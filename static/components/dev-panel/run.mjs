"use strict";

function onLoad() {
    console.log("component loaded");
}

function onRender(element) {
    console.log("component rendered", element);
}

export { onLoad, onRender }