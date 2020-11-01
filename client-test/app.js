

let canvas = document.getElementById("main-canvas");

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