const inside = require("point-in-polygon-hao");
const Bezier = require("./module/bezier.js");
const Offset = require('polygon-offset');
const polygon = [
	[
		[451,309], [451,48], [879,48], [879,309], [451,309]
	],
	[
		[480,279], [850,279], [850,194], [480,194], [480,279]
	],
	[
		[480,165], [850,165], [850,78], [480,78], [480,165]
	]
];
let offset = new Offset();
let margined = offset.data(polygon).arcSegments(2).margin(1);
console.log(JSON.stringify(margined, null, '\t'));
console.log(inside([650,181], polygon));

// let bezier1 = new Bezier(668, 190,686, 231, 668, 259, 622, 259);
// let bezier2 = new Bezier(675, 257, 179, 161, 155, 108, 155, 48);
// let intersects = bezier1.intersects(bezier2);
// let split = bezier2.split(intersects[0].split('/')[1]);
// console.log(JSON.stringify(split, null, '\t'));