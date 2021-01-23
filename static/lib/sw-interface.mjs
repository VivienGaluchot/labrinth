'use strict';


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

let swRequest = () => {
    return new Promise((resolve, reject) => {
        reject("the page is not controlled by a service worker");
    });
}

function connect(controller) {
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
    controller.postMessage({ type: 'open' }, [channel.port2])
    let post = (message) => {
        controller.postMessage(message);
    };

    swRequest = (type, data) => {
        return new Promise((resolve, reject) => {
            requestId += 1;
            requestHandler.set(requestId, (replyData) => {
                resolve(replyData);
            });
            post({ type: type, id: requestId, data: data });
        });
    }
}


// service worker registration

function handleRegistration(reg) {
    let sw = null;
    if (reg.installing) {
        console.log('service worker installing');
        sw = reg.installing;
    } else if (reg.waiting) {
        console.log('service worker waiting');
        sw = reg.waiting;
    } else if (reg.active) {
        console.log('service worker active');
        sw = reg.active;
        connect(sw);
        getVersion().then((version) => {
            console.log(`new service worker registered: ${version}`);
        });
    } else {
        console.warn("unexpected service worker registration", req);
    }
    if (sw) {
        sw.onstatechange = (event) => {
            handleRegistration(reg);
        };
    }
}

if (navigator.serviceWorker.controller) {
    connect(navigator.serviceWorker.controller);
    getVersion().then((version) => {
        console.log(`service worker already running: ${version}`);
    });
}

navigator.serviceWorker.register("/sw.js", { scope: '/' })
    .then((reg) => {
        handleRegistration(reg);
    })
    .catch((error) => {
        console.warn('service worker registration failed', error);
    });


// public services

function getVersion() {
    return swRequest("get_version", null);
}


export { getVersion }