
const directions = {
    TOP: 'top',
    RIGHT: 'right',
    BOTTOM: 'bottom',
    LEFT: 'left'
}

function reverse(direction) {
    switch (direction) {
        case directions.TOP:
            return directions.BOTTOM;
        case directions.BOTTOM:
            return directions.TOP;
        case directions.RIGHT:
            return directions.LEFT;
        case directions.LEFT:
            return directions.RIGHT;
        default:
            throw Error("wrong direction");
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}


// game

class Piece {
    constructor() {
        this.paths = {
            [directions.TOP]: false,
            [directions.RIGHT]: false,
            [directions.BOTTOM]: false,
            [directions.LEFT]: false
        }
    }

    isOpen(direction) {
        return this.paths[direction];
    }

    rotateClockwise() {
        let top = this.paths[directions.TOP];
        this.paths[directions.TOP] = this.paths[directions.LEFT];
        this.paths[directions.LEFT] = this.paths[directions.BOTTOM];
        this.paths[directions.BOTTOM] = this.paths[directions.RIGHT];
        this.paths[directions.RIGHT] = top;
    }

    rotateAntiClockwise() {
        let top = this.paths[directions.TOP];
        this.paths[directions.TOP] = this.paths[directions.RIGHT];
        this.paths[directions.RIGHT] = this.paths[directions.BOTTOM];
        this.paths[directions.BOTTOM] = this.paths[directions.LEFT];
        this.paths[directions.LEFT] = top;
    }

    draw(ctx, x, y, w, h) {
        let run = (exec) => {
            for (let i of [0, 1, 2]) {
                let wi = w / 3;
                let xi = x + i * wi;
                for (let j of [0, 1, 2]) {
                    let hj = h / 3;
                    let yj = y + j * hj;
                    let isOpen = true;
                    if ((i == 0 || i == 2) && (j == 0 || j == 2)) {
                        isOpen = false;
                    } else if (i == 1 && j == 0 && !this.isOpen(directions.TOP)) {
                        isOpen = false;
                    } else if (i == 0 && j == 1 && !this.isOpen(directions.LEFT)) {
                        isOpen = false;
                    } else if (i == 1 && j == 2 && !this.isOpen(directions.BOTTOM)) {
                        isOpen = false;
                    } else if (i == 2 && j == 1 && !this.isOpen(directions.RIGHT)) {
                        isOpen = false;
                    }
                    exec(isOpen, xi, yj, wi, hj);
                }
            }
        };

        ctx.save();
        run((isOpen, x, y, w, h) => {
            if (isOpen) {
                ctx.fillStyle = "#FFF";
            } else {
                ctx.fillStyle = "#555";
            }
            ctx.fillRect(x, y, Math.ceil(w), Math.ceil(h));
            if (!isOpen) {
                let border = 4;
                ctx.lineWidth = border;
                ctx.strokeStyle = "#0001";
                ctx.strokeRect(x + border / 2, y + border / 2, Math.ceil(w) - border, Math.ceil(h) - border);
            }
        });
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#0002";
        run((isOpen, x, y, w, h) => {
            ctx.strokeRect(x, y, Math.ceil(w), Math.ceil(h));
        });
        let border = 4;
        ctx.lineWidth = border;
        ctx.strokeStyle = "#0002";
        ctx.strokeRect(x + border / 2, y + border / 2, w - border, h - border);
        ctx.restore();
    }
}

class PieceL extends Piece {
    constructor() {
        super();
        this.paths = {
            [directions.TOP]: true,
            [directions.RIGHT]: true,
            [directions.BOTTOM]: false,
            [directions.LEFT]: false
        }
    }
}

class PieceI extends Piece {
    constructor() {
        super();
        this.paths = {
            [directions.TOP]: true,
            [directions.RIGHT]: false,
            [directions.BOTTOM]: true,
            [directions.LEFT]: false
        }
    }
}

class PieceT extends Piece {
    constructor() {
        super();
        this.paths = {
            [directions.TOP]: true,
            [directions.RIGHT]: true,
            [directions.BOTTOM]: false,
            [directions.LEFT]: true
        }
    }
}

class PieceX extends Piece {
    constructor() {
        super();
        this.paths = {
            [directions.TOP]: true,
            [directions.RIGHT]: true,
            [directions.BOTTOM]: true,
            [directions.LEFT]: true
        }
    }
}

class Pion {
    constructor(name, color, startCol) {
        this.name = name;
        this.color = color;
        this.startCol = startCol;
    }

    draw(ctx, x, y, w, h, id, count) {
        ctx.save();
        ctx.strokeStyle = `#${this.color}FF`;
        ctx.fillStyle = `#${this.color}88`;
        ctx.lineWidth = 4;

        let r = Math.min(h / 2, w / 2) / 4;

        let cx = x + w / 2 + (id * r * 1.2 * 2) - ((count - 1) * r * 1.2);
        let cy = y + h / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = `#FFFFFFAA`;
        ctx.fill();
        ctx.fillStyle = `#${this.color}44`;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = `#${this.color}`;
        ctx.font = `${Math.round(r)}px arial`;
        ctx.fillText(this.name, cx - r / 3, cy + r / 3);
        ctx.restore();
    }
}

class Grid {
    constructor(rowCount, colCount) {
        this.rowCount = rowCount;
        this.colCount = colCount;

        this.rows = [];

        this.pions = new Map();

        let getRandomPiece = () => {
            let x = Math.random();
            let p = null;
            if (x < 0.3) {
                p = new PieceI();
            } else if (x < 0.6) {
                p = new PieceL();
            } else if (x < 0.8) {
                p = new PieceT();
            } else {
                p = new PieceX();
            }
            let angle = getRandomInt(4);
            for (let i = 0; i < angle; i++) {
                p.rotateClockwise();
            }
            return p;
        }

        for (let r = 0; r < rowCount; r++) {
            let col = [];
            for (let c = 0; c < colCount; c++) {
                col.push(getRandomPiece());
            }
            this.rows.push(col);
        }
    }

    getPiece(row, col) {
        return this.rows[row][col];
    }

    getNextPos(row, col, direction) {
        let next = { "row": row, "col": col };
        switch (direction) {
            case directions.TOP:
                next.row += 1;
                break;
            case directions.BOTTOM:
                next.row -= 1;
                break;
            case directions.RIGHT:
                next.col += 1;
                break;
            case directions.LEFT:
                next.col -= 1;
                break;
            default:
                throw Error("wrong direction");
        }
        if (next.row < 0 || next.row >= this.rowCount ||
            next.col < 0 || next.col >= this.colCount) {
            return null;
        }
        return next;
    }

    draw(ctx, x, y, w, h) {
        let wCol = w / this.colCount;
        let hRow = h / this.rowCount;
        let sPiece = Math.min(wCol, hRow);
        let trueW = sPiece * this.colCount;
        let trueH = sPiece * this.rowCount;
        let paddingW = (w - trueW) / 2;
        let paddingH = (h - trueH) / 2;

        let spacing = 2;
        sPiece -= spacing;
        paddingW += spacing / 2;
        paddingH += spacing / 2;

        for (let i in this.rows) {
            let py = h - (paddingH + y + i * (sPiece + spacing) + sPiece);
            for (let j in this.rows[i]) {
                let px = paddingW + x + j * (sPiece + spacing);
                this.getPiece(i, j).draw(ctx, px, py, sPiece, sPiece);
                let pionCount = 0;
                for (const [pion, pos] of this.pions) {
                    if (i == pos.row && j == pos.col) {
                        pionCount++;
                    }
                }
                let id = 0;
                for (const [pion, pos] of this.pions) {
                    if (i == pos.row && j == pos.col) {
                        pion.draw(ctx, px, py, sPiece, sPiece, id, pionCount);
                        id++;
                    }
                }
            }
        }
    }

    addPion(pion) {
        this.pions.set(pion, { "row": 0, "col": pion.startCol });
    }

    move(pion, direction) {
        let startPos = this.pions.get(pion);
        let nextPos = this.getNextPos(startPos.row, startPos.col, direction);

        let start = this.getPiece(startPos.row, startPos.col);
        let next = nextPos ? this.getPiece(nextPos.row, nextPos.col) : null;

        if (next != null && start.isOpen(direction) && next.isOpen(reverse(direction))) {
            this.pions.set(pion, nextPos);
        }
    }

    shift(pion, direction) {
        let startPos = this.pions.get(pion);
        let row = this.rows[startPos.row];
        if (direction == directions.LEFT) {
            let first = row[0];
            row = row.slice(1, row.length);
            row.push(first);
            for (let [pion, pos] of this.pions) {
                if (pos.row == startPos.row) {
                    pos.col = pos.col == 0 ? this.colCount - 1 : pos.col - 1;
                    this.pions.set(pion, pos);
                }
            }
        } else if (direction == directions.RIGHT) {
            let last = row.pop();
            row.unshift(last);
            for (let [pion, pos] of this.pions) {
                if (pos.row == startPos.row) {
                    pos.col = (pos.col + 1) % this.colCount;
                    this.pions.set(pion, pos);
                }
            }
        }
        this.rows[startPos.row] = row;
    }

    rotate(pion, isClockwise) {
        let startPos = this.pions.get(pion);
        let row = this.rows[startPos.row];
        for (let piece of row) {
            if (isClockwise) {
                piece.rotateClockwise();
            } else {
                piece.rotateAntiClockwise();
            }
        }
    }
}


let grid = new Grid(7, 5);
let pionA = new Pion("A", "AA00AA", 1);
let pionB = new Pion("B", "00AAAA", 2);
let pionC = new Pion("C", "0000AA", 3);

grid.addPion(pionA);
grid.addPion(pionB);
grid.addPion(pionC);


// canvas

let canvas = document.getElementById("main-canvas");

function draw(canvas) {
    let width = canvas.width;
    let height = canvas.height;

    let ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000000";

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.lineTo(width, height);
    ctx.lineTo(width, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();

    grid.draw(ctx, 0, 0, width, height);
}

draw(canvas);


// actions

const opCount = 3;

let turnNb = 0;

const playersFifo = new Map();
playersFifo.set("fifo-a", []);
playersFifo.set("fifo-b", []);
playersFifo.set("fifo-c", []);

const playerPions = new Map();
playerPions.set("fifo-a", pionA);
playerPions.set("fifo-b", pionB);
playerPions.set("fifo-c", pionC);

const opIcons = {
    "left": "fas fa-arrow-left",
    "up": "fas fa-arrow-up",
    "down": "fas fa-arrow-down",
    "right": "fas fa-arrow-right",
    "shift-left": "fas fa-angle-double-left",
    "shift-right": "fas fa-angle-double-right",
    "rotate-clock": "fas fa-undo mirror",
    "rotate-anti_clock": "fas fa-undo",
    "reset": "far fa-trash-alt"
};

const gridOp = new Set();
gridOp.add("shift-left");
gridOp.add("shift-right");
gridOp.add("rotate-clock");
gridOp.add("rotate-anti_clock");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let tourBtn = document.getElementById("tour-btn");
tourBtn.onclick = async () => {
    turnNb++;

    for (let btn of document.getElementsByClassName("action")) {
        btn.disabled = true;
    }

    let runOp = (op, pion) => {
        switch (op) {
            case "left":
                grid.move(pion, directions.LEFT);
                break;
            case "up":
                grid.move(pion, directions.TOP);
                break;
            case "down":
                grid.move(pion, directions.BOTTOM);
                break;
            case "right":
                grid.move(pion, directions.RIGHT);
                break;
            case "shift-left":
                grid.shift(pion, directions.LEFT);
                break;
            case "shift-right":
                grid.shift(pion, directions.RIGHT);
                break;
            case "rotate-clock":
                grid.rotate(pion, true);
                break;
            case "rotate-anti_clock":
                grid.rotate(pion, false);
                break;
        }
        draw(canvas);
    };

    for (let i = 0; i < opCount; i++) {
        for (const [key, entry] of playersFifo) {
            if (gridOp.has(entry[i].op)) {
                entry[i].setActive(true);
            }
        }
        await sleep(200);
        for (const [key, entry] of playersFifo) {
            if (gridOp.has(entry[i].op)) {
                runOp(entry[i].op, playerPions.get(key));
                await sleep(300);
            }
        }
        await sleep(800);
        for (const [key, entry] of playersFifo) {
            if (gridOp.has(entry[i].op)) {
                entry[i].setActive(false);
            }
        }
        await sleep(200);

        for (const [key, entry] of playersFifo) {
            if (!gridOp.has(entry[i].op)) {
                entry[i].setActive(true);
            }
        }
        await sleep(200);
        for (const [key, entry] of playersFifo) {
            if (!gridOp.has(entry[i].op)) {
                runOp(entry[i].op, playerPions.get(key));
                await sleep(300);
            }
        }
        await sleep(800);
        for (const [key, entry] of playersFifo) {
            if (!gridOp.has(entry[i].op)) {
                entry[i].setActive(false);
            }
        }
        await sleep(200);
    }

    for (let slot of playersFifo.get("fifo-a")) {
        slot.reset();
    }
    playersFifo.set("fifo-a", []);
    for (let slot of playersFifo.get("fifo-b")) {
        slot.reset();
    }
    playersFifo.set("fifo-b", []);
    for (let slot of playersFifo.get("fifo-c")) {
        slot.reset();
    }
    playersFifo.set("fifo-c", []);

    updateTourBtn();
}

function updateTourBtn() {
    if (playersFifo.get("fifo-a").length == opCount &&
        playersFifo.get("fifo-b").length == opCount &&
        playersFifo.get("fifo-c").length == opCount) {
        tourBtn.disabled = false;
    } else {
        for (let btn of document.getElementsByClassName("action")) {
            btn.disabled = false;
        }
        tourBtn.disabled = true;
    }
}

function registerAction(btn) {
    btn.onclick = () => {
        let op = btn.dataset["op"];
        let target = btn.dataset["target"];
        let targetEl = document.getElementById(target);
        if (op != "reset") {
            for (let slot of targetEl.getElementsByClassName("slot")) {
                if (slot.classList.contains("empty")) {
                    slot.classList.remove("empty");
                    slot.innerHTML = `<i class="${opIcons[op]}"></i>`;
                    playersFifo.get(target).push({
                        "op": op,
                        "setActive": (isActive) => {
                            if (isActive) {
                                slot.classList.add("active");
                            } else {
                                slot.classList.remove("active");
                                slot.classList.add("used");
                            }
                        },
                        "reset": () => {
                            slot.classList.add("empty");
                            slot.classList.remove("active");
                            slot.classList.remove("used");
                            slot.textContent = "";
                        }
                    });
                    break;
                }
            }
        } else {
            for (let slot of playersFifo.get(target)) {
                slot.reset();
            }
            playersFifo.get(target, []);
        }
        updateTourBtn();
    };
}

for (let btn of document.getElementsByClassName("action")) {
    registerAction(btn);
}