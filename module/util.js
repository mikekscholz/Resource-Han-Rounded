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

function angle(bearing1, bearing2) {
	let delta = bearing2 - bearing1;
	if (delta < -180) {
		delta += 360;
	} else if (delta > 180) {
		delta -= 360;
	}
	return delta === 0 ? 0 : delta < 0 ? -(delta + 180) : 180 - delta;
}

function base60(num) {
	return abs(360 + num % 360) % 360;
}

function horizontalSlope(line) {
	let { p1, p2 } = line;
	return (p2.y - p1.y) / (p2.x - p1.x) || 0;
}

function verticalSlope(line) {
	let { p1, p2 } = line;
	return (p2.x - p1.x) / (p2.y - p1.y) || 0;
}

function findIntersection(array) {
	let [P1, P2, P3, P4] = array;

	let x =
		((P1.x * P2.y - P2.x * P1.y) * (P3.x - P4.x) -
			(P1.x - P2.x) * (P3.x * P4.y - P3.y * P4.x)) /
		((P1.x - P2.x) * (P3.y - P4.y) - (P1.y - P2.y) * (P3.x - P4.x));
	let y =
		((P1.x * P2.y - P2.x * P1.y) * (P3.y - P4.y) -
			(P1.y - P2.y) * (P3.x * P4.y - P3.y * P4.x)) /
		((P1.x - P2.x) * (P3.y - P4.y) - (P1.y - P2.y) * (P3.x - P4.x));
	return { x: x, y: y };
}

function closestPointOnLine(p, line) {
	const { p1, p2 } = line;
	const v = { x: p2.x - p1.x, y: p2.y - p1.y };
	const proj = {
		x: (p.x - p1.x) * v.x + (p.y - p1.y) * v.y,
		y: (p.x - p1.x) * v.y - (p.y - p1.y) * v.x
	};
	return {
		x: p1.x + proj.x / (v.x * v.x + v.y * v.y) * v.x,
		y: p1.y + proj.x / (v.x * v.x + v.y * v.y) * v.y
	};
}

function pointOnLine(points, line, tolerance = 0, clamp = false) {
	if (!Array.isArray(points)) points = [points];
	const { p1, p2 } = line;
	const A = p2.y - p1.y;
	const B = p1.x - p2.x;
	const C = p2.x * p1.y - p1.x * p2.y;
	const left = Math.min(p1.x, p2.x);
	const right = Math.max(p1.x, p2.x);
	const top = Math.min(p1.y, p2.y);
	const bottom = Math.max(p1.y, p2.y);
	for (const point of points) {
		const { x, y } = point;
		const distance = Math.abs(A * x + B * y + C) / Math.sqrt(A * A + B * B);
		if (distance > tolerance) return false;
		if (clamp && (left > x || top > y || bottom < y || right < x)) return false;
	}
	return true;
}

function approximateBezier(p1, cp1, cp2, p2, tolerance = 0.1) {
	const result = [];
	subdivideBezier(p1, cp1, cp2, p2, tolerance, result);
	return result;
}

function subdivideBezier(p1, cp1, cp2, p2, tolerance, result) {
	if (isFlatEnough(p1, cp1, cp2, p2, tolerance)) {
		result.push(p1, p2);
		return;
	}

	const p12 = midpoint(p1, cp1);
	const cp12 = midpoint(cp1, cp2);
	const cp21 = midpoint(cp2, p2);
	const p12cp12 = midpoint(p12, cp12);
	const cp12cp21 = midpoint(cp12, cp21);
	const p21 = midpoint(p12cp12, cp12cp21);

	subdivideBezier(p1, p12, p12cp12, p21, tolerance, result);
	subdivideBezier(p21, cp12cp21, cp21, p2, tolerance, result);
}

function isFlatEnough(p1, cp1, cp2, p2, tolerance) {
	const distance1 = pointToLineDistance(cp1, p1, p2);
	const distance2 = pointToLineDistance(cp2, p1, p2);
	return Math.max(distance1, distance2) < tolerance;
}

function pointToLineDistance(point, lineStart, lineEnd) {
	const dx = lineEnd.x - lineStart.x;
	const dy = lineEnd.y - lineStart.y;

	if (dx === 0 && dy === 0) {
		return distance(point, lineStart);
	}

	let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
	t = Math.max(0, Math.min(1, t));

	const closestPoint = {
		x: lineStart.x + t * dx,
		y: lineStart.y + t * dy
	};

	return distance(point, closestPoint);
}

function distance(p1, p2) {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(p1, p2) {
	return {
		x: (p1.x + p2.x) / 2,
		y: (p1.y + p2.y) / 2,
	};
}

/**
 * Check if number is within range.
 * @example
 * // returns true
 * let example = 5;
 * example.isBetween(1, 10);
 * @example
 * // returns false
 * let example2 = -15;
 * example2.isBetween(-10, 0);
 * @extends Number
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
const isBetween = (function () {
	if (!Object.hasOwn(Number.prototype, "isBetween")) {
		Object.defineProperty(Number.prototype, "isBetween", {
			value: function (a, b) {
				if (b < a) {
					return b <= this.valueOf() && this.valueOf() <= a;
				} else {
					return a <= this.valueOf() && this.valueOf() <= b;
				}
			}
		});
	}
})();

module.exports = {
	angle, approximateBezier, base60, bearing, closestPointOnLine, findIntersection, horizontalSlope, isBetween, midpoint, pointOnLine, roundTo, turn, verticalSlope
};
