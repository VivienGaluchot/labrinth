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
        if (cssClass != undefined) {
            for (let cl of cssClass.split(' ')) {
                this.element.classList.add(cl);
            }
        }
        return this;
    }

    id(cssId) {
        this.element.id = cssId;
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

class FButton extends FNode {
    constructor() {
        super("button");
    }

    onclick(onclick) {
        this.element.onclick = onclick;
        return this;
    }
}


export { FNode, FButton }