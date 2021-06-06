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
 *  WebRtcEndpoint allows to exchange offers through a websocket server and create
 *  WebRTC connections with other peers
 * 
 *  inspired from https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
 */
class WebRtcEndpoint {
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

    connectTo(peerId) {
        if (this.socket.state != State.CONNECTED) {
            throw new Error("connector websocket not connected");
        }
        if (this.connections.has(peerId)) {
            throw new Error("peerId already registered");
        }
        let connection = new WebRtcConnection(this, peerId);
        this.connections.set(peerId, connection);
        this.onConnect(connection);
        return connection;
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
                } else if (data?.id == "desc") {
                    this.onDescriptionReceived(data);
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

    sendDescription(peerId, desc) {
        console.debug(`[WebRtcEndpoint] send desc to ${peerId}`);
        this.socket.send({ id: "desc", src: this.localId, dst: peerId, data: desc });
    }

    sendIceCandidate(peerId, candidate) {
        console.debug(`[WebRtcEndpoint] send ICE candidate: ${peerId}`);
        this.socket.send({ id: "candidate", src: this.localId, dst: peerId, data: candidate });
    }

    // private

    onDescriptionReceived(data) {
        if (data?.id != "desc")
            throw new Error(`unexpected data.id, received '${data?.id}' expected 'desc'`);
        if (data?.src == undefined)
            throw new Error(`undefined data.src`);
        if (data?.dst != this.localId)
            throw new Error(`unexpected data.dst, received '${data?.dst}' expected '${this.localId}'`);
        if (data?.data == undefined)
            throw new Error(`undefined data.data`);
        console.debug(`[WebRtcEndpoint] desc received from ${data.src}`);
        if (!this.connections.has(data.src))
            this.connectTo(data.src);
        this.connections.get(data.src).onDescriptionReceived(data.data);
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
        console.debug(`[WebRtcEndpoint] ICE candidate received: ${data.src}`);
        if (!this.connections.has(data?.src))
            throw new Error(`peer from data.src not registered`);
        this.connections.get(data.src).onIceCandidateReceived(data.data);
    }
}

/**
 *  WebRtcConnection is a link between two peers
 *  It allows to create multiple communications channels
 */
class WebRtcConnection {

    constructor(connector, peerId) {
        this.peerId = peerId;
        this.connector = connector;
        this.isPolite = peerId > this.connector.localId;

        this.isMakingOffer = false;
        this.isOfferIgnored = false;
        this.isSettingRemoteAnswerPending = false;

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
        this.pc.onnegotiationneeded = async (event) => {
            try {
                this.isMakingOffer = true;
                await this.pc.setLocalDescription();
                this.connector.sendDescription(this.peerId, this.pc.localDescription);
            } catch (err) {
                console.error(err);
            } finally {
                this.isMakingOffer = false;
            }
        };
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Send the candidate to the remote peer
                this.connector.sendIceCandidate(this.peerId, event.candidate);
            }
        };
    }

    getChannel(tag, id) {
        return new WebRtcDataChannel(this.peerId, this.pc, tag, id);
    }

    // expected to be called by the connector
    async onDescriptionReceived(description) {
        try {
            const readyForOffer =
                !this.isMakingOffer &&
                (this.pc.signalingState == "stable" || this.isSettingRemoteAnswerPending);
            const offerCollision = description.type == "offer" && !readyForOffer;

            this.isOfferIgnored = !this.isPolite && offerCollision;
            if (this.isOfferIgnored) {
                return;
            }
            this.isSettingRemoteAnswerPending = description.type == "answer";
            await this.pc.setRemoteDescription(description); // SRD rolls back as needed
            this.isSettingRemoteAnswerPending = false;
            if (description.type == "offer") {
                await this.pc.setLocalDescription();
                this.connector.sendDescription(this.peerId, this.pc.localDescription);
            }
        } catch (err) {
            console.error(err);
        }
    }

    // expected to be called by the connector
    async onIceCandidateReceived(candidate) {
        try {
            try {
                await this.pc.addIceCandidate(candidate);
            } catch (err) {
                if (!this.isOfferIgnored) throw err; // Suppress ignored offer's candidates
            }
        } catch (err) {
            console.error(err);
        }
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

    let connector1 = new WebRtcEndpoint(wsUrl.href, "0001");
    let connector2 = new WebRtcEndpoint(wsUrl.href, "0002");
    let connector3 = new WebRtcEndpoint(wsUrl.href, "0003");

    let onConnect = (connection) => {
        let chan = connection.getChannel("main", 0);
        chan.onmessage = (data) => {
            console.info(`[${connection.connector.localId}] message received from ${chan.peerId} '${data}'`);
        };
        chan.onStateUpdate = (state) => {
            console.debug("state of chan", chan.peerId, state);
            if (state == State.CONNECTED) {
                chan.send(`hi, i'm ${connection.connector.localId} !`);
            }
        };
        chan.connect();
    };
    connector1.onConnect = onConnect;
    connector2.onConnect = onConnect;
    connector3.onConnect = onConnect;

    await connector1.start();
    await connector2.start();
    await connector3.start();

    connector1.connectTo("0002");
    connector1.connectTo("0003");
    connector2.connectTo("0003");
}
test();


export { Multiplexer, WebSocketChannel, DebugChannel, State }