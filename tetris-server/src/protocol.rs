use core::fmt;
use serde::de::Visitor;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use tetris_core::field::{ActivePiece, PieceType, Tile, Timestamp};

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum GameCommand {
    #[serde(rename = "move-left")]
    MoveLeft,
    #[serde(rename = "move-right")]
    MoveRight,
    #[serde(rename = "soft-drop")]
    SoftDrop,
    #[serde(rename = "hard-drop")]
    HardDrop,
    #[serde(rename = "rotate-cw")]
    RotateCW,
    #[serde(rename = "rotate-ccw")]
    RotateCCW,
    #[serde(rename = "swap-held")]
    SwapHeld,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMsg {
    #[serde(rename = "init")]
    Init { name: String, token: String },

    #[serde(rename = "create-game")]
    CreateGame {
        password: String,
        client_fields: bool,
    },

    #[serde(rename = "join-game")]
    JoinGame { name: String, password: String },

    #[serde(rename = "start-game")]
    StartGame,

    #[serde(rename = "game-command")]
    GameCommand { command: GameCommand },

    #[serde(rename = "field")]
    Field { field: FieldState },
}

#[derive(Serialize, Debug, Clone)]
pub struct ClientDesc {
    pub name: String,
    pub has_game: bool,
    pub client_fields: bool,
    pub in_game: bool,
    pub proposed_game: bool,
}

#[derive(Debug, Clone)]
pub struct TileSerde(Vec<Tile>);

impl From<Vec<Tile>> for TileSerde {
    fn from(this: Vec<Tile>) -> Self {
        Self(this)
    }
}

impl Serialize for TileSerde {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialized = String::new();
        for tile in &self.0 {
            tile.stringify(&mut serialized);
        }
        serializer.serialize_str(&serialized)
    }
}

impl<'a> Deserialize<'a> for TileSerde {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'a>,
    {
        deserializer.deserialize_str(TileVisitor)
    }
}

struct TileVisitor;

impl<'de> Visitor<'de> for TileVisitor {
    type Value = TileSerde;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "a tile list (which is just a string)")
    }

    fn visit_str<E>(self, s: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        let mut cursor = 0;
        let mut tiles = Vec::with_capacity(128);
        while cursor < s.len() {
            let (tile, l) =
                Tile::parse_from_str(&s[cursor..]).map_err(|_| E::custom("invalid tile list"))?;
            tiles.push(tile);
            cursor += l;

            if tiles.len() >= 2048 {
                break;
            }
        }
        Ok(TileSerde(tiles))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldState {
    pub width: usize,
    pub tiles: TileSerde,
    pub active: Option<ActivePiece>,
    pub next: Option<PieceType>,
    pub time: Timestamp,
    pub score: usize,
    pub level: usize,
    pub is_game_over: bool,
}

#[derive(Debug, Clone, Serialize)]
pub enum ServerMsg {
    #[serde(rename = "name-taken")]
    NameTaken,

    #[serde(rename = "client-list")]
    ClientList { clients: Vec<ClientDesc> },

    #[serde(rename = "started-game")]
    StartedGame { client_fields: bool },

    #[serde(rename = "joined-game")]
    JoinedGame,
    #[serde(rename = "failed-join-game")]
    FailedJoinGame,
    #[serde(rename = "game-client-list")]
    PlayerList { players: Vec<ClientDesc> },
    #[serde(rename = "confirmed-start-game")]
    ConfirmedStartGame,

    #[serde(rename = "ended-game")]
    EndedGame,

    #[serde(rename = "fields")]
    Fields { fields: HashMap<String, FieldState> },
}
