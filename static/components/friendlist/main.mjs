"use strict";

import * as Friends from '/lib/p2p-apps/friends.mjs';
import * as P2pId from '/lib/p2p-id.mjs';
import { FNode, FTag, FButton, FIcon, FMinComponent } from '/lib/fdom.mjs';


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
        this.element.querySelector("#add-friend-local-id-safe").textContent = this.maskUserId(P2pId.localEndpoint.user);
        this.element.querySelector("#add-friend-local-id-full").textContent = P2pId.localEndpoint.user;
        this.element.querySelector("#add-friend-local-id-copy").onclick = (event) => {
            let resCls = null;
            try {
                navigator.clipboard.writeText(P2pId.localEndpoint.user);
                resCls = "success";
            } catch (err) {
                console.error(err, err.stack);
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
                console.error(err, err.stack);
                input.classList.add("error");
                setTimeout(() => {
                    input.classList.remove("error");
                }, 1000);
            }
        };

        // friend list
        for (let [userId, data] of Friends.app.getFriends()) {
            let el = this.renderFriend(userId);
            this.ulElement.appendChild(el);
            this.userElements.set(userId, el);
        }

        this.onFriendAdd = (event) => {
            let el = this.renderFriend(event.userId);
            this.ulElement.appendChild(el);
            this.userElements.set(event.userId, el);
        };
        Friends.app.eventTarget.addEventListener("onAdd", this.onFriendAdd);

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
    }

    onRemove() {
        Friends.app.eventTarget.removeEventListener("onAdd", this.onFriendAdd);
        Friends.app.eventTarget.removeEventListener("onRemove", this.onFriendRemove);
    }

    // internal

    maskUserId(userId) {
        return "#" + userId.slice(userId.length - 4);
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

    static renderName(element, value) {
        if (value != null) {
            new FNode(element).clear().text(value);
        } else {
            new FNode(element).clear().child(new FTag("i").text("Unknown"));
        }
    }

    static renderPicture(element, value) {
        element.setAttribute("class", "profile-picture");
        element.classList.add(value);
    }

    static renderPing(element, delayInMs) {
        let text = delayInMs ? `${delayInMs} ms` : '';
        element.textContent = text;
    }

    static renderConnected(element, isConnected) {
        if (isConnected) {
            element.classList.add("connected");
            element.classList.remove("disconnected");
        } else {
            element.classList.add("disconnected");
            element.classList.remove("connected");
        }
    }

    renderFriend(userId) {
        let isLocal = userId == P2pId.localEndpoint.user;

        let nameBinder = Friends.app.getDataBinder(userId).getProp("name");
        let pictureBinder = Friends.app.getDataBinder(userId).getProp("picture");
        let isConnectedBinder = Friends.app.getDataBinder(userId).getProp("isConnected");
        let pingBinder = Friends.app.getDataBinder(userId).getProp("pingInMs");

        let li = new FTag("li")
        if (isLocal) {
            li.class("self");
        }
        li.bindWith(isConnectedBinder, Component.renderConnected);

        let chat = new FMinComponent("/components/chatbox").class("chatbox");
        chat.element.renderPromise.then(() => {
            chat.element.internal.setRemote(userId);
        });
        this.chatBoxes.set(userId, chat);

        let chatModal = new FMinComponent("/components/ui/modal");
        chatModal.child(new FTag("span").attribute("slot", "title")
            .text(`Chat with `)
            .child(new FTag("b").bindWith(nameBinder, Component.renderName)));
        chatModal.child(new FTag("span").attribute("slot", "content").child(chat));
        li.child(chatModal);

        let maskedId = this.maskUserId(userId);
        li.child(new FTag("div").bindWith(pictureBinder, Component.renderPicture));

        let subLine = new FTag("div")
            .child(new FTag("span").id("friends-local-id").class("id").text(maskedId))
            .child(new FTag("span").class("ping").bindWith(pingBinder, Component.renderPing));

        li.child(new FTag("div").class("infos")
            .child(new FTag("div").class("name").bindWith(nameBinder, Component.renderName))
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
            // TODO anchor on the right target element
            // maybe with visual highlight
            li.child(new FTag("a").class("button transparent grey")
                .class("js-local-link")
                .attribute("href", `/peers#uid-${userId}`)
                .child(new FIcon('fas fa-ellipsis-v')))
        }

        return li.element;
    }
}

export { Component }