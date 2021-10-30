/**
 * DOM elements creation utility
 */

"use strict";

import * as MinComponent from '/lib/min-component.mjs';
import * as FDom from '/lib/fdom.mjs';


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
        if (element instanceof FDom.FNode) {
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


/**
 * Proxy binding
 */

function proxAny(target, onchange) {
    if (target instanceof Array) {
        return proxArr(target, onchange);
    } else if (target instanceof Object) {
        return proxObj(target, onchange);
    } else {
        return target;
    }
}

function proxObj(target, onchange) {
    for (let prop in target) {
        target[prop] = proxAny(target[prop], onchange);
    }
    return new Proxy(target, {
        set: (obj, prop, value) => {
            console.log("object prop", prop, "set to", value);
            obj[prop] = proxAny(value, onchange);
            onchange();
            return true;
        }
    });
}

function proxArr(target, onchange) {
    for (let prop in target) {
        target[prop] = proxAny(target[prop], onchange);
    }
    return new Proxy(target, {
        set: (target, prop, value) => {
            // called when an array index is set
            console.log("array prop", prop, "set to", value);
            target[prop] = proxAny(value, onchange);
            onchange();
            return true;
        },
        get(target, prop) {
            // do not call onchange for each intermediate change made by push, unshift, pop
            const val = target[prop];
            if (typeof val === 'function') {
                if (['push', 'unshift', 'pop', 'fill', 'sort'].includes(prop)) {
                    return function () {
                        console.log('array operation', prop, arguments);
                        let ret = Array.prototype[prop].apply(target, arguments);
                        onchange();
                        return ret;
                    }
                } else {
                    return val.bind(target);
                }
            } else {
                return val;
            }
        }
    });
}


try {
    class Watch {
        constructor(val) {
            this.renders = [];
            this.proxy = null;
            this.rerender = () => {
                for (let render of this.renders) {
                    render(this.proxy);
                }
            };
            this.proxy = proxAny(val, this.rerender);
        }

        set object(val) {
            console.log("set root object", val);
            this.proxy = proxAny(val, this.rerender);
            this.rerender();
        }

        get object() {
            return this.proxy;
        }

        bind(render) {
            this.renders.push(render);
            render(this.object);
        }
    }

    let watch = new Watch({
        a: 1,
        b: 1,
        c: [1],
        d: {
            a: 1,
            b: {
                a: [1]
            }
        }
    });
    watch.bind((object) => {
        let x = `I) a = ${object.a}, b = ${object.b}, c = ${object.c}, d.a = ${object.d.a}, d.b.a = ${object.d.b.a}`;
        console.log(x);
    });
    // set property
    console.log("-");
    watch.object.a++;
    console.log("-");
    watch.object.b++;

    // add array value
    console.log("-");
    // TODO check why double render here
    watch.object.c.push(1);
    console.log("-");
    watch.object.c.push(1);

    // set array value
    console.log("-");
    watch.object.c[0] = 2;
    console.log("-");
    watch.object.c = [3, 3, 3,];

    // set object value
    console.log("-");
    watch.object.d.a = 2;
    console.log("-");
    watch.object.d.b.a[0] = 2;

    // set an object
    console.log("-");
    watch.object.d = {
        a: 1,
        b: {
            a: [1]
        }
    };

    console.log("------------");
    let watch_2 = new Watch({
        a: 1,
        b: 1
    });
    watch_2.bind((object) => {
        let x = `I) a = ${object.a}, b = ${object.b}`;
        console.log(x);
    });
    watch_2.bind((object) => {
        let x = `II) a = ${object.a}, b = ${object.b}`;
        console.log(x);
    });
    watch_2.object.a++;
    watch_2.object.b++;

    console.log("------------");
    let watch_3 = new Watch([1, 2, 3]);
    watch_3.bind((object) => {
        let x = `I) ${object}`;
        console.log(x);
    });

    watch_3.object.push(4);
    watch_3.object.pop();
    watch_3.object.unshift(0);
    watch_3.object[0] = 25;
    watch_3.object.sort((a, b) => { return a - b });
    watch_3.object.fill(0, 2, 4);

    watch_3.object = [1, 2, 3];
    watch_3.object.push(4);

} catch (err) {
    console.error(err);
}


// TODO handle composed ?
// - object of object
// - object of array of object
// - ...


export { FBinderAtomic, FBinderObject }