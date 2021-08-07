"use strict";

import * as Friends from '/lib/p2p-apps/friends.mjs';
import * as P2p from '/lib/p2p.mjs';
import { FNode, FButton } from '/lib/fdom.mjs';

class Component {
    constructor(element) {
        this.element = element;
        this.ulElement = element.querySelector("ul");
        this.userElements = new Map();
    }

    onRender() {
        // local profile
        this.element.querySelector("#profile-btn").onclick = () => {
            this.element.querySelector("#profile-modal").internal.ask().then((choice) => {
                if (choice == "apply") {
                    let data = Friends.app.getLocalData();
                    data.name = this.element.querySelector("#profile-modal-name").value;
                    Friends.app.setLocalData(data);
                }
            });
        };
        let updateLocalName = () => {
            let name = Friends.app.getLocalData().name;
            this.element.querySelector("#friends-local-name").innerText = name;
            this.element.querySelector("#profile-modal-name").value = name;
        }
        updateLocalName();
        this.element.querySelector("#friends-local-id").innerText = P2p.localEndpoint.user;;

        // add friend form
        this.element.querySelector("#add-friend-modal-btn").onclick = () => {
            this.element.querySelector("#add-friend-local-id").innerText = P2p.localEndpoint.user;
            this.element.querySelector("#add-friend-modal").internal.show();
        };
        this.element.querySelector("#add-friend-btn").onclick = () => {
            let input = this.element.querySelector("#add-friend-id");
            let userId = input.value;
            try {
                Friends.app.add(userId, null);
                input.classList.add("success");
                setTimeout(() => {
                    input.classList.remove("success");
                    input.value = "";
                }, 1000);
            } catch (err) {
                console.exception(err);
                input.classList.add("error");
                setTimeout(() => {
                    input.classList.remove("error");
                    input.value = "";
                }, 1000);
            }
        };

        // friend list
        for (let [userId, data] of Friends.app.getFriends()) {
            if (userId != P2p.localEndpoint.user) {
                let el = this.renderFriend(userId);
                this.userElements.set(userId, el);
                this.ulElement.appendChild(el);
            }
        }

        let updateForEvent = (event) => {
            if (event.userId == P2p.localEndpoint.user) {
                updateLocalName();
            } else {
                let el = this.userElements.get(event.userId);
                let newEl = this.renderFriend(event.userId);
                this.userElements.set(event.userId, newEl);
                el.replaceWith(newEl);
            }
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
            this.userElements.delete(event.userId);
            el.remove();
        });
    }

    onRemove() {

    }

    // internal

    renderFriend(userId) {
        let name = Friends.app.getData(userId)?.name;
        let isConnected = Friends.app.isConnected(userId);
        let li = new FNode("li")
            .class(isConnected ? "connected" : "disconnected")
            .child(new FNode("div").class("icon"))
            .child(new FNode("div").class("infos")
                .child(new FNode("div").id("friends-local-name").class("name").text(name))
                .child(new FNode("div").id("friends-local-id").class("id").text(userId)))
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
                            Friends.app.remove(userId);
                        }
                    });
                }));
        return li.element;
    }
}

export { Component }