"use strict";

class Component {
    // called when the component is instantiated
    constructor(element) {
        this.element = element;
    }

    // called when the component is rendered
    onRender() {
        this.element.querySelector("#close").onclick = () => {
            this.element.querySelector("#bg").classList.add("js-hidden");
        };
        this.element.querySelector("#bg").onclick = () => {
            this.element.querySelector("#bg").classList.add("js-hidden");
        };
        this.element.querySelector("#fg").onclick = (event) => {
            event.stopPropagation();
        };
    }

    // called when the component is removed
    onRemove() {

    }

    // custom API

    show() {
        this.element.querySelector("#bg").classList.remove("js-hidden");
    }
}

export { Component }