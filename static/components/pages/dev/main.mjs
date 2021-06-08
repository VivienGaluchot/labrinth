"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import { FNode } from '/lib/fdom.mjs';
import * as Channel from '/lib/channel.mjs';
import * as Sw from '/lib/sw-interface.mjs';

import * as P2pTest from '/lib/p2p-test.mjs';


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
        wsUrl.pathname = "/connector";
        this.ws = new Channel.WebSocketChannel(wsUrl.href, "rtc-on-socket-connector", true);
    }

    onRender() {
        // Websocket server
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
        this.ws.onmessage = (data) => {
            let obj = JSON.parse(data);
            console.log("ws message", data);
        };
        showState(this.ws.state);

        this.element.querySelector(".btn-connect").onclick = () => { this.ws.connect(); };
        this.element.querySelector(".btn-close").onclick = () => { this.ws.close(); };

        this.ws.connect();

        // P2P
        let webRtcEndpoint = P2p.localEndpoint.webRtcEndpoint;

        let localId = this.element.querySelector("#p2p-local-id");
        localId.innerText = P2p.localEndpoint.serialize();

        this.element.querySelector("#p2p-tests-btn").onclick = () => {
            let tbody = this.element.querySelector("#p2p-tests-tbody");
            while (tbody.firstChild) {
                tbody.firstChild.remove()
            }
            let total = { nbKo: 0, nbOk: 0 };
            function addResult(name, res) {
                let cssClass = "success";
                if (res.nbKo != 0) {
                    cssClass = "error";
                }
                let tr = new FNode("tr")
                    .child(new FNode("td")
                        .child(name))
                    .child(new FNode("td")
                        .child(new FNode("code").class(cssClass)
                            .text(`${res.nbOk} / ${res.nbKo + res.nbOk}`)));
                tbody.appendChild(tr.element);
                total.nbKo += res.nbKo;
                total.nbOk += res.nbOk;
            }
            addResult(new FNode("code").text("TimestampedHistory"), P2pTest.TimestampedHistory());
            addResult(new FNode("code").text("SharedValue"), P2pTest.SharedValue());
            addResult(new FNode("code").text("SharedSet"), P2pTest.SharedSet());
            addResult(new FNode("span").text("Done"), total);
        };

        let updateP2pCount = () => {
            let p2pCount = this.element.querySelector("#p2p-peer-count");
            let count = 0;
            for (let [id, con] of webRtcEndpoint.connections) {
                if (con.state == Channel.State.CONNECTED) {
                    count++;
                }
            }
            p2pCount.innerText = count;
        }
        webRtcEndpoint.addEventListener("onConnect", updateP2pCount);
        webRtcEndpoint.addEventListener("onDisconnect", updateP2pCount);
        updateP2pCount();

        let handleP2pConnection = (event) => {
            let connection = event.connection;
            let chan = connection.getChannel("main", 0);
            chan.onmessage = (data) => {
                console.log(`message received from ${chan.peerId} '${data}'`);
            };
            chan.onStateUpdate = (state) => {
                console.log("state of chan", chan.peerId, state);
                if (state == Channel.State.CONNECTED) {
                    peerConnectId.value = "";
                    chan.send(`hi, i'm ${connection.connector.localId} !`);
                }
            };
            chan.connect();
        }
        webRtcEndpoint.addEventListener("onRegister", handleP2pConnection);

        let peerConnectId = this.element.querySelector("#p2p-peer-connect-id");
        let peerConnectBtn = this.element.querySelector("#p2p-peer-connect-btn");
        let peerConnectTimeout = null;
        peerConnectBtn.onclick = () => {
            try {
                let endpoint = P2p.RemoteEndpoint.deserialize(peerConnectId.value);
                webRtcEndpoint.getOrCreateConnection(endpoint.serialize());
            } catch (err) {
                peerConnectId.classList.add("error");
                clearTimeout(peerConnectTimeout);
                peerConnectTimeout = setTimeout(() => { peerConnectId.classList.remove("error"); }, 1000);
                throw err;
            }
        };

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
        let iceCandidatesEl = this.element.querySelector(".webrtc-ice-candidates-tbody");
        this.element.querySelector(".btn-gen-ice-candidates").onclick = () => {
            while (iceCandidatesEl.firstChild) {
                iceCandidatesEl.firstChild.remove()
            }

            Channel.getIceCandidates((candidate) => {
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