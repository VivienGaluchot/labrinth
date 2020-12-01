/**
 * UI component management
 */

"use strict";

class Component {
    constructor(path) {
        this.path = path;
        this.template = null;
        this.run = null;
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
                    // var parser = new DOMParser();
                    // this.template = parser.parseFromString(response, 'text/html');
                    var range = document.createRange();
                    range.selectNode(document.body);
                    this.template = range.createContextualFragment(response);
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

            promises.push(import(`/${this.path}/run.mjs`)
                .then((module) => {
                    this.run = module;
                }));

            this.loadPromise =
                Promise.all(promises)
                    .then(() => {
                        if (this.run.onLoad)
                            this.run.onLoad();
                    })
                    .catch((err) => {
                        console.error(`compoment ${this.path} load failed`, err);
                    });
        }
        return this.loadPromise;
    }

    render() {
        return this.load()
            .then(() => {
                let template = this.template.firstChild.cloneNode(true);
                if (this.run.onRender)
                    this.run.onRender(template);
                return template;
            });
    }
}

export { Component }