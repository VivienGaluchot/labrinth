/**
 * Ping management
 */

"use strict";

import * as P2pApps from '/lib/p2p-apps.mjs';
import * as Channel from '/lib/channel.mjs';


/**
 *  Event related to a ping
 */
class PingEvent extends Event {
    constructor(type, endpoint, delayInMs) {
        super(type);
        this.endpoint = endpoint;
        this.delayInMs = delayInMs;
    }
}


/**
 *  Perform ping for each channels
 * 
 *  Events
 *   - onPingUpdate: PingEvent
 */
class PingApp extends P2pApps.App {
    constructor() {
        super("ping");

        this.eventTarget = new EventTarget();

        // Endpoint -> Set(delayInMs)
        this.pingDelays = new Map();

        setInterval(() => {
            this.sendPings();
        }, 5000);
        this.sendPings();
    }

    sendPings() {
        for (let [endpoint, delayInMs] of this.pingDelays) {
            this.sendMessage(endpoint, { src: this.webRtcEndpoint.localEndpoint.peerId, timestamp: Date.now() });
        }
    }


    // API

    getDelayInMs(endpoint) {
        return this.pingDelays.get(endpoint);
    }


    // Network

    onIncomingConnection(endpoint) {
        console.log("[Ping] onIncomingConnection", endpoint.peerId);
        this.openChannel(endpoint);
    }

    onChannelStateChange(endpoint, state) {
        if (state == Channel.State.CONNECTED) {
            this.pingDelays.set(endpoint, null);
            this.sendMessage(endpoint, { src: this.webRtcEndpoint.localEndpoint.peerId, timestamp: Date.now() });
        } else if (state == Channel.State.CLOSED) {
            this.pingDelays.delete(endpoint);
            this.eventTarget.dispatchEvent(new PingEvent("onPingUpdate", endpoint, null));
        }
    }

    onMessage(endpoint, data) {
        if (data.src == this.webRtcEndpoint.localEndpoint.peerId) {
            let delayInMs = Date.now() - data.timestamp;
            this.pingDelays.set(endpoint, delayInMs);
            this.eventTarget.dispatchEvent(new PingEvent("onPingUpdate", endpoint, delayInMs));
        } else {
            this.sendMessage(endpoint, data);
        }
    }
}


const app = new PingApp();
app.register();

export {
    app
}