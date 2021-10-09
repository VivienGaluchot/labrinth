
"use strict";

import * as P2pId from '/lib/p2p-id.mjs';
import * as Storage from '/lib/storage.mjs';
import * as Channel from '/lib/channel.mjs';


class NetworkManager {
    constructor(webRtcEndpoint, localEndpoint) {
        this.webRtcEndpoint = webRtcEndpoint;
        this.localEndpoint = localEndpoint;

        // appName -> App
        this.apps = new Map();

        // channels requested
        // P2pId.Endpoint -> Set(appName)
        this.requestedChannels = new Map();

        // P2pId.Endpoint -> channel
        this.channels = new Map();

        this.webRtcEndpoint.addEventListener("onRegister", (event) => {
            this.handleP2pConnection(event.connection);
        });
        for (let [endpoint, connection] of this.webRtcEndpoint.connections) {
            this.handleP2pConnection(connection);
        }
    }

    registerApp(app) {
        if (!this.apps.has(app.name)) {
            this.apps.set(app.name, app);
            console.debug(`app '${app.name}' registered`);
            for (let [endpoint, channels] of this.channels) {
                app.onIncomingConnection(endpoint);
            }
        } else {
            throw new Error(`app named '${app.name}' was already registered`);
        }
    }

    openChannel(app, endpoint) {
        if (!this.requestedChannels.has(endpoint)) {
            this.requestedChannels.set(endpoint, new Set());
        }
        if (!this.requestedChannels.get(endpoint).has(app.name)) {
            this.requestedChannels.get(endpoint).add(app.name);

            if (this.channels.has(endpoint)) {
                app.onChannelStateChange(endpoint, this.channels.get(endpoint).state);
            } else {
                this.webRtcEndpoint.getOrCreateConnection(endpoint);
            }
        }
    }

    closeChannel(app, endpoint) {
        if (this.requestedChannels.has(endpoint)) {
            this.requestedChannels.get(endpoint).delete(app.name);
            if (this.requestedChannels.get(endpoint).size == 0) {
                this.requestedChannels.delete(endpoint);
                this.webRtcEndpoint.close(endpoint);
            }
            app.onChannelStateChange(endpoint, Channel.State.CLOSED);
        }
    }

    sendMessage(app, endpoint, data) {
        this.channels.get(endpoint).send({ app: app.name, data: data });
    }

    // internal

    handleChanMessage(endpoint, data) {
        if (data.app != undefined && data.data != undefined && this.apps.has(data.app)) {
            this.apps.get(data.app).onMessage(endpoint, data.data);
        } else {
            console.warn(`message dropped ${JSON.stringify(data)}`);
        }
    }

    handleChanStateUpdate(endpoint, state) {
        if (this.requestedChannels.has(endpoint)) {
            for (let appName of this.requestedChannels.get(endpoint)) {
                this.apps.get(appName).onChannelStateChange(endpoint, state);
            }
        }
    }

    handleP2pConnection(connection) {
        let endpoint = connection.endpoint;
        let chan = connection.getChannel("apps", 1);
        this.channels.set(endpoint, chan);
        chan.onmessage = (data) => {
            this.handleChanMessage(endpoint, data);
        };
        chan.onStateUpdate = (state) => {
            this.handleChanStateUpdate(endpoint, state);
        };
        chan.connect();
        for (let [appName, app] of this.apps) {
            if (!this.requestedChannels.has(endpoint) || !this.requestedChannels.get(endpoint).has(appName)) {
                app.onIncomingConnection(endpoint);
            }
        }
    }
}


const networkManager = new NetworkManager(Channel.webRtcEndpoint, P2pId.localEndpoint);
const storage = new Storage.ModularStorage("apps");


class App {
    constructor(name) {
        this.name = name;
        this.webRtcEndpoint = networkManager.webRtcEndpoint;
        this.localEndpoint = networkManager.localEndpoint;
    }

    // 1- Networking

    // event handler to override

    onChannelStateChange(endpoint, state) { }

    onMessage(endpoint, data) { }

    onIncomingConnection(endpoint) { };

    //  API

    register() {
        networkManager.registerApp(this);
    }

    openChannel(endpoint) {
        networkManager.openChannel(this, endpoint);
    }

    closeChannel(endpoint) {
        networkManager.closeChannel(this, endpoint);
    }

    sendMessage(endpoint, data) {
        networkManager.sendMessage(this, endpoint, data);
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