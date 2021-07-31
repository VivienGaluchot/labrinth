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
// * produce event on friend connection / data update
// * on local data update send new value to peers
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

        this.connectedUserIds = new Set();

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
                let prevConnected = this.connectedUserIds;
                this.connectedUserIds = new Set();
                for (let id of ids) {
                    let userId = P2p.RemoteEndpoint.deserialize(id).user;
                    this.connectedUserIds.add(userId);
                    if (id != this.webRtcEndpoint.localId) {
                        this.openChannel(id);
                    }
                }
                for (let userId of this.connectedUserIds) {
                    if (!prevConnected.has(userId)) {
                        console.log("connected", userId);
                        this.eventTarget.dispatchEvent(new FriendEvent("onConnectionStatusChange", userId));
                    }
                }
                for (let userId of prevConnected) {
                    if (!this.connectedUserIds.has(userId)) {
                        console.log("disconnected", userId);
                        this.eventTarget.dispatchEvent(new FriendEvent("onConnectionStatusChange", userId));
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
            throw new Error("user already friend");
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
        // TODO send update to friends
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
        // open channel if messaged are expected to be exchanged
        this.openChannel(peerId);
    };

    onChannelStateChange(peerId, state) {
        console.log("[Friends] onChannelStateChange", peerId, state);
        if (state == Channel.State.CONNECTED) {
            this.sendMessage(peerId, this.getLocalData());
        }
    }

    onMessage(peerId, data) {
        let userId = P2p.RemoteEndpoint.deserialize(peerId).user;
        this.storageFriendRegister(userId, data);
        this.friendMap = this.storageFriendGetAll();
        this.eventTarget.dispatchEvent(new FriendEvent("onDataChange", id));
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

export {
    app
}