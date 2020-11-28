'use strict';


import * as P2p from './lib/p2p.mjs';

const localEndpoint = P2p.LocalEndpoint.generate();

// basic pages
const pageHome = {
    "title": "Labrinth | Home"
};
const pagePeers = {
    "title": "Labrinth | Peers"
};
const pageDev = {
    "title": "Labrinth | Dev"
};
const pageNotFound = {
    "title": "Labrinth | Not found"
};

const router = new Map();
router.set("/", pageHome);
router.set("/index.html", pageHome);
router.set("/peers", pagePeers);
router.set("/peers.html", pagePeers);
router.set("/dev", pageDev);

function getPage(url) {
    return router.get(url.pathname);
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
    document.getElementById("js-page-url").innerText = url.pathname;
    for (const link of document.getElementsByClassName("js-local-link")) {
        if (getPage(new URL(link.href)) == page) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    }
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