/**
 * Peer to peer friend list management
 * Take care to store the friends in local storage and exchange data (like user name)
 * between peers.
 */

"use strict";

import * as P2pApps from '/lib/p2p-apps.mjs';
import * as Ping from '/lib/p2p-apps/ping.mjs';
import * as Channel from '/lib/channel.mjs';
import * as P2p from '/lib/p2p.mjs';
import * as FBind from '/lib/fbind.mjs';


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

        // Map userId -> FBind.FBinderObject
        this.dataBinders = new Map();
        for (let [userId, data] of this.getFriends()) {
            this.dataBinders.set(userId, new FBind.FBinderObject({
                name: data.name,
                picture: data.picture,
                isConnected: false,
                pingInMs: null
            }));
        }

        Ping.app.eventTarget.addEventListener("onPingUpdate", (event) => {
            let userId = P2p.RemoteEndpoint.deserialize(event.peerId).user;
            if (this.dataBinders.has(userId)) {
                this.dataBinders.get(userId).set({ pingInMs: event.delayInMs });
            }
        });

        setInterval(() => {
            this.checkConnection();
        }, 20000);
        this.checkConnection();
    }

    checkConnection() {
        let friendIds = [];
        for (let [id, data] of this.friendMap) {
            friendIds.push(id);
        }
        this.webRtcEndpoint.getConnectedPeerIds(friendIds).then((ids) => {
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
        this.dataBinders.set(userId, new FBind.FBinderObject({
            name: data?.name,
            picture: data?.picture,
            isConnected: this.isConnected(userId),
            pingInMs: null
        }));
        this.eventTarget.dispatchEvent(new FriendEvent("onAdd", userId));
    }

    set(userId, data) {
        if (!this.friendMap.has(userId)) {
            throw new Error("user not already friend");
        }
        this.storageFriendRegister(userId, data);
        this.friendMap = this.storageFriendGetAll();
        this.dataBinders.get(userId).set({
            name: data.name,
            picture: data.picture
        });
        this.eventTarget.dispatchEvent(new FriendEvent("onDataChange", userId));
    }

    remove(userId) {
        if (userId == this.localEndpoint.user) {
            throw new Error("can't remove self from friends");
        }
        this.storageFriendRemove(userId);
        this.friendMap = this.storageFriendGetAll();
        this.dataBinders.delete(userId);
        this.eventTarget.dispatchEvent(new FriendEvent("onRemove", userId));
    }

    setLocalData(data) {
        this.set(this.localEndpoint.user, data);
        for (let [userId, peerIds] of this.connectedUserIds) {
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

    getDataBinder(userId) {
        return this.dataBinders.get(userId);
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
            this.sendMessage(peerId, this.getLocalData());
        } else if (state == Channel.State.CLOSED) {
            if (this.connectedUserIds.has(userId)) {
                this.connectedUserIds.get(userId).delete(peerId);
                if (this.connectedUserIds.get(userId).size == 0) {
                    this.connectedUserIds.delete(userId);
                }
                console.log("disconnected", peerId);
            }
        }
        this.dataBinders.get(userId).set({ isConnected: this.isConnected(userId) });
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
            if (data[key] != null) {
                friends.set(key, data[key]);
            } else {
                friends.set(key, {});
            }
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