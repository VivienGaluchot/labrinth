'use strict';

self.addEventListener('activate', (event) => {
    console.debug('dummy service worker activated', event);
});

self.addEventListener('install', (event) => {
    console.debug('dummy service worker installed', event);
});

this.addEventListener('fetch', (event) => {
    event.respondWith(fetch(request));
});