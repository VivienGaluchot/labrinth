"use strict";

import { FNode } from '/lib/fdom.mjs';

class Component {
    constructor(element) {
        this.element = element;
        this.lastHistoryDate = null;
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
    }

    onRemove() {

    }

    // TODO add message in past + add way to show exact date per message
    showMessage(date, isLocal, userId, content) {
        let wasBottom = this.history.scrollTop == this.history.scrollHeight - this.history.clientHeight;

        let dateInfoPeriodInMs = 5 * 60 * 1000;
        if (this.lastHistoryDate == null || (date.getTime() - this.lastHistoryDate.getTime()) > dateInfoPeriodInMs) {
            let node = new FNode("div").class("info")
                .text(`${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}h${date.getMinutes()}`);
            this.history.appendChild(node.element);
            this.lastHistoryDate = date;
        }

        let node = new FNode("div")
            .child(new FNode("div").class("user").text(userId))
            .child(new FNode("div").class("content").text(content));
        node.class(isLocal ? "msg-local" : "msg-remote");
        this.history.appendChild(node.element);

        if (wasBottom) {
            this.history.scrollTop = this.history.scrollHeight - this.history.clientHeight;
        }
    }

    sendTextareaContent() {
        let content = this.sendMsg.value;
        if (content.length > 0) {
            this.showMessage(new Date(), true, "test", content);
            this.sendMsg.value = "";
        };
    }
}

export { Component }