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

export const particle = s(glsl`
precision highp float;

uniform vec2 pos;
uniform vec2 pixel_scale;
attribute vec2 position;

void main() {
    gl_Position = vec4(vec2(-1) + pixel_scale * (pos + position) * 2., 0, 1);
}
`, glsl`
precision highp float;

uniform vec4 color;
uniform float luma;

void main() {
    gl_FragColor = vec4(color.rgb + vec3(clamp(luma - 1., 0., 1.)), clamp(color.a * luma, 0., 1.));
}`);

export const bloomThreshold = s(glsl`
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
varying vec2 uv;

vec3 luma_factors = vec3(0.21, 0.72, 0.07);

float luma_transfer(float lum) {
    float lum3 = lum * lum * lum;
    return lum3 * lum3 * lum3;
}

void main() {
    vec3 color = texture2D(texture, uv).rgb;
    float lum = dot(color, luma_factors);
    gl_FragColor = vec4(mix(vec3(0), color.rgb, luma_transfer(lum)), 1);
}
`);

export const bloomComposite = s(glsl`
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
uniform sampler2D bloomTexture;
varying vec2 uv;

vec3 luma_factors = vec3(0.21, 0.72, 0.07);
vec3 background = vec3(0);

void main() {
    vec4 color = texture2D(texture, uv);
    vec3 bloomColor = texture2D(bloomTexture, uv).rgb;
    color = vec4(mix(background, color.rgb, color.a), 1); // alpha composite with background
    color.r = 1. - (1. - color.r) * (1. - bloomColor.r);
    color.g = 1. - (1. - color.g) * (1. - bloomColor.g);
    color.b = 1. - (1. - color.b) * (1. - bloomColor.b);
    gl_FragColor = color;
}
`, s => {
    s.bind();
    s.uniforms.bloomTexture = 1;
});

export const gaussianPass = s(glsl`
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
uniform float kernel[7];
uniform vec2 direction;
varying vec2 uv;

void main() {
    vec4 color = vec4(0);

    for (int i = -3; i <= 3; i++) {
        color += texture2D(texture, uv + float(i) * direction) * kernel[i + 3];
    }

    gl_FragColor = color;
}
`, s => {
    s.bind();
    // s.uniforms.kernel = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136];
    s.uniforms.kernel = [0.00598, 0.060626, 0.241843, 0.383103, 0.241843, 0.060626, 0.00598];
});


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
varying vec2 uv;

void main() {
    gl_FragColor = texture2D(texture, uv);
}
`);
