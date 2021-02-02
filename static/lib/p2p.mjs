/**
 * Peer to peer networking
 */

"use strict";

import * as MyMath from './math.mjs';
import * as Storage from './storage.mjs';


const storage = new Storage.ModularStorage("p2p");

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

// Value shared amongst multiple peers
// Each peers have particular access rights (read / read-write) for this value
// The local value is not guaranteed to be the global value, but this will eventually
// be the case (when the sync speed is higher than each local update speed).
//
// TODO
// - work with a Group
// - support adding or removing peer from the group
// - access rights
// - reduce network load
// - event API
class SharedValue {
    constructor(localEndpoint, remotes) {
        this.localEndpoint = localEndpoint;

        // local value history
        this.local = new TimestampedHistory();
        // history of remote members of the group
        this.remotes = new Map();
        for (let remote of remotes) {
            this.remotes.set(remote, new TimestampedHistory());
        }

        // input (called internally)
        this.send = (endpoint, message) => {
            console.warn("send not implemented");
        };
        this.merge = (left, right) => {
            if (left > right) {
                return right
            } else {
                return left;
            }
        };
    }

    getLocalClock() {
        return this.local.frontClock();
    }

    getLocal() {
        return this.local.frontValue();
    }

    getGlobalClock() {
        let frontClock = null;
        for (let history of this.histories()) {
            if (frontClock == null || history.frontClock() < frontClock) {
                frontClock = history.frontClock();
            }
        }
        return frontClock;
    }

    getGlobal() {
        let frontClock = this.getGlobalClock();
        let value = null;
        for (let history of this.histories()) {
            if (history.get(frontClock) != undefined) {
                if (value == null) {
                    value = history.get(frontClock);
                } else {
                    value = this.merge(value, history.get(frontClock));
                }
            }
        }
        return value;
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

    setLocal(value) {
        if (value == undefined) {
            throw new Error("undefined value not supported");
        }
        this.local.push(value);
        this.sendLocalUpdate();
    }

    // when a message is received from an other peer
    onmessage(endpoint, message) {
        if (message.id == "set") {
            let lClock = this.local.frontClock();
            let remote = this.remotes.get(endpoint);
            if (remote.frontClock() < message.lClock) {
                // register the message in remote history
                remote.set(message.lClock, message.value);
                // register local value
                if (message.rClock == lClock) {
                    // no conflict, use the received value as local value
                    if (lClock < message.lClock) {
                        this.local.set(message.lClock, undefined);
                        this.sendLocalAck();
                    }
                } else if (message.rClock < lClock) {
                    // conflict
                    if (lClock < message.lClock) {
                        this.local.set(message.lClock, this.local.frontValue());
                        this.sendLocalAckMerge();
                    }
                } else if (lClock < message.rClock) {
                    // invalid case
                    console.warn("invalid case");
                }
            }
            this.collapseHistories();
        } else if (message.id == "ack") {
            let remote = this.remotes.get(endpoint);
            if (remote.frontClock() < message.lClock) {
                // register the ack in remote history
                remote.set(message.lClock, undefined);
            }
            this.collapseHistories();
        } else if (message.id == "ackMerge") {
            let remote = this.remotes.get(endpoint);
            if (remote.frontClock() < message.lClock) {
                // register the ack in remote history
                remote.set(message.lClock, message.value);
            }
            this.collapseHistories();
        }
    }

    // internal

    sendLocalUpdate() {
        for (let [remote, h] of this.remotes) {
            this.send(remote, {
                id: "set",
                // remote clock in the sender point of view
                rClock: h.frontClock(),
                // local clock in the sender point of view
                lClock: this.local.frontClock(),
                // local value in the sender point of view
                value: this.local.frontValue()
            });
        }
    }

    sendLocalAck() {
        for (let [remote, h] of this.remotes) {
            this.send(remote, {
                id: "ack",
                // local clock in the sender point of view
                lClock: this.local.frontClock()
            });
        }
    }

    sendLocalAckMerge() {
        for (let [remote, h] of this.remotes) {
            this.send(remote, {
                id: "ackMerge",
                // local clock in the sender point of view
                lClock: this.local.frontClock(),
                // local value in the sender point of view
                value: this.local.frontValue()
            });
        }
    }

    collapseHistories() {
        let frontClock = null;
        for (let history of this.histories()) {
            if (frontClock == null || history.frontClock() < frontClock) {
                frontClock = history.frontClock();
            }
        }
        for (let history of this.histories()) {
            history.forget(frontClock - 1);
        }
    }

    * histories() {
        yield this.local;
        for (let [remote, history] of this.remotes) {
            yield history;
        }
    }

    static test() {
        let nbOk = 0;
        let nbKo = 0;

        function check(predicate) {
            if (!predicate) {
                console.trace("KO");
                nbKo++;
            } else {
                nbOk++;
            }
        }
        function checkThrow(callback) {
            try {
                callback();
                check(false);
            } catch (error) {
                nbOk++;
            }
        }

        // setup
        let alice = "alice";
        let bob = "bob";
        let charles = "charles";
        let group = [alice, bob, charles];

        let messages = [];
        function exchangeShuffle(max) {
            let count = 0;
            while (messages.length > 0 && (max == null || count < max)) {
                MyMath.shuffleArray(messages);
                messages[0]();
                messages.shift();
                count++;
            }
        }

        let shd = new Map();
        for (let id of group) {
            let shared = new SharedValue(id, group.filter((value) => { return value != id }));
            shared.send = (to, message) => {
                messages.push(() => {
                    console.debug(id, "->", to, message);
                    shd.get(to).onmessage(id, message);
                });
            };
            shd.set(id, shared);
        }

        function logDetail(id, sh) {
            console.log(`==> vue from ${id}, global ${sh.isGlobal()}`);
            console.log("local", sh.local.backClock(), sh.local.frontClock(), sh.local.history);
            for (let [id, hs] of sh.remotes) {
                console.log("remote", id, hs.backClock(), hs.frontClock(), hs.history);
            }
            console.log("global", sh.getGlobal());
        }


        console.log("-- initial condition");

        check(shd.get(alice).getLocal() == undefined);
        check(shd.get(alice).getGlobal() == undefined);


        console.log("-- invalid input");

        checkThrow(() => { shd.get(alice).setLocal(undefined); });


        console.log("-- no conflict value exchange");

        shd.get(alice).setLocal("1");
        check(shd.get(alice).getLocal() == "1");
        check(shd.get(alice).getLocalClock() == 1);
        check(shd.get(alice).getGlobal() == undefined);
        check(shd.get(alice).getGlobalClock() == 0);
        exchangeShuffle();
        for (let [id, sh] of shd) {
            check(sh.getGlobal() == "1");
        }
        shd.get(bob).setLocal("2");
        check(shd.get(bob).getLocal() == "2");
        check(shd.get(bob).getLocalClock() == 2);
        check(shd.get(bob).getGlobalClock() == 1);
        exchangeShuffle();
        for (let [id, sh] of shd) {
            check(sh.getGlobal() == "2");
        }
        shd.get(alice).setLocal("1");
        exchangeShuffle();
        for (let [id, sh] of shd) {
            check(sh.getGlobal() == "1");
        }

        for (let [id, sh] of shd) {
            logDetail(id, sh);
            check(sh.getGlobalClock() == 3);
        }


        console.log("-- conflict value exchange");

        shd.get(alice).setLocal("2");
        check(shd.get(alice).getLocal() == "2");
        shd.get(bob).setLocal("3");
        check(shd.get(bob).getLocal() == "3");
        shd.get(bob).setLocal("5");
        check(shd.get(bob).getLocal() == "5");
        shd.get(charles).setLocal("4");
        check(shd.get(charles).getLocal() == "4");

        for (let [id, sh] of shd) {
            check(shd.get(id).getGlobal() == "1");
        }
        exchangeShuffle();
        for (let [id, sh] of shd) {
            logDetail(id, sh);
            check(sh.getGlobal() == "2");
            check(sh.getGlobalClock() == 5);
        }

        console.log("-- global consistency");

        for (let i = 0; i < 10; i++) {
            shd.get(alice).setLocal("6");
            exchangeShuffle(1);
            shd.get(bob).setLocal("7");
            shd.get(charles).setLocal("8");
            exchangeShuffle(2);
            shd.get(charles).setLocal("9");
            shd.get(bob).setLocal("10");
            exchangeShuffle(4);
            shd.get(alice).setLocal("11");
            shd.get(alice).setLocal("12");
            shd.get(alice).setLocal("13");
            shd.get(alice).setLocal("14");
            exchangeShuffle();
        }

        // all shall have the same global value & clock
        check(shd.get(alice).getGlobal() != undefined);
        check(shd.get(alice).getGlobal() == shd.get(bob).getGlobal());
        check(shd.get(alice).getGlobal() == shd.get(charles).getGlobal());
        check(shd.get(alice).getGlobalClock() == shd.get(bob).getGlobalClock());
        check(shd.get(alice).getGlobalClock() == shd.get(charles).getGlobalClock());

        for (let [id, sh] of shd) {
            logDetail(id, sh);
        }


        console.log("-- result");
        if (nbKo == 0) {
            console.log(`SharedValue test: ${nbOk} / ${nbOk + nbKo}`);
        } else {
            console.error(`SharedValue test: ${nbOk} / ${nbOk + nbKo}`);
        }
        return { nbOk: nbOk, nbKo: nbKo };
    }
}

class TimestampedHistory {
    constructor() {
        // <value>Array()
        // 0: older (lower clock) -> last: newer (higher clock)
        this.history = [];
        this.clock = 0;
    }

    frontValue() {
        return this.get(this.frontClock());
    }

    frontClock() {
        return this.clock;
    }

    backClock() {
        return this.clock - this.history.length + 1;
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
        if (clock <= this.clock) {
            throw new Error("can't rewrite history");
        } else {
            let frontValue = this.history[this.history.length - 1];
            for (let i = this.clock; i < (clock - 1); i++) {
                this.history.push(frontValue);
            }
            this.history.push(value);
        }
        this.clock = clock;
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

    static test() {
        let nbOk = 0;
        let nbKo = 0;

        function check(predicate) {
            if (!predicate) {
                console.trace("KO");
                nbKo++;
            } else {
                nbOk++;
            }
        }
        function checkThrow(callback) {
            try {
                callback();
                check(false);
            } catch (error) {
                nbOk++;
            }
        }

        // setup
        let h = new TimestampedHistory();
        checkThrow(() => { h.set(0, "x") });
        h.set(1, "1");
        h.set(2, "2");
        h.set(5, "5");
        checkThrow(() => { h.set(5, "x") });
        h.set(10, "10");

        // ranges
        check(h.backClock() == 1);
        check(h.frontClock() == 10);

        // values
        check(h.get(0) == undefined);
        check(h.get(1) == "1");
        check(h.get(2) == "2");
        check(h.get(3) == "2");
        check(h.get(4) == "2");
        check(h.get(5) == "5");
        check(h.get(9) == "5");
        check(h.get(10) == "10");
        check(h.get(11) == undefined);

        // forget
        h.forget(3);
        check(h.backClock() == 4);
        check(h.frontClock() == 10);
        check(h.get(0) == undefined);
        check(h.get(1) == undefined);
        check(h.get(2) == undefined);
        check(h.get(3) == undefined);
        check(h.get(4) == "2");
        check(h.get(5) == "5");
        check(h.get(9) == "5");
        check(h.get(10) == "10");
        check(h.get(11) == undefined);

        h.forget(4);
        check(h.backClock() == 5);
        check(h.frontClock() == 10);
        check(h.get(4) == undefined);
        check(h.get(5) == "5");
        check(h.get(9) == "5");
        check(h.get(10) == "10");
        check(h.get(11) == undefined);

        if (nbKo == 0) {
            console.log(`TimestampedHistory test: ${nbOk} / ${nbOk + nbKo}`);
        } else {
            console.error(`TimestampedHistory test: ${nbOk} / ${nbOk + nbKo}`);
        }
        return { nbOk: nbOk, nbKo: nbKo };
    }
}

export { localEndpoint, offer, getIceCandidates, TimestampedHistory, SharedValue }