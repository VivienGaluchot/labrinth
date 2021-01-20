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


/**
 * Simple request protocol to exchange information asynchronously with the service worker
 * - request   object { type, id, data }
 *     type is the type of request, to redirect to the right handler
 *     id a unique identifier for the request
 *     data is the request payload
 * 
 * - reply     object { type:"reply", id, data }
 *     type set to "reply"
 *     id is the id of the request answered
 *     data is the answer payload
 * 
 * 
 * The request might be emitted from the worker or from the main thread, depending on the service
 * available.
 */

let requestId = 0;

// store handler per id
const requestHandler = new Map();

// setup channel
const channel = new MessageChannel();

channel.port1.onmessage = (event) => {
    if (event.data && event.data.type) {
        const type = event.data.type;
        if (type == "reply") {
            if (event.data.id && requestHandler.has(event.data.id)) {
                let handler = requestHandler.get(event.data.id);
                requestHandler.delete(event.data.id);
                handler(event.data.data);
            } else {
                console.warn(`no handler registered with id '${event.data.id}'`);
            }
        } else {
            console.warn(`no handler registered for the type '${type}'`);
        }
    } else {
        console.warn(`malformed message`, event);
    }
};

channel.port1.start();
navigator.serviceWorker.controller.postMessage({ type: 'open' }, [channel.port2])
let post = (message) => {
    navigator.serviceWorker.controller.postMessage(message);
};

function swRequest(type, data) {
    return new Promise((resolve, reject) => {
        requestId += 1;
        requestHandler.set(requestId, (replyData) => {
            resolve(replyData);
        });
        post({ type: type, id: requestId, data: data });
    });
}

// public services

function getVersion() {
    return swRequest("get_version", null);
}


export { getVersion }