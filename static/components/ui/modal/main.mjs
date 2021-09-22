"use strict";

import * as MinComponent from '/lib/min-component.mjs';

class Component {
    // called when the component is instantiated
    constructor(element) {
        this.element = element;

        this.onChoice = (choice) => { };
        this.onClose = () => { };
    }

    // called when the component is rendered
    onRender() {
        this.element.querySelector("#close").onclick = () => {
            this.close();
            this.onChoice(null);
        };
        this.element.querySelector("#bg").onclick = (event) => {
            event.stopPropagation();
            this.close();
            this.onChoice(null);
        };
        this.element.querySelector("#fg").onclick = (event) => {
            event.stopPropagation();
        };
        let elements = this.element.querySelector('slot[name="choices"]').assignedElements();
        for (let element of elements) {
            for (let btn of element.querySelectorAll("button")) {
                btn.onclick = () => {
                    if (btn.dataset) {
                        this.onChoice(btn.dataset["choice"]);
                    } else {
                        this.onChoice(null);
                    }
                };
            }
        }
    }

    // called when the component is removed
    onRemove() {

    }

    // custom API

    isActive() {
        return !this.element.querySelector("#bg").classList.contains("js-hidden");
    }

    focusInside() {
        for (let node of this.element.querySelector("#content slot").assignedNodes()) {
            let focusable = MinComponent.queryShadowSelector(node, "button, input, select, textarea");
            if (focusable) {
                focusable.focus();
                return;
            }
        }
        for (let node of this.element.querySelector("#footer slot").assignedNodes()) {
            let focusable = MinComponent.queryShadowSelector(node, "button, input, select, textarea");
            if (focusable) {
                focusable.focus();
                return;
            }
        }
    }

    show() {
        this.onChoice = () => { };
        this.element.querySelector("#bg").classList.remove("js-hidden");
        this.focusInside();
    }

    ask() {
        return new Promise((resolve, reject) => {
            this.onChoice = (choice) => {
                resolve(choice);
                this.close();
            }
            this.element.querySelector("#bg").classList.remove("js-hidden");
            this.focusInside();
        });
    }

    close() {
        this.element.querySelector("#bg").classList.add("js-hidden");
        this.onClose();
    }
}

export { Component }