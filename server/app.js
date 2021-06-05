#!/usr/bin/env node

'use strict';


const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const { URL } = require("url");
const path = require('path');

// logging

class Logger {
    constructor(module) {
        this.module = module;
    }

    formatLog(level, msg) {
        return `${new Date().toISOString()} [${level}] ${this.module} | ${msg}`;
    }

    debug(msg) {
        console.debug(this.formatLog(`DEB`, msg));
    }

    info(msg) {
        console.log(this.formatLog(`INF`, msg));
    }

    warning(msg) {
        console.warn(this.formatLog(`WAR`, msg));
    }

    error(msg) {
        console.error(this.formatLog(`ERR`, msg));
    }
}

const logger = new Logger("root");


// configuration

const isDev = process.argv.length > 2 && process.argv[2] == "dev";
if (isDev) {
    logger.warning(`dev environnement, not suitable for production`);
}


// http

const httpLogger = new Logger("http");

let port = process.env.PORT;
if (!port) {
    port = "8080";
    httpLogger.info(`defaulting to port ${port}`);
}

const mimeMap = new Map();
mimeMap.set(".html", "text/html");
mimeMap.set(".js", "application/javascript");
mimeMap.set(".mjs", "application/javascript");
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
            response.end(`404 - not found`);
        } else {
            let ext = path.extname(pathname);
            let mime = mimeMap.get(ext);
            if (mime) {
                response.setHeader("Content-Type", `${mimeMap.get(ext)}; charset=utf-8`);
                response.setHeader("X-Content-Type-Options", "nosniff");
            }
            if (!isDev)
                response.setHeader("Cache-Control", "public,max-age=3600");
            else
                response.setHeader("Cache-Control", "public,max-age=0");
            response.writeHead(200);
            response.end(data);
        }
    });
}

class Router {
    constructor() {
        this.route = new Map();
        this.default = null;
    }

    set(path, handler) {
        this.route.set(path, handler);
    }

    setDefault(handler) {
        this.default = handler;
    }

    handle(request, response) {
        let reqUrl = new URL(request.url, `http://${request.headers['host']}`);
        let handler = this.route.get(reqUrl.pathname);
        if (handler)
            return handler(request, response);
        else
            return this.default(request, response);
    }
}

const sendIndex = (request, response) => {
    sendFile("static/index.html", response);
};
const sendStatic = (request, response) => {
    let reqUrl = new URL(request.url, `http://${request.headers['host']}`);
    sendFile("./static" + reqUrl.pathname, response);
};

const router = new Router();
router.set("/", sendIndex);
router.set("/index", sendIndex);
router.set("/index.html", sendIndex);
router.set("/peers", sendIndex);
router.set("/peers.html", sendIndex);
router.set("/dev", sendIndex);
router.set("/dev.html", sendIndex);
router.setDefault(sendStatic);

const server = http.createServer(function (request, response) {
    response.on('finish', () => {
        if (response.statusCode != 200) {
            httpLogger.info(`${response.statusCode} ${request.url}`);
        } else {
            httpLogger.debug(`${response.statusCode} ${request.url}`);
        }
    });

    if (!isDev && request.headers['x-forwarded-proto'] != "https") {
        response.writeHead(301, { "Location": `https://${request.headers['host']}${request.url}` });
        response.end();
    } else {
        router.handle(request, response);
    }
});
server.listen(port, function () {
    httpLogger.info(`server listening on port ${port}`);
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

// Hub

const hubLogger = new Logger("hub");

class Hub {
    constructor() {
        this.connections = new Set();
        this.onEmpty = () => { };
        this.onChange = (connections) => { };
    }

    size() {
        return this.connections.size;
    }

    register(connection) {
        this.connections.add(connection);
        connection.on('close', () => {
            this.connections.delete(connection);
            this.onChange(this.connections);
            if (this.connections.size == 0) {
                this.onEmpty();
            }
        });
        this.onChange(this.connections);
    }

    broadcastUTF(msg) {
        for (let connection of this.connections) {
            connection.sendUTF(msg);
        }
    }
}

const hubs = new Map();
function getHub(name) {
    if (!hubs.has(name)) {
        let hub = new Hub();
        hub.onEmpty = () => {
            hubs.delete(name);
            hubLogger.debug(`remove empty hub '${name}'`);
        };

        hubs.set(name, hub);
        hubLogger.debug(`add new hub '${name}'`);
    }
    return hubs.get(name);
}


// websocket

const websocketLogger = new Logger("websocket");

function originIsAllowed(origin) {
    if (origin == "http://127.0.0.1:8080")
        return true;
    if (origin == "http://localhost:8080")
        return true;
    if (origin == "https://vga-labrinth.herokuapp.com")
        return true;
    return false;
}

// dev page user count

// const wsServer = new WebSocketServer({
//     httpServer: server,
//     autoAcceptConnections: false,
//     path: "/peer-discovery",
// });

// wsServer.on('request', function (request) {
//     if (!originIsAllowed(request.origin)) {
//         request.reject();
//         websocketLogger.error(`connection from origin '${request.origin}' rejected.`);
//         return;
//     }

//     try {
//         let connection = request.accept('peer-discovery', request.origin);
//         connection.on('message', message => {
//             if (message.type === 'binary') {
//                 websocketLogger.error(`received binary message of ${message.binaryData.length} bytes`);
//                 return
//             }
//             if (message.type !== 'utf8') {
//                 websocketLogger.error(`received non utf8 message of type ${message.type}`);
//             }

//             websocketLogger.debug("utf8 data received : " + message.utf8Data);
//             // connection.sendUTF(message.utf8Data);
//             // let data = JSON.parse(message.utf8Data);
//             // if (data.id != undefined) {

//             // } else {
//             //     logError(`unexpected data received ${ JSON.stringify(data) }`);
//             // }
//         });
//         connection.on('close', (reasonCode, description) => {
//             websocketLogger.debug("connection closed, " + reasonCode + ": " + description);
//         });

//         let hub = getHub("default");
//         hub.onChange = () => {
//             hub.broadcastUTF(JSON.stringify({ "user_count": hub.size() }));
//         };
//         hub.register(connection);
//     } catch (error) {
//         websocketLogger.error(error);
//     }
// });


// peer connector

const peers = new Map();


const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    path: "/peer-connector",
})

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        request.reject();
        websocketLogger.error(`connection from origin '${request.origin}' rejected.`);
        return;
    }
    try {
        let connection = request.accept('rtc-on-socket-connector', request.origin);
        connection.on('message', message => {
            if (message.type === 'binary') {
                websocketLogger.error(`received binary message of ${message.binaryData.length} bytes`);
                return;
            }
            if (message.type !== 'utf8') {
                websocketLogger.error(`received non utf8 message of type ${message.type}`);
                return;
            }
            let data = JSON.parse(message.utf8Data);
            if (data.id == "hi" && data?.src != undefined) {
                if (peers.has(data.src)) {
                    websocketLogger.error(`peer already registered ${data.src}`);
                } else {
                    peers.set(data.src, connection);
                    websocketLogger.debug(`peer registered '${data.src}'`);
                    connection.peerId = data.src;
                }
            } else if (data.id == "offer" && data?.src != undefined && data?.dst != undefined) {
                if (peers.has(data.dst)) {
                    websocketLogger.debug(`forward offer '${data.src}' from to '${data.dst}'`);
                    peers.get(data.dst).sendUTF(JSON.stringify({ id: data.id, src: data.src, dst: data.dst, data: data.data }));
                } else {
                    websocketLogger.error(`can't forward offer, peer not registered ${data.src}`);
                }
            } else if (data.id == "answer" && data?.src != undefined && data?.dst != undefined) {
                if (peers.has(data.dst)) {
                    websocketLogger.debug(`forward answer '${data.src}' from to '${data.dst}'`);
                    peers.get(data.dst).sendUTF(JSON.stringify({ id: data.id, src: data.src, dst: data.dst, data: data.data }));
                } else {
                    websocketLogger.error(`can't forward answer, peer not registered ${data.src}`);
                }
            } else {
                websocketLogger.error(`received unexpected message: ${message.utf8Data}`);
            }
        });
        connection.on('close', (reasonCode, description) => {
            websocketLogger.debug("connection closed, " + reasonCode + ": " + description);
            if (peers.has(connection.peerId)) {
                peers.delete(connection.peerId);
                websocketLogger.debug(`peer unregistered '${connection.peerId}'`);
            }
        });
    } catch (error) {
        websocketLogger.error(error);
    }
});