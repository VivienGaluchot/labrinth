/**
 * Peer to peer networking
 */

"use strict";

function getModularKey(mod, key) {
    return JSON.stringify({ mod, key });
}

function get(mod, key, initialize) {
    let value = localStorage.getItem(getModularKey(mod, key));
    if (value != null) {
        value = JSON.parse(value);
    }
    if (value == null && initialize != null) {
        value = initialize();
        set(mod, key, value);
    }
    return value;
}

function set(mod, key, value) {
    localStorage.setItem(getModularKey(mod, key), JSON.stringify(value));
}

function remove(mod, key) {
    localStorage.removeItem(getModularKey(mod, key));
}

function clear() {
    localStorage.clear();
}

function* all() {
    for (let key of Object.keys(localStorage)) {
        let keyObject;
        try {
            keyObject = JSON.parse(key);
        } catch (error) {
            keyObject = null;
        }
        if (keyObject?.mod && keyObject?.key) {
            yield [keyObject.mod, keyObject.key, localStorage.getItem(key)];
        }
    }
}

class ModularStorage {
    constructor(mod) {
        this.mod = mod;
    }

    get(key, initialize) {
        return get(this.mod, key, initialize);
    }

    set(key, value) {
        return set(this.mod, key, value);
    }

    remove(key) {
        return remove(this.mod, key);
    }
}

export { set, get, remove, clear, ModularStorage, all }