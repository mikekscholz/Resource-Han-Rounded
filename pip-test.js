const inside = require("point-in-polygon-hao");
const Bezier = require("./module/bezier.js");
// const Offset = require('polygon-offset');
// const polygon = [
// 	[
// 		[451,309], [451,48], [879,48], [879,309], [451,309]
// 	],
// 	[
// 		[480,279], [850,279], [850,194], [480,194], [480,279]
// 	],
// 	[
// 		[480,165], [850,165], [850,78], [480,78], [480,165]
// 	]
// ];
// let offset = new Offset();
// let margined = offset.data(polygon).arcSegments(2).margin(1);
// console.log(JSON.stringify(margined, null, '\t'));
// console.log(inside([650,181], polygon));

let bezierH = new Bezier(698.2, 283,698.2, 318, 670.2, 341, 628.2, 341);
let bezierV = new Bezier(674, 338, 174, 226, 150, 163, 150, 92);
let intersects = bezierV.intersects(bezierH);
console.log(intersects.length);
let split = bezierV.split(intersects[0].split('/')[0]);
// console.log(JSON.stringify(split, null, '\t'));