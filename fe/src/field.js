import Text from './text';
import { gl, canvas } from './canvas';
import { tile as tileShader, obscure as obscureShader, particle as particleShader } from './shaders';
import quad from './quad';
import { Spring, lerp } from './animation';

const TILE_SIZE = 8;
const TILE_COLORS = {
    '': [0.1, 0.1, 0.1, 1],
    X: [1.0, 1.0, 1.0, 1],
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

        this.particles = new Particles();

        this.clearBounces = {};
    }

    update (dt) {
        this.dy.update(dt);
        this.particles.update(dt);
    }

    updateField ({ name, field }) {
        if (this.field && field.a.y < this.field.a.y) {
            // active moved down
            const dy = this.field.a.y - field.a.y;
            this.activeDownDelta = dy;
        }

        this.name = name;
        this.field = field;
        this.dims = [this.field.w * TILE_SIZE, this.field.h * TILE_SIZE];
        this.dims[0] += TILE_SIZE * 5; // space for hold/next

        this.titleText.update(`${name}: ${this.field.s} (${this.field.l})`);

        if (this.field.b) {
            this.dy.velocity -= 50;
        }
    }

    makeClearParticles (x, y, clearLine) {
        const white = [1, 1, 1, 1];
        for (let i = 0; i < 4; i++) {
            for (let dx = 0; dx < this.field.w * TILE_SIZE; dx++) {
                const px = x + dx + lerp(-4, 4, Math.random());
                const py = y + lerp(-4, 4, Math.random());
                const dxn = dx / this.field.w / TILE_SIZE;
                const vx = clearLine * 10 * lerp(7, 15, Math.random()) * (dxn - 0.5) ** 5;
                const vy = clearLine * 10 * lerp(-5, -15, Math.random());

                this.particles.addParticle([px, py], [vx, vy], white);
            }
        }
    }

    render (fbo, time) {
        const px = this.pos[0];
        const py = fbo.height - this.pos[1] - this.dims[1] + this.dy.value
            - Math.ceil(32 / fbo.getPixelSize());

        tileShader.bind();
        tileShader.uniforms.pixel_scale = [1 / fbo.width, 1 / fbo.height];
        quad.bind();

        let posY = 0;
        const yOffsets = [];
        for (let y = 0; y < this.field.h + 4; y++) {
            yOffsets[y] = posY;
            const firstTile = this.field.t[y * this.field.w];
            let clearTime = 0;
            if (firstTile.startsWith('X')) {
                const tileTime = +firstTile.substr(1);
                clearTime = Math.min(1, 2 * (time - tileTime));
                const clearID = `${tileTime}${y}`;
                if (clearTime < 1 && !this.clearBounces[clearID]) {
                    this.clearBounces[clearID] = 1;
                }
                if (clearTime >= 1 && this.clearBounces[clearID]) {
                    delete this.clearBounces[clearID];
                    this.dy.velocity -= 100;
                    this.makeClearParticles(px, py + posY, this.dy.velocity / -100);
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

        // draw active tile
        this.drawTiles(
            px + this.field.a.x * TILE_SIZE,
            py,
            this.field.a.y,
            yOffsets,
            this.field.a.p,
            this.field.a.t,
            this.activeDownDelta,
        );

        this.activeDownDelta = 0;

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

        this.particles.render(fbo, this.dy.value);
    }

    drawTiles (x, py, y, yOff, p, t, downDeltaY) {
        tileShader.uniforms.color = TILE_COLORS[p];
        tileShader.uniforms.expand = true;
        for (let i = 0; i < t.length; i += 2) {
            const [dx, dy] = [t[i], t[i + 1]];
            const ydy = y + dy;
            const xy = yOff[ydy] ? yOff[ydy] : (ydy * TILE_SIZE);
            tileShader.uniforms.pos = [x + dx * TILE_SIZE, py + xy];
            quad.draw();

            if (downDeltaY > 1) {
                this.particles.addParticlesIn(
                    x + dx * TILE_SIZE,
                    py + xy,
                    TILE_SIZE,
                    TILE_SIZE * downDeltaY,
                    0,
                    -downDeltaY * downDeltaY,
                    TILE_COLORS[p],
                );
            }
        }
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

const PARTICLE_FRICTION = 7;
const SIGMOID = x => 1 / (1 + Math.exp(-10 * x + 5));

class Particles {
    constructor () {
        this.particles = new Set();
    }

    addParticle (pos, velocity, color) {
        this.particles.add({ p: pos, v: velocity, c: color, r: Math.random() });
    }

    addParticlesIn (x, y, w, h, vx, vy, c) {
        const amount = Math.random() * 0.05 * w * h;
        for (let i = 0; i < amount; i++) {
            const px = lerp(x, x + w, Math.random());
            const py = lerp(y, y + h, lerp(0.3, 1, Math.random()));
            const pvx = lerp(vx / 2, vx, Math.random()) + lerp(-4, 4, Math.random());
            const pvy = lerp(vy / 2, vy, Math.random()) + lerp(-4, 4, Math.random());
            this.addParticle([px, py], [pvx, pvy], c);
        }
    }

    update (dt) {
        const deadParticles = [];

        for (const particle of this.particles) {
            particle.p[0] += particle.v[0] * dt;
            particle.p[1] += particle.v[1] * dt;
            particle.v[0] -= PARTICLE_FRICTION * particle.v[0] * dt;
            particle.v[1] -= PARTICLE_FRICTION * particle.v[1] * dt;

            if (Math.abs(particle.v[0]) + Math.abs(particle.v[1]) < 0.1) {
                deadParticles.push(particle);
            }
        }

        for (const p of deadParticles) this.particles.delete(p);
    }

    render (fbo, dy) {
        quad.bind();
        particleShader.bind();
        particleShader.uniforms.pixel_scale = [1 / fbo.width, 1 / fbo.height];
        particleShader.uniforms.color = [1, 1, 1, 1];
        for (const particle of this.particles) {
            particleShader.uniforms.pos = [particle.p[0], particle.p[1] + dy];
            particleShader.uniforms.color = particle.c;
            particleShader.uniforms.luma = particle.r * Math.min(2, Math.hypot(particle.v[0], particle.v[1]) / 4);
            quad.draw();
        }
        quad.unbind();
    }
}
