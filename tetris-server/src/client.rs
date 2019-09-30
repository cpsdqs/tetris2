use crate::game::GameManager;
use crate::protocol::{ClientMsg, ServerMsg};
use core::hash::{Hash, Hasher};
use futures::future::{self, Either, Future};
use futures::stream::Stream;
use futures::sync::mpsc;
use parking_lot::Mutex;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::codec::Framed;
use tokio::net::TcpStream;
use tokio::prelude::*;
use tokio::timer::Delay;
use uuid::Uuid;
use websocket::r#async::MessageCodec;
use websocket::CloseData;
use websocket::OwnedMessage;
use websocket::WebSocketError;

const CLIENT_HANDSHAKE_TIMEOUT_SECS: u64 = 3;
const MAX_CLIENT_PACKET_SIZE: usize = 1_000_000;

pub fn accept(
    gm: Arc<Mutex<GameManager>>,
    socket: Framed<TcpStream, MessageCodec<OwnedMessage>>,
    addr: SocketAddr,
) -> impl Future<Item = (), Error = ()> {
    let did_accept = Arc::new(Mutex::new(false));
    let did_accept2 = did_accept.clone();

    let f = socket
        .into_future()
        .map_err(|(err, _)| err)
        .and_then(move |(message, socket)| match message {
            Some(OwnedMessage::Text(text)) => match serde_json::from_str(&text) {
                Ok(ClientMsg::Init { name, token }) => {
                    info!(
                        "got init from {} with name {} and token {}",
                        addr, name, token
                    );

                    *did_accept2.lock() = true;
                    match Client::new(gm, name, token, socket, addr) {
                        Ok(client) => Either::A(client),
                        Err(client) => Either::A(client),
                    }
                }
                _ => Either::B(future::ok(())),
            },
            _ => Either::B(future::ok(())),
        })
        .map_err(move |err| error!("websocket error at {}: {}", addr, err));

    struct ClientAccept<F> {
        f: F,
        timeout: Option<(Delay, Arc<Mutex<bool>>, SocketAddr)>,
    }

    impl<F: Future<Item = (), Error = ()>> Future for ClientAccept<F> {
        type Item = ();
        type Error = ();

        fn poll(&mut self) -> Result<Async<()>, ()> {
            match &mut self.timeout {
                Some((ref mut timeout, did_accept, addr)) => match timeout.poll() {
                    Ok(Async::NotReady) => self.f.poll(),
                    Ok(Async::Ready(())) => {
                        if *did_accept.lock() {
                            self.timeout = None;
                            self.f.poll()
                        } else {
                            info!("dropping connection from {} (init timed out)", addr);
                            Ok(Async::Ready(()))
                        }
                    }
                    Err(_) => Err(()),
                },
                None => self.f.poll(),
            }
        }
    }

    let timeout = Delay::new(Instant::now() + Duration::from_secs(CLIENT_HANDSHAKE_TIMEOUT_SECS));

    ClientAccept {
        timeout: Some((timeout, did_accept, addr)),
        f,
    }
}

#[derive(Clone)]
pub struct ClientHandle {
    id: Uuid,
    sender: mpsc::UnboundedSender<OwnedMessage>,
}

impl ClientHandle {
    /// Sends a message to the client.
    pub fn send(&self, msg: ServerMsg) {
        match serde_json::to_string(&msg) {
            Ok(msg) => self.send_msg(OwnedMessage::Text(msg)),
            Err(err) => error!("failed to serialize client packet: {}", err),
        }
    }

    /// Sends a websocket message.
    ///
    /// (actually just puts it in a queue)
    fn send_msg(&self, message: OwnedMessage) {
        if let Err(_) = self.sender.unbounded_send(message) {
            error!("failed to put message in client message queue");
        }
    }
}

impl PartialEq for ClientHandle {
    fn eq(&self, rhs: &Self) -> bool {
        self.id == rhs.id
    }
}
impl Eq for ClientHandle {}
impl Hash for ClientHandle {
    fn hash<H>(&self, hasher: &mut H)
    where
        H: Hasher,
    {
        self.id.hash(hasher);
    }
}

struct Client {
    id: Uuid,
    name: String,
    gm: Arc<Mutex<GameManager>>,
    registered: bool,
    socket: Framed<TcpStream, MessageCodec<OwnedMessage>>,
    addr: SocketAddr,
    msg_queue: mpsc::UnboundedReceiver<OwnedMessage>,
    msg_queue_in: mpsc::UnboundedSender<OwnedMessage>,
    closing: Option<CloseData>,
}

impl Client {
    fn new(
        gm: Arc<Mutex<GameManager>>,
        name: String,
        token: String,
        socket: Framed<TcpStream, MessageCodec<OwnedMessage>>,
        addr: SocketAddr,
    ) -> Result<Client, Client> {
        let (msg_queue_in, msg_queue) = mpsc::unbounded();

        let mut client = Client {
            id: Uuid::new_v4(),
            name: name.clone(),
            gm,
            registered: false,
            socket,
            addr,
            closing: None,
            msg_queue,
            msg_queue_in,
        };

        let mut is_err = false;
        if let Err(_) = client
            .gm
            .lock()
            .add_client(name, token, client.create_handle())
        {
            client.create_handle().send(ServerMsg::NameTaken);
            is_err = true;
        }
        if is_err {
            return Err(client);
        }

        client.registered = true;
        Ok(client)
    }

    pub fn create_handle(&self) -> ClientHandle {
        ClientHandle {
            id: self.id,
            sender: self.msg_queue_in.clone(),
        }
    }

    fn handle_msg(&mut self, msg: ClientMsg) {
        if !self.registered {
            return;
        }
        match msg {
            ClientMsg::Init { .. } => (),
            ClientMsg::CreateGame {
                password,
                client_fields,
            } => {
                self.gm
                    .lock()
                    .create_room(self.name.clone(), password, client_fields);
            }
            ClientMsg::JoinGame { name, password } => {
                self.gm.lock().join_room(self.name.clone(), name, password);
            }
            ClientMsg::StartGame => {
                self.gm.lock().start_game(&self.name);
            }
            ClientMsg::GameCommand { command } => {
                self.gm.lock().run_game_command(&self.name, command);
            }
            ClientMsg::Field { field } => {
                self.gm.lock().update_client_field(&self.name, field);
            }
        }
    }

    /// Marks this connection as closed with the given status and reason text.
    ///
    /// This will send a final close message through the websocket and resolve this future.
    /// Note that this will not actually forcefully close the connection until this struct is
    /// dropped.
    pub fn close(&mut self, status_code: u16, reason: String) {
        info!(
            "closing connection to {}: {} {:?}",
            self.addr, status_code, reason
        );
        self.closing = Some(CloseData {
            status_code,
            reason,
        });
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        if self.registered {
            self.gm.lock().remove_client(&self.name);
        }
    }
}

impl Future for Client {
    type Item = ();
    type Error = WebSocketError;

    fn poll(&mut self) -> Result<Async<()>, WebSocketError> {
        if let Some(close_data) = &self.closing {
            self.socket
                .start_send(OwnedMessage::Close(Some(close_data.clone())))?;
            return self.socket.poll_complete();
        }

        loop {
            match self.msg_queue.poll().unwrap() {
                Async::Ready(Some(msg)) => {
                    self.socket.start_send(msg)?;
                }
                _ => break,
            }
        }

        self.socket.poll_complete()?;

        while let Async::Ready(msg) = self.socket.poll()? {
            if let Some(msg) = msg {
                match msg {
                    OwnedMessage::Text(text) => {
                        if text.len() > MAX_CLIENT_PACKET_SIZE {
                            self.close(
                                1009,
                                format!(
                                    "packet too large (exceeds {} bytes)",
                                    MAX_CLIENT_PACKET_SIZE
                                ),
                            );
                            return Ok(Async::NotReady);
                        }

                        let msg = match serde_json::from_str(&text) {
                            Ok(msg) => msg,
                            Err(err) => {
                                self.close(4000, format!("parse error: {}", err));
                                return Ok(Async::NotReady);
                            }
                        };

                        self.handle_msg(msg);
                    }
                    OwnedMessage::Ping(payload) => {
                        if let Err(err) = self
                            .msg_queue_in
                            .unbounded_send(OwnedMessage::Ping(payload))
                        {
                            error!("failed to put message in client message queue: {}", err);
                        }
                    }
                    _ => (),
                }
            } else {
                info!("dropping connection to {} (socket closed)", self.addr);
                return Ok(Async::Ready(()));
            }
        }

        Ok(Async::NotReady)
    }
}
