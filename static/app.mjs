'use strict';

// components
import * as Components from '/lib/components.mjs';
customElements.define('lazy-comp', Components.Element);

// basic pages
const pageHome = {
    "title": "Labrinth | Home"
};
const pagePeers = {
    "title": "Labrinth | Peers"
};
const pageDev = {
    "title": "Labrinth | Dev",
    "component": "/components/dev-panel",
};
const pageNotFound = {
    "title": "Labrinth | Not found"
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
    for (const el of document.getElementsByClassName("sidebar")) {
        el.classList.remove("is-active");
    }
    for (const btn of document.getElementsByClassName("sidebar-toggle")) {
        btn.onclick = () => {
            for (const el of document.getElementsByClassName("sidebar")) {
                el.classList.toggle("is-active");
            }
            btn.classList.toggle("is-active");
        };
    }
    // component
    if (page.component) {
        // TODO show loading animation
        // showPlaceholder("loading");
        // resetContent();

        for (let el of document.getElementById("js-main").children) {
            if (el.classList.contains("placeholder")) {
                el.classList.add("js-hidden");
            }
        }
        document.getElementById("js-main").innerHTML +=
            `<lazy-comp data-path=\"${page.component}\"></lazy-comp>`;
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
    for (let el of document.getElementsByClassName("js-page-url")) {
        el.innerText = url.pathname;
    }
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

// service worker
if (navigator.serviceWorker) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
            if (reg.installing) {
                console.log('service worker installing');
            } else if (reg.waiting) {
                console.log('service worker installed');
            } else if (reg.active) {
                console.log('service worker active');
            }
        }).catch((error) => {
            console.warn('service worker registration failed', error);
        });
}