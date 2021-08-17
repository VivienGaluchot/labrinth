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
    constructor(type, peerId, delayInMs) {
        super(type);
        this.peerId = peerId;
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

        // peerId -> Set(delayInMs)
        this.pingDelays = new Map();

        setInterval(() => {
            this.sendPings();
        }, 5000);
        this.sendPings();
    }

    sendPings() {
        for (let [peerId, delayInMs] of this.pingDelays) {
            this.sendMessage(peerId, { src: this.webRtcEndpoint.localId, timestamp: Date.now() });
        }
    }


    // API

    getDelayInMs(peerId) {
        return this.pingDelays.get(peerId);
    }


    // Network

    onIncomingConnection(peerId) {
        console.log("[Ping] onIncomingConnection", peerId);
        this.openChannel(peerId);
    }

    onChannelStateChange(peerId, state) {
        if (state == Channel.State.CONNECTED) {
            this.pingDelays.set(peerId, null);
            this.sendMessage(peerId, { src: this.webRtcEndpoint.localId, timestamp: Date.now() });
        } else if (state == Channel.State.CLOSED) {
            this.pingDelays.delete(peerId);
        }
    }

    onMessage(peerId, data) {
        if (data.src == this.webRtcEndpoint.localId) {
            let delayInMs = Date.now() - data.timestamp;
            this.pingDelays.set(peerId, delayInMs);
            this.eventTarget.dispatchEvent(new PingEvent("onPingUpdate", peerId, delayInMs));
        } else {
            this.sendMessage(peerId, data);
        }
    }
}


const app = new PingApp();

export {
    app
}