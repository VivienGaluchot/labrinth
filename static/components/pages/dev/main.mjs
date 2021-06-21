"use strict";

import * as Apps from '/lib/apps.mjs';
import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import { FNode, FButton } from '/lib/fdom.mjs';
import * as Channel from '/lib/channel.mjs';
import * as Sw from '/lib/sw-interface.mjs';

import * as P2pTest from '/lib/p2p-test.mjs';
import { RemoteEndpoint } from '../../../lib/p2p.mjs';


function populateLocalStorageTbody(element) {
    while (element.firstChild) {
        element.firstChild.remove()
    }
    for (let [mod, key, value] of Storage.all()) {
        let tr = new FNode("tr")
            .child(new FNode("td")
                .child(new FNode("code").text(mod)))
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
        let localIdCopy = this.element.querySelector("#p2p-local-id-copy-btn");
        localId.innerText = P2p.localEndpoint.serialize();
        localIdCopy.onclick = () => {
            navigator.clipboard.writeText(localId.innerText)
                .then(() => {
                    localId.classList.add("success");
                    setTimeout(() => { localId.classList.remove("success"); }, 1000);
                });
        };

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

        let updateP2pPeers = () => {
            let tbody = this.element.querySelector("#p2p-peers-tbody");
            while (tbody.firstChild) {
                tbody.firstChild.remove()
            }

            let p2pCount = this.element.querySelector("#p2p-peer-count");
            p2pCount.innerText = webRtcEndpoint.connections.size;
            if (webRtcEndpoint.connections.size == 0) {
                let tr = new FNode("tr")
                    .child(new FNode("td").text("-"))
                    .child(new FNode("td").text("-"))
                    .child(new FNode("td").text("-"));
                tbody.appendChild(tr.element);
            } else {
                let getNode = (state) => {
                    let cssClass = "info";
                    if (state == Channel.State.CONNECTED)
                        cssClass = "success";
                    if (state == "stable")
                        cssClass = "success";
                    if (state == "failed")
                        cssClass = "error";
                    if (state == "closed")
                        cssClass = "error";
                    if (state == "checking")
                        cssClass = "warning";
                    if (state == "connecting")
                        cssClass = "warning";
                    if (state == "undefined")
                        cssClass = "warning";
                    return new FNode("code").class(cssClass).text(state);
                }
                for (let [id, con] of webRtcEndpoint.connections) {
                    let signaling = con.pc.signalingState;
                    let ice = con.pc.iceConnectionState;
                    let tr = new FNode("tr")
                        .child(new FNode("td").child(getNode(id)))
                        .child(new FNode("td")
                            .child(new FNode("div").text("Signaling is ").child(getNode(signaling)))
                            .child(new FNode("div").text("ICE is ").child(getNode(ice)))
                            .child(new FNode("div").text("Global is ").child(getNode(con.state))));
                    if (con.pingDelayInMs)
                        tr.child(new FNode("td").text(`${con.pingDelayInMs} ms`));
                    else
                        tr.child(new FNode("td").text(`- ms`));
                    tr.child(new FNode("td")
                        .child(new FButton().text("Close").onclick(() => {
                            webRtcEndpoint.close(id);
                        }))
                        .child(new FButton().text("Restart ICE").onclick(() => {
                            con.pc.restartIce();
                        }))
                        .child(new FButton().text("Add friend").onclick(() => {
                            P2p.Notebook.register(P2p.RemoteEndpoint.deserialize(id).user, null);
                            updateP2pFriends();
                        }))
                    );
                    tbody.appendChild(tr.element);
                }
            }
        };
        webRtcEndpoint.addEventListener("onRegister", updateP2pPeers);
        webRtcEndpoint.addEventListener("onUnregister", updateP2pPeers);
        webRtcEndpoint.addEventListener("onStateUpdate", updateP2pPeers);
        webRtcEndpoint.addEventListener("onPingUpdate", updateP2pPeers);
        updateP2pPeers();

        let handleP2pConnection = (event) => {
            let connection = event.connection;
            let chan = connection.getChannel("main", 100);
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
                peerConnectId.classList.add("success");
                clearTimeout(peerConnectTimeout);
                peerConnectTimeout = setTimeout(() => {
                    peerConnectId.classList.remove("success");
                    peerConnectId.value = "";
                }, 1000);
            } catch (err) {
                peerConnectId.classList.add("error");
                clearTimeout(peerConnectTimeout);
                peerConnectTimeout = setTimeout(() => { peerConnectId.classList.remove("error"); }, 1000);
                throw err;
            }
        };

        let p2pLocalName = this.element.querySelector("#p2p-friends-local-name");
        let updateP2pLocalName = () => {
            p2pLocalName.value = P2p.Notebook.getLocalName();
        };
        p2pLocalName.onchange = () => {
            P2p.Notebook.setLocalName(p2pLocalName.value);
            console.log("set name", p2pLocalName.value);
        }
        updateP2pLocalName();

        let friendSyncs = [];
        let updateP2pFriends = () => {
            for (let sync of friendSyncs) {
                clearInterval(sync);
            }
            friendSyncs = [];

            let tbody = this.element.querySelector("#p2p-friends-tbody");
            while (tbody.firstChild) {
                tbody.firstChild.remove()
            }

            let friends = P2p.Notebook.friends();
            if (friends.length == 0) {
                let tr = new FNode("ul")
                    .child(new FNode("td").text("-"))
                    .child(new FNode("td").text("-"));
                tbody.appendChild(tr.element);
            } else {
                for (let [id, name] of friends) {
                    let tr = new FNode("tr");

                    let subIds = [];
                    let sync = () => {
                        webRtcEndpoint.getConnectedPeerIds([id]).then((ids) => {
                            for (let el of subIds) {
                                el.remove();
                            }
                            subIds = [];
                            for (let peerId of ids) {
                                if (peerId != webRtcEndpoint.localId) {
                                    let endpoint = RemoteEndpoint.deserialize(peerId);
                                    let subTr = new FNode("tr")
                                        .child(new FNode("td").text(""))
                                        .child(new FNode("td").child(new FNode("code").class("success").text(`${endpoint.device}-${endpoint.session}`)))
                                        .child(new FNode("td")
                                            .child(new FButton().text("Connect").onclick(() => {
                                                webRtcEndpoint.getOrCreateConnection(endpoint.serialize());
                                            }))
                                        );
                                    subIds.push(subTr.element);
                                    tr.element.parentNode.insertBefore(subTr.element, tr.element.nextSibling);
                                }
                            }
                        });
                    };

                    tr.child(new FNode("td")
                        .child(new FNode("div").text(name == null ? "-" : name))
                        .child(new FNode("code").text(id)))
                        .child(new FNode("td").text(""))
                        .child(new FNode("td")
                            .child(new FButton().text("Sync").onclick(sync))
                            .child(new FButton().text("Delete").onclick(() => {
                                this.element.querySelector("#p2p-friends-confirm-modal").internal.ask().then((choice) => {
                                    if (choice == "yes") {
                                        P2p.Notebook.remove(id);
                                        updateP2pFriends();
                                    }
                                });
                            }))
                        );

                    tbody.appendChild(tr.element);

                    friendSyncs.push(setInterval(sync, 5000));
                    sync();
                }
            }
        };
        updateP2pFriends();
        this.element.querySelector("#p2p-friends-refresh").onclick = updateP2pFriends;

        let friendAddTimeout = null;
        let peerFriendsId = this.element.querySelector("#p2p-friends-add-id");
        this.element.querySelector("#p2p-friends-add-btn").onclick = () => {
            P2p.Notebook.register(peerFriendsId.value, null);
            updateP2pFriends();
            peerFriendsId.classList.add("success");
            clearTimeout(friendAddTimeout);
            friendAddTimeout = setTimeout(() => {
                peerFriendsId.classList.remove("success");
                peerFriendsId.value = "";
            }, 1000);
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
                    updateP2pFriends();
                    updateP2pLocalName();
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