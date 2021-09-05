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
        let text = document.createTextNode(innerText);
        this.element.appendChild(text);
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

class FIcon extends FNode {
    constructor(iconClass) {
        super("i");
        this.class(iconClass);
    }
}

export { FNode, FButton, FIcon }