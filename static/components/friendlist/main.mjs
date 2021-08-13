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
                    let name = this.element.querySelector("#profile-modal-name").value;
                    let picture = this.element.querySelector('input[name="profile-modal-pict"]:checked').value;
                    Friends.app.setLocalData({ name: name, picture: picture });
                }
            });
        };
        let updateLocalName = () => {
            let data = Friends.app.getLocalData();
            let name = data.name;
            let picture = data.picture;
            this.element.querySelector("#friends-local-name").innerText = name;
            this.element.querySelector("#profile-modal-name").value = name;
            this.element.querySelector("#friends-local-picture").setAttribute("class", `profile-picture ${picture}`);
            for (let el of this.element.querySelectorAll('input[name = "profile-modal-pict"]')) {
                el.checked = (el.value == picture);
            }
            this.element.querySelector("#friends-local-picture").setAttribute("class", `profile-picture ${picture}`);
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
                this.renderFriend(userId);
                this.ulElement.appendChild(this.userElements.get(userId));
            }
        }

        let updateForEvent = (event) => {
            let userId = event.userId;
            if (userId == P2p.localEndpoint.user) {
                updateLocalName();
            } else {
                this.renderFriend(userId);
            }
        };

        Friends.app.eventTarget.addEventListener("onConnectionStatusChange", updateForEvent);
        Friends.app.eventTarget.addEventListener("onDataChange", updateForEvent);
        Friends.app.eventTarget.addEventListener("onAdd", (event) => {
            this.renderFriend(event.userId);
        });
        Friends.app.eventTarget.addEventListener("onRemove", (event) => {
            let userId = event.userId;
            let el = this.userElements.get(userId);
            this.userElements.delete(userId);
            el.remove();
        });

        P2p.webRtcEndpoint.addEventListener("onPingUpdate", (event) => {
            let userId = P2p.RemoteEndpoint.deserialize(event.connection.peerId).user;
            if (this.userElements.has(userId)) {
                let text = `${event.connection.pingDelayInMs} ms`;
                this.userElements.get(userId).querySelector(".ping").innerText = text;
            }
        });
    }

    onRemove() {

    }

    // internal

    renderFriend(userId) {
        let data = Friends.app.getData(userId);
        let name = data?.name;
        let picture = data?.picture;
        let isConnected = Friends.app.isConnected(userId);
        let pingNode = new FNode("div").class("ping");
        let li = new FNode("li").class(isConnected ? "connected" : "disconnected")
            .child(new FNode("div").class("profile-picture").class(picture))
            .child(new FNode("div").class("infos")
                .child(new FNode("div").id("friends-local-name").class("name").text(name))
                .child(new FNode("div").id("friends-local-id").class("id").text(userId)))
            .child(pingNode);
        li.child(new FButton().class("outline").class("grey")
            .text("Chat")
            .onclick(() => {
                // TODO
            }))
        li.child(new FButton().class("outline").class("text-icon").class("grey")
            .text("🗑")
            .onclick(() => {
                this.element.querySelector("#del-confirm-modal").internal.ask().then((choice) => {
                    if (choice == "yes") {
                        Friends.app.remove(userId);
                    }
                });
            }));

        let newEl = li.element;
        if (this.userElements.has(userId)) {
            this.userElements.get(userId).replaceWith(newEl);
        } else {
            this.ulElement.appendChild(newEl);
        }
        this.userElements.set(userId, newEl);
    }
}

export { Component }