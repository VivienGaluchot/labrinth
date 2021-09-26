"use strict";

import * as Chat from '/lib/p2p-apps/chat.mjs';
import * as Friends from '/lib/p2p-apps/friends.mjs';
import * as P2p from '/lib/p2p.mjs';
import { FTag } from '/lib/fdom.mjs';

class Component {
    constructor(element) {
        this.element = element;
        this.lastHistoryDate = null;
        this.remoteUserId = null;
    }

    onRender() {
        this.sendBtn = this.element.querySelector("#send-btn");
        this.sendMsg = this.element.querySelector("#send-msg");
        this.history = this.element.querySelector(".history");
        this.history.scrollTop = this.history.scrollHeight - this.history.clientHeight;

        let resizeSendBox = () => {
            let wasBottom = this.history.scrollTop == this.history.scrollHeight - this.history.clientHeight;
            this.sendMsg.style.height = "1px";
            this.sendMsg.style.height = (this.sendMsg.scrollHeight) + "px";
            this.sendMsg.scrollTop = this.sendMsg.scrollHeight - this.sendMsg.clientHeight;
            if (wasBottom) {
                this.history.scrollTop = this.history.scrollHeight - this.history.clientHeight;
            }
        };
        this.sendBtn.onclick = () => {
            this.sendTextareaContent();
            resizeSendBox();
        };
        this.sendMsg.onkeypress = (event) => {
            let prevent = false;
            if (event.keyCode == 13) {
                if (event.shiftKey || event.ctrlKey || event.altKey) {
                    this.sendMsg.value = this.sendMsg.value + "\n";
                } else {
                    this.sendTextareaContent();
                }
                prevent = true;
            }
            resizeSendBox();
            return !prevent;
        };
        this.sendMsg.oninput = resizeSendBox;

        Chat.app.eventTarget.addEventListener("onChatMessage", (event) => {
            let srcUserId = event.srcUserId;
            let dstUserId = event.dstUserId;
            if ((dstUserId == this.remoteUserId && srcUserId == P2p.localEndpoint.user) || (srcUserId == this.remoteUserId && dstUserId == P2p.localEndpoint.user)) {
                let date = event.date;
                let content = event.content;
                let isLocal = srcUserId == P2p.localEndpoint.user;
                this.showMessage(date, isLocal, srcUserId, content);
            }
        });

        // API
        this.onMessageShown = (event) => { };
    }

    onRemove() {

    }

    // TODO add message in past + add way to show exact date per message
    showMessage(date, isLocal, userId, content) {
        let wasBottom = this.history.scrollTop == this.history.scrollHeight - this.history.clientHeight;

        let dateInfoPeriodInMs = 5 * 60 * 1000;
        if (this.lastHistoryDate == null || (date.getTime() - this.lastHistoryDate.getTime()) > dateInfoPeriodInMs) {
            let node = new FTag("div").class("info")
                .text(`${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}h${date.getMinutes()}`);
            this.history.appendChild(node.element);
            this.lastHistoryDate = date;
        }

        let node = new FTag("div")
            .class("msg")
            .class(isLocal ? "msg-local" : "msg-remote")
            .child(new FTag("div").bindWith(Friends.app.getPictureBinder(userId)))
            .child(new FTag("div").class("user")
                .bindWith(Friends.app.getNameBinder(userId)))
            .child(new FTag("div").class("content").text(content));
        this.history.appendChild(node.element);

        this.history.querySelector(".empty-msg")?.remove();

        if (wasBottom) {
            this.history.scrollTop = this.history.scrollHeight - this.history.clientHeight;
        }

        this.onMessageShown();
    }

    sendTextareaContent() {
        if (this.remoteUserId == null) {
            throw new Error("remote user id not set");
        }
        let content = this.sendMsg.value;
        if (content.length > 0) {
            Chat.app.sendChatMessage(this.remoteUserId, content);
            this.sendMsg.value = "";
        };
    }

    // API

    setRemote(remoteUserId) {
        this.remoteUserId = remoteUserId;
    }
}

export { Component }