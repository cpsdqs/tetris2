import { gl, canvas } from './canvas';
import { Spring, lerp } from './animation';
import conn from './conn';
import Text from './text';

const TITLE_COLOR = [0.9, 0.6, 0.1, 1];
const MENU_ITEM_COLOR = [1.0, 0.8, 0.1, 1];
const FOCUSED_ITEM_COLOR = t => {
    const variants = [
        [1.0, 0.88, 0.16, 1],
        [0.92, 0.6, 0.31, 1],
        [0.96, 0.28, 0.33, 1],
        [0.3, 0.74, 0.42, 1],
        [0.39, 0.48, 0.77, 1],
        [0.26, 0.77, 0.9, 1],
        [0.55, 0.38, 0.85, 1],
    ];
    return variants[Math.floor((t % 2) / 2 * variants.length)];
}
const PLAYER_COLOR = MENU_ITEM_COLOR;
const PLAYER_PROPOSED_COLOR = [0.6, 1.0, 0.3, 1];

export default class UI {
    constructor () {
        this.mainMenu = new MainMenu();
        this.playerList = new PlayerList();
    }

    updatePlayers (players) {
        this.playerList.updatePlayers(players);
    }

    startedGame () {
        this.mainMenu.visibility.target = 0;
        this.playerList.visibility.target = 0;
    }

    onKeyDown (key) {
        return this.mainMenu.onKeyDown(key);
    }

    update (dt) {
        this.mainMenu.update(dt);
        this.playerList.update(dt);
    }

    render () {
        this.mainMenu.render();
        this.playerList.render();
    }
}

class MainMenu {
    constructor () {
        this.title = new Text('Tetris', 48, TITLE_COLOR);
        this.title.pos = [16, 16];
        this.startGame = new MenuItem('Disconnected');
        this.startGame.pos = [16, 128];
        this.startSP = new MenuItem('Start Singleplayer');
        this.startSP.pos = [16, 128 + 48];
        this.visibility = new Spring(1, 0.5);
        this.visibility.target = 1;

        this.keybinds = new Text('Key bindings: Z X C V I J K L Space Arrows', 24, MENU_ITEM_COLOR);
        this.keybinds.pos = [16, 128 + 100];

        this.selection = 1;

        conn.on('close', () => {
            this.startGame.setLabel('Disconnected');
            if (!conn.isSP()) this.visibility.target = 1;
        });
        conn.on('open', () => {
            this.startGame.setLabel('Start Multiplayer');
        });
    }

    update (dt) {
        this.visibility.update(dt);
        this.startGame.update(dt);
        this.startSP.update(dt);
    }

    onKeyDown (key) {
        if (key === 'c') {
            if (this.selection === 0) {
                this.startGame.activate();
                this.startGame.setLabel('Waiting for other players…');
                conn.send({ type: 'start-game' });
            } else {
                conn.makeSingleplayer();
                setTimeout(() => conn.send({ type: 'start-game' }), 100);
            }
        } else if (key === 'ArrowDown' || key === 'k') {
            this.selection++;
        } else if (key === 'ArrowUp' || key === 'i') {
            this.selection--;
        }

        this.selection = ((this.selection % 2) + 2) % 2;
    }

    render () {
        if (this.visibility.value <= 0) return;
        this.title.pos[0] = lerp(-this.title.dims[0], 16, this.visibility.value);
        this.startGame.pos[0] = lerp(-this.startGame.text.dims[0], 16, this.visibility.value);
        this.startSP.pos[0] = lerp(-this.startSP.text.dims[0], 16, this.visibility.value);
        this.keybinds.pos[0] = lerp(-this.keybinds.dims[0], 16, this.visibility.value);

        const items = [this.startGame, this.startSP];
        for (const item of items) item.focused = false;
        items[this.selection].focused = true;

        this.title.render();
        this.startGame.render();
        this.startSP.render();
        this.keybinds.render();
    }
}

class MenuItem {
    constructor (label) {
        this.focused = false;
        this.text = new Text(label, 32);
        this.pos = [0, 0];
        this.scale = new Spring(0.55, 0.3, 1);
        this.time = 0;
    }

    setLabel (label) {
        this.text.update(label);
    }

    update (dt) {
        this.time += dt;
        this.scale.update(dt);
    }

    activate () {
        this.scale.velocity = -5;
    }

    render () {
        this.text.pos = [this.pos[0], this.pos[1]];
        this.text.scale = this.scale.value;
        this.text.color = this.focused
            ? FOCUSED_ITEM_COLOR(this.time)
            : MENU_ITEM_COLOR;
        this.text.render();
    }
}

class PlayerList {
    constructor () {
        this.title = new Text('Players', 32, TITLE_COLOR);
        this.players = {};
        this.visibility = new Spring(1, 0.5);
        this.visibility.target = 1;

        conn.on('open', () => {
            this.visibility.target = 1;
        });
    }

    update (dt) {
        this.visibility.update(dt);
        for (const k in this.players) this.players[k].visibility.update(dt);
    }

    updatePlayers (players) {
        const playerNames = [];
        for (const p of players) {
            playerNames.push(p.name);
            this.updatePlayer(p);
        }
        for (const k in this.players) {
            if (!playerNames.includes(k)) {
                this.removePlayer(k);
            }
        }
        const unsorted = this.players;
        const sorted = Object.keys(unsorted).sort();
        this.players = {};
        for (const k of sorted) this.players[k] = unsorted[k];
    }

    updatePlayer (player) {
        if (this.players[player.name]) {
            const p = this.players[player.name];
            p.isBeingRemoved = false;
            p.visibility.target = 1;
            const wasProposing = p.player.proposedGame;
            p.player = player;
            if (p.player.proposedGame && !wasProposing) {
                p.visibility.velocity = 3;
            }
        } else {
            this.players[player.name] = {
                text: new Text(player.name, 24, PLAYER_COLOR),
                player,
                visibility: new Spring(1, 0.5),
            };
            this.players[player.name].visibility.target = 1;
        }
    }

    removePlayer (name) {
        if (!this.players[name] || this.players[name].isBeingRemoved) return;
        this.players[name].isBeingRemoved = true;
        this.players[name].visibility.target = 0;
        this.players[name].visibility.on('finish', () => {
            if (!this.players[name] || !this.players[name].isBeingRemoved) return;
            this.players[name].text.dispose();
            delete this.players[name];
        });
    }

    render () {
        if (this.visibility.value <= 0) return;

        let width = this.title.dims[0];
        for (const k in this.players) {
            width = Math.max(width, this.players[k].text.dims[0]);
        }

        let x = v => canvas.scaledWidth - 16 + (1 - v) * (16 + width);
        let y = 16;

        this.title.pos[0] = x(this.visibility.value) - this.title.dims[0];
        this.title.pos[1] = y;
        this.title.render();
        y += this.title.dims[1] + 10;

        for (const k in this.players) {
            const p = this.players[k];
            p.text.pos[0] = x(this.visibility.value * p.visibility.value) - p.text.dims[0];
            p.text.pos[1] = y;
            p.text.color = p.player.proposedGame
                ? PLAYER_PROPOSED_COLOR
                : PLAYER_COLOR;
            p.text.render();
            y += (p.text.dims[1] + 4) * Math.min(1, p.visibility.value);
        }
    }
}
