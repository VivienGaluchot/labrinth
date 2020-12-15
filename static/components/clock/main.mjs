"use strict";

function onRender(element, ctx) {
    let update = () => {
        element.innerText = new Date().toLocaleTimeString();
    };
    setInterval(update, 1000);
    update();
}

export { onRender }