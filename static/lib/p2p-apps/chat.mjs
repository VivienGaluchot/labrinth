/**
 * Chat management
 */

"use strict";

import * as P2pApps from '/lib/p2p-apps.mjs';
import * as Channel from '/lib/channel.mjs';
import * as P2pId from '/lib/p2p-id.mjs';


/**
 *  Event related to a ping
 */
class ChatEvent extends Event {
    constructor(type, srcUserId, dstUserId, date, content) {
        super(type);
        this.srcUserId = srcUserId;
        this.dstUserId = dstUserId;
        this.date = date;
        this.content = content;
    }
}


/**
 *  Send and receive chat message to users
 * 
 *  Events
 *   - onChatMessage: ChatEvent
 */
class ChatApp extends P2pApps.App {
    constructor() {
        super("chat");

        this.endpoints = new Set();
        this.eventTarget = new EventTarget();
    }


    // API

    sendChatMessage(userId, content) {
        let date = new Date();
        let srcUserId = P2pId.localEndpoint.user;
        let dstUserId = userId;
        let data = {
            srcUserId: srcUserId,
            dstUserId: dstUserId,
            date: date,
            content: content
        };
        for (let endpoint of this.endpoints) {
            if (endpoint.user == srcUserId || endpoint.user == dstUserId) {
                this.sendMessage(endpoint, data);
            }
        }
        this.eventTarget.dispatchEvent(new ChatEvent("onChatMessage", srcUserId, userId, date, content));
    }


    // Network

    onIncomingConnection(endpoint) {
        console.log("[Chat] onIncomingConnection", endpoint.peerId);
        this.openChannel(endpoint);
    }

    onChannelStateChange(endpoint, state) {
        if (state == Channel.State.CONNECTED) {
            this.endpoints.add(endpoint);
        } else if (state == Channel.State.CLOSED) {
            this.endpoints.delete(endpoint);
        }
    }

    onMessage(endpoint, data) {
        let srcUserId = data.srcUserId;
        let dstUserId = data.dstUserId;
        let content = data.content;
        let date = new Date(data.date);
        this.eventTarget.dispatchEvent(new ChatEvent("onChatMessage", srcUserId, dstUserId, date, content));
    }
}

const app = new ChatApp();
app.register();

export {
    app
}