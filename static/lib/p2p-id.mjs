/**
 * Peer to peer identification
 */

"use strict";

import * as MyMath from './math.mjs';
import * as Storage from './storage.mjs';


const storage = new Storage.ModularStorage("p2p");


// ---------------------------------
// Endpoints
// ---------------------------------

class Endpoint {
    constructor(user, device, session, isLocal) {
        // identify a user
        this.user = user;
        // identify an user device able to store data between sessions
        this.device = device;
        // unique volatile session id
        this.session = session;

        this.peerId = `${this.user}-${this.device}-${this.session}`;

        this.isLocal = isLocal;
    }

    serialize() {
        return this.peerId;
    }
}

class RemoteEndpoint extends Endpoint {
    static deserialize(str) {
        const regex = /^([0-9a-f]{16})-([0-9a-f]{8})-([0-9a-f]{8})$/;
        let matches = str.match(regex);
        if (!matches) {
            throw new Error(`invalid endpoint '${str}'`);
        }
        return Object.freeze(new RemoteEndpoint(matches[1], matches[2], matches[3], true));
    }

    constructor(user, device, session) {
        super(user, device, session, false);
    }
}

class LocalEndpoint extends Endpoint {
    static generate() {
        let init = () => {
            return {
                user: MyMath.bufferToHex(MyMath.getRandomByteArray(64 / 8)),
                device: MyMath.bufferToHex(MyMath.getRandomByteArray(32 / 8))
            };
        };
        let persist = storage.get("local-endpoint", init);
        let user = persist.user;
        let device = persist.device;
        let session = MyMath.bufferToHex(MyMath.getRandomByteArray(32 / 8));
        return new LocalEndpoint(user, device, session);
    }

    constructor(user, device, session) {
        super(user, device, session, true);
    }
}

const localEndpoint = LocalEndpoint.generate();

// TODO fix memory leak
const remoteEndpoints = new Map();
function getEndpoint(peerId) {
    if (peerId == localEndpoint.serialize()) {
        return localEndpoint;
    }
    let existing = remoteEndpoints.get(peerId);
    if (existing) {
        return existing;
    } else {
        let created = RemoteEndpoint.deserialize(peerId);
        remoteEndpoints.set(peerId, created);
        return created;
    }
}


export { localEndpoint, getEndpoint }