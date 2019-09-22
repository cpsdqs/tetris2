import Text from './text';
import { gl, canvas } from './canvas';
import { tile as tileShader, obscure as obscureShader } from './shaders';
import quad from './quad';
import { Spring } from './animation';

const TILE_SIZE = 8;
const TILE_COLORS = {
    '': [0.1, 0.1, 0.1, 1],
    X: [0.9, 0.9, 0.9, 1],
    I: [0.26, 0.77, 0.9, 1],
    O: [1.0, 0.88, 0.16, 1],
    T: [0.55, 0.38, 0.85, 1],
    S: [0.3, 0.74, 0.42, 1],
    Z: [0.96, 0.28, 0.33, 1],
    J: [0.39, 0.48, 0.77, 1],
    L: [0.92, 0.6, 0.31, 1],
};
const TILE_SHAPES = {
    I: [[0, 0], [1, 0], [2, 0], [3, 0]],
    O: [[0, 0], [1, 0], [0, 1], [1, 1]],
    T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
    J: [[0, 0], [0, 1], [1, 1], [2, 1]],
    L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

const easeClear = t => t < 0.3 ? 0 : ((t - 0.3) / 0.7) ** 2;

export default class Field {
    constructor (data) {
        this.titleText = new Text('', 20);
        this.nextText = new Text('next', 20, [1, 1, 1, 0.8]);
        this.holdText = new Text('hold', 20, [1, 1, 1, 0.8]);
        this.updateField(data);
        this.pos = [0, 0];
        this.dy = new Spring(0.33, 0.38);

        this.clearBounces = {};
    }

    update (dt) {
        this.dy.update(dt);
    }

    updateField ({ name, field }) {
        this.name = name;
        this.field = field;
        this.dims = [this.field.w * TILE_SIZE, this.field.h * TILE_SIZE];
        this.dims[0] += TILE_SIZE * 5; // space for hold/next

        this.titleText.update(`${name}: ${this.field.s} (${this.field.l})`);

        if (this.field.b) {
            this.dy.velocity -= 50;
        }
    }

    render (fbo) {
        const px = this.pos[0];
        const py = fbo.height - this.pos[1] - this.dims[1] + this.dy.value
            - Math.ceil(32 / fbo.getPixelSize());

        tileShader.bind();
        tileShader.uniforms.pixel_scale = [1 / fbo.width, 1 / fbo.height];
        quad.bind();

        let posY = 0;
        for (let y = 0; y < this.field.h + 4; y++) {
            const firstTile = this.field.t[y * this.field.w];
            let clearTime = 0;
            if (firstTile.startsWith('X')) {
                const tileTime = +firstTile.substr(1);
                clearTime = Math.min(1, (Date.now() - tileTime) / 500);
                if (clearTime < 1 && !this.clearBounces[tileTime]) {
                    this.clearBounces[tileTime] = 1;
                }
                if (clearTime >= 1 && this.clearBounces[tileTime]) {
                    delete this.clearBounces[tileTime];
                    this.dy.velocity -= 100;
                }
            }
            clearTime = easeClear(clearTime);
            const tileHeight = Math.round(TILE_SIZE * (1 - clearTime));
            tileShader.uniforms.size = [TILE_SIZE, tileHeight];

            for (let x = 0; x < this.field.w; x++) {
                const tile = this.field.t[y * this.field.w + x].substr(0, 1);
                tileShader.uniforms.color = TILE_COLORS[tile];
                tileShader.uniforms.pos = [px + x * TILE_SIZE, py + posY];
                quad.draw();
            }

            posY += tileHeight;
        }

        // draw next piece
        this.drawPiece(px + (this.field.w + 1) * TILE_SIZE, py + (this.field.h - 2) * TILE_SIZE, this.field.n);

        // draw held piece
        this.drawPiece(px + (this.field.w + 1) * TILE_SIZE, py + (this.field.h - 7) * TILE_SIZE, this.field.o);

        // obscure top rows
        obscureShader.bind();
        obscureShader.uniforms.pixel_scale = [1 / fbo.width, 1 / fbo.height];
        obscureShader.uniforms.pos = [px, py + this.field.h * TILE_SIZE];
        obscureShader.uniforms.size = [this.field.w * TILE_SIZE, 4 * TILE_SIZE];
        quad.draw();

        quad.unbind();
    }

    drawPiece (x, y, p) {
        if (!p) return;
        const shape = TILE_SHAPES[p];
        tileShader.uniforms.color = TILE_COLORS[p];
        tileShader.uniforms.expand = true;
        for (const [dx, diy] of shape) {
            tileShader.uniforms.pos = [x + dx * TILE_SIZE, y - diy * TILE_SIZE];
            quad.draw();
        }
    }

    renderUI (fbo) {
        const pixelSize = fbo.getPixelSize();
        const dy = Math.round(this.dy.value) * -pixelSize;
        this.titleText.pos[0] = this.pos[0] * pixelSize;
        this.titleText.pos[1] = this.pos[1] * pixelSize + dy;
        this.titleText.render();

        const nhx = (this.pos[0] + (this.field.w + 1) * TILE_SIZE) * pixelSize;
        this.nextText.pos = [nhx, (this.pos[1] + 1 * TILE_SIZE) * pixelSize + dy];
        this.nextText.render();
        this.holdText.pos = [nhx, (this.pos[1] + 6 * TILE_SIZE) * pixelSize + dy];
        this.holdText.render();
    }
}
