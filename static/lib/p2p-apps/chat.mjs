/**
 * Chat management
 */

"use strict";

import * as P2pApps from '/lib/p2p-apps.mjs';
import * as P2p from '/lib/p2p.mjs';
import * as Channel from '/lib/channel.mjs';


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

        this.peers = new Set();
        this.eventTarget = new EventTarget();
    }


    // API

    sendChatMessage(userId, content) {
        let date = new Date();
        let srcUserId = P2p.localEndpoint.user;
        let dstUserId = userId;
        let data = {
            srcUserId: srcUserId,
            dstUserId: dstUserId,
            date: date,
            content: content
        };
        for (let peerId of this.peers) {
            if (P2p.RemoteEndpoint.deserialize(peerId).user == srcUserId ||
                P2p.RemoteEndpoint.deserialize(peerId).user == dstUserId) {
                this.sendMessage(peerId, data);
            }
        }
        this.eventTarget.dispatchEvent(new ChatEvent("onChatMessage", srcUserId, userId, date, content));
    }


    // Network

    onIncomingConnection(peerId) {
        console.log("[Chat] onIncomingConnection", peerId);
        this.openChannel(peerId);
    }

    onChannelStateChange(peerId, state) {
        if (state == Channel.State.CONNECTED) {
            this.peers.add(peerId);
        } else if (state == Channel.State.CLOSED) {
            this.peers.delete(peerId);
        }
    }

    onMessage(peerId, data) {
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