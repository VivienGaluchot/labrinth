/**
 * DOM elements creation utility
 */

"use strict";

import * as MinComponent from '/lib/min-component.mjs';
import { FNode } from '/lib/fdom.mjs';


let bindCounter = 0;


class FBinderAtomic {
    constructor(value) {
        this.index = bindCounter;
        this.subIndex = 0;
        bindCounter++;
        this.renders = new Map();
        this.value = value;
    }

    bind(element, render) {
        if (element instanceof FNode) {
            element = element.element;
        }
        if (!this.renders.has(render)) {
            let watchId = `${this.index}-${this.subIndex}`;
            this.subIndex++;
            element.dataset["bid"] = watchId;
            this.renders.set(render, watchId);
        }
        element.dataset["bid"] = this.renders.get(render);
        render(element, this.value);
    }

    set(value) {
        if (this.value != value) {
            this.value = value;
            for (let [render, watchId] of this.renders) {
                for (let el of MinComponent.queryShadowSelectorAll(document, `[data-bid='${watchId}']`)) {
                    render(el, value);
                }
            }
        }
    }
}


class FBinderObject {
    constructor(obj) {
        this.atomics = new Map();
        for (let prop in obj) {
            this.atomics.set(prop, new FBinderAtomic(obj[prop]));
        }
    }

    getProp(key) {
        if (!this.atomics.has(key)) {
            throw new Error("property not defined", key);
        }
        return this.atomics.get(key);
    }

    set(obj) {
        for (let [key, binder] of this.atomics) {
            if (obj[key] !== undefined) {
                binder.set(obj[key]);
            }
        }
    }
}


// TODO handle composed ?
// - object of object
// - object of array of object
// - ...


export { FBinderAtomic, FBinderObject }