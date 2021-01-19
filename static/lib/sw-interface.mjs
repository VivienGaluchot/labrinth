'use strict';

// install service worker
navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then((reg) => {
        if (reg.installing) {
            console.log('service worker installing');
        } else if (reg.waiting) {
            console.log('service worker installed');
        } else if (reg.active) {
            console.log('service worker active');
        }
    }).catch((error) => {
        console.warn('service worker registration failed', error);
    });


// store handler per type
const requestHandler = new Map();

// setup channel
const channel = new MessageChannel();
channel.port1.onmessage = (event) => {
    if (event.data && event.data.type) {
        const type = event.data.type;
        if (requestHandler.has(type)) {
            requestHandler.get(type)(event.data.data);
        } else {
            console.warn(`no handler registered for the type '${type}'`);
        }
    } else {
        console.warn(`malformed message`, event);
    }
};
channel.port1.start();
let post = (message, transfer) => {
    navigator.serviceWorker.controller.postMessage(message, transfer);
};
post({ type: 'open' }, [channel.port2]);

function swRequest(type, data) {
    return new Promise((resolve, reject) => {
        if (!requestHandler.has(type)) {
            requestHandler.set(type, (replyData) => {
                requestHandler.delete(type);
                resolve(replyData);
            });
            post({ type: type, data: data });
        } else {
            reject(`request already pending for the given type '${type}'`);
        }
    });
}

// public services

function getVersion() {
    return swRequest("get_version", null);
}


export { getVersion }