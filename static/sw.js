'use strict';

const VERSION = "0.0.0";

// Message from other workers

let backPort = null;

let post = (msg) => {
    if (backPort) {
        backPort.postMessage(msg);
    } else {
        console.warn(`message dropped`, msg);
    }
};

let messageMapHandler = new Map();
messageMapHandler.set('open', event => {
    backPort = event.ports[0];
});

messageMapHandler.set('get_version', (event) => {
    post({ type: 'reply', id: event.data.id, data: VERSION });
});

self.addEventListener('message', event => {
    if (event.data && event.data.type) {
        let handler = messageMapHandler.get(event.data.type);
        if (handler) {
            handler(event);
        } else {
            console.warn(`message dropped`, event.data);
        }
    } else {
        console.warn(`message dropped`, event.data);
    }
});

// Service worker

self.addEventListener('activate', () => {
    console.debug(`dummy service worker activated in version ${VERSION}`);
});

self.addEventListener('install', () => {
    console.debug(`dummy service worker installed in version ${VERSION}`);
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
