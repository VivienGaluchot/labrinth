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
            console.debug(`load component ${this.path}`);
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

            promises.push(import(`${this.path}/main.mjs`));

            this.loadPromise =
                Promise.all(promises)
                    .then(([template, style, module]) => {
                        console.debug(`compoment ${this.path} loaded`);
                        return [template, style, module];
                    })
                    .catch((err) => {
                        console.error(`compoment ${this.path} load failed`, err);
                    });
        }
        return this.loadPromise;
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
        this.onRender = () => { };
        this.onRenderError = (error) => { };
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
        if (name == "data-path")
            this.render();
    }

    render() {
        let path = this.dataset["path"];
        if (path) {
            if (this.path != path) {
                this.path = path;
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

                        if (module.Component) {
                            if (this.moduleComponent)
                                this.moduleComponent.onRemove();
                            this.moduleComponent = new module.Component(this.shadow);
                            this.moduleComponent.onRender();
                        }
                        this.onRender();
                    })
                    .catch((reason) => {
                        this.onRenderError(`component load failed: ${reason}`);
                    });
            }
        } else {
            console.warn("data-path attribute missing", this);
            while (this.shadow.firstChild != null) {
                this.shadow.firstChild.remove();
            }
        }
    }
}

export { storage, Element }