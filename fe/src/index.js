import('./app').then(app => {
    window.app = new app.default();
});
