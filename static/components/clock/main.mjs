"use strict";

class Component {
    constructor(element) {
        this.clockElement = element.querySelector("#clock");
        this.interval = null;
    }

    onRender() {
        let update = () => {
            this.clockElement.textContent = new Date().toLocaleTimeString();
        };
        this.interval = setInterval(update, 1000);
        update();
    }

    onRemove() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }
}

export { Component }