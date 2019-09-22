export const canvas = document.createElement('canvas');
export const gl = canvas.getContext('webgl');
document.body.appendChild(canvas);
Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
});

const updateSize = () => {
    canvas.scale = Math.ceil(window.devicePixelRatio);
    canvas.width = innerWidth * canvas.scale;
    canvas.height = innerHeight * canvas.scale;
    canvas.scaledWidth = innerWidth;
    canvas.scaledHeight = innerHeight;

    canvas.dispatchEvent(new Event('draw'));
};
updateSize();
window.addEventListener('resize', updateSize);
