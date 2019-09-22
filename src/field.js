const FIELD_WIDTH = 10;
const FIELD_HEIGHT = 40;
const FIELD_TOP_HEIGHT = 22;

// field orientation:
// x goes right
// y goes up (bottom row is at the start)

const scalarProduct = (a, b) => a.map((x, i) => x * b[i]).reduce((a, b) => a + b);
const mat3Vector = (m, i) => [m[i], m[3 + i], m[6 + i]];
const mat3Transpose = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const mat3Mul = (a, b) => {
    a = mat3Transpose(a);
    return [
        scalarProduct(mat3Vector(a, 0), mat3Vector(b, 0)),
        scalarProduct(mat3Vector(a, 0), mat3Vector(b, 1)),
        scalarProduct(mat3Vector(a, 0), mat3Vector(b, 2)),
        scalarProduct(mat3Vector(a, 1), mat3Vector(b, 0)),
        scalarProduct(mat3Vector(a, 1), mat3Vector(b, 1)),
        scalarProduct(mat3Vector(a, 1), mat3Vector(b, 2)),
        scalarProduct(mat3Vector(a, 2), mat3Vector(b, 0)),
        scalarProduct(mat3Vector(a, 2), mat3Vector(b, 1)),
        scalarProduct(mat3Vector(a, 2), mat3Vector(b, 2)),
    ];
};
const mat3VecMul = (a, v) => {
    a = mat3Transpose(a);
    return [
        scalarProduct(mat3Vector(a, 0), v),
        scalarProduct(mat3Vector(a, 1), v),
        scalarProduct(mat3Vector(a, 2), v),
    ];
};

const compileShape = shape => [...shape.replace(/\|/g, '')].map(c => c === 'x' ? 1 : 0);
const compileRotation = ccw => {
    return [
        // 0: initial state
        [1, 0, 0, 0, 1, 0, 0, 0, 1],
        // 1: clockwise
        mat3Mul(mat3Mul(ccw, ccw), ccw),
        // 2: flip
        mat3Mul(ccw, ccw),
        // 3: counterclockwise
        ccw,
    ];
};

const rotateShapeWithMatrix = (shape, matrix) => {
    const newShape = shape.slice();
    const shapeSize = Math.sqrt(shape.length);
    for (let y = 0; y < shapeSize; y++) {
        for (let x = 0; x < shapeSize; x++) {
            const pos = mat3VecMul(matrix, [x, y, 1]);
            newShape[y * shapeSize + x] = shape[pos[1] * shapeSize + pos[0]];
        }
    }
    return newShape;
};

const pivot11Rotation = compileRotation([
    0, 1, -1,
    -1, 0, 3,
    0, 0, 1,
]);
const pivot11WallPop = {
    [0 << 4 + 1]: [[0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
    [1 << 4 + 0]: [[0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
    [1 << 4 + 2]: [[0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
    [2 << 4 + 1]: [[0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
    [2 << 4 + 3]: [[0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]],
    [3 << 4 + 2]: [[0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
    [3 << 4 + 0]: [[0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
    [0 << 4 + 3]: [[0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]],
};

const TILES = {
    I: {
        shape: compileShape('----|----|xxxx|----'),
        rotations: compileRotation([
            0, 1, 0,
            -1, 0, 3,
            0, 0, 1,
        ]),
        wallPop: {
            [0 << 4 + 1]: [[0, 0], [-2, 0], [ 1, 0], [-2, -1], [ 1,  2]],
            [1 << 4 + 0]: [[0, 0], [ 2, 0], [-1, 0], [ 2,  1], [-1, -2]],
            [1 << 4 + 2]: [[0, 0], [-1, 0], [ 2, 0], [-1,  2], [ 2, -1]],
            [2 << 4 + 1]: [[0, 0], [ 1, 0], [-2, 0], [ 1, -2], [-2,  1]],
            [2 << 4 + 3]: [[0, 0], [ 2, 0], [-1, 0], [ 2,  1], [-1, -2]],
            [3 << 4 + 2]: [[0, 0], [-2, 0], [ 1, 0], [-2, -1], [ 1,  2]],
            [3 << 4 + 0]: [[0, 0], [ 1, 0], [-2, 0], [ 1, -2], [-2,  1]],
            [0 << 4 + 3]: [[0, 0], [-1, 0], [ 2, 0], [-1,  2], [ 2, -1]],
        },
    },
    J: {
        shape: compileShape('----|----|xxx-|x---'),
        rotations: pivot11Rotation,
        wallPop: pivot11WallPop,
    },
    L: {
        shape: compileShape('----|----|xxx-|--x-'),
        rotations: pivot11Rotation,
        wallPop: pivot11WallPop,
    },
    O: {
        shape: compileShape('----|----|-xx-|-xx-'),
        rotations: compileRotation([
            1, 0, 0,
            0, 1, 0,
            0, 0, 1,
        ]),
        wallPop: {
            [0 << 4 + 1]: [[0, 0]],
            [1 << 4 + 0]: [[0, 0]],
            [1 << 4 + 2]: [[0, 0]],
            [2 << 4 + 1]: [[0, 0]],
            [2 << 4 + 3]: [[0, 0]],
            [3 << 4 + 2]: [[0, 0]],
            [3 << 4 + 0]: [[0, 0]],
            [0 << 4 + 3]: [[0, 0]],
        },
    },
    S: {
        shape: compileShape('----|----|xx--|-xx-'),
        rotations: pivot11Rotation,
        wallPop: pivot11WallPop,
    },
    T: {
        shape: compileShape('----|----|xxx-|-x--'),
        rotations: pivot11Rotation,
        wallPop: pivot11WallPop,
    },
    Z: {
        shape: compileShape('----|----|-xx-|xx--'),
        rotations: pivot11Rotation,
        wallPop: pivot11WallPop,
    },
};

class ActiveTile {
    constructor (type, x, y) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.rotation = 0;
        Object.assign(this, TILES[type]);
    }

    resolveShape () {
        return rotateShapeWithMatrix(this.shape, this.rotations[this.rotation]);
    }

    rotate (field, rotation) {
        const newRotation = (((this.rotation + rotation) % 4) + 4) % 4;
        const newShape = rotateShapeWithMatrix(this.shape, this.rotations[newRotation]);
        const wallPopIndex = this.rotation << 4 + newRotation;
        const popOffsets = this.wallPop[wallPopIndex];

        for (const offset of popOffsets) {
            const [dx, dy] = offset;
            if (!field.collide(newShape, this.x + dx, this.y + dy)) {
                // valid position
                this.rotation = newRotation;
                this.x += dx;
                this.y += dy;
                break;
            }
        }
    }

    project (tiles, width) {
        const size = Math.sqrt(this.shape.length);
        const resolved = this.resolveShape();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (resolved[y * size + x]) {
                    tiles[(this.y + y) * width + (this.x + x)] = this.type;
                }
            }
        }
    }

    move (field, dx) {
        const resolved = this.resolveShape();
        if (field.collide(resolved, this.x + dx, this.y)) return;
        this.x += dx;
    }

    moveDown (field) {
        const resolved = this.resolveShape();
        if (field.collide(resolved, this.x, this.y - 1)) {
            return true;
        }
        this.y--;
    }
}

module.exports = class Field {
    constructor () {
        this.width = FIELD_WIDTH;
        this.height = FIELD_HEIGHT;
        this.topHeight = FIELD_TOP_HEIGHT;
        this.clearRows = 0;
        this.score = 0;
        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) this.tiles.push('');
        }

        this.queue = [];
        this.heldPiece = '';
        this.spawnActive();
    }

    getLevel () {
        // FIXME: needs tweaking
        return Math.ceil(Math.log((this.score / 1000) ** 1.4 + 2));
    }

    getTile (x, y) {
        if (x < 0 || y < 0 || x >= this.width || y > this.height) return 'X';
        return this.tiles[y * this.width + x];
    }
    setTile (x, y, v) {
        this.tiles[y * this.width + x] = v;
    }

    updateQueue () {
        if (this.queue.length < 2) {
            const t = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
            // shuffle
            for (let j, x, i = t.length; i; j = Math.floor(Math.random() * i), x = t[--i], t[i] = t[j], t[j] = x);
            this.queue.push(...t);
        }
    }

    spawnActive (typeOverride) {
        this.updateQueue();
        const type = typeOverride || this.queue.shift();
        this.active = new ActiveTile(type, Math.floor(this.width / 2) - 2, 20 + this.clearRows);
        this.active.moveDown(this);
    }

    collide (shape, sx, sy) {
        const shapeSize = Math.sqrt(shape.length);
        for (let y = 0; y < shapeSize; y++) {
            for (let x = 0; x < shapeSize; x++) {
                if (shape[y * shapeSize + x] && this.getTile(sx + x, sy + y)) {
                    return true;
                }
            }
        }
        return false;
    }

    rotateActiveCW () {
        this.active.rotate(this, 1);
    }
    rotateActiveCCW () {
        this.active.rotate(this, -1);
    }
    moveActiveLeft () {
        this.active.move(this, -1);
    }
    moveActiveRight () {
        this.active.move(this, 1);
    }
    dropActive () {
        this.tick();
    }
    hardDropActive () {
        while (!this.active.moveDown(this));
    }
    holdPiece () {
        if (this.active.wasHoldPiece) return;
        const holdType = this.active.type;
        this.spawnActive(this.heldPiece);
        this.heldPiece = holdType;
        this.active.wasHoldPiece = true;
    }

    clearLinesMaybe () {
        let cleared = 0;
        let y = 0;
        outer:
        while (y < this.height) {
            let shouldRemoveRow = false;
            for (let x = 0; x < this.width; x++) {
                const tile = this.tiles[y * this.width + x];
                if (x === 0 && tile.startsWith('X')) {
                    // clear row
                    let time = +tile.substr(1);
                    if (time < Date.now() - 600) {
                        shouldRemoveRow = true;
                        break;
                    } else {
                        y++;
                        continue outer;
                    }
                }
                if (!tile) {
                    y++;
                    continue outer;
                }
            }
            if (shouldRemoveRow) {
                // remove row
                for (let x = 0; x < this.width; x++) {
                    this.tiles.splice(y * this.width, 1);
                }
                this.clearRows--;
            } else {
                // clear row
                for (let x = 0; x < this.width; x++) {
                    this.tiles[y * this.width + x] = x === 0 ? `X${+Date.now()}` : 'X';
                    this.tiles.push('');
                }
                y++;
                this.clearRows++;
                cleared++;
            }
        }

        const wasTetris = this.wasTetris;
        this.wasTetris = false;

        const level = this.getLevel();
        let score = 0;
        if (cleared === 1) score = 100 * level;
        else if (cleared === 2) score = 300 * level;
        else if (cleared === 3) score = 500 * level;
        else if (cleared === 4) {
            if (wasTetris) {
                score = 1200 * level;
                this.wasTetris = true;
            } else {
                score = 800 * level;
                this.wasTetris = true;
            }
        } else if (cleared > 4) {
            // this shouldn’t happen in normal tetris but handle it anyway
            score = (wasTetris ? 400 : 300) * cleared * level;
            this.wasTetris = true;
        }

        this.score += score;
    }

    isTopOut () {
        for (let x = 0; x < this.width; x++) {
            if (this.tiles[(this.topHeight + this.clearRows) * this.width + x]) {
                return true;
            }
        }
        return false;
    }

    tick () {
        if (this.active.moveDown(this)) {
            this.active.project(this.tiles, this.width);
            this.clearLinesMaybe();
            this.spawnActive();
            this.bounce = true;
        }
    }

    serialize () {
        const tiles = this.tiles.slice();
        this.active.project(tiles, this.width);

        const bounce = !!this.bounce;
        this.bounce = false;

        return {
            n: this.queue[0],
            o: this.heldPiece,
            w: this.width,
            h: this.topHeight,
            t: tiles,
            b: bounce,
            s: this.score,
            l: this.getLevel(),
        };
    }
}
