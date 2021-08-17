
"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import * as Channel from '/lib/channel.mjs';


class NetworkManager {
    constructor(webRtcEndpoint, localEndpoint) {
        this.webRtcEndpoint = webRtcEndpoint;
        this.localEndpoint = localEndpoint;

        // appName -> App
        this.apps = new Map();

        // channels requested
        // peerId -> Set(appName)
        this.requestedChannels = new Map();

        // peerIs -> [channel]
        this.channels = new Map();

        this.webRtcEndpoint.addEventListener("onRegister", (event) => {
            this.handleP2pConnection(event);
        });
    }

    registerApp(app) {
        if (!this.apps.has(app.name)) {
            this.apps.set(app.name, app);
            console.debug(`app '${app.name}' registered`);
        } else {
            throw new Error(`app named '${app.name}' was already registered`);
        }
    }

    openChannel(app, peerId) {
        if (!this.requestedChannels.has(peerId)) {
            this.requestedChannels.set(peerId, new Set());
        }
        if (!this.requestedChannels.get(peerId).has(app.name)) {
            this.requestedChannels.get(peerId).add(app.name);

            if (this.channels.has(peerId)) {
                app.onChannelStateChange(peerId, Channel.State.CONNECTED);
            } else {
                this.webRtcEndpoint.getOrCreateConnection(peerId);
            }
        }
    }

    closeChannel(app, peerId) {
        if (this.requestedChannels.has(peerId)) {
            this.requestedChannels.get(peerId).delete(app.name);
            if (this.requestedChannels.get(peerId).size == 0) {
                this.requestedChannels.delete(peerId);
                this.webRtcEndpoint.close(peerId);
            }
            app.onChannelStateChange(peerId, Channel.State.CLOSED);
        }
    }

    sendMessage(app, peerId, data) {
        let minBufferedAmount = null;
        let selectedChan = null;
        for (let chan of this.channels.get(peerId)) {
            let bufferedAmount = chan.getBufferedAmount();
            if (minBufferedAmount == null || minBufferedAmount > bufferedAmount) {
                selectedChan = chan;
            }
        }
        selectedChan.send({ app: app.name, data: data });
    }

    // internal

    handleChanMessage(peerId, data) {
        if (data.app != undefined && data.data != undefined && this.apps.has(data.app)) {
            this.apps.get(data.app).onMessage(peerId, data.data);
        } else {
            console.warn(`message dropped ${JSON.stringify(data)}`);
        }
    }

    handleChanStateUpdate(peerId, state) {
        if (this.requestedChannels.has(peerId)) {
            for (let appName of this.requestedChannels.get(peerId)) {
                this.apps.get(appName).onChannelStateChange(peerId, state);
            }
        }
    }

    handleP2pConnection(event) {
        let connection = event.connection;
        let peerId = connection.peerId;

        let channels = [
            connection.getChannel("apps-1", 1),
            connection.getChannel("apps-2", 2),
            connection.getChannel("apps-3", 3),
            connection.getChannel("apps-4", 4),
            connection.getChannel("apps-5", 5),
            connection.getChannel("apps-6", 6)
        ];

        for (let [appName, app] of this.apps) {
            if (!this.requestedChannels.has(peerId) || !this.requestedChannels.get(peerId).has(appName)) {
                app.onIncomingConnection(peerId);
            }
        }

        let lastState = null;
        this.channels.set(peerId, channels);
        for (let chan of channels) {
            chan.onmessage = (data) => {
                this.handleChanMessage(peerId, data);
            };
            chan.onStateUpdate = (state) => {
                if (lastState != state) {
                    this.handleChanStateUpdate(peerId, state);
                    lastState = state;
                }
            };
        }
        for (let chan of channels) {
            chan.connect();
        }
    }
}


const networkManager = new NetworkManager(P2p.webRtcEndpoint, P2p.localEndpoint);
const storage = new Storage.ModularStorage("apps");


class App {
    constructor(name) {
        this.name = name;
        this.webRtcEndpoint = networkManager.webRtcEndpoint;
        this.localEndpoint = networkManager.localEndpoint;
        networkManager.registerApp(this);
    }

    // 1- Networking

    // event handler to override

    onChannelStateChange(peerId, state) { }

    onMessage(peerId, data) { }

    onIncomingConnection(peerId) { };

    //  API

    openChannel(peerId) {
        networkManager.openChannel(this, peerId);
    }

    closeChannel(peerId) {
        networkManager.closeChannel(this, peerId);
    }

    sendMessage(peerId, data) {
        networkManager.sendMessage(this, peerId, data);
    }

    // 2 - Local storage

    storageKey(key) {
        return JSON.stringify({ name: this.name, key: key });
    }

    storageGet(key, initialize) {
        return storage.get(this.storageKey(key), initialize);
    }

    storageSet(key, value) {
        storage.set(this.storageKey(key), value);
    }

    storageRemove(key) {
        storage.remove(this.storageKey(key));
    }
}


export {
    App,
}