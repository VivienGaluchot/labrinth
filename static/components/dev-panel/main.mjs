"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';

function onLoad() { }

function onRender(element, ctx) {
    let user = element.querySelector(".p2p-local-user");
    let device = element.querySelector(".p2p-local-device");
    let session = element.querySelector(".p2p-local-session");
    user.innerText = P2p.localEndpoint.user;
    device.innerText = P2p.localEndpoint.device;
    session.innerText = P2p.localEndpoint.session;

    let btnClear = element.querySelector(".btn-clear");
    btnClear.onclick = () => {
        Storage.clear();
        alert("All the data in local storage was cleared.");
    };
}

export { onLoad, onRender }