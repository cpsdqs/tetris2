import EventEmitter from 'events';
import GameManager from '../../src/game';

const conn = new EventEmitter();

let ws;
function initWS () {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}${location.pathname}tetris`;
    ws = new WebSocket(url);
    ws.onopen = () => conn.emit('open');
    ws.onmessage = msg => conn.emit('message', JSON.parse(msg.data));
    ws.onclose = () => conn.emit('close');
}

let isSP = false;
conn.on('close', () => {
    if (isSP) return;
    setTimeout(initWS, 1000);
});

conn.isSP = () => isSP;

conn.send = msg => {
    ws.send(JSON.stringify(msg));
};

const promptName = (msg) => {
    const name = sessionStorage.tetrisUsername || prompt(msg);
    sessionStorage.tetrisUsername = conn.name = name;
    conn.send({
        type: 'init',
        name,
    });
};

conn.on('message', msg => {
    if (msg.type === 'alert') {
        if (msg.message === 'name is already taken') {
            delete sessionStorage.tetrisUsername;
            promptName(msg.message);
        }
    }
});

conn.on('open', () => {
    promptName('username');
});

conn.makeSingleplayer = () => {
    isSP = true;
    ws.close();

    window.game = new GameManager();
    const game = window.game;

    const sws = new EventEmitter();
    sws.readyState = 1;
    sws.send = msg => conn.emit('message', JSON.parse(msg));
    conn.send = msg => sws.emit('message', JSON.stringify(msg));
    game.addPlayer(sws);
    conn.send({ type: 'init', name: sessionStorage.tetrisUsername });
};

initWS();

export default conn;
