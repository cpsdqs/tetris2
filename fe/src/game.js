import { gl, canvas } from './canvas';
import conn from './conn';
import createFBO from 'gl-fbo';
import quad from './quad';
import { gameFBO as gameFBOShader } from './shaders';
import Field from './field';

const keymap = {
    'i': 'rcw',
    'k': 'rccw',
    'j': 'ml',
    'l': 'mr',
    ' ': 'drop',
    'ArrowUp': 'rcw',
    'ArrowDown': 'rccw',
    'ArrowLeft': 'ml',
    'ArrowRight': 'mr',
    'x': 'rcw',
    'z': 'rccw',
    'Shift': 'hold',
    'c': 'hold',
    'v': 'hdrop',
};

export default class Game {
    constructor () {
        this.fbo = new GameFBO();
        this.fields = {};
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
        if (keymap[key]) {
            conn.send({ type: 'game-command', command: keymap[key] });
        }
    }

    update (dt) {
        for (const name in this.fields) this.fields[name].update(dt);
    }

    render () {
        const fboRender = this.fbo.render();
        fboRender.next();

        let x = 4;
        for (const name in this.fields) {
            const field = this.fields[name];
            field.pos[0] = x;
            field.pos[1] = 4;
            field.render(this.fbo);

            x += field.dims[0] + 8;
        }

        fboRender.next();

        gameFBOShader.bind();
        gameFBOShader.uniforms.pixel_scale = [1 / this.fbo.width, 1 / this.fbo.height];
        this.fbo.fbo.color[0].bind(0);
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

const PIXEL_SIZE = 4;

class GameFBO {
    updateFBO () {
        if (this.fboWidth !== this.width || this.fboHeight !== this.height) {
            if (this.fbo) this.fbo.dispose();
            this.fbo = createFBO(gl, [this.width, this.height]);
            this.fboWidth = this.width;
            this.fboHeight = this.height;
        }
    }
    getPixelSize () {
        return PIXEL_SIZE;
    }
    *render () {
        this.width = Math.floor(canvas.scaledWidth / PIXEL_SIZE);
        this.height = Math.floor(canvas.scaledHeight / PIXEL_SIZE);
        this.updateFBO();

        const origVP = gl.getParameter(gl.VIEWPORT);

        this.fbo.bind();
        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        yield;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        gl.viewport(...origVP);
    }

    dispose () {
        if (this.fbo) this.fbo.dispose();
    }
}
