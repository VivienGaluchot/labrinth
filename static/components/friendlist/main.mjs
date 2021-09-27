"use strict";

import * as Friends from '/lib/p2p-apps/friends.mjs';
import * as Ping from '/lib/p2p-apps/ping.mjs';
import * as P2p from '/lib/p2p.mjs';
import { FTag, FButton, FIcon, FMinComponent } from '/lib/fdom.mjs';

class Component {
    constructor(element) {
        this.element = element;
        this.ulElement = element.querySelector("ul");
        this.userElements = new Map();

        // userId -> FTag
        this.chatBoxes = new Map();
    }

    onRender() {
        // profile form
        for (let el of this.element.querySelectorAll('#profile-modal button.profile-picture')) {
            el.onclick = () => {
                el.parentNode.querySelector('input').checked = true;
            };
        }

        // add friend form
        this.element.querySelector("#add-friend-modal-btn").onclick = () => {
            this.element.querySelector("#add-friend-modal").internal.show();
        };
        this.element.querySelector("#add-friend-local-id-safe").textContent = this.maskUserId(P2p.localEndpoint.user);
        this.element.querySelector("#add-friend-local-id-full").textContent = P2p.localEndpoint.user;
        this.element.querySelector("#add-friend-local-id-copy").onclick = (event) => {
            let resCls = null;
            try {
                navigator.clipboard.writeText(P2p.localEndpoint.user);
                resCls = "success";
            } catch (err) {
                console.exception(err);
                resCls = "error";
            }
            this.element.querySelector("#add-friend-local-id").classList.add(resCls);
            setTimeout(() => {
                this.element.querySelector("#add-friend-local-id").classList.remove(resCls);
            }, 1000);
        };
        this.element.querySelector("#add-friend-local-id-show").onclick = () => {
            this.element.querySelector("#add-friend-local-id-full").classList.toggle("js-hidden");
            this.element.querySelector("#add-friend-local-id-safe").classList.toggle("js-hidden");
        };
        this.element.querySelector("#add-friend-btn").onclick = () => {
            let input = this.element.querySelector("#add-friend-id");
            let userId = input.value;
            try {
                Friends.app.add(userId, null);
                this.element.querySelector("#add-friend-modal").internal.close();
                input.value = "";
            } catch (err) {
                console.exception(err);
                input.classList.add("error");
                setTimeout(() => {
                    input.classList.remove("error");
                }, 1000);
            }
        };

        // friend list
        for (let [userId, data] of Friends.app.getFriends()) {
            this.renderFriend(userId);
            this.ulElement.appendChild(this.userElements.get(userId));
        }

        this.onFriendUpdate = (event) => {
            this.renderFriend(event.userId);
        };
        Friends.app.eventTarget.addEventListener("onConnectionStatusChange", this.onFriendUpdate);
        // Friends.app.eventTarget.addEventListener("onDataChange", this.onFriendUpdate);
        Friends.app.eventTarget.addEventListener("onAdd", this.onFriendUpdate);

        this.onFriendRemove = (event) => {
            let userId = event.userId;
            if (this.userElements.has(userId)) {
                let el = this.userElements.get(userId);
                this.userElements.delete(userId);
                el.remove();
            }
            if (this.chatBoxes.has(userId)) {
                let el = this.chatBoxes.get(userId).element;
                this.chatBoxes.delete(userId);
                el.remove();
            }
        };
        Friends.app.eventTarget.addEventListener("onRemove", this.onFriendRemove);

        this.onPingUpdate = (event) => {
            let userId = P2p.RemoteEndpoint.deserialize(event.peerId).user;
            if (this.userElements.has(userId)) {
                let text = `${event.delayInMs} ms`;
                this.userElements.get(userId).querySelector(".ping").textContent = text;
            }
        };
        Ping.app.eventTarget.addEventListener("onPingUpdate", this.onPingUpdate);
    }

    onRemove() {
        Friends.app.eventTarget.removeEventListener("onConnectionStatusChange", this.onFriendUpdate);
        Friends.app.eventTarget.removeEventListener("onDataChange", this.onFriendUpdate);
        Friends.app.eventTarget.removeEventListener("onAdd", this.onFriendUpdate);
        Friends.app.eventTarget.removeEventListener("onRemove", this.onFriendRemove);
        Ping.app.eventTarget.removeEventListener("onPingUpdate", this.onPingUpdate);
    }

    // internal

    maskUserId(userId) {
        return "#" + userId.slice(12);
    }

    showProfileForm() {
        let data = Friends.app.getLocalData();
        let name = data.name;
        let picture = data.picture;
        this.element.querySelector("#profile-modal-name").value = name;
        for (let el of this.element.querySelectorAll('input[name = "profile-modal-pict"]')) {
            el.checked = (el.value == picture);
        }
        this.element.querySelector("#profile-modal").internal.ask().then((choice) => {
            if (choice == "apply") {
                let name = this.element.querySelector("#profile-modal-name").value;
                let picture = this.element.querySelector('input[name="profile-modal-pict"]:checked').value;
                Friends.app.setLocalData({ name: name, picture: picture });
            }
        });
    }

    renderFriend(userId) {
        // TODO use binding instead of rerendering all the node when the friend data is changed
        let isLocal = userId == P2p.localEndpoint.user;

        let nameBinder = Friends.app.getNameBinder(userId);
        let pictureBinder = Friends.app.getPictureBinder(userId);

        let li = new FTag("li");
        if (isLocal) {
            li.class("self");
        } else {
            let isConnected = Friends.app.isConnected(userId);
            li.class(isConnected ? "connected" : "disconnected");
        }

        if (!this.chatBoxes.has(userId)) {
            let chat = new FMinComponent("/components/chatbox").class("chatbox");
            chat.element.renderPromise.then(() => {
                chat.element.internal.setRemote(userId);
            });
            this.chatBoxes.set(userId, chat);
        }
        let chat = this.chatBoxes.get(userId);

        let chatModal = new FMinComponent("/components/ui/modal");
        chatModal.child(new FTag("span").attribute("slot", "title")
            .text(`Chat with `)
            .child(new FTag("b").bindWith(nameBinder)));
        chatModal.child(new FTag("span").attribute("slot", "content").child(chat));
        li.child(chatModal);

        let maskedId = this.maskUserId(userId);
        li.child(new FTag("div").bindWith(pictureBinder));

        let subLine = new FTag("div")
            .child(new FTag("span").id("friends-local-id").class("id").text(maskedId))
            .child(new FTag("span").class("ping"));

        li.child(new FTag("div").class("infos")
            .child(new FTag("div").class("name").bindWith(nameBinder))
            .child(subLine));

        let chatButton = new FButton().class("transparent grey")
            .child(new FIcon("far fa-comments"))
            .onclick(() => {
                chatModal.element.internal.show();
                chatButton.element.classList.remove("bullet");
            });
        chat.element.renderPromise.then(() => {
            chat.element.internal.onMessageShown = () => {
                if (!chatModal.element.internal.isActive()) {
                    console.log("Here", chatButton.element);
                    chatButton.element.classList.add("bullet");
                }
            };
        });
        li.child(chatButton);

        if (isLocal) {
            li.child(new FButton().class("transparent grey")
                .text("Profile")
                .onclick(() => {
                    this.showProfileForm();
                }));
        } else {
            li.child(new FButton().class("transparent grey")
                .child(new FIcon('far fa-trash-alt'))
                .onclick(() => {
                    this.element.querySelector("#del-confirm-modal").internal.ask().then((choice) => {
                        if (choice == "yes") {
                            Friends.app.remove(userId);
                        }
                    });
                }));
        }

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