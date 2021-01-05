/**
 * UI component management
 */

"use strict";

class Storage {
    constructor() {
        this.components = new Map();
    }

    get(path) {
        if (!this.components.get(path)) {
            this.components.set(path, new Component(path));
        }
        return this.components.get(path);
    }
}

const storage = new Storage();

class Component {
    constructor(path) {
        this.path = path;
        this.template = null;
        this.module = null;
        this.style = null;
        this.loadPromise = null;
    }

    load() {
        if (!this.loadPromise) {
            console.debug(`fetch component ${this.path}`);
            let promises = [];

            promises.push(fetch(`${this.path}/template.html`)
                .then((response) => {
                    return response.text();
                })
                .then((response) => {
                    let range = document.createRange();
                    range.selectNode(document.body);
                    this.template = range.createContextualFragment(response).firstElementChild;
                    if (this.template.tagName != "TEMPLATE") {
                        throw new Error("unsupported template node");
                    }
                }));

            promises.push(fetch(`${this.path}/style.css`)
                .then((response) => {
                    return response.text();
                })
                .then((response) => {
                    this.style = response;
                }));

            promises.push(import(`${this.path}/main.mjs`)
                .then((module) => {
                    this.module = module;
                }));

            this.loadPromise =
                Promise.all(promises)
                    .then(() => {
                        console.log(`compoment ${this.path} loaded`);
                    })
                    .catch((err) => {
                        console.error(`compoment ${this.path} load failed`, err);
                    });
        }
        return this.loadPromise;
    }

    render(root, ctx) {
        return this.load()
            .then(() => {
                let clone = this.template.content.cloneNode(true);
                if (this.module.onRender)
                    this.module.onRender(clone, ctx);
                let style = document.createElement('style');
                style.innerHTML = this.style;
                root.appendChild(style);
                root.appendChild(clone);
            }).catch((err) => {
                console.error(`compoment ${this.path} render failed`, err);
            });
    }
}

class Element extends HTMLElement {
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        let path = this.dataset["path"];
        if (path) {
            storage.get(path).render(shadow, null);
        } else {
            console.warn("data-path attribute missing", this);
        }
    }
}

export { storage, Element }