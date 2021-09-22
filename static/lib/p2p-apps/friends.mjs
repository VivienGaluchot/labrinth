/**
 * Peer to peer friend list management
 * Take care to store the friends in local storage and exchange data (like user name)
 * between peers.
 */

"use strict";

import * as P2pApps from '/lib/p2p-apps.mjs';
import * as Channel from '/lib/channel.mjs';
import * as P2p from '/lib/p2p.mjs';


/**
 *  Event related to a friend
 */
class FriendEvent extends Event {
    constructor(type, userId) {
        super(type);
        this.userId = userId;
    }
}


// TODO list
// * do not answer to peer if not in friend list

/**
 *  Manage friend list /  friend connection status
 * 
 *  Events
 *   - onAdd: FriendEvent
 *   - onDataChange: FriendEvent
 *   - onRemove: FriendEvent
 *   - onConnectionStatusChange: FriendEvent
 */
class FriendsApp extends P2pApps.App {
    constructor() {
        super("friends");

        this.eventTarget = new EventTarget();

        // userId -> Set(peerId)
        this.connectedUserIds = new Map();

        // Map userId -> data
        this.friendMap = this.storageFriendGetAll();
        console.debug(`[Friends] restored ${this.friendMap.size} friends from local storage`);

        setInterval(() => {
            this.checkConnection();
        }, 5000);
        this.checkConnection();
    }

    checkConnection() {
        let friendIds = [];
        for (let [id, data] of this.friendMap) {
            friendIds.push(id);
        }
        this.webRtcEndpoint.getConnectedPeerIds(friendIds)
            .then((ids) => {
                for (let id of ids) {
                    if (id != this.webRtcEndpoint.localId) {
                        this.openChannel(id);
                    }
                }
            });
    }


    // API

    getFriends() {
        return this.friendMap;
    }

    getData(userId) {
        return this.friendMap.get(userId);
    }

    add(userId, data) {
        if (this.friendMap.has(userId)) {
            throw new Error("friend already defined");
        }
        if (userId.length == 0) {
            throw new Error("friend id malformed");
        }
        this.storageFriendRegister(userId, data);
        this.friendMap = this.storageFriendGetAll();
        this.eventTarget.dispatchEvent(new FriendEvent("onAdd", userId));
    }

    set(userId, data) {
        if (!this.friendMap.has(userId)) {
            throw new Error("user not already friend");
        }
        this.storageFriendRegister(userId, data);
        this.friendMap = this.storageFriendGetAll();
        this.eventTarget.dispatchEvent(new FriendEvent("onDataChange", userId));
    }

    remove(userId) {
        if (userId == this.localEndpoint.user) {
            throw new Error("can't remove self from friends");
        }
        this.storageFriendRemove(userId);
        this.friendMap = this.storageFriendGetAll();
        this.eventTarget.dispatchEvent(new FriendEvent("onRemove", userId));
    }

    setLocalData(data) {
        this.set(this.localEndpoint.user, data);
        for (let [userI, peerIds] of this.connectedUserIds) {
            for (let peerId of peerIds) {
                this.sendMessage(peerId, data);
            }
        }
    }

    getLocalData() {
        return this.getData(this.localEndpoint.user);
    }

    isConnected(userId) {
        return this.connectedUserIds.has(userId);
    }


    // Network

    onIncomingConnection(peerId) {
        console.log("[Friends] onIncomingConnection", peerId);

        let userId = P2p.RemoteEndpoint.deserialize(peerId).user;
        if (!this.friendMap.has(userId)) {
            this.add(userId, null);
        }

        // TODO only open channel if messages are expected to be exchanged
        this.openChannel(peerId);
    };

    onChannelStateChange(peerId, state) {
        let userId = P2p.RemoteEndpoint.deserialize(peerId).user;
        console.log("[Friends] onChannelStateChange", peerId, state);
        if (state == Channel.State.CONNECTED) {
            if (!this.connectedUserIds.has(userId)) {
                this.connectedUserIds.set(userId, new Set());
            }
            this.connectedUserIds.get(userId).add(peerId);
            console.log("connected", peerId);
            this.eventTarget.dispatchEvent(new FriendEvent("onConnectionStatusChange", userId));
            this.sendMessage(peerId, this.getLocalData());
        } else if (state == Channel.State.CLOSED) {
            if (this.connectedUserIds.has(userId)) {
                this.connectedUserIds.get(userId).delete(peerId);
                if (this.connectedUserIds.get(userId).size == 0) {
                    this.connectedUserIds.delete(userId);
                }
                console.log("disconnected", peerId);
                this.eventTarget.dispatchEvent(new FriendEvent("onConnectionStatusChange", userId));
            }
        }
    }

    onMessage(peerId, data) {
        let userId = P2p.RemoteEndpoint.deserialize(peerId).user;
        this.set(userId, data);
    }


    // Storage

    storageFriendGetAll() {
        let data = this.storageGet("ids", () => { return {}; });
        let friends = new Map();
        friends.set(this.localEndpoint.user, {});
        for (let key of Object.keys(data)) {
            friends.set(key, data[key]);
        }
        return friends;
    }

    storageFriendRegister(id, data) {
        let friends = this.storageGet("ids", () => { return {}; });
        friends[id] = data;
        this.storageSet("ids", friends);
    }

    storageFriendRemove(id) {
        let friends = this.storageGet("ids", () => { return {}; });
        let newFriends = {};
        for (let key of Object.keys(friends)) {
            if (id != key) {
                newFriends[key] = friends[key];
            }
        }
        this.storageSet("ids", newFriends);
    }
}


const app = new FriendsApp();
app.register();

export {
    app
}