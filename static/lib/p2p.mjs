/**
 * Peer to peer networking
 */

"use strict";

import * as MyMath from './math.mjs';
import * as Storage from './storage.mjs';


const storage = new Storage.ModularStorage("p2p");



// ---------------------------------
// WebRTC
// ---------------------------------

const config = {
    iceServers: [{
        urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
        ]
    }],
    iceTransportPolicy: "all",
    iceCandidatePoolSize: "0"
};

function getIceCandidates(onicecandidate) {
    let pc = new RTCPeerConnection(config);
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            if (event.candidate.candidate === '') {
                onicecandidate(null);
            } else {
                console.info("ice candidate", event.candidate.candidate);
                // TODO parse event.candidate.candidate fields
                onicecandidate(event.candidate.candidate);
            }
        }
    };

    const offerOptions = { iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: false };
    pc.createOffer(offerOptions)
        .then((desc) => {
            pc.setLocalDescription(desc)
                .then(() => {
                    console.log("setLocalDescription terminated");
                }).catch((error) => {
                    console.error("setLocalDescription error", error);
                });
        }).catch((error) => {
            console.error("createOffer error", error);
        });
};

function offer() {
    return new Promise((resolve, reject) => {
        let pc = new RTCPeerConnection(config);
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                if (event.candidate.candidate === '') {
                    return;
                }
                console.info("ice candidate", event.candidate.candidate);
            }
        };
        pc.onicegatheringstatechange = (event) => {
            console.log("onicegatheringstatechange", pc.iceGatheringState);
            if (pc.iceGatheringState == "complete") {
                resolve(pc);
            }
        };

        const offerOptions = { iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: false };
        pc.createOffer(offerOptions)
            .then((desc) => {
                pc.setLocalDescription(desc)
                    .then(() => {
                        console.log("setLocalDescription terminated");
                    }).catch((error) => {
                        console.error("setLocalDescription error", error);
                        reject(error);
                    });
            }).catch((error) => {
                console.error("createOffer error", error);
                reject(error);
            });
    });
};


// ---------------------------------
// Endpoints
// ---------------------------------

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
        let user = storage.get("user-id", () => MyMath.bufferToHex(MyMath.getRandomByteArray(64 / 8)));
        let device = storage.get("device-id", () => MyMath.bufferToHex(MyMath.getRandomByteArray(32 / 8)));
        let session = MyMath.bufferToHex(MyMath.getRandomByteArray(32 / 8));
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


// ---------------------------------
// Concurrent computing
// ---------------------------------

class Group {
    constructor() {
        this.id = MyMath.bufferToHex(MyMath.getRandomByteArray(32 / 8));
        // Set<Endpoint>();
        this.members = new Set();
    }

    // peer: Endpoint
    register(peer) {
        return new Promise((resolve, reject) => {
            // resolve when the peer accepts to join the group
            // reject when the peer reply is not received or the peer decline to join the group
        });
    }
}


// Abstract value shared amongst multiple peers
// Each peers have particular access rights (read / read-write)
// The local value is not guaranteed to be the global value, but this will eventually
// be the case (when the sync speed is higher than each local update speed)
//
// TODO
// - work with a Group
// - support adding or removing peer from the group
// - access rights
// - reduce network load
// - event API
// - global lock
// - get last updaters
class SharedMinimal {
    constructor(localEndpoint, remotes) {
        this.localEndpoint = localEndpoint;

        // local value history
        this.local = new TimestampedHistory();
        // history of remote members of the group
        this.remotes = new Map();
        for (let remote of remotes) {
            this.remotes.set(remote, new TimestampedHistory());
        }

        this.signaledCommit = 0;

        // input (called internally)
        this.send = (endpoint, message) => {
            console.warn("send not implemented");
        };
    }

    // abstract

    onCommit(clock) {
        throw new Error("abstract function not implemented");
    }

    // public

    // local

    getLocalClock() {
        return this.local.frontClock();
    }

    // global

    getGlobalClock() {
        let frontClock = null;
        for (let history of this.histories()) {
            if (frontClock == null || history.commitClock() < frontClock) {
                frontClock = history.commitClock();
            }
        }
        return frontClock;
    }

    * getGlobalHistoryPoints() {
        return this.historyPoints(this.getGlobalClock());
    }

    isGlobal() {
        let frontRef = this.local.frontClock();
        let backRef = this.local.backClock();
        // global when all the members share the same old and new clock
        for (let history of this.histories()) {
            if (history.frontClock() != frontRef || history.backClock() != backRef) {
                return false;
            }
        }
        return true;
    }

    // reception

    // when a message is received from an other peer
    onmessage(endpoint, message) {
        let remote = this.remotes.get(endpoint);
        if (message.id == "set") {
            let lClock = this.local.frontClock();
            // register the message in remote history
            remote.set(message.lClock, new HistoryPointValue(message.value));
            // register local value
            if (message.rClock == lClock) {
                // no conflict, use the received value as local value
                if (this.local.get(message.lClock) == undefined) {
                    this.local.set(message.lClock, HistoryPointNone);
                    this.sendLocalAck(message.lClock);
                }
            } else if (message.rClock < lClock) {
                // conflict, local value was updated since the message was sent
                if (this.local.get(message.lClock) == undefined) {
                    let localValue = this.local.frontValue();
                    if (localValue == HistoryPointNone) {
                        this.local.set(message.lClock, HistoryPointNone);
                        this.sendLocalAck(message.lClock);
                    } else {
                        this.local.set(message.lClock, new HistoryPointRef(localValue.value));
                        this.sendLocalAckMerge(message.lClock, localValue.value);
                    }
                }
            } else {
                throw new Error("invalid message");
            }

        } else if (message.id == "ack") {
            // register the ack in remote history
            remote.set(message.lClock, HistoryPointNone);

        } else if (message.id == "ackMerge") {
            // register the ack in remote history
            remote.set(message.lClock, new HistoryPointRef(message.value));
        }
        this.collapseHistories();
    }

    // private

    pushLocalPoint(value) {
        if (value == undefined) {
            throw new Error("undefined value not supported");
        }
        this.local.push(new HistoryPointValue(value));
        this.sendLocalUpdate(this.local.frontClock(), value);
    }

    sendLocalUpdate(lClock, value) {
        for (let [remote, h] of this.remotes) {
            this.send(remote, {
                id: "set",
                // remote clock in the sender point of view
                rClock: h.frontClock(),
                // local clock in the sender point of view
                lClock: lClock,
                // local value in the sender point of view
                value: value
            });
        }
    }

    sendLocalAck(clock) {
        let msg = {
            id: "ack",
            // local clock in the sender point of view
            lClock: clock
        };
        for (let [remote, h] of this.remotes) {
            this.send(remote, msg);
        }
    }

    sendLocalAckMerge(clock, value) {
        let msg = {
            id: "ackMerge",
            // local clock in the sender point of view
            lClock: clock,
            // local value in the sender point of view
            value: value
        };
        for (let [remote, h] of this.remotes) {
            this.send(remote, msg);
        }
    }

    collapseHistories() {
        let commitClock = this.getGlobalClock();
        if (this.signaledCommit < commitClock) {
            for (let clock = this.signaledCommit + 1; clock <= commitClock; clock++) {
                this.onCommit(clock);
            }
            for (let history of this.histories()) {
                history.forget(commitClock - 1);
            }
            this.signaledCommit = commitClock;
        }
    }

    * histories() {
        yield this.local;
        for (let [remote, history] of this.remotes) {
            yield history;
        }
    }

    * historyPoints(clock) {
        for (let history of this.histories()) {
            if (history.get(clock) != undefined) {
                yield history.get(clock);
            }
        }
    }
}

// Simple value shared amongst multiple peers
// In case of conflict, a merge function is applied
class SharedValue extends SharedMinimal {
    constructor(localEndpoint, remotes) {
        super(localEndpoint, remotes);

        // input (called internally)
        this.merge = (left, right) => {
            if (left > right) {
                return right
            } else {
                return left;
            }
        };
        this.onValueCommit = (clock, value) => { };
    }

    // abstract

    onCommit(clock) {
        this.onValueCommit(clock, this.getValue(clock));
    }

    // public

    // local

    setLocalValue(value) {
        this.pushLocalPoint(value);
    }

    getLocalValue() {
        let point = this.local.frontValue();
        if (point != undefined && point != HistoryPointNone) {
            return point.value;
        } else {
            return undefined;
        }
    }

    // global

    getGlobalValue() {
        return this.getValue(this.getGlobalClock());
    }

    // internal

    getValue(clock) {
        let mergedValue = null;
        for (let value of this.historyValues(clock)) {
            if (mergedValue == null) {
                mergedValue = value;
            } else {
                mergedValue = this.merge(mergedValue, value);
            }
        }
        return mergedValue;
    }

    * historyValues(clock) {
        for (let point of this.historyPoints(clock)) {
            if (point != HistoryPointNone) {
                yield point.value;
            }
        }
    }
}

class SharedSet extends SharedMinimal {
    constructor(localEndpoint, remotes) {
        super(localEndpoint, remotes);

        this.globalSet = new Set();
        this.localSet = null;
    }

    // abstract

    onCommit(clock) {
        this.localSet = null;
        this.updateSet(this.globalSet, clock);
    }

    // local

    addLocal(item) {
        this.localSet = null;
        this.pushLocalPoint({ op: "add", item: item });
    }

    deleteLocal(item) {
        this.localSet = null;
        this.pushLocalPoint({ op: "del", item: item });
    }

    getLocalSet() {
        if (this.localSet == null) {
            this.localSet = new Set([...this.globalSet]);
            for (let clock = this.getGlobalClock() + 1; clock <= this.getLocalClock(); clock++) {
                this.updateSet(this.localSet, clock);
            }
        }
        return this.localSet;
    }

    // global

    getGlobalSet() {
        return this.globalSet;
    }

    // internal

    updateSet(set, clock) {
        // add are executed first as simultaneous add x - del x shall result in x deleted
        for (let point of this.historyPoints(clock)) {
            // only take values into account, not refs
            if (point instanceof HistoryPointValue) {
                if (point.value.op == "add") {
                    set.add(point.value.item);
                }
            }
        }
        for (let point of this.historyPoints(clock)) {
            // only take values into account, not refs
            if (point instanceof HistoryPointValue) {
                if (point.value.op == "del") {
                    set.delete(point.value.item);
                }
            }
        }
    }
}


// ---------------------------------
// History utils
// ---------------------------------

class HistoryPoint { }

const HistoryPointNone = new HistoryPoint();

class HistoryPointValue extends HistoryPoint {
    constructor(value) {
        super();
        if (value == undefined) {
            throw new Error("undefined point value");
        }
        this.value = value;
    }
}

class HistoryPointRef extends HistoryPoint {
    constructor(value) {
        super();
        if (value == undefined) {
            throw new Error("undefined point value");
        }
        this.value = value;
    }
}

class TimestampedHistory {
    constructor() {
        // <value>Array()
        // 0: older (lower clock) -> last: newer (higher clock)
        this.history = [];
        this.clock = 0;
        this.cachedCommitClock = 0;
    }

    frontValue() {
        return this.get(this.frontClock());
    }

    frontClock() {
        return this.clock;
    }

    commitClock() {
        let back = this.backClock();
        let clock = back;
        while (this.get(clock) != undefined) {
            clock++;
        }
        return Math.max(clock - 1, back);
    }

    backClock() {
        return Math.min(this.clock - this.history.length + 1, this.clock);
    }

    get(clock) {
        let back = this.backClock();
        let front = this.frontClock();
        if (clock < back || front < clock) {
            return undefined;
        } else {
            return this.history[clock - back];
        }
    }

    set(clock, value) {
        if (value == undefined) {
            throw new Error(`can't set undefined value in history`);
        }
        let back = this.backClock();
        if (clock <= back) {
            throw new Error(`can't rewrite history, ${clock} was forgotten`);
        } else if (clock <= this.frontClock()) {
            if (this.history[clock - back] != undefined) {
                console.log(this);
                throw new Error(`can't rewrite history, ${clock} already defined`);
            } else {
                this.history[clock - back] = value;
            }
        } else {
            for (let i = this.clock; i < (clock - 1); i++) {
                this.history.push(undefined);
            }
            this.history.push(value);
            this.clock = clock;
        }
    }

    push(value) {
        this.set(this.frontClock() + 1, value);
    }

    // forget all the values up to the clock included
    forget(clock) {
        for (let i = this.backClock(); i <= clock; i++) {
            this.history.shift();
        }
        this.clockShift = clock + 1;
    }
}

export { localEndpoint, offer, getIceCandidates, TimestampedHistory, SharedValue, SharedSet }