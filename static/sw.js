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
    console.log(`[SW-${VERSION}] service worker installed`);
    // Activate worker immediately
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    console.log(`[SW-${VERSION}] service worker activated`);
    // Become available to all pages
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    let handler = fetch(event.request)
        .then((response) => {
            if (response.ok) {
                console.log(`[SW-${VERSION}] fetch ${event.request.url} success`);
            } else {
                console.log(`[SW-${VERSION}] fetch ${event.request.url} error: not ok`);
            }
            return response;
        }).catch((error) => {
            console.log(`[SW-${VERSION}] fetch ${event.request.url} error: ${error}`);
        });
    event.respondWith(handler);
});
