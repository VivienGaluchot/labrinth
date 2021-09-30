/**
 * DOM elements creation utility
 */

"use strict";

import * as MinComponent from '/lib/min-component.mjs';

class FNode {
    constructor(element) {
        this.element = element;
    }

    bindWith(binder, render) {
        binder.bind(this, render);
        return this;
    }

    text(value) {
        if (value == null) {
            value = "";
        }
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
        if (element instanceof FTag) {
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

    clear() {
        while (this.element.firstChild) {
            this.element.removeChild(this.element.lastChild);
        }
        return this;
    }
}

class FTag extends FNode {
    constructor(tag) {
        super(document.createElement(tag));
    }
}

class FButton extends FTag {
    constructor() {
        super("button");
    }

    onclick(onclick) {
        this.element.onclick = onclick;
        return this;
    }
}

class FIcon extends FTag {
    constructor(iconClass) {
        super("i");
        this.class(iconClass);
    }
}

class FMinComponent extends FTag {
    constructor(path) {
        super("min-component");
        this.dataset("path", path);
    }
}


// Tools

function alertModal(title, text) {
    let cmp = new FMinComponent("/components/ui/modal");
    cmp.child(new FTag("span").attribute("slot", "title").text(title));
    cmp.child(new FTag("span").attribute("slot", "content").child(new FTag("p").text(text)));
    document.body.appendChild(cmp.element);
    cmp.element.renderPromise.then(() => {
        cmp.element.internal.onClose = () => {
            cmp.element.remove();
        };
        cmp.element.internal.show();
    });
}

export { FNode, FTag, FButton, FIcon, FMinComponent, alertModal }