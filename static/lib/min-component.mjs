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
        this.loadPromise = null;
    }

    load() {
        if (!this.loadPromise) {
            let promises = [];

            promises.push(fetch(`${this.path}/template.html`)
                .then((response) => {
                    return response.text();
                })
                .then((response) => {
                    let range = document.createRange();
                    range.selectNode(document.body);
                    let template = range.createContextualFragment(response).firstElementChild;
                    if (template.tagName != "TEMPLATE") {
                        throw new Error("unsupported template node");
                    }
                    return template;
                }));

            promises.push(fetch(`${this.path}/style.css`)
                .then((response) => {
                    return response.text();
                }));

            promises.push(import(`${this.path}/main.mjs`)
                .catch((err) => {
                    if (err instanceof SyntaxError) {
                        console.error(`module ${this.path} load failed\n${err.name}: ${err.message}\nfrom ${err.fileName}:${err.lineNumber}:${err.columnNumber}`);
                    } else {
                        console.error(`module ${this.path} load failed`);
                        console.exception(err);
                    }
                }));

            this.loadPromise =
                Promise.all(promises)
                    .then(([template, style, module]) => {
                        return [template, style, module];
                    })
                    .catch((err) => {
                        console.error(`compoment ${this.path} load failed`, err);
                    });
        }
        return this.loadPromise;
    }
}

class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject
            this.resolve = resolve
        });
    }
}

class Element extends HTMLElement {
    static get observedAttributes() {
        return ["data-path"];
    }

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: "open" });
        this.moduleComponent = null;
        this.path = null;

        // callback API
        this.renderDeferred = new Deferred();
        this.renderPromise = this.renderDeferred.promise;
    }

    // TODO remove this layer ? this could be moduleComponent ?
    get internal() {
        return this.moduleComponent;
    }

    // custom component added to page
    connectedCallback() {
        this.render();
    }

    // custom component removed from page
    disconnectedCallback() {
        if (this.moduleComponent)
            this.moduleComponent.onRemove();
    }

    // custom component moved to new page
    adoptedCallback() {
    }

    // custom component attributes changed
    attributeChangedCallback(name, oldValue, newValue) {
        if (name == "data-path") {
            this.render();
        }
    }

    render() {
        // TODO get class variable from element tags ?
        const errorCssClass = "error";
        const renderCssClass = "render";
        this.classList.remove(errorCssClass);
        this.renderDeferred.promise.then(() => {
            this.classList.remove(renderCssClass);
        }).catch(() => {
            this.classList.remove(renderCssClass);
            this.classList.add(errorCssClass);
        });

        let path = this.dataset["path"];
        if (path) {
            if (this.path != path) {
                this.classList.add(renderCssClass);
                storage.get(path).load()
                    .then(([template, style, module]) => {
                        let clone = template.content.cloneNode(true);
                        let styleNode = document.createElement('style');
                        styleNode.textContent = style;

                        while (this.shadow.firstChild != null) {
                            this.shadow.firstChild.remove();
                        }
                        this.shadow.appendChild(styleNode);
                        this.shadow.appendChild(clone);

                        if (module && module.Component) {
                            if (this.moduleComponent)
                                this.moduleComponent.onRemove();
                            this.moduleComponent = new module.Component(this.shadow);
                            this.moduleComponent.onRender();
                        }
                        this.renderDeferred.resolve();
                    })
                    .catch((err) => {
                        console.error(`component ${path} load failed`);
                        console.exception(err);
                        this.renderDeferred.reject(`component ${path} load failed`);
                    });
                this.path = path;
            }
        } else {
            console.warn("data-path attribute missing", this);
            while (this.shadow.firstChild != null) {
                this.shadow.firstChild.remove();
            }
            this.classList.add(errorCssClass);
        }
    }
}

function register() {
    customElements.define('min-component', Element);
}

function queryShadowSelector(root, itemSelector) {
    if (!root.querySelector) {
        return null;
    }
    let selected = root.querySelector(itemSelector);
    if (selected) {
        return selected;
    }
    for (let cmp of root.querySelectorAll('min-component')) {
        for (let child of cmp.shadow.childNodes) {
            let selected = queryShadowSelector(child, itemSelector);
            if (selected) {
                return selected;
            }
        }
    }
    return null;
}

function* queryShadowSelectorAll(root, itemSelector) {
    if (root.querySelectorAll) {
        for (let el of root.querySelectorAll(itemSelector)) {
            yield el;
        }
        for (let cmp of root.querySelectorAll('min-component')) {
            for (let child of cmp.shadow.childNodes) {
                for (let inner of queryShadowSelectorAll(child, itemSelector)) {
                    yield inner;
                }
            }
        }
    }
}

export { register, queryShadowSelectorAll, queryShadowSelector }