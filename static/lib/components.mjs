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

function bootstrap(element, src) {
    for (let sub of element.querySelectorAll("component")) {
        let path = sub.dataset["path"];
        if (path) {
            storage.get(path).render(null)
                .then((element) => {
                    sub.replaceWith(element);
                });
        } else {
            console.warn("data-path attribute missing in component imported from", src);
        }
    }
}

class Component {
    constructor(path) {
        this.path = path;
        this.template = null;
        this.module = null;
        this.styleElement = null;
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
                    var range = document.createRange();
                    range.selectNode(document.body);
                    this.template = range.createContextualFragment(response);
                    this.template = this.template.querySelector("component").firstElementChild;
                }));

            promises.push(fetch(`${this.path}/style.css`)
                .then((response) => {
                    return response.text();
                })
                .then((response) => {
                    const head = document.getElementsByTagName("head")[0];
                    let style = document.createElement("style");
                    style.innerHTML = `/* component ${this.path} */\n` + response;
                    head.appendChild(style);
                    this.styleElement = style;
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

    render(ctx) {
        return this.load()
            .then(() => {
                let element = this.template.cloneNode(true);
                if (this.module.onRender)
                    this.module.onRender(element, ctx);
                bootstrap(element, this.path);
                return element;
            }).catch((err) => {
                console.error(`compoment ${this.path} render failed`, err);
            });
    }
}

export { storage }