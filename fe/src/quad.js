import createBuffer from 'gl-buffer';
import createVAO  from 'gl-vao';
import { gl } from './canvas';

export const quad = createVAO(gl, [
    {
        buffer: createBuffer(gl, [0, 0, 0, 1, 1, 0, 1, 1]),
        type: gl.FLOAT,
        size: 2,
    },
], createBuffer(gl, new Uint16Array([0, 2, 1, 1, 2, 3]), gl.ELEMENT_ARRAY_BUFFER));


export default {
    bind: () => quad.bind(),
    unbind: () => quad.unbind(),
    draw: () => quad.draw(gl.TRIANGLES, 6),
};
