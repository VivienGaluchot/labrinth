
let canvas = document.getElementById("main-canvas");

function countour(canvas) {
    let width = canvas.width;
    let height = canvas.height;

    let ctx = canvas.getContext("2d");

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000000";

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.lineTo(width, height);
    ctx.lineTo(width, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
}

countour(canvas);


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