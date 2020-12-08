"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import { FNode } from '/lib/fdom.mjs';


function onLoad() { }

function populateLocalStorageTbody(element) {
    while (element.firstChild) {
        element.firstChild.remove()
    }
    for (let [module, key, value] of Storage.all()) {
        let tr = new FNode("tr")
            .child(new FNode("td")
                .child(new FNode("code").text(module)))
            .child(new FNode("td")
                .child(new FNode("code").text(key)))
            .child(new FNode("td")
                .child(new FNode("code").text(value)));
        element.appendChild(tr.element);
    }
}

function onRender(element, ctx) {
    // Server

    // P2P identification
    let user = element.querySelector(".p2p-local-user");
    let device = element.querySelector(".p2p-local-device");
    let session = element.querySelector(".p2p-local-session");

    user.innerText = P2p.localEndpoint.user;
    device.innerText = P2p.localEndpoint.device;
    session.innerText = P2p.localEndpoint.session;

    // Local storage
    let localStorageTbody = element.querySelector(".local-storage-tbody");
    populateLocalStorageTbody(localStorageTbody);

    let btnClear = element.querySelector(".btn-clear");
    btnClear.onclick = () => {
        if (confirm("Do you really want to delete all data stored on your device ?\nThis operation is not reversible.")) {
            Storage.clear();
            populateLocalStorageTbody(localStorageTbody);
        }
    };
    let btnRefresh = element.querySelector(".btn-refresh");
    btnRefresh.onclick = () => {
        populateLocalStorageTbody(localStorageTbody);
    };
}

export { onLoad, onRender }