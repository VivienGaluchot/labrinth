/**
 * DOM elements creation utility
 */

"use strict";

class FNode {
    constructor(tag) {
        this.element = document.createElement(tag);
        this.element.classList.add()
    }

    text(value) {
        let isFirst = true;
        for (let line of value.split("\n")) {
            if (!isFirst) {
                this.element.appendChild(document.createElement("br"));
            } else {
                isFirst = false;
            }
            this.element.appendChild(document.createTextNode(line));
        }
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

    attribute(key, value) {
        this.element.setAttribute(key, value);
        return this;
    }

    dataset(key, value) {
        this.attribute(`data-${key}`, value);
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

class FMinComponent extends FNode {
    constructor(path) {
        super("min-component");
        this.dataset("path", path);
    }
}

function alertModal(titre, text) {
    let cmp = new FMinComponent("/components/ui/modal");
    cmp.child(new FNode("span").attribute("slot", "title").text(titre));
    cmp.child(new FNode("span").attribute("slot", "content").child(new FNode("p").text(text)));
    document.body.appendChild(cmp.element);
    cmp.element.renderPromise.then(() => {
        cmp.element.internal.onClose = () => {
            cmp.element.remove();
        };
        cmp.element.internal.show();
    });
}

export { FNode, FButton, FIcon, FMinComponent, alertModal }