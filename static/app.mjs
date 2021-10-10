'use strict';

import '/lib/sw-interface.mjs';
import * as MinComponent from '/lib/min-component.mjs';
import * as Channel from '/lib/channel.mjs';

MinComponent.register();

// TODO handle properly the paging with min component...
// issues:
// - anchor in loaded min-components not reached
// - anchor update in history not fully working
// - local link in loaded components


// ---------------------------
// basic pages
// ---------------------------

const pageHome = {
    "title": "Home | Labrinth",
    "component": "/components/pages/main",
};
const pagePeers = {
    "title": "Peers | Labrinth",
    "component": "/components/pages/peers",
};
const pageDev = {
    "title": "Dev | Labrinth",
    "component": "/components/pages/dev",
};
const pageNotFound = {
    "title": "Not found | Labrinth"
};

const router = new Map();
router.set("/", pageHome);
router.set("/index", pageHome);
router.set("/index.html", pageHome);
router.set("/peers", pagePeers);
router.set("/peers.html", pagePeers);
router.set("/dev", pageDev);

function getPage(url) {
    return router.get(url.pathname);
}


// ---------------------------
// index page management
// ---------------------------

function showPlaceholder(activeClass) {
    for (let el of document.getElementById("js-main").children) {
        if (el.classList.contains("placeholder")) {
            if (el.classList.contains(activeClass)) {
                el.classList.remove("js-hidden");
            } else {
                el.classList.add("js-hidden");
            }
        }
    }
}

function resetContent() {
    let toRemove = [];
    for (let el of document.getElementById("js-main").children) {
        if (!el.classList.contains("placeholder")) {
            toRemove.push(el);
        }
    }
    for (let el of toRemove) {
        el.remove();
    }
    showPlaceholder("empty");
}

// generic render
function genericRender(page) {
    resetContent();
    // links
    for (const link of document.getElementsByClassName("js-local-link")) {
        if (getPage(new URL(link.href)) == page) {
            link.classList.add("is-active");
        } else {
            link.classList.remove("is-active");
        }
    }
    // sidebar
    document.querySelector("#root").classList.remove("sidebar-active");
    for (const btn of document.getElementsByClassName("sidebar-toggle")) {
        btn.onclick = () => {
            document.querySelector("#root").classList.toggle("sidebar-active");
        };
    }
    // component
    if (page.component) {
        resetContent();
        for (let el of document.getElementById("js-main").children) {
            if (el.classList.contains("placeholder")) {
                el.classList.add("js-hidden");
            }
        }
        let el = document.createElement("min-component");
        el.dataset["path"] = page.component;
        document.getElementById("js-main").appendChild(el);
    }
    // hash
    if (location.hash) {
        MinComponent.queryShadowSelector(document, location.hash)?.scrollIntoView();
    }
}

// render the page into the DOM
function renderPage(href, ctx) {
    console.log("[Paging] loading page", href);
    let url = new URL(href);
    let page = getPage(url);
    if (!page) {
        console.warn("[Paging] page not found", { url });
        page = pageNotFound;
    }
    document.title = page.title;
    genericRender(page);
}

// render the page and push it onto history
function pushPage(href, ctx) {
    renderPage(href);
    window.history.pushState({ "href": href, "ctx": ctx }, "", href);
}


// ---------------------------
// events
// ---------------------------

function onDOMLoad(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', (event) => {
            callback(document);
        });
    } else {
        callback(document);
    }
    MinComponent.eventTarget.addEventListener("onRender", (event) => {
        callback(event.element);
    });
};

// react to user going to back page
window.onpopstate = (event) => {
    if (event.state) {
        renderPage(event.state.href, event.state.ctx);
    }
};

// change link to call js redirection
function updateLinks(element) {
    for (const link of MinComponent.queryShadowSelectorAll(element, "a.js-local-link")) {
        link.onclick = () => {
            try {
                pushPage(link.href, null);
                return false;
            } catch (e) {
                console.error(e);
                return false;
            }
        };
    }
}
onDOMLoad(updateLinks);

// handle hash
function scrollToHash(element) {
    if (location.hash) {
        let selected = MinComponent.queryShadowSelector(element, location.hash);
        if (selected) {
            for (let el of MinComponent.queryShadowSelectorAll(document, ".anchor-target")) {
                el.classList.remove("anchor-target");
            }
            selected.scrollIntoView();
            selected.classList.add("anchor-target");
        }
    }
}
window.onhashchange = (event) => {
    if (location.hash) {
        scrollToHash(document);
    }
};
onDOMLoad(scrollToHash);

// update connection status
Channel.webRtcEndpoint.addEventListener("onSignalingServerStateUpdate", (event) => {
    let state = event.state;
    let el = document.body.querySelector("footer .server-con-status");
    if (state == Channel.State.CLOSED) {
        el.classList.remove("success");
        el.classList.remove("warning");
        el.classList.add("error");
        el.textContent = "disconnected";
    } else if (state == Channel.State.CONNECTING) {
        el.classList.remove("success");
        el.classList.remove("error");
        el.classList.add("warning");
        el.textContent = "connecting...";
    } else if (state == Channel.State.CONNECTED) {
        el.classList.remove("warning");
        el.classList.remove("error");
        el.classList.add("success");
        el.textContent = "connected";
    }
});


// ---------------------------
// render the current page
// ---------------------------

document.addEventListener("DOMContentLoaded", (event) => {
    pushPage(window.location.href, null);
});