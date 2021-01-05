"use strict";

function onRender(element, ctx) {
    let clockElement = element.querySelector("#clock");
    let update = () => {
        clockElement.innerText = new Date().toLocaleTimeString();
    };
    setInterval(update, 1000);
    update();
}

export { onRender }