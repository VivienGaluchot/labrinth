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

class SocketLikeChannel extends Channel {
    constructor(name, reconnect) {
        super(name);

        this.reconnect = reconnect;
        this.isReconnectFused = false;
        this.socket = null;

        this.unsetSend = () => { throw new Error(`channel ${this.name} socket not connected`); };
        this.send = this.unsetSend;
    }

    // to override
    getSocket() {
        throw new Error("not implemented");
    }

    connect() {
        if (this.socket != null) {
            console.warn(`channel ${this.name} not closed`);
            return;
        }
        this.socket = this.getSocket();
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
            this.send = this.unsetSend;
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
            this.send = this.unsetSend;
        }
    }
}


// ---------------------------------
// Websocket
// ---------------------------------

/**
 *  Websocket channel
 */
class WebSocketChannel extends SocketLikeChannel {
    constructor(url, protocols, reconnect) {
        super(`${url}`, reconnect);
        this.url = url;
        this.protocols = protocols;
        this.isReliable = () => { return true };
    }

    getSocket() {
        return new WebSocket(this.url, this.protocols);
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

        this.connections = new Map();

        // API services
        // input (called internally on event)
        this.onConnect = (connection) => { console.warn("unset onConnect"); };

        this.onAnswerReceived = () => { };

        // socket used to publish id to server and wait for incoming offers
        this.socket = new WebSocketChannel(this.serverUrl, "rtc-on-socket-connector", true);
    }

    initiate(peerId) {
        if (this.socket.state != State.CONNECTED) {
            throw new Error("connector websocket not connected");
        }
        if (this.connections.has(peerId)) {
            throw new Error("peerId already registered");
        }
        let connection = new WebRtcConnection(this, peerId);
        this.onConnect(connection);
        this.connections.set(peerId, connection);
        connection.initiate();
    }

    start() {
        return new Promise((resolve, reject) => {
            this.socket.onStateUpdate = (state) => {
                if (state == State.CONNECTED) {
                    this.socket.send({ id: "hi", src: this.localId });
                }
            };
            this.socket.onmessage = (data) => {
                if (data?.id == "hi") {
                    resolve();
                } else if (data?.id == "offer") {
                    this.onOfferReceived(data);
                } else if (data?.id == "answer") {
                    this.onAnswerReceived(data);
                } else if (data?.id == "candidate") {
                    this.onIceCandidateReceived(data);
                } else if (data?.id == "error") {
                    reject(`server error: ${data?.data}`);
                }
            };
            this.socket.connect();
        });
    }

    stop() {
        this.socket.close();
    }

    sendOffer(peerId, offer) {
        console.debug(`[WebRtcConnector] send offer and wait answer: ${peerId}`);
        this.socket.send({ id: "offer", src: this.localId, dst: peerId, data: offer });
    }

    sendIceCandidate(peerId, candidate) {
        console.debug(`[WebRtcConnector] send ICE candidate: ${peerId}`);
        this.socket.send({ id: "candidate", src: this.localId, dst: peerId, data: candidate });
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
        console.debug(`[WebRtcConnector] offer received from ${data.src}`);
        let offer = data.data;
        let peerId = data.src;
        if (!this.connections.has(peerId)) {
            let con = new WebRtcConnection(this, peerId);
            this.connections.set(peerId, con);
            this.onConnect(con);
        }
        let connection = this.connections.get(peerId);
        connection.getAnswer(offer).then((answer) => {
            this.socket.send({ id: "answer", src: this.localId, dst: peerId, data: answer });
        });
    }

    onAnswerReceived(data) {
        if (data?.id != "answer")
            throw new Error(`unexpected data.id, received '${data?.id}' expected 'answer'`);
        if (data?.src != peerId)
            throw new Error(`unexpected data.src, received '${data?.src}' expected '${peerId}'`);
        if (data?.dst != this.localId)
            throw new Error(`unexpected data.dst, received '${data?.dst}' expected '${this.localId}'`);
        if (data?.data == undefined)
            throw new Error(`undefined data.data`);
        console.debug(`[WebRtcConnector] answer received from ${data.src}`);
        let answer = data.data;
        let peerId = data.src;
        let connection = this.connections.get(peerId);
        connection.setAnswer(answer);
    }

    onIceCandidateReceived(data) {
        if (data?.id != "candidate")
            throw new Error(`unexpected data.id, received '${data?.id}' expected 'candidate'`);
        if (data?.src == undefined)
            throw new Error(`undefined data.src`);
        if (data?.dst != this.localId)
            throw new Error(`unexpected data.dst, received '${data?.dst}' expected '${this.localId}'`);
        if (data?.data == undefined)
            throw new Error(`undefined data.data`);
        if (!this.connections.has(data?.src))
            throw new Error(`peer from data.src not registered`);
        console.debug(`[WebRtcConnector] ICE candidate received: ${peerId}`);
        let peerId = data.src;
        let connection = this.connections.get(peerId);
        connection.onIceCandidateReceived(data.data);
    }
}

class WebRtcConnection {
    constructor(connector, peerId) {
        this.peerId = peerId;
        this.connector = connector;
        this.isInitiator = null;

        const config = {
            iceServers: [{
                urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
                ]
            }],
            iceTransportPolicy: "all",
            iceCandidatePoolSize: "0"
        };
        this.pc = new RTCPeerConnection(config);

        this.pc.onsignalingstatechange = (event) => {
            console.debug(`[WebRtcConnection to ${this.peerId}] signaling state change: `, this.pc.signalingState);
        };
        this.pc.oniceconnectionstatechange = (event) => {
            console.debug(`[WebRtcConnection to ${this.peerId}] ice state change: `, this.pc.iceConnectionState);
            if (this.pc.iceConnectionState === "failed") {
                this.pc.restartIce();
            }
        };
        this.pc.onnegotiationneeded = (event) => {
            console.debug(`[WebRtcConnection to ${this.peerId}] negotiationneeded`);
            this.initiate();
        };
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Send the candidate to the remote peer
                this.connector.sendIceCandidate(this.peerId, event.candidate);
            }
        };

        this.channel = new WebRtcDataChannel(this.peerId, this.pc, "main", 0);
        this.channel.onStateUpdate = (state) => {
            console.debug(`[WebRtcConnection to ${this.peerId}] state of channel`, this.channel.peerId, state);
        };
        this.channel.connect();

        this.isReliable = () => { return true };
    }

    // do not call directly, expected to be called by the connector
    async initiate() {
        try {
            this.isInitiator = true;
            await this.pc.setLocalDescription();
            await this.connector.sendOffer(this.peerId, this.pc.localDescription);
        } catch (err) {
            console.error(err);
        } finally {
            this.isInitiator = false;
        }
    }

    // do not call directly, expected to be called by the connector
    async setAnswer(answer) {
        if (this.isInitiator) {
            await this.pc.setRemoteDescription(answer);
        }
    }

    // do not call directly, expected to be called by the connector
    async getAnswer(offer) {
        if (!this.isInitiator) {
            await this.pc.setRemoteDescription(offer);
            await this.pc.setLocalDescription();
            return this.pc.localDescription;
        }
    }

    // do not call directly, expected to be called by the connector
    onIceCandidateReceived(candidate) {
        this.pc.addIceCandidate(candidate);
    }

    // do not call directly, expected to be called by the connector
    close() {
    }
}

/**
 *  WebRTC channel
 */
class WebRtcDataChannel extends SocketLikeChannel {
    constructor(peerId, pc, tag, id) {
        super(`${peerId} - ${tag}`, false);

        this.peerId = peerId;
        this.pc = pc;
        this.tag = tag;
        this.id = id;

        this.isReliable = () => { return true };
    }

    getSocket() {
        return this.pc.createDataChannel(this.tag, { negotiated: true, id: this.id });
    }
}


async function test() {
    let wsUrl = new URL(window.location.href);
    if (wsUrl.protocol == "http:") {
        wsUrl.protocol = "ws:";
    } else {
        wsUrl.protocol = "wss:";
    }
    wsUrl.pathname = "/connector";

    let connector1 = new WebRtcConnector(wsUrl.href, "0001");
    let connector2 = new WebRtcConnector(wsUrl.href, "0002");

    await connector1.start();
    await connector2.start();

    connector1.onConnect = (connection) => {
        let chan = connection.channel;
        chan.onmessage = (data) => {
            console.log("message received from", chan.peerId, data);
        };
        chan.onStateUpdate = (state) => {
            console.debug("state of chan", chan.peerId, state);
            if (state == State.CONNECTED) {
                chan.send(`hi, i'm ${chan.peerId} !`);
            }
        };
        chan.onStateUpdate(chan.state);
    };
    connector2.onConnect = (connection) => {
        let chan = connection.channel;
        chan.onmessage = (data) => {
            console.log("message received from", chan.peerId, data);
        };
        chan.onStateUpdate = (state) => {
            console.debug("state of chan", chan.peerId, state);
            if (state == State.CONNECTED) {
                chan.send(`hi, i'm ${chan.peerId} !`);
            }
        };
        chan.onStateUpdate(chan.state);
    };

    connector1.initiate("0002");
}
test();


export { Multiplexer, WebSocketChannel, DebugChannel, State }