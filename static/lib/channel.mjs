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
    constructor(name, isReliable) {
        this.name = name;
        this.isReliable = isReliable;
        this.state = State.CLOSED;

        // API services
        this.onStateUpdate = (state) => { };
        this.onopen = () => { };
        this.onmessage = (data) => { console.warning(`${this.name} unset onmessage`); };
        this.send = (data) => { console.warning(`${this.name} unset send`) };
        this.onclose = (event) => { };
    }

    // internal

    setState(state) {
        if (state != this.state) {
            this.state = state;
            this.onStateUpdate?.(state);
        }
    }
}

class WebSocketChannel extends Channel {
    constructor(url, protocols, reconnect) {
        super(`${url}`, true);
        this.url = url;
        this.protocols = protocols;
        this.reconnect = reconnect;
        this.isReconnectFused = false;
        this.socket = null;
    }

    connect() {
        if (this.socket != null) {
            console.warn(`channel ${this.name} already connected`);
            return;
        }
        this.socket = new WebSocket(this.url, this.protocols);
        this.socket.onopen = () => {
            this.send = (data) => {
                this.socket.send(data)
            };
            this.setState(State.CONNECTED);
            this.onopen?.();
        };
        this.socket.onmessage = (event) => {
            this.onmessage?.(event.data);
        };
        this.socket.onclose = (event) => {
            if (this.state == State.CONNECTED) {
                this.onclose?.(event);
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

export { WebSocketChannel, State }