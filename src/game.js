const EventEmitter = require('events');
const Player = require('./player');

class Game extends EventEmitter {
    constructor (players, broadcast) {
        super();
        this.players = players;
        this.broadcast = broadcast;
        this.time = 0;
        this.lastTime = Date.now();
        this.running = true;

        this.broadcast({ type: 'started-game' });
        for (const player of this.players) {
            player.startGame();
        }
        this.update();
    }

    removePlayer (player) {
        const index = this.players.indexOf(player);
        if (index < 0) return;
        this.players.splice(index, 1);
        this.broadcast({ type: 'remove-field', player: player.name });
    }

    update () {
        const dt = (Date.now() - this.lastTime) / 1000;
        this.lastTime = Date.now();

        let updates = {};
        for (const player of this.players) {
            player.tick(dt);
            if (player.dirty) {
                updates[player.name] = player.serUpdate();
                player.dirty = false;
            }
        }
        this.players = this.players.filter(player => !player.field.isTopOut());

        if (!this.players.length) {
            this.running = false;
            this.emit('close');
            this.broadcast({ type: 'ended-game' });
        }

        if (Object.keys(updates).length) this.broadcast({ type: 'field-updates', updates });

        if (this.running) setTimeout(() => this.update(), 1 / 60);
    }
}

module.exports = class GameManager {
    constructor () {
        this.players = [];
        this.broadcast = (...args) => this._broadcast(...args);
    }

    _broadcast (msg) {
        for (const player of this.players) {
            player.send(msg);
        }
    }

    didProposeGame (player) {
        if (this.game) return;
        if (!this.players.includes(player)) return;
        let canStart = true;
        for (const player of this.players) {
            if (!player.proposedGame) canStart = false;
        }
        this.broadcastPlayers();
        if (canStart) {
            for (const player of this.players) {
                player.proposedGame = false;
            }
            this.game = new Game(this.players.slice(), this.broadcast);
            this.game.on('close', () => this.game = null);
        }
    }

    broadcastPlayers () {
        this.broadcast({
            type: 'players',
            players: this.players.map(player => ({
                name: player.name,
                proposedGame: player.proposedGame,
            })),
        });
    }

    addPlayer (ws) {
        try {
            const player = new Player(this, ws, this.broadcast);
            player.on('init', name => {
                for (const p of this.players) {
                    if (p.name === name) {
                        player.nameIsTaken();
                        return;
                    }
                }
                this.players.push(player);
                this.broadcastPlayers();
                player.on('close', () => {
                    this.players.splice(this.players.indexOf(player), 1);
                    if (this.game) this.game.removePlayer(player);
                    this.broadcastPlayers();
                });
            });
        } catch (err) {
            console.error(err);
        }
    }
}
