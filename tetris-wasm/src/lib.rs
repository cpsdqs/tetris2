use wasm_bindgen::throw_str;
use wasm_bindgen::prelude::*;
use tetris_core::field::{ActiveField, ActivePiece, Tile, Shape};

#[wasm_bindgen(js_name = ActiveField)]
pub struct JsActiveField(ActiveField);

#[wasm_bindgen(js_name = ActivePiece)]
pub struct JsActivePiece(ActivePiece);

#[wasm_bindgen(js_class = ActivePiece)]
impl JsActivePiece {
    #[wasm_bindgen(js_name = "type")]
    pub fn piece_type(&self) -> String {
        let mut buf = String::new();
        self.0.piece_type().stringify(&mut buf);
        buf
    }

    #[wasm_bindgen(js_name = "posX")]
    pub fn pos_x(&self) -> isize {
        self.0.pos().x
    }

    #[wasm_bindgen(js_name = "posY")]
    pub fn pos_y(&self) -> isize {
        self.0.pos().y
    }

    #[wasm_bindgen(js_name = "getTiles")]
    pub fn tiles(&self) -> Box<[isize]> {
        self.0.iter_tiles().flat_map(|v| {
            struct Iter(isize, isize, usize);
            impl Iterator for Iter {
                type Item = isize;
                fn next(&mut self) -> Option<isize> {
                    self.2 += 1;
                    match self.2 - 1 {
                        0 => Some(self.0),
                        1 => Some(self.1),
                        _ => None,
                    }
                }
            }
            Iter(v.x, v.y, 0)
        }).collect()
    }
}

#[wasm_bindgen(js_name = "createActiveField")]
pub fn create_active_field() -> JsActiveField {
    JsActiveField(ActiveField::new())
}

#[wasm_bindgen(js_class = ActiveField)]
impl JsActiveField {
    #[wasm_bindgen(js_name = "spawnActive")]
    pub fn spawn_active(&mut self, type_override: JsValue, time: f64) {
        let type_override = if let Some(s) = type_override.as_string() {
            match s.parse() {
                Ok(t) => Some(t),
                Err(_) => throw_str(&format!("unknown piece type {}", s)),
            }
        } else if type_override.is_null() {
            None
        } else {
            throw_str("type override must be a string or null");
        };

        self.0.spawn_active(type_override, time);
    }

    #[wasm_bindgen(js_name = "rotateActiveCCW")]
    pub fn rotate_active_ccw(&mut self, time: f64) {
        self.0.rotate_active_ccw(time);
    }

    #[wasm_bindgen(js_name = "rotateActiveCW")]
    pub fn rotate_active_cw(&mut self, time: f64) {
        self.0.rotate_active_cw(time);
    }

    #[wasm_bindgen(js_name = "moveActiveLeft")]
    pub fn move_active_left(&mut self, time: f64) {
        self.0.move_active_left(time);
    }

    #[wasm_bindgen(js_name = "moveActiveRight")]
    pub fn move_active_right(&mut self, time: f64) {
        self.0.move_active_right(time);
    }

    #[wasm_bindgen(js_name = "moveActiveDown")]
    pub fn move_active_down(&mut self, time: f64) {
        self.0.move_active_down(time);
    }

    #[wasm_bindgen(js_name = "hardDropActive")]
    pub fn hard_drop_active(&mut self, time: f64) {
        self.0.hard_drop_active(time);
    }

    #[wasm_bindgen(js_name = "lockActive")]
    pub fn lock_active(&mut self) {
        self.0.lock_active();
    }

    #[wasm_bindgen(js_name = "shouldLockActive")]
    pub fn should_lock_active(&mut self, lock_delay: f64, time: f64) -> bool {
        self.0.should_lock_active(lock_delay, time)
    }

    #[wasm_bindgen(js_name = "swapHeldPiece")]
    pub fn swap_held_piece(&mut self, time: f64) {
        self.0.swap_held_piece(time);
    }

    #[wasm_bindgen(js_name = "clearLines")]
    pub fn clear_lines(&mut self, clear_timeout: f64, time: f64) -> usize {
        self.0.clear_lines(clear_timeout, time)
    }

    #[wasm_bindgen(js_name = "cleanLines")]
    pub fn clean_lines(&mut self, clear_timeout: f64, time: f64) {
        self.0.clean_lines(clear_timeout, time);
    }

    #[wasm_bindgen(js_name = "isTopOut")]
    pub fn is_top_out(&self) -> bool {
        self.0.is_top_out()
    }

    #[wasm_bindgen(js_name = "getNextPiece")]
    pub fn next_piece(&self) -> JsValue {
        match self.0.queue().get(0) {
            Some(piece) => {
                let mut buf = String::new();
                piece.stringify(&mut buf);
                JsValue::from_str(&buf)
            }
            None => JsValue::null(),
        }
    }

    #[wasm_bindgen(js_name = "getHeldPiece")]
    pub fn held_piece(&self) -> JsValue {
        match self.0.held_piece() {
            Some(piece) => {
                let mut buf = String::new();
                piece.stringify(&mut buf);
                JsValue::from_str(&buf)
            }
            None => JsValue::null(),
        }
    }

    #[wasm_bindgen(js_name = "getActivePiece")]
    pub fn active_piece(&self) -> Option<JsActivePiece> {
        self.0.active_piece().map(|x| JsActivePiece(*x))
    }

    #[wasm_bindgen(js_name = "getFieldWidth")]
    pub fn field_width(&self) -> usize {
        self.0.field().width()
    }

    #[wasm_bindgen(js_name = "getFieldHeight")]
    pub fn field_height(&self) -> usize {
        self.0.field().height()
    }

    #[wasm_bindgen(js_name = "getFieldTopHeight")]
    pub fn field_top_height(&self) -> usize {
        self.0.field().top_height()
    }

    #[wasm_bindgen(js_name = "getFieldClearRows")]
    pub fn field_clear_rows(&self) -> usize {
        self.0.field().clear_rows()
    }

    #[wasm_bindgen(js_name = "getFieldTile")]
    pub fn field_get_tile(&self, x: usize, y: usize) -> JsValue {
        match self.0.field().get_tile(x, y) {
            Some(Tile::Empty) => JsValue::from_str(""),
            Some(Tile::Piece(t)) => {
                let mut buf = String::new();
                t.stringify(&mut buf);
                JsValue::from_str(&buf)
            }
            Some(Tile::Clear(time)) => JsValue::from_f64(time),
            None => JsValue::null(),
        }
    }
}
