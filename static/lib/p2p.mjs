/**
 * Peer to peer networking
 */

"use strict";

import * as Math from './math.mjs';
import * as Storage from './storage.mjs';


const storage = new Storage.ModularStorage("p2p");

class Endpoint {
    constructor(user, device, session) {
        // identify a user
        this.user = user;
        // identify an user device able to store data between sessions
        this.device = device;
        // unique volatile session id
        this.session = session;
    }

    serialize() {
        return {
            user: this.user,
            device: this.device,
            session: this.session
        };
    }
}

class LocalEndpoint extends Endpoint {
    static generate() {
        let user = storage.get("user-id", () => Math.bufferToHex(Math.getRandomByteArray(64 / 8)));
        let device = storage.get("device-id", () => Math.bufferToHex(Math.getRandomByteArray(32 / 8)));
        let session = Math.bufferToHex(Math.getRandomByteArray(32 / 8));
        return new LocalEndpoint(user, device, session);
    }
}

class RemoteEndpoint extends Endpoint {
    constructor(user, device, session) {
        super(user, device, session);
    }

    static deserialize(data) {
        if (data.user == undefined) {
            throw new Error(`unexpected input '${JSON.stringify(data)}'`);
        } else if (data.device == undefined) {
            throw new Error(`unexpected input '${JSON.stringify(data)}'`);
        } else if (data.session == undefined) {
            throw new Error(`unexpected input '${JSON.stringify(data)}'`);
        } else {
            return new RemoteEndpoint(data.user, data.device, data.session);
        }
    }
}

const localEndpoint = LocalEndpoint.generate();

export { localEndpoint }