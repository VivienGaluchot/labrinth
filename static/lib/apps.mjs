
"use strict";

import * as P2p from '/lib/p2p.mjs';
import * as Storage from '/lib/storage.mjs';
import * as Channel from '/lib/channel.mjs';



class AppServer {
    constructor(localEndpoint) {
        this.localEndpoint = localEndpoint;
        this.webRtcEndpoint = localEndpoint.webRtcEndpoint;

        // appName -> App
        this.apps = new Map();

        // channels requested
        // peerId -> Set(appName)
        this.requestedChannels = new Map();

        // peerIs -> channel
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
        this.channels.get(peerId).send({ app: app.name, data: data });
    }

    // internal

    handleChanMessage(chan, data) {
        if (data.app != undefined && data.data != undefined && this.apps.has(data.app)) {
            this.apps.get(data.app).onMessage(chan.peerId, data.data);
        } else {
            console.warn(`message dropped ${JSON.stringify(data)}`);
        }
    }

    handleChanStateUpdate(chan, state) {
        if (this.requestedChannels.has(chan.peerId)) {
            for (let appName of this.requestedChannels.get(chan.peerId)) {
                this.apps.get(appName).onChannelStateChange(chan.peerId, state);
            }
        }
    }

    handleP2pConnection(event) {
        let connection = event.connection;
        let chan = connection.getChannel("apps", 1);
        let peerId = chan.peerId;

        for (let [appName, app] of this.apps) {
            if (!this.requestedChannels.has(peerId) || !this.requestedChannels.get(peerId).has(appName)) {
                app.onIncomingConnection(peerId);
            }
        }

        this.channels.set(peerId, chan);
        chan.onmessage = (data) => {
            this.handleChanMessage(chan, data);
        };
        chan.onStateUpdate = (state) => {
            this.handleChanStateUpdate(chan, state);
        };
        chan.connect();
    }
}

const defaultAppServer = new AppServer(P2p.localEndpoint);


class App {
    constructor(name, appServer = defaultAppServer) {
        this.name = name;
        this.appServer = appServer;
        this.appServer.registerApp(this);
    }

    // functions to override, called by the server

    onChannelStateChange(peerId, state) { }

    onMessage(peerId, data) { }

    onIncomingConnection(peerId) { };

    //  API

    openChannel(peerId) {
        this.appServer.openChannel(this, peerId);
    }

    closeChannel(peerId) {
        this.appServer.closeChannel(this, peerId);
    }

    sendMessage(peerId, data) {
        this.appServer.sendMessage(this, peerId, data);
    }
}


class DummyApp extends App {
    constructor() {
        super("dummy");

        let friendIds = [];
        for (let [id, data] of P2p.Notebook.friends()) {
            friendIds.push(id);
        }
        this.appServer.webRtcEndpoint.getConnectedPeerIds(friendIds)
            .then((ids) => {
                for (let id of ids) {
                    if (id != this.appServer.webRtcEndpoint.localId) {
                        this.openChannel(id);
                    }
                }
            });
    }

    onIncomingConnection(peerId) {
        console.log("[DummyApp] onIncomingConnection", peerId);
        // open channel if messaged are expected to be exchanged
        this.openChannel(peerId);
    };

    onChannelStateChange(peerId, state) {
        console.log("[DummyApp] onChannelStateChange", peerId, state);
        if (state == Channel.State.CONNECTED) {
            this.sendMessage(peerId, "Hi from DummyApp !");
        }
    }

    onMessage(peerId, data) {
        console.log("[DummyApp] onMessage", peerId, data);
    }
}

new DummyApp();


export {
    App,
}