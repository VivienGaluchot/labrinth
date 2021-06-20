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

    warn(msg) {
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
    logger.warn(`dev environnement, not suitable for production`);
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


// errors

class RequestError extends Error { }


// peers

const peersLogger = new Logger("peers");

class PeerSet {
    static getUserId(sessionId) {
        const regex = /^([0-9a-f]+)-([0-9a-f]+)-([0-9a-f]+)$/;
        let matches = sessionId.match(regex);
        if (!matches) {
            throw new RequestError(`invalid session id '${sessionId}'`);
        }
        return matches[1];
    }

    constructor() {
        // session id -> connection
        this.connections = new Map();

        // registered users
        // user id -> Set(session id)
        this.users = new Map();
    }

    register(sessionId, connection) {
        let userId = PeerSet.getUserId(sessionId);
        if (this.connections.has(sessionId)) {
            peersLogger.error(`peer already registered ${sessionId}`);
            throw new RequestError("peer already registered");
        } else if (connection.sessionId != null) {
            peersLogger.error(`connection already registered`);
            throw new RequestError("connection already registered");
        } else {
            connection.sessionId = sessionId;
            this.connections.set(sessionId, connection);
            peersLogger.debug(`peer registered '${sessionId}'`);
            if (!this.users.has(userId)) {
                this.users.set(userId, new Set());
            }
            this.users.get(userId).add(sessionId);
            peersLogger.debug(`'${this.users.size}' distinct user connected`);
        }
    }

    getConnection(sessionId) {
        if (this.connections.has(sessionId)) {
            return this.connections.get(sessionId);
        } else {
            throw new RequestError(`peer not registered '${sessionId}'`);
        }
    }

    * getUserSessions(userId) {
        if (this.users.has(userId)) {
            for (let sessionId of this.users.get(userId)) {
                yield sessionId;
            }
        }
    }

    unregister(connection) {
        if (connection.sessionId) {
            let sessionId = connection.sessionId;
            let userId = PeerSet.getUserId(sessionId);
            if (this.connections.has(sessionId)) {
                this.connections.delete(sessionId);
                peersLogger.debug(`peer unregistered '${sessionId}'`);
            }
            if (this.users.has(userId)) {
                this.users.get(userId).delete(sessionId);
                if (this.users.get(userId).size == 0) {
                    this.users.delete(userId);
                }
                peersLogger.debug(`'${this.users.size}' distinct user connected`);
            }
        }
    }
}

const peerSet = new PeerSet();


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


const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    path: "/peer-connector",
});



function sendData(connection, data) {
    connection.sendUTF(JSON.stringify(data));
}

function handleRequest(connection, index, data) {
    function sendReply(data) {
        sendData(connection, { id: "rep", index: index, isOk: true, data: data });
    }
    function sendError(msg) {
        sendData(connection, { id: "rep", index: index, isOk: false, msg: msg });
    }

    try {
        if (data.id == "hi" && data?.src != undefined) {
            peerSet.register(data.src, connection);
            sendReply();
        } else if ((data.id == "desc" || data.id == "candidate") && data?.src != undefined && data?.dst != undefined) {
            let con = peerSet.getConnection(data.dst);
            sendData(con, { id: data.id, src: data.src, dst: data.dst, data: data.data });
            sendReply();
        } else if (data.id == "find-peers" && data?.ids != undefined) {
            let matches = [];
            for (let userId of data.ids) {
                for (let sessionId of peerSet.getUserSessions(userId)) {
                    matches.push(sessionId);
                }
            }
            sendReply({ ids: matches });
        } else {
            sendError(`unexpected message id: '${data.id}'`);
        }
    } catch (err) {
        if (err instanceof RequestError) {
            websocketLogger.error(`request error ${err}`);
            sendError(err.message);
        } else {
            websocketLogger.error(`unexpected server error ${err}`);
            sendError(`unexpected server error`);
        }
    }
}

function handleData(connection, data) {
    if (data.id == "req" && data?.index != undefined && data?.data != undefined) {
        handleRequest(connection, data.index, data.data);
    } else {
        websocketLogger.warn(`drop unexpected data ${JSON.stringify(data)}`);
    }
}

wsServer.on('request', (request) => {
    if (!originIsAllowed(request.origin)) {
        request.reject();
        websocketLogger.error(`connection from origin '${request.origin}' rejected.`);
    } else {
        try {
            let connection = request.accept('rtc-on-socket-connector', request.origin);
            connection.peerId = null;
            connection.on('message', message => {
                if (message.type === 'binary') {
                    websocketLogger.warn(`drop binary message of ${message.binaryData.length} bytes`);
                    return;
                }
                if (message.type !== 'utf8') {
                    websocketLogger.warn(`drop non utf8 message of type ${message.type}`);
                    return;
                }
                handleData(connection, JSON.parse(message.utf8Data));
            });
            connection.on('close', (reasonCode, description) => {
                websocketLogger.debug("connection closed, " + reasonCode + ": " + description);
                peerSet.unregister(connection);
            });
        } catch (error) {
            websocketLogger.error(error);
        }
    }
});