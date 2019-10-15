import { gl, canvas } from './canvas';
import conn from './conn';
import createFBO from 'gl-fbo';
import quad from './quad';
import { gameFBO as gameFBOShader, bloomThreshold, bloomComposite, gaussianPass } from './shaders';
import Field from './field';
import { createActiveField } from '../../tetris-wasm/pkg';
import * as gamepad from './gamepad';

const LOCK_DELAY = 0.5;
const CLEAR_TIMEOUT = 0.52;

const keymap = {
    'i': 'rotateActiveCW',
    'k': 'rotateActiveCCW',
    'j': 'moveActiveLeft',
    'l': 'moveActiveRight',
    ' ': 'hardDropActive',
    'ArrowUp': 'rotateActiveCW',
    'ArrowDown': 'rotateActiveCCW',
    'ArrowLeft': 'moveActiveLeft',
    'ArrowRight': 'moveActiveRight',
    'x': 'rotateActiveCW',
    'z': 'rotateActiveCCW',
    'Shift': 'swapHeldPiece',
    'c': 'swapHeldPiece',
    'v': 'moveActiveDown',
};

export default class Game {
    constructor () {
        this.fbo = new GameFBO();
        this.field = createActiveField();
        this.fields = {};
        this.dirty = true;
        this.time = 0;
        this.score = 0;
        this.dropTimeout = 0;
    }

    getLevel () {
        // TODO: needs tweaking
        return Math.ceil(Math.log(Math.pow(this.score / 1000, 1.4) + 2));
    }

    getStepCooldown () {
        const level = this.getLevel();
        return Math.pow(0.8 - ((level - 1) * 0.007), level - 1);
    }

    updateFields (fields) {
        for (const name in fields) {
            const field = fields[name];
            if (!(name in this.fields)) {
                this.fields[name] = new Field(field);
            } else {
                this.fields[name].updateField(field);
            }
        }
    }

    onKeyDown (key) {
        const name = keymap[key];
        if (name) {
            if (name === 'hardDropActive') {
                this.bounce = true;
                this.field.sonicDropActive(this.time);
                this.update(0);
                this.render();
                this.isHardDrop = true;
                this.update(0);
            } else {
                this.field[name](this.time);
            }
            this.dirty = true;
        }
    }

    update (dt) {
        gamepad.pollEvents(key => this.onKeyDown(key), dt);

        this.time += dt;
        this.dropTimeout -= dt;

        this.field.cleanLines(CLEAR_TIMEOUT, this.time);

        if (this.dropTimeout < 0) {
            this.dropTimeout = this.getStepCooldown();
            this.field.moveActiveDown(this.time);
            this.dirty = true;
        }

        let bounce = this.bounce;
        this.bounce = false;

        if (this.field.shouldLockActive(LOCK_DELAY, this.time) || this.isHardDrop) {
            this.isHardDrop = false;
            bounce = true;
            this.field.lockActive();
        }
        if (!this.field.getActivePiece()) {
            this.field.spawnActive(null, this.time);
        }

        if (bounce) this.dirty = true;

        if (bounce) {
            const clearedLines = this.field.clearLines(CLEAR_TIMEOUT, this.time);
            this.scoreClearedLines(clearedLines);
        }

        if (this.dirty) {
            // update field contents
            this.dirty = false;

            const activePiece = this.field.getActivePiece();

            const now = Date.now();
            const width = this.field.getFieldWidth();
            const topHeight = this.field.getFieldTopHeight();
            const height = this.field.getFieldHeight();
            const tiles = [];

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const tile = this.field.getFieldTile(x, y);
                    if (typeof tile === 'number') tiles.push(`X${tile}`);
                    else tiles.push(tile.trim());
                }
            }

            const a = {
                p: activePiece.type(),
                x: activePiece.posX(),
                y: activePiece.posY() + this.field.getFieldClearRows(),
                t: activePiece.getTiles(),
            };

            this.updateFields({
                anonymous: {
                    name: 'anonymous',
                    field: {
                        w: width,
                        h: topHeight,
                        s: this.score,
                        l: this.getLevel(),
                        b: bounce,
                        t: tiles,
                        n: this.field.getNextPiece(),
                        o: this.field.getHeldPiece(),
                        a,
                    },
                },
            });
        }

        for (const name in this.fields) this.fields[name].update(dt);
    }

    scoreClearedLines (cleared) {
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

    render () {
        const fboRender = this.fbo.render();
        fboRender.next();

        let x = 4;
        for (const name in this.fields) {
            const field = this.fields[name];
            field.pos[0] = x;
            field.pos[1] = 4;
            field.render(this.fbo, this.time);

            x += field.dims[0] + 8;
        }

        fboRender.next();

        gameFBOShader.bind();
        this.fbo.out.color[0].bind(0);
        quad.bind();
        quad.draw();
        quad.unbind();

        for (const name in this.fields) {
            const field = this.fields[name];
            field.renderUI(this.fbo);
        }
    }

    dispose () {
        this.fbo.dispose();
    }
}

const GAME_HEIGHT = 1080 / 5;

class GameFBO {
    constructor () {
        this.height = GAME_HEIGHT;
    }

    updateFBO () {
        if (this.fboWidth !== this.width || this.fboHeight !== this.height) {
            if (this.fbo) {
                this.fbo.dispose();
                this.fbo2.dispose();
                this.fbo3.dispose();
            }
            this.fbo = createFBO(gl, [this.width, this.height]);
            this.fbo2 = createFBO(gl, [this.width, this.height]);
            this.fbo3 = createFBO(gl, [this.width, this.height]);
            this.fboWidth = this.width;
            this.fboHeight = this.height;
        }
    }
    getPixelSize () {
        return canvas.scaledHeight / this.height;
    }
    *render () {
        const pixelSize = canvas.scaledHeight / this.height;
        this.width = Math.floor(canvas.scaledWidth / pixelSize);
        this.updateFBO();

        const origVP = gl.getParameter(gl.VIEWPORT);

        this.fbo.bind();
        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        yield;

        quad.bind();

        // bloom threshold filter
        this.fbo2.bind();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.fbo.color[0].bind(0);
        bloomThreshold.bind();
        quad.draw();

        // gaussian blur
        this.fbo3.bind();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.fbo2.color[0].bind(0);
        gaussianPass.bind();
        gaussianPass.uniforms.direction = [1 / this.width, 0];
        quad.draw();

        this.fbo2.bind();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.fbo3.color[0].bind(0);
        gaussianPass.uniforms.direction = [0, 1 / this.height];
        quad.draw();

        // composite
        this.fbo3.bind();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.fbo.color[0].bind(0);
        this.fbo2.color[0].bind(1);
        bloomComposite.bind();
        quad.draw();

        quad.unbind();

        this.out = this.fbo3;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(...origVP);
    }

    dispose () {
        if (this.fbo) this.fbo.dispose();
    }
}
