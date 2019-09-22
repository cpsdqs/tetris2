const EventEmitter = require('events');
const Field = require('./field');

module.exports = class Player extends EventEmitter {
    constructor (gm, ws, broadcast) {
        super();
        this.gm = gm;
        this.ws = ws;
        this.ws.on('message', (...args) => this.onMessage(...args));
        this.ws.on('close', (...args) => this.onClose(...args));
        this.broadcast = broadcast;
        this.name = '';
        this.field = new Field();
        this.isPlaying = false;
        this.time = 0;
        this.tickTime = 0;
        this.dirty = false;
        this.moveCooldown = 0;
    }

    startGame () {
        this.time = 0;
        this.tickTime = 0;
        this.moveCooldown = 0;
        this.isPlaying = true;
    }

    getTPS () {
        const level = this.field.getLevel();
        return 1 / ((0.8 - ((level - 1) * 0.007)) ** (level - 1));
    }

    getMoveCooldown () {
        return 0.1 / this.getTPS();
    }

    tick (dt) {
        this.time += dt;
        this.tickTime -= dt;
        this.moveCooldown -= dt;
        if (this.tickTime <= 0) {
            this.field.tick();
            this.tickTime = 1 / this.getTPS();

            if (this.field.isTopOut()) {
                this.isPlaying = false;
                this.sendGameOver();
            }
            this.dirty = true;
        }
    }

    serUpdate () {
        return {
            name: this.name,
            field: this.field.serialize(),
        };
    }

    send (msg) {
        if (this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    onMessage (msg) {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (err) {}
        if (data) this.handleMessage(data);
    }

    onClose () {
        this.emit('close');
    }

    nameIsTaken () {
        this.send({ type: 'alert', message: 'name is already taken' });
    }

    handleMessage (msg) {
        if (msg.type === 'init') {
            this.name = '' + msg.name;
            this.emit('init', this.name);
        } else if (msg.type === 'start-game') {
            this.proposedGame = true;
            this.gm.didProposeGame(this);
        } else if (msg.type === 'game-command') {
            this.handleGameControl(msg);
        }
    }

    handleGameControl (msg) {
        if (msg.command === 'rcw') {
            if (this.moveCooldown <= 0) {
                this.field.rotateActiveCW();
                this.moveCooldown = this.getMoveCooldown();
                this.dirty = true;
            }
        } else if (msg.command === 'rccw') {
            if (this.moveCooldown <= 0) {
                this.field.rotateActiveCCW();
                this.moveCooldown = this.getMoveCooldown();
                this.dirty = true;
            }
        } else if (msg.command === 'ml') {
            if (this.moveCooldown <= 0) {
                this.field.moveActiveLeft();
                this.moveCooldown = this.getMoveCooldown();
                this.dirty = true;
            }
        } else if (msg.command === 'mr') {
            if (this.moveCooldown <= 0) {
                this.field.moveActiveRight();
                this.moveCooldown = this.getMoveCooldown();
                this.dirty = true;
            }
        } else if (msg.command === 'drop') {
            this.field.dropActive();
            this.dirty = true;
        } else if (msg.command === 'hdrop') {
            this.field.hardDropActive();
            this.dirty = true;
        } else if (msg.command === 'hold') {
            this.field.holdPiece();
            this.dirty = true;
        }
    }

    sendGameOver () {
        // TODO
    }
}
