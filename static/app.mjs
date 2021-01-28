'use strict';

import '/lib/sw-interface.mjs';

// web component lib, register custom element "min-component"
import '/lib/min-component.mjs';

import '/lib/channel.mjs';


// basic pages
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

// index page management

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
    document.body.classList.remove("sidebar-active");
    for (const btn of document.getElementsByClassName("sidebar-toggle")) {
        btn.onclick = () => {
            document.body.classList.toggle("sidebar-active");
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
}

// render the page into the DOM
function renderPage(href, ctx) {
    let url = new URL(href);
    let page = getPage(url);
    if (!page) {
        console.warn("page not found", { url });
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

// react to user going to back page
window.onpopstate = function (e) {
    if (e.state) {
        renderPage(e.state.href, e.state.ctx);
    }
};

// change link to call js redirection
for (const link of document.getElementsByClassName("js-local-link")) {
    link.onclick = () => {
        try {
            // todo: get the current page ctx
            let ctx = null;
            pushPage(link.href, ctx);
            return false;
        } catch (e) {
            console.error(e);
            return false;
        }
    };
}

// render the current page
renderPage(window.location.href);