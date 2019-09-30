const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HTMLWebpackPlugin = require('html-webpack-plugin');
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin');

module.exports = {
    output: {
        path: path.resolve(__dirname, '../static'),
        filename: 'main.js',
        chunkFilename: '[id].js',
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HTMLWebpackPlugin({
            title: 'Tetris2',
        }),
        new WasmPackPlugin({
            crateDirectory: path.resolve(__dirname, '../tetris-wasm'),
        }),
    ],
    devtool: 'source-map',
};
