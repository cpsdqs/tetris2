import createTexture from 'gl-texture2d';
import { gl, canvas } from './canvas';
import { text } from './shaders';
import quad from './quad';

const FONT = size => `600 ${size}px Avenir Next, sans-serif`;
const RENDER_SCALE = 2;
const X_PAD = 2;
const Y_PAD = size => size / 4;

const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');

export default class Text {
    constructor (value, size, color = [1, 1, 1, 1]) {
        if (!size) throw new Error("no size");
        this.value = value;
        this.size = size;
        this.color = color;
        this.pos = [0, 0];
        this.dims = [0, 0];
        this.scale = 1;
        this.updateDimensions();
        this.renderText();
    }

    updateDimensions () {
        textCtx.font = FONT(this.size);
        const width = textCtx.measureText(this.value).width;
        this.dims = [width, this.size];
    }

    update (value) {
        this.value = value;
        this.renderText();
    }

    renderText () {
        if (this.rendered === this.value + '\u0000' + this.font) return;
        this.rendered = this.value + '\u0000' + this.font;
        if (this.texture) this.texture.dispose();

        this.updateDimensions();
        const [width, height] = this.dims;
        this.dims = [width, height];
        textCanvas.width = (width + 2 * X_PAD) * RENDER_SCALE;
        textCanvas.height = (height + 2 * Y_PAD(this.size)) * RENDER_SCALE;
        textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
        textCtx.save();
        textCtx.scale(RENDER_SCALE, RENDER_SCALE);
        textCtx.font = FONT(this.size);
        textCtx.fillStyle = '#fff';
        textCtx.textAlign = 'left';
        textCtx.textBaseline = 'top';
        textCtx.fillText(this.value, X_PAD, Y_PAD(this.size));
        textCtx.restore();
        this.texture = createTexture(gl, textCanvas);
    }

    render () {
        text.bind();
        text.uniforms.pixel_scale = [1 / canvas.scaledWidth, 1 / canvas.scaledHeight];

        let posX = this.pos[0] - X_PAD;
        let posY = this.pos[1] - Y_PAD(this.size);
        let width = this.dims[0] + 2 * X_PAD;
        let height = this.dims[1] + 2 * Y_PAD(this.size);;

        posX += width * (1 - this.scale) / 2;
        posY += height * (1 - this.scale) / 2;
        width *= this.scale;
        height *= this.scale;

        text.uniforms.pos = [posX, posY];
        text.uniforms.size = [width, height];
        text.uniforms.color = this.color;
        this.texture.bind(0);
        quad.bind();
        quad.draw();
        quad.unbind();
    }

    dispose () {
        this.texture.dispose();
    }
}
