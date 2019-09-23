//! HTTP handling.

use futures::future::Either;
use hyper::header::{self, Headers};
use hyper::method::Method;
use hyper::mime::*;
use hyper::status::StatusCode;
use hyper::uri::RequestUri;
use hyper::version::HttpVersion;
use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use time::now_utc;
use tokio::fs::File;
use tokio::io::write_all;
use tokio::net::TcpStream;
use tokio::prelude::*;
use websocket::server::upgrade::Request;

/// Handles a single HTTP request.
pub fn handle_http(
    static_path: Option<&String>,
    stream: TcpStream,
    request: Request,
    addr: SocketAddr,
) {
    match request.subject {
        (method, RequestUri::AbsolutePath(path)) => match (method, &*path, static_path) {
            (Method::Get, path, Some(static_path)) => {
                tokio::spawn(write_file(static_path, path, stream, request.version, addr));
            }
            (m, p, _) => {
                info!("{}: not found: {} {}", addr, m, p);
                tokio::spawn(write_html_error(
                    stream,
                    request.version,
                    StatusCode::NotFound,
                ));
            }
        },
        (m, p) => {
            info!("{}: bad request: {} {}", addr, m, p);
            tokio::spawn(write_html_error(
                stream,
                request.version,
                StatusCode::BadRequest,
            ));
        }
    }
}

/// Writes a file using HTTP chunked encoding to the stream.
///
/// Denies any HTTP version that isn’t 1.1.
fn write_file<T: AsyncWrite>(
    static_path: &str,
    req_path: &str,
    stream: T,
    version: HttpVersion,
    addr: SocketAddr,
) -> impl Future<Item = (), Error = ()> {
    if version != HttpVersion::Http11 {
        debug!("outdated http");
        Either::A(write_html_error(stream, version, StatusCode::BadRequest))
    } else {
        let mut subpath = PathBuf::new();
        for component in Path::new(req_path).components() {
            match component {
                Component::ParentDir => {
                    subpath.pop();
                }
                Component::Normal(s) => subpath.push(s),
                _ => (),
            }
        }
        let mut rel_path = Path::new(static_path).join(subpath);
        let mut path = match rel_path.canonicalize() {
            Ok(path) => path,
            Err(_) => {
                info!(
                    "{}: not found: {:?} -> {:?} (can’t canonicalize)",
                    addr, req_path, rel_path
                );
                return Either::A(write_html_error(stream, version, StatusCode::NotFound));
            }
        };

        let is_dir = match path.metadata() {
            Ok(metadata) => metadata.is_dir(),
            _ => false,
        };

        if is_dir {
            path.push("index.html");
            rel_path.push("index.html");
        }

        let req_path = String::from(req_path);

        Either::B(File::open(path.clone()).then(move |file| match file {
            Ok(file) => {
                info!("{}: sending file {:?} -> {:?}", addr, req_path, rel_path);
                let content_type = match path.extension().map_or(None, |s| s.to_str()) {
                    Some("html") => mime!(Text/Html; Charset=Utf8),
                    Some("js") => mime!(Application/Javascript; Charset=Utf8),
                    Some("css") => mime!(Text/Css; Charset=Utf8),
                    _ => mime!(Text/Plain; Charset=Utf8),
                };

                let mut headers = Headers::new();
                headers.set(header::ContentType(content_type));
                headers.set(header::TransferEncoding(vec![header::Encoding::Chunked]));

                Either::A(
                    write_all(
                        stream,
                        format!("{} {}\r\n", HttpVersion::Http11, StatusCode::Ok),
                    )
                    .and_then(move |(stream, _)| write_all(stream, format!("{}\r\n", headers)))
                    .then(move |res| match res {
                        Ok((stream, _)) => Either::A(read_file_chunked(stream, file)),
                        Err(_) => Either::B(future::err(())),
                    }),
                )
            }
            Err(_) => {
                info!("{}: ISE: {:?} -> {:?}", addr, req_path, rel_path);
                Either::B(write_html_error(
                    stream,
                    HttpVersion::Http11,
                    StatusCode::InternalServerError,
                ))
            }
        }))
    }
}

/// Writes a simple HTTP response with an HTML error page to the given AsyncWrite.
fn write_html_error<T: AsyncWrite>(
    stream: T,
    version: HttpVersion,
    status: StatusCode,
) -> impl Future<Item = (), Error = ()> {
    let server_name = format!("{}/{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));

    let html = format!(
        "<!DOCTYPE html>
<html>
    <head>
        <title>{0}</title>
        <meta charset='utf-8' />
    </head>
    <body>
        <center>
            <h1>{0}</h1>
            <hr>
            {1}
        </center>
    </body>
</html>",
        status, server_name
    );

    let mut response = Response::new(html.into());
    *response.version_mut() = version;
    *response.status_mut() = status;
    response
        .headers_mut()
        .set(header::ContentType(mime!(Text/Html; Charset=Utf8)));
    response.headers_mut().set(header::Server(server_name));

    response.write(stream).map(|_| {}).map_err(|_| {})
}

fn read_file_chunked<T: AsyncWrite>(stream: T, file: File) -> impl Future<Item = (), Error = ()> {
    ChunkedFileReader {
        stream,
        file,
        buffer: [0; 8192],
        buffer_len: 0,
        is_last_buffer: false,
        cursor: 0,
    }
}

struct ChunkedFileReader<T: AsyncWrite> {
    stream: T,
    file: File,
    buffer: [u8; 8192],
    buffer_len: usize,
    is_last_buffer: bool,
    cursor: usize,
}

impl<T: AsyncWrite> Future for ChunkedFileReader<T> {
    type Item = ();
    type Error = ();

    fn poll(&mut self) -> Result<Async<()>, ()> {
        loop {
            if self.cursor == self.buffer_len && !self.is_last_buffer {
                // read next chunk
                let mut read_buffer = [0; 8192 - 64]; // 64 bytes for the header & footer
                match self.file.poll_read(&mut read_buffer) {
                    Ok(Async::Ready(bytes)) => {
                        if bytes == 0 {
                            // EOF
                            self.is_last_buffer = true;
                        }

                        let header = format!("{:X}\r\n", bytes);
                        let footer = "\r\n";

                        let mut c = 0;
                        for byte in header
                            .bytes()
                            .chain(read_buffer[0..bytes].iter().map(|i| *i))
                            .chain(footer.bytes())
                        {
                            self.buffer[c] = byte;
                            c += 1;
                        }

                        self.buffer_len = c;
                        self.cursor = 0;
                    }
                    Ok(Async::NotReady) => return Ok(Async::NotReady),
                    Err(_) => return Err(()),
                }
            }

            if self.cursor != self.buffer_len {
                // write current chunk
                match self
                    .stream
                    .poll_write(&self.buffer[self.cursor..self.buffer_len])
                {
                    Ok(Async::Ready(bytes)) => {
                        self.cursor += bytes;
                    }
                    Ok(Async::NotReady) => return Ok(Async::NotReady),
                    Err(_) => return Err(()),
                }
            } else if self.is_last_buffer {
                return Ok(Async::Ready(()));
            }
        }
    }
}

/// A simple HTTP response.
struct Response {
    body: Vec<u8>,
    version: HttpVersion,
    status: StatusCode,
    headers: Headers,
}

impl Response {
    /// Creates a new HTTP response with the given body.
    pub fn new(body: Vec<u8>) -> Response {
        Response {
            body,
            version: HttpVersion::Http11,
            status: StatusCode::Ok,
            headers: Headers::new(),
        }
    }

    /// Returns a mutable reference to the version.
    pub fn version_mut(&mut self) -> &mut HttpVersion {
        &mut self.version
    }

    /// Returns a mutable reference to the status code.
    pub fn status_mut(&mut self) -> &mut StatusCode {
        &mut self.status
    }

    /// Returns a mutable reference to the headers.
    pub fn headers_mut(&mut self) -> &mut Headers {
        &mut self.headers
    }

    /// Writes the response to the given stream and returns a future.
    pub fn write<W: AsyncWrite>(mut self, stream: W) -> impl Future {
        if !self.headers.has::<header::Date>() {
            self.headers.set(header::Date(header::HttpDate(now_utc())));
        }

        self.headers
            .set(header::ContentLength(self.body.len() as u64));

        let headers = self.headers;
        let body = self.body;

        write_all(stream, format!("{} {}\r\n", self.version, self.status))
            .and_then(move |(stream, _)| write_all(stream, format!("{}\r\n", headers)))
            .and_then(|(stream, _)| write_all(stream, body))
    }
}
