"use strict";

class Component {
    // called when the component is instantiated
    constructor(element) {
        this.element = element;

        this.onChoice = (choice) => { };
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

    show() {
        this.onChoice = () => { };
        this.element.querySelector("#bg").classList.remove("js-hidden");
    }

    ask() {
        return new Promise((resolve, reject) => {
            this.onChoice = (choice) => {
                resolve(choice);
                this.close();
            }
            this.element.querySelector("#bg").classList.remove("js-hidden");
        });
    }

    close() {
        this.element.querySelector("#bg").classList.add("js-hidden");
    }
}

export { Component }