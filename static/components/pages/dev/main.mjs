"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import { FNode } from '/lib/fdom.mjs';
import * as Channel from '/lib/channel.mjs';
import * as Sw from '/lib/sw-interface.mjs';


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
        let serverUserCount = this.element.querySelector(".server-user-count");
        let showCount = (count) => {
            serverUserCount.innerText = count;
        };
        let serverStatus = this.element.querySelector(".server-con-status");
        let showState = (state) => {
            serverStatus.classList.remove(...serverStatus.classList);
            if (state == Channel.State.CONNECTING) {
                serverStatus.classList.add("warning");
            } else if (state == Channel.State.CONNECTED) {
                serverStatus.classList.add("success");
            }
            serverStatus.innerText = state;
            if (state != Channel.State.CONNECTED) {
                showCount("-");
            }
        };
        this.ws.onStateUpdate = (state) => {
            showState(state);
        };
        this.ws.onmessage = (data) => {
            let obj = JSON.parse(data);
            if (obj.user_count) {
                showCount(obj.user_count);
            } else {
                console.warn(obj);
            }
        };
        showState(this.ws.state);

        this.element.querySelector(".btn-connect").onclick = () => { this.ws.connect(); };
        this.element.querySelector(".btn-close").onclick = () => { this.ws.close(); };

        this.ws.connect();

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
            this.element.querySelector("#clear-confirm-modal").internal.ask().then((choice) => {
                if (choice == "yes") {
                    Storage.clear();
                    populateLocalStorageTbody(localStorageTbody);
                }
            });
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

        let iceCandidatesEl = this.element.querySelector(".webrtc-ice-candidates-tbody");
        this.element.querySelector(".btn-gen-ice-candidates").onclick = () => {
            while (iceCandidatesEl.firstChild) {
                iceCandidatesEl.firstChild.remove()
            }

            P2p.getIceCandidates((candidate) => {
                console.log("candidate", candidate);
                if (candidate) {
                    let tr = new FNode("tr")
                        // Component
                        .child(new FNode("td")
                            .child(new FNode("code").text(candidate)));

                    // let tr = new FNode("tr")
                    //     // Component
                    //     .child(new FNode("td")
                    //         .child(new FNode("code").text(candidate)))
                    //     // Type
                    //     .child(new FNode("td")
                    //         .child(new FNode("code").text("")))
                    //     // Foundation
                    //     .child(new FNode("td")
                    //         .child(new FNode("code").text("")))
                    //     // Protocol
                    //     .child(new FNode("td")
                    //         .child(new FNode("code").text("")))
                    //     // Address
                    //     .child(new FNode("td")
                    //         .child(new FNode("code").text("")))
                    //     // Port
                    //     .child(new FNode("td")
                    //         .child(new FNode("code").text("")))
                    //     // Priority
                    //     .child(new FNode("td")
                    //         .child(new FNode("code").text("")));

                    iceCandidatesEl.appendChild(tr.element);
                } else {
                    let tr = new FNode("tr")
                        // Component
                        .child(new FNode("td").text("Done"));
                    iceCandidatesEl.appendChild(tr.element);
                }
            });
        };

        // Service worker
        let showSwVersion = () => {
            Sw.getVersion()
                .then((version) => {
                    this.element.querySelector(".sw-version").innerText = version;
                    this.element.querySelector(".sw-error").innerText = "";
                }).catch((error) => {
                    console.error(error);
                    this.element.querySelector(".sw-version").innerText = "-";
                    this.element.querySelector(".sw-error").innerText = `error: ${error}`;
                });
        };
        this.element.querySelector(".btn-sw-refresh").onclick = showSwVersion;
        showSwVersion();

        // UI
        this.element.querySelector(".btn-modal-show").onclick = () => {
            this.element.querySelector("#modal").internal.show();
        };
        this.element.querySelector(".btn-modal-ask").onclick = () => {
            this.element.querySelector("#modal").internal.ask();
        };
    }

    onRemove() {
        this.ws.close();
    }
}

export { Component }