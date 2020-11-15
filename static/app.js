'use strict';

// basic pages
const home = { "title": "Labrinth | Home" };
const peers = { "title": "Labrinth | Peers" };
const notFound = { "title": "Labrinth | Not found" };

const pageRouter = new Map();
pageRouter.set("/", home);
pageRouter.set("/index.html", home);
pageRouter.set("/peers", peers);
pageRouter.set("/peers.html", peers);

// render the page into the DOM
function renderPage(url, ctx) {
    let pathname = new URL(url).pathname;
    let page = pageRouter.get(pathname);
    if (!page) {
        console.warn("page not found", { pathname });
        page = notFound;
    }
    document.title = page.title;
    document.getElementById("js-page-url").innerText = pathname;
}

// render the page and push it onto history
function pushPage(url, ctx) {
    renderPage(url);
    window.history.pushState({ "url": url, "ctx": ctx }, "", url);
}

// react to user going to back page
window.onpopstate = function (e) {
    if (e.state) {
        renderPage(e.state.url, e.state.ctx);
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