use crate::client::ClientHandle;
use crate::protocol::{ClientDesc, FieldState, GameCommand, ServerMsg};
use core::f64::consts::E;
use futures::prelude::*;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::{Arc, Weak};
use std::time::Instant;
use tetris_core::field::ActiveField;
use tetris_core::field::{Duration, Timestamp};
use tokio::timer::DelayQueue;
use uuid::Uuid;

const TICK_INTERVAL_NS: u64 = 16_666_667;

pub struct GMScheduler {
    last_time: Instant,
    tick_queue: Arc<Mutex<DelayQueue<SchedulerMsg>>>,
    gm: Weak<Mutex<GameManager>>,
}

enum SchedulerMsg {
    Start(Instant),
    Tick,
}

impl Future for GMScheduler {
    type Item = ();
    type Error = ();

    fn poll(&mut self) -> Result<Async<()>, ()> {
        if let Some(gm) = Weak::upgrade(&self.gm) {
            let mut tick_queue = self.tick_queue.lock();
            let mut gm = gm.lock();
            loop {
                match tick_queue.poll() {
                    Ok(Async::Ready(Some(expired))) => {
                        match expired.get_ref() {
                            SchedulerMsg::Start(instant) => self.last_time = *instant,
                            SchedulerMsg::Tick => {
                                let delta_time = self.last_time.elapsed();
                                gm.tick(delta_time.as_micros() as f64 / 1_000_000.);
                            }
                        }
                        self.last_time = Instant::now();
                        if gm.wants_tick() {
                            self.tick_queue.lock().insert(
                                SchedulerMsg::Tick,
                                core::time::Duration::from_nanos(TICK_INTERVAL_NS),
                            );
                        }
                    }
                    Ok(Async::Ready(None)) | Ok(Async::NotReady) => return Ok(Async::NotReady),
                    Err(_) => return Err(()),
                }
            }
        } else {
            Ok(Async::Ready(()))
        }
    }
}

pub struct GameManager {
    rooms: HashMap<Uuid, Arc<Mutex<Room>>>,
    client_rooms: HashMap<String, Uuid>,
    clients: HashMap<String, ClientHandle>,
    tick_queue: Arc<Mutex<DelayQueue<SchedulerMsg>>>,
}

impl GameManager {
    pub fn new() -> (Arc<Mutex<GameManager>>, GMScheduler) {
        let tick_queue = Arc::new(Mutex::new(DelayQueue::new()));
        let mut scheduler = GMScheduler {
            last_time: Instant::now(),
            tick_queue: tick_queue.clone(),
            gm: Weak::new(),
        };
        let gm = Arc::new(Mutex::new(GameManager {
            rooms: HashMap::new(),
            client_rooms: HashMap::new(),
            clients: HashMap::new(),
            tick_queue,
        }));
        scheduler.gm = Arc::downgrade(&gm);
        (gm, scheduler)
    }

    fn start_tick(&mut self) {
        let mut tick_queue = self.tick_queue.lock();
        if tick_queue.is_empty() {
            tick_queue.insert(
                SchedulerMsg::Start(Instant::now()),
                core::time::Duration::from_nanos(TICK_INTERVAL_NS),
            );
        }
    }

    fn tick(&mut self, dt: Duration) {
        for (_, room) in &self.rooms {
            room.lock().tick(dt);
        }
    }

    fn wants_tick(&self) -> bool {
        !self.rooms.is_empty()
    }

    fn broadcast_client_list(&self) {
        let msg = ServerMsg::ClientList {
            clients: self
                .clients
                .iter()
                .map(|(name, _)| {
                    let room = match self.client_rooms.get(name) {
                        Some(id) => Some(&self.rooms[&id]),
                        None => None,
                    };
                    ClientDesc {
                        name: name.clone(),
                        in_game: room.map_or(false, |r| r.lock().is_in_game()),
                        has_game: true,
                        client_fields: room.map_or(false, |r| r.lock().uses_client_fields()),
                        proposed_game: false,
                    }
                })
                .collect(),
        };

        for (_, client) in &self.clients {
            client.send(msg.clone());
        }
    }

    pub fn add_client(
        &mut self,
        name: String,
        _token: String,
        handle: ClientHandle,
    ) -> Result<(), ()> {
        // TODO: tokens for re-entry
        if self.clients.contains_key(&name) {
            return Err(());
        }
        self.clients.insert(name, handle);
        self.broadcast_client_list();
        Ok(())
    }

    pub fn remove_client(&mut self, name: &str) {
        self.remove_from_rooms(name);
        self.clients.remove(name);
        self.broadcast_client_list();
    }

    fn remove_room(&mut self, id: Uuid) {
        self.rooms.remove(&id);
    }

    fn remove_from_rooms(&mut self, name: &str) {
        if let Some(room_id) = self.client_rooms.remove(name) {
            let room_m = self.rooms.get_mut(&room_id).unwrap();
            let mut room = room_m.lock();
            room.remove_player(name);
            if room.is_empty() {
                drop(room);
                drop(room_m);
                self.remove_room(room_id);
            }
        }
    }

    pub fn create_room(&mut self, name: String, password: String, client_fields: bool) {
        if let Some(client) = self.clients.get(&name).map(|client| client.clone()) {
            self.remove_from_rooms(&name);
            let room_id = Uuid::new_v4();
            let mut room = Room::new(password, client_fields);
            room.add_player(name, client);
            self.rooms.insert(room_id, Arc::new(Mutex::new(room)));
        }
    }

    pub fn join_room(&mut self, name: String, room_member: String, password: String) {
        if let Some(client) = self.clients.get(&name) {
            if let Some(id) = self.client_rooms.get(&room_member).map(|id| *id) {
                let room_m = &self.rooms[&id];
                let mut room = room_m.lock();
                if room.password == password {
                    room.add_player(name.clone(), client.clone());
                    self.client_rooms.insert(name, id);
                    return;
                }
            }

            client.send(ServerMsg::FailedJoinGame);
        }
    }

    pub fn start_game(&mut self, name: &str) {
        if let Some(room_id) = self.client_rooms.get(name) {
            self.rooms
                .get_mut(&room_id)
                .unwrap()
                .lock()
                .proposed_game(name);

            self.start_tick();
        }
    }

    pub fn run_game_command(&mut self, name: &str, command: GameCommand) {
        if let Some(room_id) = self.client_rooms.get(name) {
            self.rooms
                .get_mut(&room_id)
                .unwrap()
                .lock()
                .run_game_command(name, command);
        }
    }

    pub fn update_client_field(&mut self, name: &str, field: FieldState) {
        // TODO
    }
}

enum RoomFields {
    ClientFields(HashMap<String, FieldState>),
    ServerFields(HashMap<String, PlayerField>),
}

struct RoomClient {
    client: ClientHandle,
    proposed_game: bool,
}

const ROOM_START_TIME: Timestamp = -3.;

pub struct Room {
    players: HashMap<String, RoomClient>,
    time: Timestamp,
    fields: RoomFields,
    password: String,
    running: bool,
}

impl Room {
    fn new(password: String, client_fields: bool) -> Room {
        Room {
            players: HashMap::new(),
            time: ROOM_START_TIME,
            fields: if client_fields {
                RoomFields::ClientFields(HashMap::new())
            } else {
                RoomFields::ServerFields(HashMap::new())
            },
            password,
            running: false,
        }
    }

    fn uses_client_fields(&self) -> bool {
        match self.fields {
            RoomFields::ClientFields(_) => true,
            _ => false,
        }
    }

    fn is_in_game(&self) -> bool {
        self.running
    }

    fn broadcast_clients(&self) {
        self.broadcast(ServerMsg::PlayerList {
            players: self
                .players
                .iter()
                .map(|(name, player)| ClientDesc {
                    name: name.clone(),
                    in_game: self.is_in_game(),
                    has_game: true,
                    client_fields: self.uses_client_fields(),
                    proposed_game: player.proposed_game,
                })
                .collect(),
        });
    }

    fn add_player(&mut self, name: String, client: ClientHandle) {
        self.players.insert(
            name,
            RoomClient {
                client: client.clone(),
                proposed_game: false,
            },
        );
        client.send(ServerMsg::JoinedGame);
        self.broadcast_clients();
    }

    fn remove_player(&mut self, name: &str) {
        self.players.remove(name);
        self.broadcast_clients();
    }

    fn proposed_game(&mut self, name: &str) {
        if let Some(player) = self.players.get_mut(name) {
            player.proposed_game = true;
            player.client.send(ServerMsg::ConfirmedStartGame);
            self.broadcast_clients();

            for (_, player) in &self.players {
                if !player.proposed_game {
                    return;
                }
            }
            self.start_game();
        }
    }

    fn start_game(&mut self) {
        self.running = true;
        self.broadcast(ServerMsg::StartedGame {
            client_fields: self.uses_client_fields(),
        });
    }

    fn end_game(&mut self) {
        self.broadcast(ServerMsg::EndedGame);
        self.running = false;
        self.time = ROOM_START_TIME;
        self.fields = if self.uses_client_fields() {
            RoomFields::ClientFields(HashMap::new())
        } else {
            RoomFields::ServerFields(HashMap::new())
        };
    }

    fn run_game_command(&mut self, name: &str, command: GameCommand) {
        if self.running && self.time >= 0. {
            match &mut self.fields {
                RoomFields::ServerFields(fields) => {
                    if let Some(field) = fields.get_mut(name) {
                        field.run_game_command(command);
                    }
                }
                _ => (),
            }
        }
    }

    fn is_empty(&self) -> bool {
        self.players.is_empty()
    }

    fn broadcast(&self, msg: ServerMsg) {
        for (_, player) in &self.players {
            player.client.send(msg.clone());
        }
    }

    pub fn tick(&mut self, dt: Duration) {
        if self.running {
            self.time += dt;

            if self.time < 0. {
                return;
            }

            let mut updated_fields = HashMap::new();
            let mut is_still_playing = false;

            match &mut self.fields {
                RoomFields::ServerFields(fields) => {
                    for (name, field) in fields {
                        field.tick(dt);
                        if field.is_dirty {
                            field.is_dirty = false;
                            updated_fields.insert(name.clone(), field.serialize());
                        }
                        if !field.field.is_top_out() {
                            is_still_playing = true;
                        }
                    }
                }
                _ => (), // TODO
            }

            if !updated_fields.is_empty() {
                self.broadcast(ServerMsg::Fields {
                    fields: updated_fields,
                });
            }

            if !is_still_playing {
                self.end_game();
            }
        }
    }
}

const CLEAR_TIMEOUT: Duration = 0.5;
const LOCK_DELAY: Duration = 0.5;

struct PlayerField {
    field: ActiveField,
    score: usize,
    time: Timestamp,
    step_cooldown: Duration,
    is_game_over: bool,
    is_dirty: bool,
}

impl PlayerField {
    fn level(&self) -> usize {
        // TODO: needs tweaking
        ((self.score as f64 / 1000.).powf(1.4) + 2.).log(E).ceil() as usize
    }

    fn step_cooldown(&self) -> Duration {
        let level = self.level();
        (0.8 - ((level as f64 - 1.) * 0.007)).powf(level as f64 - 1.)
    }

    fn tick(&mut self, dt: Duration) {
        if !self.is_game_over {
            self.time += dt;

            self.step_cooldown -= dt;
            if self.step_cooldown <= 0. {
                self.field.move_active_down(self.time);
                if self.field.should_lock_active(LOCK_DELAY, self.time) {
                    self.field.lock_active();
                    self.field.spawn_active(None, self.time);
                }
                self.step_cooldown = self.step_cooldown();
                self.is_dirty = true;
            }

            let cleared_lines = self.field.clear_lines(CLEAR_TIMEOUT, self.time);

            // TODO: score

            if self.field.is_top_out() {
                self.is_game_over = true;
                self.is_dirty = true;
            }
        }
    }

    fn run_game_command(&mut self, command: GameCommand) {
        match command {
            GameCommand::MoveLeft => self.field.move_active_left(self.time),
            GameCommand::MoveRight => self.field.move_active_right(self.time),
            GameCommand::SoftDrop => self.field.move_active_down(self.time),
            GameCommand::HardDrop => self.field.hard_drop_active(self.time),
            GameCommand::RotateCW => self.field.rotate_active_cw(self.time),
            GameCommand::RotateCCW => self.field.rotate_active_ccw(self.time),
            GameCommand::SwapHeld => self.field.swap_held_piece(self.time),
        }
        self.is_dirty = true;
    }

    fn serialize(&self) -> FieldState {
        FieldState {
            width: self.field.field().width(),
            tiles: self.field.field().tiles().clone().into(),
            active: self.field.active_piece().map(Clone::clone),
            next: self.field.queue().get(0).map(Clone::clone),
            time: self.time,
            score: self.score,
            level: self.level(),
            is_game_over: self.is_game_over,
        }
    }
}
