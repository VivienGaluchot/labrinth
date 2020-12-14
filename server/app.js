#!/usr/bin/env node

'use strict';


const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const url = require("url");
const path = require('path');

// logging

function formatLog(level, msg) {
    return `${new Date().toISOString()} - ${level} | ${msg}`;
}

function logDebug(msg) {
    console.debug(formatLog(`DEBUG`, msg));
}

function logInfo(msg) {
    console.log(formatLog(`INFO `, msg));
}

function logWarning(msg) {
    console.warn(formatLog(`WARN `, msg));
}

function logError(msg) {
    console.error(formatLog(`ERROR`, msg));
}

// configuration

const isDev = process.argv.length > 2 && process.argv[2] == "dev";
if (isDev) {
    logWarning(`dev environnement enabled`);
}

// http

let port = process.env.PORT;
if (!port) {
    port = "8080";
    logInfo(`defaulting to port ${port}`);
}

let mimeMap = new Map();
mimeMap.set(".js", "application/javascript");
mimeMap.set(".mjs", "text/javascript");
mimeMap.set(".json", "application/json");
mimeMap.set(".css", "text/css");
mimeMap.set(".jpeg", "image/jpeg");
mimeMap.set(".jpg", "image/jpeg");
mimeMap.set(".png", "image/png");
mimeMap.set(".svg", "image/svg+xml");

function sendFile(pathname, response) {
    fs.readFile(pathname, (err, data) => {
        if (err) {
            response.writeHead(404);
            response.end();
            logError("can't read file, " + err);
            return;
        }
        let ext = path.extname(pathname);
        let mime = mimeMap.get(ext);
        if (mime)
            response.setHeader("Content-Type", mimeMap.get(ext));
        if (!isDev)
            response.setHeader("Cache-Control", "public,max-age=3600");
        response.writeHead(200);
        response.end(data);
    });
}

const sendIndex = (response) => { sendFile("static/index.html", response) };

const route = new Map();
route.set("/", sendIndex);
route.set("/index", sendIndex);
route.set("/index.html", sendIndex);
route.set("/peers", sendIndex);
route.set("/peers.html", sendIndex);
route.set("/dev", sendIndex);
route.set("/dev.html", sendIndex);

const server = http.createServer(function (request, response) {
    var pathname = url.parse(request.url).pathname;
    let handler = route.get(pathname);
    if (handler)
        handler(response);
    else
        sendFile("./static/" + pathname, response);
    logInfo(`${response.statusCode} ${request.url}`);
});
server.listen(port, function () {
    logInfo(`server listening on port ${port}`);
});


// peers

/*
class PeerSet {
    constructor() {
        // store peers connection by id
        // id -> connection
        this.peerMap = new Map();
    }

    getConnection(id) {
        return this.peerMap.get(id);
    }

    register(id, connection) {
        if (this.peerMap.has(id)) {
            logError(`peer id collision`);
        } else {
            this.peerMap.set(id, connection);
            logDebug(`peer registered '${id}', count '${this.peerMap.size}'`);
            connection.id = id;
        }
    }

    unregister(id) {
        this.peerMap.delete(id);
        logDebug(`peer unregistered '${id}', count '${this.peerMap.size}'`);
    }
}

let set = new PeerSet();
*/

// web socket

const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    path: "/peer-discovery",
});

function originIsAllowed(origin) {
    logDebug("connection origin " + origin);
    if (origin == "http://127.0.0.1:8080")
        return true;
    if (origin == "http://localhost:8080")
        return true;
    if (origin == "http://vga-labrinth.herokuapp.com:8080")
        return true;
    return false;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        logError(`connection from origin '${request.origin}' rejected.`);
        return;
    }

    try {
        let connection = request.accept('peer-discovery', request.origin);
        connection.on('message', message => {
            if (message.type === 'binary') {
                logError(`received binary message of ${message.binaryData.length} bytes`);
                return
            }
            if (message.type !== 'utf8') {
                logError(`received non utf8 message of type ${message.type}`);
            }

            logDebug("websocket utf8 data received : " + message.utf8Data);
            // connection.sendUTF(message.utf8Data);
            // let data = JSON.parse(message.utf8Data);
            // if (data.id != undefined) {

            // } else {
            //     logError(`unexpected data received ${JSON.stringify(data)}`);
            // }
        });
        connection.on('close', (reasonCode, description) => {
            logDebug("websocket connection closed, " + reasonCode + ": " + description);
        });
    } catch (error) {
        logError(error);
    }
});