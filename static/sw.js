'use strict';

const VERSION = "0.0.0";

// Message from other workers

let messageMapHandler = new Map();

messageMapHandler.set('get_version', (event) => {
    event.ports[0].postMessage(VERSION);
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

self.addEventListener('install', (event) => {
    console.debug(`dummy service worker installed in version ${VERSION}`);
    // Activate worker immediately
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    console.debug(`dummy service worker activated in version ${VERSION}`);
    // Become available to all pages
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
