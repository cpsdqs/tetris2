import createShader from 'gl-shader';
import glsl from 'glslify';
import { gl } from './canvas';

const s = (v, f, t) => {
    const shader = createShader(gl, v, f);
    if (t) t(shader);
    return shader;
};

export const text = s(glsl`
precision highp float;

uniform vec2 pixel_scale;
uniform vec2 pos;
uniform vec2 size;
attribute vec2 position;
varying vec2 uv;

void main() {
    gl_Position = vec4(vec2(-1, 1) + vec2(1, -1) * (pixel_scale * (pos + position * size) * 2.), 0, 1);
    uv = position;
}
`, glsl`
precision highp float;

uniform sampler2D texture;
uniform vec4 color;
varying vec2 uv;

void main() {
    gl_FragColor = color * texture2D(texture, uv);
}
`);

export const tile = s(glsl`
precision highp float;

uniform vec2 pixel_scale;
uniform vec2 pos;
uniform vec2 size;
attribute vec2 position;
varying vec2 uv;

void main() {
    gl_Position = vec4(vec2(-1) + pixel_scale * (pos + position * size) * 2., 0, 1);
    uv = position;
}
`, glsl`
precision highp float;

uniform vec4 color;
varying vec2 uv;

void main() {
    gl_FragColor = color;

    vec2 pix_uv = uv * 8.;
    bool x_b = pix_uv.x < 1. || pix_uv.x >= 7.;
    bool y_b = pix_uv.y < 1. || pix_uv.y >= 7.;
    if (x_b || y_b) {
        gl_FragColor = color + vec4(0.1, 0.1, 0.1, 1.);
    }
}
`);

export const obscure = s(glsl`
precision highp float;

uniform vec2 pixel_scale;
uniform vec2 pos;
uniform vec2 size;
attribute vec2 position;

void main() {
    gl_Position = vec4(vec2(-1) + pixel_scale * (pos + position * size) * 2., 0, 1);
}
`, glsl`
precision highp float;

void main() {
    gl_FragColor = vec4(0, 0, 0, 1);
}
`);

export const gameFBO = s(glsl`
precision highp float;

attribute vec2 position;
varying vec2 uv;

void main() {
    gl_Position = vec4(vec2(-1) + 2. * position, 0, 1);
    uv = position;
}
`, glsl`
precision highp float;

uniform sampler2D texture;
uniform vec2 pixel_scale;
varying vec2 uv;

float scl(float i) {
    return exp(-(i * i)) / 2.;
}

void main() {
    vec4 bloom = vec4(0);

    for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
            vec4 tex = texture2D(texture, uv + vec2(i, j) * pixel_scale * 2.);
            tex -= 0.8;
            tex /= 0.2;
            tex = max(vec4(0), tex);
            bloom += tex * tex * tex * scl(float(i)) * scl(float(j));
        }
    }

    gl_FragColor = texture2D(texture, uv) + bloom;
}
`);
