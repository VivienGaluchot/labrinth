/**
 * Peer to peer networking test module
 */

"use strict";

import * as MyMath from './math.mjs';
import * as P2p from './p2p.mjs';


function TimestampedHistory() {
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
    let h = new P2p.TimestampedHistory();
    checkThrow(() => { h.set(0, "x") });
    h.set(1, "1");
    h.set(2, "2");
    h.set(5, "5");
    checkThrow(() => { h.set(5, "x") });
    h.set(10, "10");

    // ranges
    check(h.backClock() == 1);
    check(h.commitClock() == 2);
    check(h.frontClock() == 10);

    // values
    check(h.get(0) == undefined);
    check(h.get(1) == "1");
    check(h.get(2) == "2");
    check(h.get(3) == undefined);
    check(h.get(4) == undefined);
    check(h.get(5) == "5");
    check(h.get(9) == undefined);
    check(h.get(10) == "10");
    check(h.get(11) == undefined);

    // forget
    h.forget(3);
    check(h.backClock() == 4);
    check(h.commitClock() == 3);
    check(h.frontClock() == 10);
    check(h.get(0) == undefined);
    check(h.get(1) == undefined);
    check(h.get(2) == undefined);
    check(h.get(3) == undefined);
    check(h.get(4) == undefined);
    check(h.get(5) == "5");
    check(h.get(9) == undefined);
    check(h.get(10) == "10");
    check(h.get(11) == undefined);

    h.forget(4);
    check(h.backClock() == 5);
    check(h.commitClock() == 5);
    check(h.frontClock() == 10);
    check(h.get(4) == undefined);
    check(h.get(5) == "5");
    check(h.get(9) == undefined);
    check(h.get(10) == "10");
    check(h.get(11) == undefined);

    if (nbKo == 0) {
        console.log(`TimestampedHistory test: ${nbOk} / ${nbOk + nbKo}`);
    } else {
        console.error(`TimestampedHistory test: ${nbOk} / ${nbOk + nbKo}`);
    }
    return { nbOk: nbOk, nbKo: nbKo };
}

function SharedValue() {
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
            messages.shift()();
            count++;
        }
    }

    let shd = new Map();
    let historyValues = new Map();
    for (let id of group) {
        let shared = new P2p.SharedValue(id, group.filter((value) => { return value != id }));
        shared.send = (to, message) => {
            messages.push(() => {
                console.debug(id, "->", to, message);
                shd.get(to).onmessage(id, message);
            });
        };
        shared.onCommit = (clock, value) => {
            historyValues.get(id)[clock] = value;
        };
        historyValues.set(id, []);
        shd.set(id, shared);
    }

    function logDetail(id, sh) {
        console.log(`==> vue from ${id}, global ${sh.isGlobal()}`);
        console.log("local", sh.local.backClock(), sh.local.frontClock(), sh.local.history);
        for (let [id, hs] of sh.remotes) {
            console.log("remote", id, hs.backClock(), hs.frontClock(), hs.history);
        }
        console.log("global", sh.getGlobalValue());
    }


    console.log("-- initial condition");

    check(shd.get(alice).getLocalValue() == undefined);
    check(shd.get(alice).getGlobalValue() == undefined);


    console.log("-- invalid input");

    checkThrow(() => { shd.get(alice).setLocal(undefined); });


    console.log("-- no conflict value exchange");

    shd.get(alice).setLocal("1");
    check(shd.get(alice).getLocalValue() == "1");
    check(shd.get(alice).getLocalClock() == 1);
    check(shd.get(alice).getGlobalValue() == undefined);
    check(shd.get(alice).getGlobalClock() == 0);
    check(shd.get(alice).isGlobal() == false);
    exchangeShuffle();
    for (let [id, sh] of shd) {
        check(sh.getGlobalValue() == "1");
        check(sh.isGlobal() == true);
    }
    shd.get(bob).setLocal("2");
    check(shd.get(bob).isGlobal() == false);
    check(shd.get(bob).getLocalValue() == "2");
    check(shd.get(bob).getLocalClock() == 2);
    check(shd.get(bob).getGlobalClock() == 1);
    exchangeShuffle();
    for (let [id, sh] of shd) {
        check(sh.getGlobalValue() == "2");
        check(sh.isGlobal() == true);
    }
    shd.get(alice).setLocal("1");
    check(shd.get(alice).isGlobal() == false);
    exchangeShuffle();
    for (let [id, sh] of shd) {
        check(sh.getGlobalValue() == "1");
        check(sh.isGlobal() == true);
    }

    for (let [id, sh] of shd) {
        logDetail(id, sh);
        check(sh.getGlobalClock() == 3);
    }


    console.log("-- conflict value exchange");

    shd.get(alice).setLocal("2");
    check(shd.get(alice).getLocalValue() == "2");
    shd.get(bob).setLocal("3");
    check(shd.get(bob).getLocalValue() == "3");
    shd.get(bob).setLocal("5");
    check(shd.get(bob).getLocalValue() == "5");
    shd.get(charles).setLocal("4");
    check(shd.get(charles).getLocalValue() == "4");

    for (let [id, sh] of shd) {
        check(shd.get(id).getGlobalValue() == "1");
    }
    exchangeShuffle();
    for (let [id, sh] of shd) {
        logDetail(id, sh);
        check(sh.getGlobalValue() == "2");
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
    check(shd.get(alice).getGlobalValue() != undefined);
    check(shd.get(alice).getGlobalValue() == shd.get(bob).getGlobalValue());
    check(shd.get(alice).getGlobalValue() == shd.get(charles).getGlobalValue());
    check(shd.get(alice).getGlobalClock() == shd.get(bob).getGlobalClock());
    check(shd.get(alice).getGlobalClock() == shd.get(charles).getGlobalClock());

    for (let [id, sh] of shd) {
        logDetail(id, sh);
    }

    let historyContinuous = true;
    for (let i = 1; i < historyValues.get(alice).length; i++) {
        if (historyValues.get(alice)[i] == undefined) {
            console.log("history not defined for", i);
            historyContinuous = false;
        }
    }
    check(historyContinuous);

    let allHistoryEqual = true;
    for (let i in historyValues.get(alice)) {
        let equal = historyValues.get(alice)[i] == historyValues.get(bob)[i] && historyValues.get(alice)[i] == historyValues.get(charles)[i];
        if (!equal) {
            console.log("diff in history", i);
            allHistoryEqual = false;
        }
    }
    check(allHistoryEqual);

    console.log("-- result");
    if (nbKo == 0) {
        console.log(`P2p.SharedValue test: ${nbOk} / ${nbOk + nbKo}`);
    } else {
        console.error(`P2p.SharedValue test: ${nbOk} / ${nbOk + nbKo}`);
    }
    return { nbOk: nbOk, nbKo: nbKo };
}



export { SharedValue, TimestampedHistory }