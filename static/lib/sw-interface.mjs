'use strict';


/**
 * Simple request exchange information asynchronously with the service worker
 * - request   object { type, id, data }
 *     type is the type of request, to redirect to the right handler
 *     id a unique identifier for the request
 *     data is the request payload
 * 
 * - reply     data
 *     data is the answer payload
 */

let currentSw = null;

function swRequest(type, data) {
    return new Promise((resolve, reject) => {
        if (!currentSw) {
            reject("the page is not controlled by a service worker");
        } else {
            const channel = new MessageChannel();
            channel.port1.onmessage = (event) => {
                resolve(event.data);
            };
            currentSw.postMessage({ type: type, data: data }, [channel.port2]);
        }
    });
};

function setCurrentSw(controller) {
    currentSw = controller;
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
        setCurrentSw(sw);
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
    setCurrentSw(navigator.serviceWorker.controller);
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