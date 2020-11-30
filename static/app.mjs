'use strict';

// p2p
import * as P2p from './lib/p2p.mjs';
const localEndpoint = P2p.LocalEndpoint.generate();

// components
import * as Components from './lib/components.mjs';

// basic pages
const pageHome = {
    "title": "Labrinth | Home"
};
const pagePeers = {
    "title": "Labrinth | Peers"
};
const pageDev = {
    "title": "Labrinth | Dev",
    "component": new Components.Component("./components/dev-panel"),
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

// generic render
const genericRender = (page) => {
    // cleanup content
    for (let el of document.getElementById("js-main").children) {
        if (!el.classList.contains("placeholder")) {
            el.remove();
        }
    }
    // links
    for (const link of document.getElementsByClassName("js-local-link")) {
        if (getPage(new URL(link.href)) == page) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    }
    // sidebar
    for (const el of document.getElementsByClassName("sidebar")) {
        el.classList.remove("active");
    }
    for (const btn of document.getElementsByClassName("sidebar-toggle")) {
        btn.onclick = () => {
            for (const el of document.getElementsByClassName("sidebar")) {
                el.classList.toggle("active");
            }
        };
    }
    // component
    if (page.component) {
        page.component.render()
            .then((element) => {
                document.getElementById("js-main").appendChild(element);
            });
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
    document.getElementById("js-page-url").innerText = url.pathname;
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