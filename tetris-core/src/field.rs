//! Tetris playfields.

use crate::geom::{Matrix3, Point2, Vector3};
use core::ops::Add;
use core::str::FromStr;
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::collections::VecDeque;
use std::convert::TryInto;

pub type Timestamp = f64;
pub type Duration = f64;

/// A shape.
pub trait Shape {
    /// Iterates over all tiles in this shape.
    fn iter_tiles<'a>(&self) -> Box<dyn Iterator<Item = Point2<isize>> + 'a>;
}

/// Possible rotations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum Rotation {
    None = 0,
    CW = 1,
    Flip = 2,
    CCW = 3,
}

impl Rotation {
    /// Number of clockwise rotations needed to achieve this rotation.
    pub fn cw_steps(&self) -> usize {
        match self {
            Rotation::None => 0,
            Rotation::CW => 1,
            Rotation::Flip => 2,
            Rotation::CCW => 3,
        }
    }
}

impl From<usize> for Rotation {
    fn from(this: usize) -> Self {
        match this % 4 {
            0 => Rotation::None,
            1 => Rotation::CW,
            2 => Rotation::Flip,
            3 => Rotation::CCW,
            _ => unreachable!(),
        }
    }
}

impl Into<usize> for Rotation {
    fn into(self) -> usize {
        self.cw_steps()
    }
}

impl Add<isize> for Rotation {
    type Output = Rotation;
    fn add(self, rhs: isize) -> Self {
        let c: usize = self.into();
        let c = ((c as isize + rhs % 4) + 4) as usize;
        c.into()
    }
}

/// Types of tetris pieces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PieceType {
    I,
    J,
    L,
    O,
    S,
    T,
    Z,
}

impl PieceType {
    /// Returns a vector containing all piece types.
    pub fn all() -> Vec<PieceType> {
        vec![
            PieceType::I,
            PieceType::J,
            PieceType::L,
            PieceType::O,
            PieceType::S,
            PieceType::T,
            PieceType::Z,
        ]
    }

    /// Returns the clockwise rotation matrix.
    pub fn cw_rotation(&self) -> Matrix3<isize> {
        match self {
            PieceType::I => ((0, -1, 0).into(), (1, 0, 0).into(), (1, 0, 1).into()).into(),
            PieceType::O => Matrix3::identity(),
            PieceType::J | PieceType::L | PieceType::S | PieceType::T | PieceType::Z => {
                ((0, -1, 0).into(), (1, 0, 0).into(), (0, 0, 1).into()).into()
            }
        }
    }

    /// Like `iter_tiles`, but rotates the tiles first (using the `cw_rotation` matrix).
    pub fn iter_tiles_rotated(&self, rotation: Rotation) -> impl Iterator<Item = Point2<isize>> {
        struct Iter<'a>(Box<dyn Iterator<Item = Point2<isize>> + 'a>, Matrix3<isize>);

        impl<'a> Iterator for Iter<'a> {
            type Item = Point2<isize>;
            fn next(&mut self) -> Option<Point2<isize>> {
                self.0
                    .next()
                    .map(|p| self.1 * Vector3::from(p))
                    .map(|v| v.into())
            }
        }

        let mut matrix = Matrix3::identity();
        let cw_rotation = self.cw_rotation();
        for _ in 0..rotation.cw_steps() {
            matrix *= cw_rotation;
        }

        Iter(self.iter_tiles(), matrix)
    }

    /// Returns the wall pop table, or an error if the rotation is invalid.
    fn wall_pop(
        &self,
        from_rot: Rotation,
        to_rot: Rotation,
    ) -> Result<&'static [(isize, isize)], ()> {
        const WALL_POP_TABLE_INDEX: [(Rotation, Rotation, usize); 8] = [
            (Rotation::None, Rotation::CW, 0),
            (Rotation::CW, Rotation::None, 1),
            (Rotation::CW, Rotation::Flip, 2),
            (Rotation::Flip, Rotation::CW, 3),
            (Rotation::Flip, Rotation::CCW, 4),
            (Rotation::CCW, Rotation::Flip, 5),
            (Rotation::CCW, Rotation::None, 5),
            (Rotation::None, Rotation::CCW, 7),
        ];
        const WALL_POP_I: [&[(isize, isize)]; 8] = [
            &[(0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)],
            &[(0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)],
            &[(0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)],
            &[(0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)],
            &[(0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)],
            &[(0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)],
            &[(0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)],
            &[(0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)],
        ];
        const WALL_POP_JLSTZ: [&[(isize, isize)]; 8] = [
            &[(0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)],
            &[(0, 0), (1, 0), (1, -1), (0, 2), (1, 2)],
            &[(0, 0), (1, 0), (1, -1), (0, 2), (1, 2)],
            &[(0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)],
            &[(0, 0), (1, 0), (1, 1), (0, -2), (1, -2)],
            &[(0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)],
            &[(0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)],
            &[(0, 0), (1, 0), (1, 1), (0, -2), (1, -2)],
        ];
        const WALL_POP_O: &[(isize, isize)] = &[(0, 0)];

        let table_index = WALL_POP_TABLE_INDEX
            .iter()
            .find(|(f, t, _)| *f == from_rot && *t == to_rot);
        if let Some((_, _, index)) = table_index {
            match self {
                PieceType::I => Ok(WALL_POP_I[*index]),
                PieceType::O => Ok(WALL_POP_O),
                PieceType::J | PieceType::L | PieceType::S | PieceType::T | PieceType::Z => {
                    Ok(WALL_POP_JLSTZ[*index])
                }
            }
        } else {
            Err(())
        }
    }

    pub fn stringify(&self, s: &mut String) {
        match self {
            PieceType::I => s.push('I'),
            PieceType::J => s.push('J'),
            PieceType::L => s.push('L'),
            PieceType::O => s.push('O'),
            PieceType::S => s.push('S'),
            PieceType::T => s.push('T'),
            PieceType::Z => s.push('Z'),
        }
    }
}

impl Shape for PieceType {
    fn iter_tiles<'a>(&self) -> Box<dyn Iterator<Item = Point2<isize>> + 'a> {
        struct Iter(PieceType, u8);
        impl Iterator for Iter {
            type Item = Point2<isize>;
            fn next(&mut self) -> Option<Point2<isize>> {
                use PieceType::*;

                let i = self.1;
                self.1 += 1;
                if i > 3 {
                    return None;
                }
                Some(
                    match (self.0, i) {
                        (I, 0) => (-1, 0),
                        (I, 1) => (0, 0),
                        (I, 2) => (1, 0),
                        (I, 3) => (2, 0),

                        (J, 0) => (-1, 1),
                        (J, 1) => (-1, 0),
                        (J, 2) => (0, 0),
                        (J, 3) => (1, 0),

                        (L, 0) => (1, 1),
                        (L, 1) => (-1, 0),
                        (L, 2) => (0, 0),
                        (L, 3) => (1, 0),

                        (O, 0) => (0, 0),
                        (O, 1) => (1, 0),
                        (O, 2) => (0, 1),
                        (O, 3) => (1, 1),

                        (S, 0) => (0, 1),
                        (S, 1) => (1, 1),
                        (S, 2) => (-1, 0),
                        (S, 3) => (0, 0),

                        (T, 0) => (0, 1),
                        (T, 1) => (-1, 0),
                        (T, 2) => (0, 0),
                        (T, 3) => (1, 0),

                        (Z, 0) => (-1, 1),
                        (Z, 1) => (0, 1),
                        (Z, 2) => (0, 0),
                        (Z, 3) => (1, 0),

                        _ => panic!(),
                    }
                    .into(),
                )
            }
        }
        Box::new(Iter(*self, 0))
    }
}

impl FromStr for PieceType {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, ()> {
        match s {
            "I" => Ok(Self::I),
            "J" => Ok(Self::J),
            "L" => Ok(Self::L),
            "O" => Ok(Self::O),
            "S" => Ok(Self::S),
            "T" => Ok(Self::T),
            "Z" => Ok(Self::Z),
            _ => Err(()),
        }
    }
}

/// Types of tiles in a playfield.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Tile {
    /// an empty tile.
    Empty,
    /// A regular non-empty tile.
    Piece(PieceType),
    /// A tile that is part of a cleared row and is marked for removal. Contains time of creation.
    Clear(Timestamp),
}

impl Tile {
    /// Returns true if a line made from this this tile is not yet clear but can be marked clear.
    pub fn is_clearable(&self) -> bool {
        match self {
            Tile::Piece(_) => true,
            Tile::Empty | Tile::Clear(_) => false,
        }
    }

    pub fn stringify(&self, s: &mut String) {
        match self {
            Tile::Empty => s.push(' '),
            Tile::Piece(ty) => ty.stringify(s),
            Tile::Clear(inst) => s.push_str(&format!("X{}$", inst)),
        }
    }

    pub fn parse_from_str(s: &str) -> Result<(Self, usize), ()> {
        let mut chars = s.chars();
        let first = chars.next().ok_or(())?;
        if let Ok(piece) = first.to_string().parse() {
            Ok((Tile::Piece(piece), 1))
        } else if first == ' ' {
            Ok((Tile::Empty, 1))
        } else if first == 'X' {
            let mut num = String::new();
            let mut len = 1;
            for c in chars {
                len += 1;
                if c == '$' {
                    break;
                } else {
                    num.push(c);
                }
            }
            let inst = num.parse().map_err(|_| ())?;
            Ok((Tile::Clear(inst), len))
        } else {
            Err(())
        }
    }
}

/// An active piece.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ActivePiece {
    pos: Point2<isize>,
    piece_type: PieceType,
    rotation: Rotation,
    was_held_piece: bool,
    last_move_time: Timestamp,
}

impl ActivePiece {
    pub fn new(piece_type: PieceType, time: Timestamp) -> ActivePiece {
        ActivePiece {
            pos: Point2::new(0, 0),
            piece_type,
            rotation: Rotation::None,
            was_held_piece: false,
            last_move_time: time,
        }
    }

    /// Returns the position.
    pub fn pos(&self) -> Point2<isize> {
        self.pos
    }

    /// Returns the piece type.
    pub fn piece_type(&self) -> PieceType {
        self.piece_type
    }

    /// Returns the rotation.
    pub fn rotation(&self) -> Rotation {
        self.rotation
    }

    /// Attempts to move this piece by a specific offset.
    ///
    /// Will only check for collisions at the end position, assuming that the piece will only ever
    /// moved one tile at a time.
    pub fn try_move(&mut self, field: &Field, dx: isize, dy: isize, time: Timestamp) {
        if !field.collide(self, (self.pos.x + dx, self.pos.y + dy).into()) {
            self.pos.x += dx;
            self.pos.y += dy;
            self.last_move_time = time;
        }
    }

    /// Returns true if this piece is on the ground.
    pub fn is_on_ground(&self, field: &Field) -> bool {
        field.collide(self, (self.pos.x, self.pos.y - 1).into())
    }

    /// Attempts to rotate this piece, employing wall popping.
    pub fn try_rotate(&mut self, field: &Field, rotation: isize, time: Timestamp) {
        struct Rotated(PieceType, Rotation);
        impl Shape for Rotated {
            fn iter_tiles<'a>(&self) -> Box<dyn Iterator<Item = Point2<isize>> + 'a> {
                Box::new(self.0.iter_tiles_rotated(self.1))
            }
        }
        let new_rotation = self.rotation + rotation;

        let deltas = self.piece_type.wall_pop(self.rotation, new_rotation);
        if let Ok(deltas) = deltas {
            for delta in deltas {
                let pos = self.pos + (*delta).into();
                if !field.collide(&Rotated(self.piece_type, new_rotation), pos) {
                    // found valid position
                    self.rotation = new_rotation;
                    self.pos = pos;
                    self.last_move_time = time;
                    break;
                }
            }
        }
    }
}

impl Shape for ActivePiece {
    fn iter_tiles<'a>(&self) -> Box<dyn Iterator<Item = Point2<isize>> + 'a> {
        Box::new(self.piece_type.iter_tiles_rotated(self.rotation))
    }
}

/// A Tetris playfield.
#[derive(Debug, Clone)]
pub struct Field {
    /// Field width in tiles.
    width: usize,
    /// Field height in tiles.
    height: usize,
    /// Visible field height in tiles, used as the threshold for topping out.
    top_height: usize,
    /// Number of rows that have been cleared but have not been removed from the data.
    clear_rows: usize,
    /// Field tiles.
    tiles: Vec<Tile>,
}

impl Field {
    const WIDTH: usize = 10;
    const HEIGHT: usize = 40;
    const TOP_HEIGHT: usize = 22;

    pub fn new() -> Field {
        let mut tiles = Vec::with_capacity(Self::WIDTH * Self::HEIGHT);
        for _ in 0..Self::WIDTH * Self::HEIGHT {
            tiles.push(Tile::Empty);
        }

        Field {
            width: Self::WIDTH,
            height: Self::HEIGHT,
            top_height: Self::TOP_HEIGHT,
            clear_rows: 0,
            tiles,
        }
    }

    /// Returns the width of the playfield.
    pub fn width(&self) -> usize {
        self.width
    }

    /// Returns the supposed height of the playfield.
    pub fn height(&self) -> usize {
        self.height
    }

    /// Returns the top height of the playfield.
    pub fn top_height(&self) -> usize {
        self.top_height
    }

    /// Returns all tiles.
    pub fn tiles(&self) -> &Vec<Tile> {
        &self.tiles
    }

    /// Returns the tile at the specified data coordinates.
    pub fn get_tile(&self, x: usize, y: usize) -> Option<Tile> {
        if x >= self.width {
            return None;
        }
        self.tiles.get(y * self.width + x).map(|tile| *tile)
    }

    /// Replaces the tile at the specified data coordinates.
    ///
    /// Returns success.
    pub fn set_tile(&mut self, x: usize, y: usize, tile: Tile) -> bool {
        if x >= self.width || y * self.width >= self.tiles.len() {
            return false;
        }
        self.tiles[y * self.width + x] = tile;
        true
    }

    /// Returns true if the shape collides with a non-empty tile, or with the bounds of this field.
    pub fn collide<T: Shape>(&self, shape: &T, pos: Point2<isize>) -> bool {
        for tile in shape.iter_tiles() {
            let px = (pos.x + tile.x as isize).try_into();
            let py = (pos.y + tile.y as isize).try_into();

            if let (Ok(px), Ok(py)) = (px, py) {
                if self
                    .get_tile(px, py)
                    .map_or(true, |tile| tile != Tile::Empty)
                {
                    return true;
                }
            } else {
                return true; // out of bounds
            }
        }
        return false;
    }

    /// Projects the shape onto the field using the given tile type.
    pub fn project<T: Shape>(&mut self, shape: &T, pos: Point2<isize>, tile_type: Tile) {
        for tile in shape.iter_tiles() {
            let px = (pos.x + tile.x as isize).try_into();
            let py = (pos.y + tile.y as isize).try_into();

            if let (Ok(px), Ok(py)) = (px, py) {
                self.set_tile(px, py, tile_type);
            }
        }
    }

    /// Marks appropriate lines as cleared and returns the number of cleared lines.
    pub fn clear_lines(&mut self, time: Timestamp) -> usize {
        let mut cleared = 0;

        for y in 0..self.height {
            let is_clear = {
                let mut is_clear = true;
                for x in 0..self.width {
                    if !self
                        .get_tile(x, y)
                        .map_or(false, |tile| tile.is_clearable())
                    {
                        is_clear = false;
                        break;
                    }
                }
                is_clear
            };

            if is_clear {
                // mark cleared
                for x in 0..self.width {
                    self.set_tile(x, y, Tile::Clear(time));
                    self.tiles.push(Tile::Empty);
                }
                cleared += 1;
                self.clear_rows += 1;
            }
        }

        cleared
    }

    /// Removes expired clear lines.
    pub fn clean_lines(&mut self, timeout: Duration, time: Timestamp) {
        let mut y = 0;
        while y < self.tiles.len() / self.width {
            let clear_line = match self.get_tile(0, y) {
                Some(Tile::Clear(instant)) => {
                    if time - instant > timeout {
                        true
                    } else {
                        false
                    }
                }
                _ => false,
            };

            if clear_line {
                for _ in 0..self.width {
                    self.tiles.remove(y * self.width);
                }
                self.clear_rows -= 1;
            } else {
                y += 1;
            }
        }
    }

    /// Returns the number of clear rows.
    pub fn clear_rows(&self) -> usize {
        self.clear_rows
    }

    /// Returns whether or not this field has been topped out.
    ///
    /// Will only check the first top-out line, since pieces can’t be stacked in mid-air.
    pub fn is_top_out(&self) -> bool {
        let y = self.top_height + self.clear_rows;
        for x in 0..self.width {
            if self
                .get_tile(x, y)
                .map_or(false, |tile| tile != Tile::Empty)
            {
                return true;
            }
        }
        false
    }
}

/// A Tetris playfield with an active piece, queue, and held piece.
#[derive(Debug, Clone)]
pub struct ActiveField {
    /// The inner playfield.
    field: Field,
    /// Queue with the next pieces.
    queue: VecDeque<PieceType>,
    /// The type of the piece that is currently in the hold box.
    held_piece: Option<PieceType>,
    /// The current active piece.
    active_piece: Option<ActivePiece>,
}

impl ActiveField {
    pub fn new() -> ActiveField {
        ActiveField {
            field: Field::new(),
            queue: VecDeque::new(),
            held_piece: None,
            active_piece: None,
        }
    }

    /// Updates the queue and fills it up with items if it’s too empty.
    fn update_queue(&mut self) {
        if self.queue.len() < 2 {
            let mut rng = rand::thread_rng();
            let mut t = PieceType::all();
            t.shuffle(&mut rng);
            for i in t {
                self.queue.push_back(i);
            }
        }
    }

    /// Spawns an active piece.
    ///
    /// If the type override is not given, this will pop the queue.
    pub fn spawn_active(&mut self, type_override: Option<PieceType>, time: Timestamp) {
        self.update_queue();
        let piece_type =
            type_override.unwrap_or_else(|| self.queue.pop_front().expect("empty queue"));
        let mut active_piece = ActivePiece::new(piece_type, time);

        let mut active_piece_x_bounds = (0, 0);
        let mut active_piece_baseline_offset = 0;
        for tile in active_piece.iter_tiles() {
            active_piece_x_bounds.0 = tile.x.min(active_piece_x_bounds.0);
            active_piece_x_bounds.1 = tile.x.max(active_piece_x_bounds.1);
            active_piece_baseline_offset = tile.y.min(active_piece_baseline_offset);
        }
        let active_piece_width = active_piece_x_bounds.1 - active_piece_x_bounds.0;

        active_piece.pos.x = self.field.width as isize / 2 - active_piece_width / 2;
        active_piece.pos.y = self.field.top_height as isize + self.field.clear_rows as isize
            - active_piece_baseline_offset;
        active_piece.try_move(&self.field, 0, -1, time);
        self.active_piece = Some(active_piece);
    }

    /// Attempts to rotate the active piece counter-clockwise.
    pub fn rotate_active_ccw(&mut self, time: Timestamp) {
        if let Some(active_piece) = &mut self.active_piece {
            active_piece.try_rotate(&self.field, -1, time);
        }
    }

    /// Attempts to rotate the active piece clockwise.
    pub fn rotate_active_cw(&mut self, time: Timestamp) {
        if let Some(active_piece) = &mut self.active_piece {
            active_piece.try_rotate(&self.field, 1, time);
        }
    }

    /// Attempts to move the active piece left.
    pub fn move_active_left(&mut self, time: Timestamp) {
        if let Some(active_piece) = &mut self.active_piece {
            active_piece.try_move(&self.field, -1, 0, time);
        }
    }

    /// Attempts to move the active piece right.
    pub fn move_active_right(&mut self, time: Timestamp) {
        if let Some(active_piece) = &mut self.active_piece {
            active_piece.try_move(&self.field, 1, 0, time);
        }
    }

    /// Attempts to move the active tile down.
    pub fn move_active_down(&mut self, time: Timestamp) {
        if let Some(active_piece) = &mut self.active_piece {
            active_piece.try_move(&self.field, 0, -1, time);
        }
    }

    /// Moves the active tile all the way down.
    pub fn sonic_drop_active(&mut self, time: Timestamp) {
        // use field height as an upper limit in case of invalid state
        for _ in 0..self.field.height {
            self.move_active_down(time);
            if self
                .active_piece
                .as_ref()
                .map_or(true, |piece| piece.is_on_ground(&self.field))
            {
                break;
            }
        }
    }

    /// Locks the active piece in place.
    pub fn lock_active(&mut self) {
        self.active_piece.take().map(|piece| {
            self.field
                .project(&piece, piece.pos, Tile::Piece(piece.piece_type))
        });
    }

    /// Returns true if the active piece should be locked in place right now.
    pub fn should_lock_active(&mut self, lock_delay: Duration, time: Timestamp) -> bool {
        if let Some(active_piece) = &self.active_piece {
            active_piece.is_on_ground(&self.field)
                && time - active_piece.last_move_time >= lock_delay
        } else {
            false
        }
    }

    /// Swaps the held piece and the active piece if the active piece was not a held piece.
    pub fn swap_held_piece(&mut self, time: Timestamp) {
        if self
            .active_piece
            .as_ref()
            .map_or(false, |p| p.was_held_piece)
        {
            return;
        }
        let new_held_piece = self.active_piece.as_ref().map(|p| p.piece_type);
        if let Some(held_piece) = self.held_piece {
            self.spawn_active(Some(held_piece), time);
        } else {
            self.spawn_active(None, time);
        }
        self.active_piece.as_mut().unwrap().was_held_piece = true;
        self.held_piece = new_held_piece;
    }

    /// Checks for clear lines and removes expired clear lines.
    ///
    /// Returns the number of cleared lines.
    pub fn clear_lines(&mut self, clear_timeout: Duration, time: Timestamp) -> usize {
        let cleared = self.field.clear_lines(time);
        self.field.clean_lines(clear_timeout, time);
        cleared
    }

    /// Removes expired clear lines.
    pub fn clean_lines(&mut self, clear_timeout: Duration, time: Timestamp) {
        self.field.clean_lines(clear_timeout, time);
    }

    /// Returns true if the field has been topped out.
    pub fn is_top_out(&self) -> bool {
        self.field.is_top_out()
    }

    /// Returns the active piece.
    pub fn active_piece(&self) -> Option<&ActivePiece> {
        self.active_piece.as_ref()
    }

    /// Returns the queue.
    pub fn queue(&self) -> &VecDeque<PieceType> {
        &self.queue
    }

    /// Returns the currently held piece.
    pub fn held_piece(&self) -> Option<PieceType> {
        self.held_piece
    }

    /// Returns the field.
    pub fn field(&self) -> &Field {
        &self.field
    }
}

#[test]
fn rotation_to_from_usize() {
    assert_eq!(Rotation::from(0), Rotation::None);
    assert_eq!(Rotation::from(4), Rotation::from(0));
    let i: usize = Rotation::CW.into();
    assert_eq!(i, 1);
}

#[test]
fn piece_type_rotations() {
    const J_OFF_X: isize = 1;
    const J_OFF_Y: isize = 1;
    const J_NONE: &[&[usize]] = &[&[1, 0, 0], &[1, 1, 1], &[0, 0, 0]];
    const J_CW: &[&[usize]] = &[&[0, 1, 1], &[0, 1, 0], &[0, 1, 0]];
    const J_FLIP: &[&[usize]] = &[&[0, 0, 0], &[1, 1, 1], &[0, 0, 1]];
    const J_CCW: &[&[usize]] = &[&[0, 1, 0], &[0, 1, 0], &[1, 1, 0]];

    const I_OFF_X: isize = 1;
    const I_OFF_Y: isize = 1;
    const I_NONE: &[&[usize]] = &[&[0, 0, 0, 0], &[1, 1, 1, 1], &[0, 0, 0, 0], &[0, 0, 0, 0]];
    const I_CW: &[&[usize]] = &[&[0, 0, 1, 0], &[0, 0, 1, 0], &[0, 0, 1, 0], &[0, 0, 1, 0]];
    const I_FLIP: &[&[usize]] = &[&[0, 0, 0, 0], &[0, 0, 0, 0], &[1, 1, 1, 1], &[0, 0, 0, 0]];
    const I_CCW: &[&[usize]] = &[&[0, 1, 0, 0], &[0, 1, 0, 0], &[0, 1, 0, 0], &[0, 1, 0, 0]];

    fn assert_rotated_matches(
        ty: PieceType,
        r: Rotation,
        table: &[&[usize]],
        off_x: isize,
        off_y: isize,
    ) {
        let mut picture = [[0; 4]; 4];
        for tile in ty.iter_tiles_rotated(r) {
            let tile_y: usize = (off_y - tile.y).try_into().unwrap();
            let tile_x: usize = (tile.x + off_x).try_into().unwrap();

            picture[tile_y][tile_x] = 1;
        }

        println!("Testing {:?} rotation {:?}", ty, r);
        println!("- 012345");
        for y in 0..picture.len() {
            fn m(i: usize) -> char {
                match i {
                    0 => ' ',
                    _ => 'X',
                }
            }
            println!(
                "{} {}{}{}{}",
                y,
                m(picture[y][0]),
                m(picture[y][1]),
                m(picture[y][2]),
                m(picture[y][3]),
            );
        }

        for (i, tile) in ty.iter_tiles_rotated(r).enumerate() {
            let tile_y: usize = (off_y - tile.y).try_into().unwrap();
            let tile_x: usize = (tile.x + off_x).try_into().unwrap();

            assert_eq!(
                table[tile_y][tile_x], 1,
                "tile {} at {:?} is invalid",
                i, tile
            );
        }
    }

    assert_rotated_matches(PieceType::J, Rotation::None, J_NONE, J_OFF_X, J_OFF_Y);
    assert_rotated_matches(PieceType::J, Rotation::CW, J_CW, J_OFF_X, J_OFF_Y);
    assert_rotated_matches(PieceType::J, Rotation::Flip, J_FLIP, J_OFF_X, J_OFF_Y);
    assert_rotated_matches(PieceType::J, Rotation::CCW, J_CCW, J_OFF_X, J_OFF_Y);

    assert_rotated_matches(PieceType::I, Rotation::None, I_NONE, I_OFF_X, I_OFF_Y);
    assert_rotated_matches(PieceType::I, Rotation::CW, I_CW, I_OFF_X, I_OFF_Y);
    assert_rotated_matches(PieceType::I, Rotation::Flip, I_FLIP, I_OFF_X, I_OFF_Y);
    assert_rotated_matches(PieceType::I, Rotation::CCW, I_CCW, I_OFF_X, I_OFF_Y);
}
