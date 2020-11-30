/**
 * UI component management
 */

"use strict";

class Component {
    constructor(path) {
        this.path = path;
        this.template = null;
        this.run = null;
        this.style = null;
    }

    load() {
        let promises = [];
        if (this.template == null) {
            promises.push(fetch(`${this.path}/template.html`)
                .then((response) => {
                    return response.text();
                })
                .then((response) => {
                    this.template = response;
                }));
        }
        if (this.style == null) {
            promises.push(fetch(`${this.path}/style.css`)
                .then((response) => {
                    return response.text();
                }).then((response) => {
                    this.style = response;
                }));
        }
        if (this.run == null) {
            // TODO
        }
        return Promise.all(promises).catch((err) => {
            console.error(`compoment ${this.path} load failed`, err);
        });
    }

    render() {
        return this.load().then(() => {
            let root = document.createElement("div");

            let style = document.createElement("style");
            style.innerHTML = this.style;
            root.appendChild(style);

            let template = document.createElement("div");
            template.innerHTML = this.template;
            root.appendChild(template);

            return root;
        });
    }
}

export { Component }