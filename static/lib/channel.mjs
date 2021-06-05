/**
 * Data transfer
 */

"use strict";


const State = {
    CLOSED: 'closed',
    CONNECTING: 'connecting',
    CONNECTED: 'connected'
}


/**
 * A channel is reliable when frame can't be lost and are received in order
 * via a retransmission mechanism.
 */
class Channel {
    constructor(name) {
        this.name = name;
        this.state = State.CLOSED;

        // API services
        // getter
        this.isReliable = () => { return false };

        // input (called internally on event)
        this.onStateUpdate = (state) => { };
        this.onopen = () => { };
        this.onmessage = (data) => {
            console.warn(`${this.name} unset onmessage: ${JSON.stringify(data)}`);
        };
        this.onclose = (event) => { };

        // output (to call externally)
        this.send = (data) => {
            console.warn(`${this.name} unset send: ${JSON.stringify(data)}`);
        };
    }

    // internal

    setState(state) {
        if (state != this.state) {
            this.state = state;
            this.onStateUpdate(state);
        }
    }
}

/**
 *  Debug channel, all received or send data are only logged
 */
class DebugChannel extends Channel {
    constructor(name) {
        super(`${name}`);

        this.isReliable = () => { return true };
        this.onStateUpdate = (state) => {
            console.debug(`'${this.name}'.onStateUpdate(${state})`);
        }
        this.onopen = () => {
            console.debug(`'${this.name}'.onopen()`);
        }
        this.onmessage = (data) => {
            console.debug(`'${this.name}'.onmessage(${JSON.stringify(data)})`);
        };
        this.onclose = () => {
            console.debug(`'${this.name}'.onclose()`);
        }
        this.send = (data) => {
            console.debug(`'${this.name}'.send(${JSON.stringify(data)})`);
        };
    }
}

/**
 *  A multiplexer allows to split a channel in multiple sub channels.
 * 
 *             |             | <---> Sub channel A
 *  Root <---> | Multiplexer | <---> Sub channel B
 *             |             | <---> Sub channel C
 * 
 *  The message received on the Root channel is expected to be in the {id:<ID>, data:<DATA>} format,
 *  when this is the case, the <DATA> content is passed to the sub channel <ID>.
 * 
 *  The message sent by the sub channels are encapsulated in an object {id: <ID>, data:<DATA>} with
 *  <ID> the index of the sub channel and <DATA> the data sent.
 * 
 *  When the root channel is opened / closed, the sub channels are also opened / closed.
 * 
 * Example of usage:
 * ```
 * let root = new DebugChannel("root");
 * let x = new Multiplexer(root);
 * 
 * let a = new DebugChannel("A");
 * x.registerSubChannel("a", a);
 * 
 * let b = new DebugChannel("B");
 * x.registerSubChannel("b", b);
 * 
 * let y = new Multiplexer(b);
 * let b1 = new DebugChannel("B1");
 * y.registerSubChannel("b1", b1);
 * 
 * root.onmessage({ id: "a", data: "test" });
 * root.onmessage({ id: "b", data: { id: "b1", data: "test" } });
 * a.send("test");
 * b.send("test");
 * b1.send("test");
 * ```
 */
class Multiplexer {
    constructor(root) {
        this.root = root;
        this.ids = new Map();

        root.onStateUpdate = (state) => {
            for (let [id, handler] of this.ids) {
                handler.onStateUpdate(state);
            }
        };
        root.onopen = () => {
            for (let [id, handler] of this.ids) {
                handler.onopen();
            }
        };
        root.onmessage = (data) => {
            if (data && data.id) {
                this.ids.get(data.id)?.onmessage(data.data);
            } else {
                console.warn(`data ${JSON.stringify(data)} dropped from '${root.name}' multiplexer`)
            }
        };
        root.onclose = (event) => {
            for (let [id, handler] of this.ids) {
                handler.onclose(event);
            }
        };
    }

    registerSubChannel(id, handler) {
        if (this.ids.has(id)) {
            throw new Error(`sub channel id '${id}' is already registered`);
        }

        this.ids.set(id, handler);

        handler.isReliable = this.root.isReliable;
        handler.send = (data) => {
            this.root.send({ id: id, data: data });
        };

        // close handler already connected
        if (handler.state == State.CONNECTED) {
            this.onclose();
        }
        // update state
        handler.setState(this.root.state);
        if (this.root.state == State.CONNECTED) {
            handler.onopen();
        }
    }
}


// ---------------------------------
// Websocket
// ---------------------------------

/**
 *  Websocket channel
 */
class WebSocketChannel extends Channel {
    constructor(url, protocols, reconnect) {
        super(`${url}`);
        this.url = url;
        this.protocols = protocols;
        this.reconnect = reconnect;
        this.isReconnectFused = false;
        this.socket = null;

        this.isReliable = () => { return true };
    }

    connect() {
        if (this.socket != null) {
            console.warn(`channel ${this.name} not closed`);
            return;
        }
        this.socket = new WebSocket(this.url, this.protocols);
        this.socket.onopen = () => {
            this.send = (data) => {
                this.socket.send(JSON.stringify(data))
            };
            this.setState(State.CONNECTED);
            this.onopen();
        };
        this.socket.onmessage = (event) => {
            this.onmessage(JSON.parse(event.data));
        };
        this.socket.onclose = (event) => {
            if (this.state == State.CONNECTED) {
                this.onclose(event);
            }
            this.setState(State.CLOSED);
            this.socket = null;
            this.send = null;
            if (!this.isReconnectFused && this.reconnect) {
                this.close();
                this.connect();
            }
        };
        this.isReconnectFused = false;
        this.setState(State.CONNECTING);
    }

    close() {
        if (this.socket) {
            this.isReconnectFused = true;
            this.socket.close();
            this.socket = null;
        }
    }
}


// ---------------------------------
// WebRTC
// ---------------------------------

/**
 *  WebRtcConnector allows to exchange offers through a websocket server and create
 *  WebRTC connections
 */
class WebRtcConnector {
    constructor(serverUrl, localId) {
        this.serverUrl = serverUrl;
        this.localId = localId;

        // API services
        // input (called internally on event)
        this.onChannel = (channel) => { console.warn("unset onChannel"); };

        this.onAnswerReceived = () => { };

        // socket used to publish id to server and wait for incoming offers
        this.socket = new WebSocketChannel(this.serverUrl, "rtc-on-socket-connector", true);
        this.socket.onStateUpdate = (state) => {
            if (state == State.CONNECTED) {
                this.socket.send({ id: "hi", src: this.localId });
            }
        };
        this.socket.onmessage = (data) => {
            if (data?.id == "offer") {
                this.onOfferReceived(data);
            } else if (data?.id == "answer") {
                this.onAnswerReceived(data);
            }
        };
    }

    startListeningOffers() {
        this.socket.connect();
    }

    stopListeningOffers() {
        this.socket.close();
    }

    sendOfferAndWaitAnswer(peerId, offer) {
        console.info(`[WebRtcConnector] send offer and wait answer: ${peerId}`);
        let connect = new Promise((resolve, reject) => {
            let websocket = new WebSocketChannel(this.serverUrl, "rtc-on-socket-connector", true);
            websocket.onStateUpdate = (state) => {
                if (state == State.CONNECTED) {
                    resolve(websocket);
                }
            };
            websocket.connect();
        });
        return connect.then((websocket) => {
            websocket.send({ id: "offer", src: this.localId, dst: peerId, data: offer });
            return new Promise((resolve, reject) => {
                this.onAnswerReceived = (data) => {
                    if (data?.id != "answer")
                        throw new Error(`unexpected data.id, received '${data?.id}' expected 'answer'`);
                    if (data?.src != peerId)
                        throw new Error(`unexpected data.src, received '${data?.src}' expected '${peerId}'`);
                    if (data?.dst != this.localId)
                        throw new Error(`unexpected data.dst, received '${data?.dst}' expected '${this.localId}'`);
                    if (data?.data == undefined)
                        throw new Error(`undefined data.data`);
                    console.info(`[WebRtcConnector] answer received from ${data.src}`);
                    this.onAnswerReceived = () => { };
                    resolve(data.data);
                };
            });
        });
    }

    // private

    onOfferReceived(data) {
        if (data?.id != "offer")
            throw new Error(`unexpected data.id, received '${data?.id}' expected 'offer'`);
        if (data?.src == undefined)
            throw new Error(`undefined data.src`);
        if (data?.dst != this.localId)
            throw new Error(`unexpected data.dst, received '${data?.dst}' expected '${this.localId}'`);
        if (data?.data == undefined)
            throw new Error(`undefined data.data`);
        console.info(`[WebRtcConnector] offer received from ${data.src}`);
        let offer = data.data;
        let peerId = data.src;
        let channel = new WebRtcChannel(peerId);
        channel.getAnswer(offer).then((answer) => {
            this.socket.send({ id: "answer", src: this.localId, dst: peerId, data: answer });
            this.onChannel(channel);
        });
    }
}

const RtcPeerConfig = {
    iceServers: [{
        urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
        ]
    }],
    iceTransportPolicy: "all",
    iceCandidatePoolSize: "0"
};


/**
 *  WebRTC channel
 */
class WebRtcChannel extends Channel {
    constructor(peerId) {
        super(`${peerId}`);
        this.peerId = peerId;

        this.pc = new RTCPeerConnection(RtcPeerConfig);
        this.pc.oniceconnectionstatechange = (evt) => {
            console.debug("ice state change : ", this.pc.iceConnectionState);
            this.onStateChange?.(this);
        };
        this.pc.onsignalingstatechange = (evt) => {
            console.debug("signaling state change : ", this.pc.signalingState);
            this.onStateChange?.(this);
        };
        this.pc.addEventListener("negotiationneeded", event => {
            console.debug("negotiation needed");
        });

        let channel = this.pc.createDataChannel("main", { negotiated: true, id: 0 });
        channel.onopen = function (event) {
            channel.send(`Hi to you ${peerId} !`);
        }
        channel.onmessage = function (event) {
            console.log(event.data);
        }

        this.isReliable = () => { return true };
    }

    initiate(connector) {
        this.setState(State.CONNECTING);
        const options = { iceRestart: false, offerToReceiveAudio: false, offerToReceiveVideo: false };
        return this.pc.createOffer(options).then((offer) => {
            return this.pc.setLocalDescription(offer);
        }).then(() => {
            return new Promise(resolve => {
                this.pc.onicecandidate = (event) => {
                    if (event.candidate != null && event.candidate.candidate != "") {
                        return;
                    }
                    resolve();
                }
            });
        }).then(() => {
            let desc = this.pc.localDescription;
            return connector.sendOfferAndWaitAnswer(this.peerId, desc.sdp);
        }).then((answer) => {
            return this.pc.setRemoteDescription({
                type: "answer",
                sdp: answer
            });
        });
    }

    getAnswer(offer) {
        this.setState(State.CONNECTING);
        const options = { iceRestart: false, offerToReceiveAudio: false, offerToReceiveVideo: false };
        return this.pc.setRemoteDescription({
            type: "offer",
            sdp: offer
        }).then(() => {
            return this.pc.createAnswer(options);
        }).then((answer) => {
            return this.pc.setLocalDescription(answer);
        }).then(() => {
            return new Promise(resolve => {
                this.pc.onicecandidate = (event) => {
                    if (event.candidate != null && event.candidate.candidate != "") {
                        return;
                    }
                    resolve();
                }
            });
        }).then(() => {
            let desc = this.pc.localDescription;
            return desc.sdp;
        });
    }

    close() {
    }
}

let wsUrl = new URL(window.location.href);
if (wsUrl.protocol == "http:") {
    wsUrl.protocol = "ws:";
} else {
    wsUrl.protocol = "wss:";
}
wsUrl.pathname = "/connector";

let con1 = new WebRtcConnector(wsUrl.href, "0001");
con1.startListeningOffers();

let con2 = new WebRtcConnector(wsUrl.href, "0002");
con2.startListeningOffers();

let chan_1_2 = new WebRtcChannel("0002");
chan_1_2.initiate(con1);

export { Multiplexer, WebSocketChannel, DebugChannel, State }