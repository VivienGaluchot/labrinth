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
                this.socket.send(data)
            };
            this.setState(State.CONNECTED);
            this.onopen();
        };
        this.socket.onmessage = (event) => {
            this.onmessage(event.data);
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

export { Multiplexer, WebSocketChannel, DebugChannel, State }