
const directions = {
    TOP: 'top',
    RIGHT: 'right',
    BOTTOM: 'bottom',
    LEFT: 'left'
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

    draw(ctx, x, y, w, h) {
        let run = (exec) => {
            let wArray = [w / 3, w / 3, w / 3];
            let xOffset = [0, wArray[0], wArray[0] + wArray[1]];
            let hArray = [h / 3, h / 3, h / 3];
            let yOffset = [0, hArray[0], hArray[0] + hArray[1]];
            for (let i of [0, 1, 2]) {
                let wi = wArray[i];
                let xi = x + xOffset[i];
                for (let j of [0, 1, 2]) {
                    let hj = hArray[j];
                    let yj = y + yOffset[j];
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
                ctx.fillStyle = "#888";
            }
            ctx.fillRect(x, y, Math.ceil(w), Math.ceil(h));
        });
        run((isOpen, x, y, w, h) => {
            ctx.strokeStyle = "#444";
            ctx.strokeRect(x, y, Math.ceil(w), Math.ceil(h));
        });
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

let pieceL = new PieceL();
let pieceI = new PieceI();
let pieceT = new PieceT();
let pieceX = new PieceX();


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

    let s = 60;
    pieceL.draw(ctx, (width - s) / 2 - s, (height - s) / 2, s, s);
    pieceI.draw(ctx, (width - s) / 2, (height - s) / 2, s, s);
    pieceT.draw(ctx, (width - s) / 2 + s, (height - s) / 2, s, s);
    pieceX.draw(ctx, (width - s) / 2, (height - s) / 2 + s, s, s);
}

draw(canvas);

setInterval(() => {
    pieceL.rotateClockwise();
    pieceI.rotateClockwise();
    pieceT.rotateClockwise();
    pieceX.rotateClockwise();
    draw(canvas);
}, 1000);



// actions

const opCount = 4;

const playersFifo = {
    "fifo-a": [],
    "fifo-b": [],
};

const opIcons = {
    "left": "fas fa-arrow-left",
    "up": "fas fa-arrow-up",
    "down": "fas fa-arrow-down",
    "right": "fas fa-arrow-right",
    "shift-left": "fas fa-angle-double-left",
    "shift-right": "fas fa-angle-double-right",
    "reset": "far fa-trash-alt"
};

let tourBtn = document.getElementById("tour-btn");
tourBtn.onclick = () => {
    for (let slot of playersFifo["fifo-a"]) {
        slot.reset();
    }
    playersFifo["fifo-a"] = [];
    for (let slot of playersFifo["fifo-b"]) {
        slot.reset();
    }
    playersFifo["fifo-b"] = [];
    tourBtn.disabled = true;
}

function updateTourBtn() {
    if (playersFifo["fifo-a"].length == opCount && playersFifo["fifo-b"].length == opCount) {
        tourBtn.disabled = false;
    } else {
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
                    playersFifo[target].push({
                        "op": op,
                        "reset": () => {
                            slot.classList.add("empty");
                            slot.textContent = "";
                        }
                    });
                    break;
                }
            }
        } else {
            for (let slot of playersFifo[target]) {
                slot.reset();
            }
            playersFifo[target] = [];
        }
        updateTourBtn();
    };
}

for (let btn of document.getElementsByClassName("action")) {
    registerAction(btn);
}