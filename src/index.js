const express = require('express')
const expressWs = require('express-ws')
const GameManager = require('./game');

const app = express()
const ws = expressWs(app)

const gameManager = new GameManager();

app.ws('/tetris', (ws, req) => {
    gameManager.addPlayer(ws);
});

app.use(express.static('static'))

app.listen(7375, '127.0.0.1', () => console.log('Listening on :7375'));
