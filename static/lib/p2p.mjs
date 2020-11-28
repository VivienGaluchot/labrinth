/**
 * Peer to peer networking
 */

"use strict";

import * as Math from './math.mjs';


class Endpoint {
    constructor(id) {
        this.id = id;
    }

    get shortId() {
        return this.id?.substr(0, 8);
    }

    serialize() {
        return { id: this.id };
    }
}

class LocalEndpoint extends Endpoint {
    static generate() {
        let id = Math.bufferToHex(Math.getRandomByteArray(128 / 8));
        console.debug(`local endpoint ${id}`);
        return new LocalEndpoint(id);
    }
}

class RemoteEndpoint extends Endpoint {
    constructor(id) {
        super(id);
        console.debug(`remote endpoint ${this.id}`);
    }

    static deserialize(data) {
        if (data.id == undefined) {
            throw new Error(`unexpected input '${JSON.stringify(data)}'`);
        } else {
            return new RemoteEndpoint(data.id);
        }
    }
}


export { LocalEndpoint, RemoteEndpoint }