/**
 * DOM elements creation utility
 */

"use strict";

class FNode {
    constructor(tag) {
        this.element = document.createElement(tag);
        this.element.classList.add()
    }

    text(innerText) {
        this.element.innerText = innerText;
        return this;
    }

    class(cssClass) {
        this.element.classList.add(cssClass);
        return this;
    }

    child(element) {
        if (element instanceof FNode) {
            this.element.appendChild(element.element);
        } else {
            this.element.appendChild(element);
        }
        return this;
    }
}


export { FNode }