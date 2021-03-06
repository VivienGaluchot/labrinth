/**
 * Data transfer
 */

"use strict";


const State = {
    CLOSED: 'closed',
    CONNECTING: 'connecting',
    CONNECTED: 'connected'
}

function timeoutPromise(timeoutInMs, promise) {
    let timeoutId;
    let timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject('promise timed out in ' + timeoutInMs + 'ms');
        }, timeoutInMs);
    });
    return Promise.race([promise, timeoutPromise])
        .then((result) => {
            clearTimeout(timeoutId);
            return result;
        }).catch((reason) => {
            clearTimeout(timeoutId);
            return Promise.reject(reason);
        });
}


/**
 * A channel is reliable when frame can't be lost and are received in order
 * via a retransmission mechanism.
 */
class Channel {
    constructor(name) {
        this.name = name;
        this.state = State.CLOSED;

        this.reqIndex = 0;
        this.pendingRequests = new Map();

        // API services

        // input (called internally on event)
        this.onStateUpdate = (state) => { };
        this.onopen = () => { };
        this.onmessage = (data) => {
            console.trace(`${this.name} unset onmessage: ${JSON.stringify(data)}`);
        };
        this.onclose = (event) => { };

        // output (to call externally)
        this.send = (data) => {
            console.trace(`${this.name} unset send: ${JSON.stringify(data)}`);
            return Promise.reject('send non implemented');
        };
    }

    request(data, timeoutInMs = 10000) {
        this.reqIndex++;
        let index = this.reqIndex;
        let requestPromise = this.send({ id: "req", index: index, data: data })
            .then(() => {
                return new Promise((resolve, reject) => {
                    this.pendingRequests.set(index, { resolve: resolve, reject: reject });
                });
            });
        return timeoutPromise(timeoutInMs, requestPromise).catch((reason) => {
            // in case of timeout unregister the pending request
            if (this.pendingRequests.has(index)) {
                this.pendingRequests.delete(index);
            }
            return Promise.reject(`request '${JSON.stringify(data)}' failed\n - ${reason}`);
        });
    }

    // internal

    setState(state) {
        if (state != this.state) {
            this.state = state;
            this.onStateUpdate(state);
        }
    }

    internalOnMessage(data) {
        if (data.id == "rep" && data.index != undefined && data.isOk != undefined) {
            let index = data.index;
            if (this.pendingRequests.has(index)) {
                if (data.isOk == true) {
                    this.pendingRequests.get(index).resolve(data.data);
                } else {
                    this.pendingRequests.get(index).reject(`server error: '${data.msg}'`);
                }
                this.pendingRequests.delete(index);
            }
        }
        this.onmessage(data);
    }
}


/**
 *  Debug channel, all received or send data are only logged
 */
class DebugChannel extends Channel {
    constructor(name) {
        super(`${name}`);

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
            return Promise.resolve();
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

        this.pendingSend = [];

        // return a promise resolved when the message is sent (when the connection is CONNECTED)
        this.send = (data) => {
            return new Promise((resolve, reject) => {
                if (this.state == State.CONNECTED) {
                    this.socket.send(JSON.stringify(data));
                    resolve();
                } else if (this.state == State.CONNECTING) {
                    this.pendingSend.push({ data: data, resolve: resolve, reject: reject });
                } else {
                    reject(`channel ${this.name} socket not connected`);
                }
            });
        };
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
            this.setState(State.CONNECTED);
            for (let pending of this.pendingSend) {
                this.send(pending.data).then(() => {
                    pending.resolve();
                }).catch((reason) => {
                    pending.reject(reason);
                });
            }
            this.pendingSend = [];
            this.onopen();
        };
        this.socket.onmessage = (event) => {
            this.internalOnMessage(JSON.parse(event.data));
        };
        this.socket.onclose = (event) => {
            if (this.state == State.CONNECTED) {
                this.onclose(event);
            }
            this.setState(State.CLOSED);
            this.socket = null;
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
    }

    getSocket() {
        return new WebSocket(this.url, this.protocols);
    }
}


// ---------------------------------
// WebRTC
// ---------------------------------

/**
 *  Event raised when a peer is connected to a WebRtcEndpoint
 */
class WebRtcConnectionEvent extends Event {
    constructor(type, connection) {
        super(type);
        this.connection = connection;
    }
}

/**
 *  WebRtcEndpoint allows to exchange offers through a websocket server and create
 *  WebRTC connections with other peers
 * 
 *  inspired from https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
 * 
 *  API services
 *  Events
 *   - onRegister: WebRtcConnectionEvent
 *   - onUnregister: WebRtcConnectionEvent
 *   - onConnect: WebRtcConnectionEvent
 *   - onDisconnect: WebRtcConnectionEvent
 *   - onStateUpdate: WebRtcConnectionEvent
 *   - onPingUpdate: WebRtcConnectionEvent
 */
class WebRtcEndpoint extends EventTarget {
    constructor(serverUrl, localId) {
        super();
        this.serverUrl = serverUrl;
        this.localId = localId;

        this.connections = new Map();

        // socket used to publish id to server and wait for incoming offers
        this.socket = new WebSocketChannel(this.serverUrl, "rtc-on-socket-connector", true);
    }

    getOrCreateConnection(peerId) {
        if (this.socket.state != State.CONNECTED) {
            throw new Error("websocket not connected to server");
        }
        if (peerId == this.localId) {
            throw new Error("can't connect to localId");
        }
        if (!this.connections.has(peerId)) {
            console.debug(`[WebRtcEndpoint] new connection to '${peerId}'`);
            let connection = new WebRtcConnection(this, peerId);
            this.connections.set(peerId, connection);
            this.dispatchEvent(new WebRtcConnectionEvent("onRegister", connection));
        }
        return this.connections.get(peerId);
    }

    getConnection(peerId) {
        if (!this.connections.has(peerId)) {
            throw new Error(`peerId not ${peerId} registered`);
        }
        if (peerId == this.localId) {
            throw new Error("can't connect to localId");
        }
        return this.connections.get(peerId);
    }

    close(peerId) {
        let connection = this.getConnection(peerId);
        connection.close();
        this.connections.delete(peerId);
        this.dispatchEvent(new WebRtcConnectionEvent("onUnregister", connection));
    }

    start() {
        console.debug(`[WebRtcEndpoint] start endpoint with local id '${this.localId}'`);
        this.socket.onmessage = (data) => {
            if (data?.id == "desc") {
                this.onDescriptionReceived(data);
            } else if (data?.id == "candidate") {
                this.onIceCandidateReceived(data);
            }
        };
        return new Promise((resolve, reject) => {
            this.socket.onStateUpdate = (state) => {
                if (state == State.CONNECTED) {
                    this.socket.request({ id: "hi", src: this.localId })
                        .then(() => {
                            console.log(`[WebRtcEndpoint] endpoint registered on server`);
                            resolve();
                        }).catch((reason) => {
                            reject(`can't register local endpoint\n - ${reason}`);
                        });
                }
            };
            this.socket.connect();
        });
    }

    stop() {
        this.socket.close();
    }

    sendDescription(peerId, desc) {
        return this.socket.request({ id: "desc", src: this.localId, dst: peerId, data: desc })
            .then(() => {
                console.debug(`[WebRtcEndpoint] send desc to ${peerId}, done`);
            });
    }

    sendIceCandidate(peerId, candidate) {
        console.log("->", candidate);
        return this.socket.request({ id: "candidate", src: this.localId, dst: peerId, data: candidate })
            .then(() => {
                console.debug(`[WebRtcEndpoint] send ICE candidate: ${peerId}, done`);
            });
    }

    getConnectedPeerIds(userIds) {
        if (!Array.isArray(userIds)) {
            throw new Error("unexpected argument");
        }
        return this.socket.request({ id: "find-peers", ids: userIds })
            .then((response) => {
                return response.ids;
            });
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
        this.getOrCreateConnection(data.src).onDescriptionReceived(data.data);
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

const rtcPeerConnectionConfig = {
    iceServers: [{
        urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
        ]
    }],
    iceTransportPolicy: "all",
    iceCandidatePoolSize: "4"
};

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
        this.pc = new RTCPeerConnection(rtcPeerConnectionConfig);

        this.pingDelayInMs = null;
        this.state = State.CLOSED;

        this.pc.onsignalingstatechange = (event) => {
            this.connector.dispatchEvent(new WebRtcConnectionEvent("onStateUpdate", this));
        };
        this.pc.oniceconnectionstatechange = (event) => {
            if (this.pc.iceConnectionState === "failed" && this.pc.signalingState !== "closed") {
                this.pc.restartIce();
            }
            this.connector.dispatchEvent(new WebRtcConnectionEvent("onStateUpdate", this));
        };

        this.pc.onnegotiationneeded = async (event) => {
            try {
                this.isMakingOffer = true;
                await this.pc.setLocalDescription();
                await this.connector.sendDescription(this.peerId, this.pc.localDescription);
            } catch (err) {
                console.error(err);
            } finally {
                this.isMakingOffer = false;
            }
        };
        this.pc.onicecandidate = async (event) => {
            if (event.candidate) {
                // Send the candidate to the remote peer
                await this.connector.sendIceCandidate(this.peerId, event.candidate);
            }
        };

        this.pingChan = this.getChannel("ping", 0);
        this.pingChan.onStateUpdate = (state) => {
            this.state = state;
            if (this.state == State.CONNECTED) {
                this.connector.dispatchEvent(new WebRtcConnectionEvent("onConnect", this));
            }
            if (this.state == State.CLOSED) {
                this.pingDelayInMs = null;
                this.connector.dispatchEvent(new WebRtcConnectionEvent("onDisconnect", this));
            }
            this.connector.dispatchEvent(new WebRtcConnectionEvent("onStateUpdate", this));
        };
        this.pingChan.onmessage = (data) => {
            if (data.src == this.peerId) {
                this.pingChan.send(data);
            }
            if (data.src == this.connector.localId) {
                this.pingDelayInMs = Date.now() - data.timestamp;
                this.connector.dispatchEvent(new WebRtcConnectionEvent("onPingUpdate", this));
            }
        };
        setInterval(() => {
            if (this.pingChan.state == State.CONNECTED) {
                this.pingChan.send({ src: this.connector.localId, timestamp: Date.now() });
            }
        }, 2000);
        this.pingChan.connect();
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
                await this.connector.sendDescription(this.peerId, this.pc.localDescription);
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

    // expected to be called by the connector
    close() {
        this.pc.close();
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
    }

    getSocket() {
        try {
            return this.pc.createDataChannel(this.tag, { negotiated: true, id: this.id });
        } catch (err) {
            console.error("createDataChannel error", this);
            throw err;
        }
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


export { Multiplexer, WebSocketChannel, DebugChannel, State, WebRtcEndpoint, getIceCandidates }