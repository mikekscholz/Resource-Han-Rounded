const inside = require("point-in-polygon-hao");
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

console.log(inside([650,181], polygon));