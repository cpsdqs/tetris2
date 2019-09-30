import EventEmitter from 'events';

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

conn.on('close', () => {
    ws = null;
    if (conn.shouldConnect) {
        conn.connectTimeout = setTimeout(initWS, 1000);
    }
});

conn.send = msg => {
    if (!ws) throw new Error('conn: attempt to send without connection');
    ws.send(JSON.stringify(msg));
};

conn.connect = () => {
    conn.shouldConnect = true;
    if (!ws) initWS();
};

conn.disconnect = () => {
    conn.shouldConnect = false;
    if (ws) ws.close();
};

// protocol
Object.assign(conn.send, {
    init: (name, token) => {
        conn.send({ type: 'init', name, token });
    },
    createGame: (password, clientFields) => {
        conn.send({ type: 'create-game', password, client_fields: clientFields });
    },
    joinGame: (name, password) => {
        conn.send({ type: 'join-game', name, password });
    },
    startGame: () => {
        conn.send({ type: 'start-game' });
    },
    gameCommand: (command) => {
        conn.send({ type: 'game-command', command });
    },
    field: (field) => {
        conn.send({ type: 'field', field });
    }
});

conn.on('message', msg => {
    const emit = (...args) => {
        conn.emit(...args);
    };
    switch (msg.type) {
    case 'name-taken': return emit('name-taken');
    case 'client-list': return emit('client-list', msg.clients);
    case 'started-game': return emit('started-game', msg.client_fields);
    case 'joined-game': return emit('joined-game');
    case 'failed-join-game': return emit('failed-join-game');
    case 'player-list': return emit('player-list', msg.players);
    case 'confirmed-start-game': return emit('confirmed-start-game');
    case 'ended-game': return emit('ended-game');
    case 'fields': return emit('fields', msg.fields);
    default: console.log('receive message with unknown type', msg);
    }
});

export default conn;
