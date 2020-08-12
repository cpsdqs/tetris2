const gamepads = [];
const mappings = {
    standard: {
        buttons: {
            2: 'Shift', // square (x)
            0: 'ArrowDown', // x (a)
            1: 'ArrowUp', // o (b)
            // shoulder buttons
            4: 'Shift',
            5: 'Shift',
            6: 'Shift',
            7: 'Shift',
            // dpad
            12: ' ',
            13: 'v',
            14: 'ArrowLeft',
            15: 'ArrowRight',
        },
    },
    ds4: {
        buttons: {
            0: 'Shift', // square (x)
            1: 'ArrowDown', // x (a)
            2: 'ArrowUp', // o (b)
            // shoulder buttons
            4: 'Shift',
            5: 'Shift',
            6: 'Shift',
            7: 'Shift',
            // dpad
            14: ' ',
            15: 'v',
            16: 'ArrowLeft',
            17: 'ArrowRight',
        },
    },
};

let gamepadIndex = 0;
function addGamepad (gamepad) {
    gamepads.push({
        gamepadIndex: gamepadIndex++,
        mapping: gamepad.mapping === 'standard' ? mappings.standard : mappings.ds4,
        buttonStates: {},
    });
    if (gamepad.mapping !== 'standard') alert('assuming DS4 controller');
}

window.addEventListener('gamepadconnected', e => {
    addGamepad(e.gamepad);
});

const BUTTON_REPEAT_INTERVAL = 0.2;

export function pollEvents (callback, dt) {
    const nGamepads = navigator.getGamepads();

    for (const pad of gamepads) {
        for (const index in pad.mapping.buttons) {
            const keyEquiv = pad.mapping.buttons[index];
            const gamepad = nGamepads[pad.gamepadIndex];
            if (gamepad.buttons[index].pressed) {
                if (!(index in pad.buttonStates)) {
                    pad.buttonStates[index] = 0;
                    callback(keyEquiv);
                } else {
                    const prevState = pad.buttonStates[index];
                    pad.buttonStates[index] += dt;
                    const state = pad.buttonStates[index];

                    if (prevState % BUTTON_REPEAT_INTERVAL > state % BUTTON_REPEAT_INTERVAL) {
                        callback(keyEquiv);
                    }
                }
            } else {
                delete pad.buttonStates[index];
            }
        }
    }
}
