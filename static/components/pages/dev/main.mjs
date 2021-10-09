"use strict";

import * as P2pId from '/lib/p2p-id.mjs';
import * as Friends from '/lib/p2p-apps/friends.mjs';
import * as Ping from '/lib/p2p-apps/ping.mjs';
import * as Storage from '/lib/storage.mjs';
import { FTag, FButton, alertModal, chooseModal } from '/lib/fdom.mjs';
import * as FBind from '/lib/fbind.mjs';
import * as Channel from '/lib/channel.mjs';
import * as Sw from '/lib/sw-interface.mjs';

import * as P2pTest from '/lib/p2p-test.mjs';


function populateLocalStorageTbody(element) {
    while (element.firstChild) {
        element.firstChild.remove()
    }
    for (let [mod, key, value] of Storage.all()) {
        let tr = new FTag("tr")
            .child(new FTag("td")
                .child(new FTag("code").text(mod)))
            .child(new FTag("td")
                .child(new FTag("code").text(key)))
            .child(new FTag("td")
                .child(new FTag("code").text(value)));
        element.appendChild(tr.element);
    }
}

function getIceCandidates(onicecandidate) {
    let pc = new RTCPeerConnection(rtcPeerConnectionConfig);
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            if (event.candidate.candidate === '') {
                onicecandidate(null);
            } else {
                console.info("ice candidate", event.candidate.candidate);
                // TODO parse event.candidate.candidate fields
                onicecandidate(event.candidate.candidate);
            }
        }
    };

    const offerOptions = { iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: false };
    pc.createOffer(offerOptions)
        .then((desc) => {
            pc.setLocalDescription(desc)
                .then(() => {
                    console.log("setLocalDescription terminated");
                }).catch((error) => {
                    console.error("setLocalDescription error", error);
                });
        }).catch((error) => {
            console.error("createOffer error", error);
        });
};


class Component {
    constructor(element) {
        this.element = element;

        let currentUrl = new URL(window.location.href);
        let protocol = null;
        if (currentUrl.protocol == "http:") {
            protocol = "ws:";
        } else {
            protocol = "wss:";
        }
        let wsUrl = new URL(`${protocol}//${currentUrl.host}/connector`);

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

        let localId = this.element.querySelector("#p2p-local-id");
        let localIdCopy = this.element.querySelector("#p2p-local-id-copy-btn");
        localId.innerText = P2pId.localEndpoint.serialize();
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
                let tr = new FTag("tr")
                    .child(new FTag("td")
                        .child(name))
                    .child(new FTag("td")
                        .child(new FTag("code").class(cssClass)
                            .text(`${res.nbOk} / ${res.nbKo + res.nbOk}`)));
                tbody.appendChild(tr.element);
                total.nbKo += res.nbKo;
                total.nbOk += res.nbOk;
            }
            addResult(new FTag("code").text("TimestampedHistory"), P2pTest.TimestampedHistory());
            addResult(new FTag("code").text("SharedValue"), P2pTest.SharedValue());
            addResult(new FTag("code").text("SharedSet"), P2pTest.SharedSet());
            addResult(new FTag("span").text("Done"), total);
        };

        let updateP2pPeers = () => {
            let tbody = this.element.querySelector("#p2p-peers-tbody");
            while (tbody.firstChild) {
                tbody.firstChild.remove()
            }

            let p2pCount = this.element.querySelector("#p2p-peer-count");
            p2pCount.innerText = Channel.webRtcEndpoint.connections.size;
            if (Channel.webRtcEndpoint.connections.size == 0) {
                let tr = new FTag("tr")
                    .child(new FTag("td").text("-"))
                    .child(new FTag("td").text("-"))
                    .child(new FTag("td").text("-"));
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
                    return new FTag("code").class(cssClass).text(state);
                }
                for (let [endpoint, con] of Channel.webRtcEndpoint.connections) {
                    let signaling = con.pc.signalingState;
                    let ice = con.pc.iceConnectionState;
                    let tr = new FTag("tr")
                        .child(new FTag("td").child(getNode(endpoint.serialize())))
                        .child(new FTag("td")
                            .child(new FTag("div").text("Signaling is ").child(getNode(signaling)))
                            .child(new FTag("div").text("ICE is ").child(getNode(ice)))
                            .child(new FTag("div").text("Global is ").child(getNode(con.state))));
                    if (Ping.app.getDelayInMs(con.endpoint))
                        tr.child(new FTag("td").text(`${Ping.app.getDelayInMs(con.endpoint)} ms`));
                    else
                        tr.child(new FTag("td").text(`- ms`));
                    tr.child(new FTag("td")
                        .child(new FButton().text("Close").onclick(() => {
                            Channel.webRtcEndpoint.close(endpoint);
                        }))
                        .child(new FButton().text("RemoteEndpoint").onclick(() => {
                            let desc = Channel.webRtcEndpoint.getConnection(endpoint).getRemoteDescription();
                            if (desc) {
                                alertModal("RemoteEndpoint", `Type:\n${desc.type}\n\nSDP description:\n${desc.sdp}`);
                            } else {
                                alertModal("RemoteEndpoint", 'none');
                            }
                        }))
                        .child(new FButton().text("LocalEndpoint").onclick(() => {
                            let desc = Channel.webRtcEndpoint.getConnection(endpoint).getLocalDescription();
                            if (desc) {
                                alertModal("LocalEndpoint", `Type:\n${desc.type}\n\nSDP description:\n${desc.sdp}`);
                            } else {
                                alertModal("LocalEndpoint", 'none');
                            }
                        }))
                        .child(new FButton().text("Restart ICE").onclick(() => {
                            con.pc.restartIce();
                        }))
                        .child(new FButton().text("Add friend").onclick(() => {
                            Friends.app.add(P2pId.getEndpoint(endpoint).user, null);
                            updateP2pFriends();
                        }))
                    );
                    tbody.appendChild(tr.element);
                }
            }
        };
        Channel.webRtcEndpoint.addEventListener("onRegister", updateP2pPeers);
        Channel.webRtcEndpoint.addEventListener("onUnregister", updateP2pPeers);
        Channel.webRtcEndpoint.addEventListener("onStateUpdate", updateP2pPeers);
        Ping.app.eventTarget.addEventListener("onPingUpdate", updateP2pPeers);
        updateP2pPeers();

        let handleP2pConnection = (event) => {
            let connection = event.connection;
            let chan = connection.getChannel("main", 100);
            chan.onmessage = (data) => {
                console.log(`message received from ${chan.endpoint.serialize()} '${data}'`);
            };
            chan.onStateUpdate = (state) => {
                console.log("state of chan", chan.endpoint.serialize(), state);
                if (state == Channel.State.CONNECTED) {
                    peerConnectId.value = "";
                    chan.send(`hi, i'm ${connection.connector.localEndpoint.serialize()} !`);
                }
            };
            chan.connect();
        }
        Channel.webRtcEndpoint.addEventListener("onRegister", handleP2pConnection);

        let peerConnectId = this.element.querySelector("#p2p-peer-connect-id");
        let peerConnectBtn = this.element.querySelector("#p2p-peer-connect-btn");
        let peerConnectTimeout = null;
        peerConnectBtn.onclick = () => {
            try {
                let endpoint = P2pId.getEndpoint(peerConnectId.value);
                Channel.webRtcEndpoint.getOrCreateConnection(endpoint);
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
            let local = Friends.app.getLocalData();
            if (local?.name != undefined) {
                p2pLocalName.value = local.name;
            } else {
                p2pLocalName.value = "";
            }
        };
        p2pLocalName.onchange = () => {
            Friends.app.setLocalData({ name: p2pLocalName.value });
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

            let friends = Friends.app.getFriends();
            if (friends.length == 0) {
                let tr = new FTag("ul")
                    .child(new FTag("td").text("-"))
                    .child(new FTag("td").text("-"));
                tbody.appendChild(tr.element);
            } else {
                for (let [id, data] of friends) {
                    let name = data?.name;

                    let tr = new FTag("tr");

                    let subIds = [];
                    let sync = () => {
                        Channel.webRtcEndpoint.getConnectedEndpoints([id]).then((endpoints) => {
                            for (let el of subIds) {
                                el.remove();
                            }
                            subIds = [];
                            for (let endpoint of endpoints) {
                                if (!endpoint.isLocal) {
                                    let subTr = new FTag("tr")
                                        .child(new FTag("td").text(""))
                                        .child(new FTag("td").child(new FTag("code").class("success").text(`${endpoint.device}-${endpoint.session}`)))
                                        .child(new FTag("td")
                                            .child(new FButton().text("Connect").onclick(() => {
                                                Channel.webRtcEndpoint.getOrCreateConnection(endpoint);
                                            }))
                                        );
                                    subIds.push(subTr.element);
                                    tr.element.parentNode.insertBefore(subTr.element, tr.element.nextSibling);
                                }
                            }
                        });
                    };


                    tr.child(new FTag("td")
                        .child(new FTag("div").text(name == null ? "-" : name))
                        .child(new FTag("code").text(id)))
                        .child(new FTag("td").text(""))
                        .child(new FTag("td")
                            .child(new FButton().text("Sync").onclick(sync))
                            .child(new FButton().text("Delete").onclick(() => {
                                this.element.querySelector("#p2p-friends-confirm-modal").internal.ask().then((choice) => {
                                    if (choice == "yes") {
                                        Friends.app.remove(id);
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
            Friends.app.add(peerFriendsId.value, null);
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

            getIceCandidates((candidate) => {
                console.log("candidate", candidate);
                if (candidate) {
                    let tr = new FTag("tr")
                        // Component
                        .child(new FTag("td")
                            .child(new FTag("code").text(candidate)));

                    // let tr = new FTag("tr")
                    //     // Component
                    //     .child(new FTag("td")
                    //         .child(new FTag("code").text(candidate)))
                    //     // Type
                    //     .child(new FTag("td")
                    //         .child(new FTag("code").text("")))
                    //     // Foundation
                    //     .child(new FTag("td")
                    //         .child(new FTag("code").text("")))
                    //     // Protocol
                    //     .child(new FTag("td")
                    //         .child(new FTag("code").text("")))
                    //     // Address
                    //     .child(new FTag("td")
                    //         .child(new FTag("code").text("")))
                    //     // Port
                    //     .child(new FTag("td")
                    //         .child(new FTag("code").text("")))
                    //     // Priority
                    //     .child(new FTag("td")
                    //         .child(new FTag("code").text("")));

                    iceCandidatesEl.appendChild(tr.element);
                } else {
                    let tr = new FTag("tr")
                        // Component
                        .child(new FTag("td").text("Done"));
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
        this.element.querySelector(".btn-modal-alertModal").onclick = () => {
            alertModal("Alert", `Generated text !\nIt's ${new Date()} ...`);
        };
        this.element.querySelector(".btn-modal-chooseModal").onclick = () => {
            chooseModal("Alert", `Generated text !\nIt's ${new Date()} ...`,
                [{
                    "value": "a",
                    "text": "A"
                },
                {
                    "value": "b",
                    "text": "B"
                }]).then((choice) => {
                    alertModal("Result", `Selected value was ${choice}`);
                });
        };

        // Bind

        let bindA = new FBind.FBinderAtomic("initial A");
        let bindB = new FBind.FBinderAtomic("initial B");
        let bindO = new FBind.FBinderObject({ "a": "initial A", "b": "initial A" });

        this.element.querySelector("#bind-src-a").oninput = (event) => {
            bindO.getProp("a").set(event.target.value);
            bindA.set(event.target.value);
        };
        this.element.querySelector("#bind-src-b").oninput = (event) => {
            bindO.getProp("b").set(event.target.value);
            bindB.set(event.target.value);
        };
        this.element.querySelector("#bindobj-src").oninput = (event) => {
            console.log(event.target.value);
            let obj = JSON.parse(event.target.value);
            bindO.set(obj);
        };

        let renderTextContent = (el, value) => {
            el.textContent = value;
        };
        for (let el of this.element.querySelectorAll(".bind-target-a")) {
            bindA.bind(el, renderTextContent);
        }
        for (let el of this.element.querySelectorAll(".bind-target-b")) {
            bindB.bind(el, renderTextContent);
        }
        for (let el of this.element.querySelectorAll(".bindobj-target-a")) {
            bindO.getProp("a").bind(el, renderTextContent);
        }
        for (let el of this.element.querySelectorAll(".bindobj-target-b")) {
            bindO.getProp("b").bind(el, renderTextContent);
        }
    }

    onRemove() {
        this.ws.close();
    }
}

export { Component }