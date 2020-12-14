/**
 * Data transfer
 */

"use strict";

/**
 * A channel is reliable when frame can't be lost and are received in order
 * via a retransmission mechanism.
 */
class Channel {
    constructor(isReliable) {
        this.isReliable = isReliable;
    }
}

class Handler {
    constructor() {
        this.onopen = () => { console.debug("default onopen"); };
        this.onmessage = (data) => { console.debug("default onmessage", data); };
        this.send = (data) => { console.debug("default send", data) };
        this.onclose = (event) => { console.debug("default onclose", event); };
    }
}

class WebSocketChannel extends Channel {
    constructor(url, protocols, reconnect) {
        super(true);
        this.url = url;
        this.protocols = protocols;
        this.reconnect = reconnect;

        this.socket = null;
        this.hasOpened = false;
    }

    connect(handler) {
        this.close();
        let socket = new WebSocket(this.url, this.protocols);
        socket.onopen = () => {
            this.hasOpened = true;
            handler.onopen();
        };
        socket.onmessage = (event) => {
            handler.onmessage(event.data);
        };
        socket.onclose = (event) => {
            socket.onclose = null;
            if (this.hasOpened) {
                handler.onclose(event);
            }
            this.hasOpened = false;
            if (this.reconnect) {
                console.debug("websocket reconnecting");
                this.connect(handler);
            }
        };
        handler.send = (data) => {
            socket.send(data)
        };
        this.socket = socket;
    }

    close() {
        if (this.socket != null) {
            this.socket.onclose = null;
            this.socket.close();
        }
    }
}

export { WebSocketChannel, Handler }