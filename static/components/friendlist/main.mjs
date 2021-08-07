"use strict";

import * as Friends from '/lib/p2p-apps/friends.mjs';
import { FNode, FButton } from '/lib/fdom.mjs';

class Component {
    constructor(element) {
        this.element = element;
        this.ulElement = element.querySelector("ul");
        this.userElements = new Map();
    }

    onRender() {
        this.element.querySelector("#profile-btn").onclick = () => {
            this.element.querySelector("#profile-modal").internal.ask().then((choice) => {
                if (choice == "apply") {
                    // TODO
                }
            });
        };
        this.element.querySelector("#add-friend-btn").onclick = () => {
            this.element.querySelector("#add-friend-modal").internal.ask().then((choice) => {
                if (choice == "apply") {
                    // TODO
                }
            });
        };

        for (let [id, data] of Friends.app.getFriends()) {
            let el = this.renderFriend(id);
            this.userElements.set(id, el);
            this.ulElement.appendChild(el);
        }

        let updateForEvent = (event) => {
            let el = this.userElements.get(event.userId);
            let newEl = this.renderFriend(event.userId);
            this.userElements.set(event.userId, newEl);
            el.replaceWith(newEl);
        };

        Friends.app.eventTarget.addEventListener("onConnectionStatusChange", updateForEvent);
        Friends.app.eventTarget.addEventListener("onDataChange", updateForEvent);
        Friends.app.eventTarget.addEventListener("onAdd", (event) => {
            let el = this.renderFriend(event.userId);
            this.userElements.set(event.userId, el);
            this.ulElement.appendChild(el);
        });
        Friends.app.eventTarget.addEventListener("onRemove", (event) => {
            let el = this.userElements.get(event.userId);
            this.userElements.remove(event.userId);
            el.remove();
        });
    }

    onRemove() {

    }

    // internal

    renderFriend(id) {
        let name = Friends.app.getData(id)?.name;
        let isConnected = Friends.app.isConnected(id);
        let li = new FNode("li")
            .class(isConnected ? "connected" : "disconnected")
            .child(new FNode("div").class("icon"))
            .child(new FNode("div").class("name").text(name))
            .child(new FButton().class("outline").class("grey")
                .text("Chat")
                .onclick(() => {
                    // TODO
                }))
            .child(new FButton().class("outline").class("text-icon").class("grey")
                .text("🗑")
                .onclick(() => {
                    this.element.querySelector("#del-confirm-modal").internal.ask().then((choice) => {
                        if (choice == "yes") {
                            Friends.app.remove(id);
                        }
                    });
                }));
        return li.element;
    }
}

export { Component }