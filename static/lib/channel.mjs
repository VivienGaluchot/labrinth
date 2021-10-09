/**
 * Data transfer
 */

"use strict";

import * as P2pId from './p2p-id.mjs';


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
            this.setState(State.CLOSED);
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

class SignalingConnectionStateEvent extends Event {
    constructor(type, state) {
        super(type);
        this.state = state;
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
 *   - onSignalingConnectionStateUpdate: SignalingConnectionStateEvent
 */
class WebRtcEndpoint extends EventTarget {
    constructor(localEndpoint) {
        super();

        let serverUrl = new URL(window.location.href);
        let protocol = null;
        if (serverUrl.protocol == "http:") {
            protocol = "ws:";
        } else {
            protocol = "wss:";
        }
        this.serverUrl = new URL(`${protocol}//${serverUrl.host}/connector`);
        this.localEndpoint = localEndpoint;

        // P2pId.Endpoint : WebRtcConnection
        this.connections = new Map();

        // socket used to publish id to server and wait for incoming offers
        this.socket = new WebSocketChannel(this.serverUrl, "rtc-on-socket-connector", true);
    }

    getOrCreateConnection(endpoint) {
        if (this.socket.state != State.CONNECTED) {
            throw new Error("websocket not connected to server");
        }
        if (endpoint == this.localEndpoint) {
            throw new Error("can't connect to localEndpoint");
        }
        if (!this.connections.has(endpoint)) {
            console.debug(`[WebRtcEndpoint] new connection to '${endpoint.serialize()}'`);
            let connection = new WebRtcConnection(this, endpoint);
            this.connections.set(endpoint, connection);
            this.dispatchEvent(new WebRtcConnectionEvent("onRegister", connection));
        }
        return this.connections.get(endpoint);
    }

    getConnection(endpoint) {
        if (!this.connections.has(endpoint)) {
            throw new Error(`peerId ${endpoint.serialize()} not registered`);
        }
        if (endpoint == this.localEndpoint) {
            throw new Error("can't connect to localEndpoint");
        }
        return this.connections.get(endpoint);
    }

    hasConnection(endpoint) {
        return this.connections.has(endpoint);
    }

    close(endpoint) {
        let connection = this.getConnection(endpoint);
        connection.close();
        this.connections.delete(endpoint);
        this.dispatchEvent(new WebRtcConnectionEvent("onUnregister", connection));
    }

    start() {
        console.debug(`[WebRtcEndpoint] start endpoint with local id '${this.localEndpoint.serialize()}'`);
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
                    this.socket.request({ id: "hi", src: this.localEndpoint.serialize() })
                        .then(() => {
                            console.log(`[WebRtcEndpoint] endpoint registered on server`);
                            resolve();
                        }).catch((reason) => {
                            reject(`can't register local endpoint\n - ${reason}`);
                        });
                }
                this.dispatchEvent(new SignalingConnectionStateEvent("onSignalingConnectionStateUpdate", state));
            };
            this.socket.connect();
        });
    }

    stop() {
        this.socket.close();
    }

    sendDescription(endpoint, desc) {
        return this.socket.request({ id: "desc", src: this.localEndpoint.serialize(), dst: endpoint.serialize(), data: desc })
            .then(() => {
                console.debug(`[WebRtcEndpoint] send desc to ${endpoint.serialize()}, done (${desc.type})`);
            });
    }

    sendIceCandidate(endpoint, candidate) {
        return this.socket.request({ id: "candidate", src: this.localEndpoint.serialize(), dst: endpoint.serialize(), data: candidate })
            .then(() => {
                console.debug(`[WebRtcEndpoint] send ICE candidate: ${endpoint.serialize()}, done`);
            });
    }

    getConnectedEndpoints(userIds) {
        if (!Array.isArray(userIds)) {
            throw new Error("unexpected argument");
        }
        return this.socket.request({ id: "find-peers", ids: userIds })
            .then((response) => {
                let endpoints = [];
                for (let peerId of response.ids) {
                    endpoints.push(P2pId.getEndpoint(peerId));
                }
                return endpoints;
            });
    }

    // private

    onDescriptionReceived(data) {
        if (data?.id != "desc")
            throw new Error(`unexpected data.id, received '${data?.id}' expected 'desc'`);
        if (data?.src == undefined)
            throw new Error(`undefined data.src`);
        if (data?.dst == undefined)
            throw new Error(`undefined data.dst`);
        if (data?.data == undefined)
            throw new Error(`undefined data.data`);
        if (!P2pId.getEndpoint(data.dst).isLocal)
            throw new Error(`unexpected data.dst, received '${data.dst}'`);
        let srcEndpoint = P2pId.getEndpoint(data.src);
        console.debug(`[WebRtcEndpoint] desc received from ${data.src} (${data.data.type})`);
        this.getOrCreateConnection(srcEndpoint).onDescriptionReceived(data.data);
    }

    onIceCandidateReceived(data) {
        if (data?.id != "candidate")
            throw new Error(`unexpected data.id, received '${data?.id}' expected 'candidate'`);
        if (data?.src == undefined)
            throw new Error(`undefined data.src`);
        if (data?.dst == undefined)
            throw new Error(`undefined data.dst`);
        if (data?.data == undefined)
            throw new Error(`undefined data.data`);
        if (!P2pId.getEndpoint(data.dst).isLocal)
            throw new Error(`unexpected data.dst, received '${data.dst}'`);
        let srcEndpoint = P2pId.getEndpoint(data.src);
        console.debug(`[WebRtcEndpoint] ICE candidate received: ${data.src}`);
        this.getConnection(srcEndpoint).onIceCandidateReceived(data.data);
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
    constructor(connector, endpoint) {
        if (endpoint.isLocal) {
            throw new Error("invalid local endpoint");
        }
        this.endpoint = endpoint;
        this.connector = connector;
        this.isPolite = endpoint.serialize() > this.connector.localEndpoint.serialize();
        if (this.isPolite !== false && this.isPolite !== true) {
            throw new Error("can't compute polite state");
        }

        this.isMakingOffer = false;
        this.isOfferIgnored = false;
        this.isSettingRemoteAnswerPending = false;
        this.pc = new RTCPeerConnection(rtcPeerConnectionConfig);
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
                await this.connector.sendDescription(this.endpoint, this.pc.localDescription);
            } catch (err) {
                console.error(err);
            } finally {
                this.isMakingOffer = false;
            }
        };
        this.pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await this.connector.sendIceCandidate(this.endpoint, event.candidate);
            }
        };

        let rootChannel = this.getChannel("root", 0);
        rootChannel.onStateUpdate = (state) => {
            if (this.state != state) {
                this.state = state;
                if (this.state == State.CONNECTED) {
                    this.connector.dispatchEvent(new WebRtcConnectionEvent("onConnect", this));
                }
                if (this.state == State.CLOSED) {
                    if (this.connector.hasConnection(this.endpoint)) {
                        this.connector.close(this.endpoint);
                    }
                    this.connector.dispatchEvent(new WebRtcConnectionEvent("onDisconnect", this));
                }
                this.connector.dispatchEvent(new WebRtcConnectionEvent("onStateUpdate", this));
            }
        };
        rootChannel.connect();
    }

    getChannel(tag, id) {
        return new WebRtcDataChannel(this.endpoint, this.pc, tag, id);
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
            await this.pc.setRemoteDescription(description);
            this.isSettingRemoteAnswerPending = false;
            if (description.type == "offer") {
                await this.pc.setLocalDescription();
                await this.connector.sendDescription(this.endpoint, this.pc.localDescription);
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

    getLocalDescription() {
        return this.pc.localDescription;
    }

    getRemoteDescription() {
        return this.pc.remoteDescription;
    }
}

/**
 *  WebRTC channel
 */
class WebRtcDataChannel extends SocketLikeChannel {
    constructor(endpoint, pc, tag, id) {
        super(`${endpoint.serialize()} - ${tag}`, false);

        this.endpoint = endpoint;
        this.pc = pc;
        this.tag = tag;
        this.id = id;
    }

    getBufferedAmount() {
        return this.socket.bufferedAmount;
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


/**
 *  WebRTC Endpoint Instance
 */

const webRtcEndpoint = new WebRtcEndpoint(P2pId.localEndpoint);
webRtcEndpoint.start();


export { WebSocketChannel, DebugChannel, State, webRtcEndpoint }