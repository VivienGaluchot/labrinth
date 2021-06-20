
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

        // peerIs -> connection
        this.connections = new Map();
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
        if (!this.connections.has(peerId)) {
            let connection = this.webRtcEndpoint.getOrCreateConnection(peerId);
            this.connections.set(peerId, connection);
        }
    }

    closeChannel(app, peerId) {
    }

    sendMessage(app, peerId, data) {
        this.channels.get(peerId).send({ app: app.name, data: data });
    }

    // internal

    handleP2pConnection(event) {
        let connection = event.connection;
        let chan = connection.getChannel("apps", 1);
        chan.onmessage = (data) => {
            if (data.app != undefined && data.data != undefined && this.apps.has(data.app)) {
                this.apps.get(data.app).onMessage(chan.peerId, data.data);
            } else {
                console.warn(`message dropped ${JSON.stringify(data)}`);
            }
        };
        chan.onStateUpdate = (state) => {
            console.log("state of chan", chan.peerId, state);
        };
        chan.connect();
        this.channels.set(chan.peerId, chan);
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
                        this.sendMessage(id, "Hi from DummyApp !");
                    }
                }
            })
    }

    onChannelStateChange(peerId, state) {
        console.log("[DummyApp] onChannelStateChange", peerId, state);
    }

    onMessage(peerId, data) {
        console.log("[DummyApp] onMessage", peerId, data);
    }
}

// new DummyApp();


export {
    App,
}