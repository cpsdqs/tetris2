import conn from './conn';
import UI from './ui';
import { gl, canvas } from './canvas';
import Game from './game';

export default class App {
    constructor () {
        conn.on('message', msg => this.onMessage(msg));
        this.ui = new UI();

        window.addEventListener('keydown', e => this.onKeyDown(e));
        window.addEventListener('keyup', e => this.onKeyUp(e));

        this.lastTime = Date.now();
        this.render();
    }

    onMessage (msg) {
        if (msg.type === 'players') this.ui.updatePlayers(msg.players);
        else if (msg.type === 'started-game' || (!this.game && msg.type === 'field-updates')) {
            if (this.game) this.game.dispose();
            this.ui.startedGame();
            this.game = new Game();
        }

        if (msg.type === 'field-updates') {
            this.game.updateFields(msg.updates);
        }
    }

    onKeyDown (e) {
        if (this.game) this.game.onKeyDown(e.key);
        else this.ui.onKeyDown(e.key);
    }
    onKeyUp (e) {

    }

    render () {
        const dt = (Date.now() - this.lastTime) / 1000;
        this.lastTime = Date.now();

        gl.clearColor(0, 0, 0, 1);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (this.game) {
            this.game.update(dt);
            this.game.render();
        }

        this.ui.update(dt);
        this.ui.render();

        requestAnimationFrame(() => this.render());
    }
}
