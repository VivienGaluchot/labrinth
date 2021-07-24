/**
 * Peer to peer friend list management
 * Take care to store the friends in local storage and exchange data (like user name)
 * between peers.
 */

"use strict";

import * as P2pApps from '/lib/p2p-apps.mjs';
import * as Channel from '/lib/channel.mjs';
import * as P2p from '/lib/p2p.mjs';


// TODO list
// * produce event on friend connection / data update
// * on local data update send new value to peers
// * do not answer to peer if not in friend list
class FriendsApp extends P2pApps.App {
    constructor() {
        super("friends");

        this.localData = this.storageLocalGet();

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
                ids = ids.filter((id => id != this.webRtcEndpoint.localId));
                for (let id of ids) {
                    this.openChannel(id);
                }
            });
    }


    // API

    getFriends() {
        return this.friendMap;
    }

    add(userId, data) {
        this.storageFriendRegister(userId, data);
        this.friendMap = this.storageFriendGetAll();
    }

    remove(userId) {
        this.storageFriendRemove(userId);
        this.friendMap = this.storageFriendGetAll();
    }

    setLocalData(data) {
        this.storageSet("local", data);
        this.localData = this.storageLocalGet();
    }

    getLocalData() {
        return this.localData;
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
            this.sendMessage(peerId, this.localData);
        }
    }

    onMessage(peerId, data) {
        let userId = P2p.RemoteEndpoint.deserialize(peerId).user;
        this.storageFriendRegister(userId, data);
        this.friendMap = this.storageFriendGetAll();
    }


    // Storage

    storageLocalGet() {
        return this.storageGet("local", () => { return {}; });
    }

    storageLocalSet(data) {
        return this.storageSet("local", data);
    }

    storageFriendGetAll() {
        let data = this.storageGet("ids", () => { return {}; });
        let friends = new Map();
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