// round to 1/precision, where precision should be power of 2 to get smaller size
function roundTo(x, precision) {
	return Math.round(x * precision) / precision;
}

function bearing(line) {
	let { p1, p2 } = line;
	return (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
}

function turn(bearing1, bearing2) {
	let delta = bearing2 - bearing1;
	if (delta < -180) {
			delta += 360;
	} else if (delta > 180) {
			delta -= 360;
	}
	return delta;
}

function base60(num) {
	return abs(360 + num % 360) % 360;
}

function horizontalSlope(line) {
	let { p1, p2 } = line;
	return (p2.y - p1.y) / (p2.x - p1.x);
}

function verticalSlope(line) {
	let { p1, p2 } = line;
	return (p2.x - p1.x) / (p2.y - p1.y);
}



module.exports = {
	base60, bearing, horizontalSlope, roundTo, turn, verticalSlope
};
