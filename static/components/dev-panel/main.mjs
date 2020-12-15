"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import { FNode } from '/lib/fdom.mjs';

import * as Channel from '/lib/channel.mjs';


let wsUrl = new URL(window.location.href);
if (wsUrl.protocol == "http:") {
    wsUrl.protocol = "ws:";
} else {
    wsUrl.protocol = "wss:";
}
wsUrl.pathname = "/peer-discovery";

let ws = new Channel.WebSocketChannel(wsUrl.href, "peer-discovery", true);
ws.connect();


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
    let serverStatus = element.querySelector(".server-con-status");
    let showState = (state) => {
        serverStatus.classList.remove(...serverStatus.classList);
        if (state == Channel.State.CLOSED) {
            serverStatus.classList.add("failure");
        } else if (state == Channel.State.CONNECTING) {
            serverStatus.classList.add("warning");
        } else if (state == Channel.State.CONNECTED) {
            serverStatus.classList.add("success");
        }
        serverStatus.innerText = state;
    };
    ws.onStateUpdate = (state) => {
        showState(state);
    };
    showState(ws.state);

    element.querySelector(".btn-connect").onclick = () => { ws.connect(); };
    element.querySelector(".btn-close").onclick = () => { ws.close(); };

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

export { onRender }