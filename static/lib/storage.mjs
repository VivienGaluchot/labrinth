/**
 * Peer to peer networking
 */

"use strict";

function getModularKey(module, key) {
    return JSON.stringify({ module, key });
}

function get(module, key, initialize) {
    console.debug(module, key, initialize);
    let value = localStorage.getItem(getModularKey(module, key));
    if (value == null && initialize != null) {
        value = initialize();
        set(module, key, value)
    }
    return value;
}

function set(module, key, value) {
    localStorage.setItem(getModularKey(module, key), value);
}

function remove(module, key) {
    localStorage.removeItem(getModularKey(module, key));
}

function clear() {
    localStorage.clear();
}

class ModularStorage {
    constructor(module) {
        this.module = module;
    }

    get(key, initialize) {
        return get(this.module, key, initialize);
    }

    set(key, value) {
        return set(this.module, key, value);
    }

    remove(key) {
        return remove(this.module, key);
    }
}

export { set, get, remove, clear, ModularStorage }