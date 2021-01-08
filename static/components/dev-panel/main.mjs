"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import { FNode } from '/lib/fdom.mjs';

import * as Channel from '/lib/channel.mjs';


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

class Component {
    constructor(element) {
        this.element = element;

        let wsUrl = new URL(window.location.href);
        if (wsUrl.protocol == "http:") {
            wsUrl.protocol = "ws:";
        } else {
            wsUrl.protocol = "wss:";
        }
        wsUrl.pathname = "/peer-discovery";
        this.ws = new Channel.WebSocketChannel(wsUrl.href, "peer-discovery", true);
    }

    onRender() {
        // Server
        let serverStatus = this.element.querySelector(".server-con-status");
        let showState = (state) => {
            serverStatus.classList.remove(...serverStatus.classList);
            if (state == Channel.State.CONNECTING) {
                serverStatus.classList.add("warning");
            } else if (state == Channel.State.CONNECTED) {
                serverStatus.classList.add("success");
            }
            serverStatus.innerText = state;
        };
        this.ws.onStateUpdate = (state) => {
            showState(state);
        };
        showState(this.ws.state);

        this.element.querySelector(".btn-connect").onclick = () => { this.ws.connect(); };
        this.element.querySelector(".btn-close").onclick = () => { this.ws.close(); };

        // P2P identification
        let user = this.element.querySelector(".p2p-local-user");
        let device = this.element.querySelector(".p2p-local-device");
        let session = this.element.querySelector(".p2p-local-session");

        user.innerText = P2p.localEndpoint.user;
        device.innerText = P2p.localEndpoint.device;
        session.innerText = P2p.localEndpoint.session;

        // Local storage
        let localStorageTbody = this.element.querySelector(".local-storage-tbody");
        populateLocalStorageTbody(localStorageTbody);

        let btnClear = this.element.querySelector(".btn-clear");
        btnClear.onclick = () => {
            if (confirm("Do you really want to delete all data stored on your device ?\nThis operation is not reversible.")) {
                Storage.clear();
                populateLocalStorageTbody(localStorageTbody);
            }
        };
        let btnRefresh = this.element.querySelector(".btn-refresh");
        btnRefresh.onclick = () => {
            populateLocalStorageTbody(localStorageTbody);
        };

        // WebRTC
        let offerEl = this.element.querySelector(".webrtc-offer");
        this.element.querySelector(".btn-gen-offer").onclick = () => {
            offerEl.classList.remove(...offerEl.classList);
            offerEl.innerText = "Offer generation pending";
            P2p.offer()
                .then((connection) => {
                    offerEl.innerText = connection.localDescription.sdp;
                    connection.close();
                }).catch((reason) => {
                    console.error(reason);
                    offerEl.classList.add("failure");
                    offerEl.innerText = "failed";
                });
        };
    }

    onRemove() {
        this.ws.close();
    }
}

export { Component }