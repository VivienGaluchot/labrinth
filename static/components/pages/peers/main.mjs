"use strict";

import * as Friends from '/lib/p2p-apps/friends.mjs';
import * as Ping from '/lib/p2p-apps/ping.mjs';
import * as P2pId from '/lib/p2p-id.mjs';
import * as Channel from '/lib/channel.mjs';
import { FNode, FTag, FButton, chooseModal } from '/lib/fdom.mjs';

class Component {
    // called when the component is instantiated
    constructor(element) {
        this.element = element;
        this.entries = element.querySelector(".entries");
    }

    // called when the component is rendered
    onRender() {
        for (let [userId, data] of Friends.app.getFriends()) {
            this.entries.appendChild(this.renderFriend(userId));
        }

        this.onFriendAdd = (event) => {
            this.entries.appendChild(this.renderFriend(event.userId));
        };
        Friends.app.eventTarget.addEventListener("onAdd", this.onFriendAdd);

        this.onFriendRemove = (event) => {
            for (let el of this.entries.querySelectorAll(`[data-userId="${event.userId}"]`)) {
                el.remove();
            }
        };
        Friends.app.eventTarget.addEventListener("onRemove", this.onFriendRemove);

        this.conUpdate = (event) => {
            let userId = event.endpoint.user;
            let el = this.element.querySelector(`#con-status-uid-${userId}`);
            if (el) {
                this.renderConnections(el, userId);
            } else {
                console.warn("element not found", userId);
            }
        };
        Channel.webRtcEndpoint.addEventListener("onRegister", this.conUpdate);
        Channel.webRtcEndpoint.addEventListener("onUnregister", this.conUpdate);
        Channel.webRtcEndpoint.addEventListener("onConnect", this.conUpdate);
        Channel.webRtcEndpoint.addEventListener("onDisconnect", this.conUpdate);
        Channel.webRtcEndpoint.addEventListener("onStateUpdate", this.conUpdate);
        Ping.app.eventTarget.addEventListener("onPingUpdate", this.conUpdate);
    }

    // called when the component is removed
    onRemove() {
        Friends.app.eventTarget.removeEventListener("onAdd", this.onFriendAdd);
        Friends.app.eventTarget.removeEventListener("onRemove", this.onFriendRemove);
        Channel.webRtcEndpoint.removeEventListener("onRegister", this.conUpdate);
        Channel.webRtcEndpoint.removeEventListener("onUnregister", this.conUpdate);
        Channel.webRtcEndpoint.removeEventListener("onConnect", this.conUpdate);
        Channel.webRtcEndpoint.removeEventListener("onDisconnect", this.conUpdate);
        Channel.webRtcEndpoint.removeEventListener("onStateUpdate", this.conUpdate);
        Ping.app.eventTarget.removeEventListener("onPingUpdate", this.conUpdate);
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
            element.textContent = "yes";
            element.classList.add("success");
        } else {
            element.textContent = "no";
            element.classList.remove("success");
        }
    }

    renderFriend(userId) {
        let isLocal = userId == P2pId.localEndpoint.user;
        let nameBinder = Friends.app.getDataBinder(userId).getProp("name");
        let pictureBinder = Friends.app.getDataBinder(userId).getProp("picture");
        let isConnectedBinder = Friends.app.getDataBinder(userId).getProp("isConnected");

        let node = new FTag("div").id(`uid-${userId}`).class("entry").dataset("userId", userId);

        let title = new FTag("div").class("title");
        node.child(title);
        title.child(new FTag("span").bindWith(pictureBinder, Component.renderPicture));
        title.child(new FTag("span").class("name").bindWith(nameBinder, Component.renderName));
        title.child(new FTag("span").class("user-id").text(P2pId.Endpoint.partialUserId(userId)));

        let content = new FTag("div").class("content");
        node.child(content);
        if (isLocal) {
            content.child(new FTag("div").text("You"));
        } else {
            content.child(new FTag("div")
                .child(new FButton().text("Remove friend").onclick(() => {
                    chooseModal("Confirm",
                        `Do you really want to remove this friend ?`,
                        [{ "value": "yes", "text": "Yes" }])
                        .then((choice) => {
                            if (choice == "yes") {
                                Friends.app.remove(userId);
                            }
                        })
                }))
            );
        }
        content.child(new FTag("hr"));
        content.child(new FTag("div")
            .child(new FTag("span").class("label").text("Connected "))
            .child(new FTag("code").class("data").bindWith(isConnectedBinder, Component.renderConnected))
        );
        let conStatus = new FTag("div").id(`con-status-uid-${userId}`);
        this.renderConnections(conStatus.element, userId);
        content.child(conStatus);
        return node.element;
    }

    renderConnections(element, userId) {
        let node = new FNode(element);
        node.clear();
        for (let [endpoint, connection] of Channel.webRtcEndpoint.connections) {
            if (endpoint.user == userId) {
                let part = new FTag("div").class("con-info");
                part.child(new FTag("div")
                    .child(new FTag("span").class("label").text("Id "))
                    .child(new FTag("code").text(`${endpoint.device}-${endpoint.session}`))
                );
                let state = connection.state;
                let stateClass = "";
                if (connection.state == "connected") {
                    stateClass = "success";
                } else if (connection.state == "connecting") {
                    stateClass = "warning";
                }
                part.child(new FTag("div")
                    .child(new FTag("span").class("label").text("Status "))
                    .child(new FTag("code").class("data").class(stateClass).text(state))
                );
                let pingInMs = Ping.app.getDelayInMs(endpoint);
                let pingText = null;
                if (pingInMs == null) {
                    pingText = "-";
                } else {
                    pingText = `${pingInMs} ms`;
                }
                part.child(new FTag("div")
                    .child(new FTag("span").class("label").text("Ping "))
                    .child(new FTag("span").class("data").text(pingText))
                );

                node.child(part);
            }
        }
    }
}

export { Component }