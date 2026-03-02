"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Ot } = require("ot-builder");
const geometric = require("geometric");
const Bezier = require("./bezier.js");
const ProgressBar = require('./node-progress');
const { angle, approximateBezier, base60, bearing, closestPointOnLine, findIntersection, horizontalSlope, isBetween, midpoint, pointOnLine, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc } = Math;
let nunito = JSON.parse(fs.readFileSync(`${__dirname}/nunito.json`, 'utf-8'));
// based on measurement of SHS
const params = {
	strokeWidth: { light: 35, heavy: 175 },
};

function circularArray(array, index) {
	var length = array && array.length;
	var idx = abs(length + index % length) % length;
	return array[isNaN(idx) ? index : idx];
}

function circularIndex(array, index) {
	var length = array && array.length;
	var idx = abs(length + index % length) % length;
	return isNaN(idx) ? index : idx;
}

function extendLineRight(line, distance) {
	// let slope = slope(line);
	let x1 = line.p1.x;
	let y1 = line.p1.y;
	let x2 = line.p2.x;
	let y2 = line.p2.y;
	let alpha = Math.atan2(y2 - y1, x2 - x1);
	return {
		x: x2 + distance * Math.cos(alpha),
		y: y2 + distance * Math.sin(alpha)
	};
}

// function pointOnLine(points, line, tolerance = 0) {
// 	if (!Array.isArray(points)) points = [points];
// 	const { p1, p2 } = line;
// 	const A = p2.y - p1.y;
// 	const B = p1.x - p2.x;
// 	const C = p2.x * p1.y - p1.x * p2.y;
// 	for (const point of points) {
// 		const { x, y } = point;
// 		const distance = Math.abs(A * x + B * y + C) / Math.sqrt(A * A + B * B);
// 		if (distance > tolerance) return false;
// 	}
// 	return true;
// }

// function abs(num) {
// 	return num >= 0 ? num : -num;
// }

function substitute(font, references) {
	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(valueDefault, [[masterWghtMax, valueWghtMax - valueDefault]]);
	}
	console.log("safeBottom" + font.os2.usWinDescent);
	console.log("descender" + font.os2.sTypoDescender);
	console.log("xHeight" + font.os2.sxHeight);
	console.log("capsHeight" + font.os2.sCapHeight);
	console.log("ascender" + font.os2.sTypoAscender);
	console.log("safeTop" + font.os2.usWinAscent);
	console.log(font.hhea);
	font.os2.usWinDescent = makeVariance(353, 353);
	font.os2.sTypoDescender = makeVariance(-353, -353);
	font.os2.sxHeight = makeVariance(484, 484);
	font.os2.sCapHeight = makeVariance(705, 705);
	font.os2.sTypoAscender = makeVariance(1011, 1011);
	font.os2.usWinAscent = makeVariance(1011, 1011);
	// font.os2.usWinAscent = makeVariance(1077, 1077);
	font.hhea.ascender = makeVariance(1011, 1011);
	font.hhea.descender = makeVariance(-353, -353);

	function originLight(point) {
		return Ot.Var.Ops.originOf(point);
	}
	
	function originHeavy(point) {
		return Ot.Var.Ops.evaluate(point, instanceShsWghtMax);
	}
	
	function pointLight(p) {
		return { x: originLight(p.x), y: originLight(p.y) };
	}
	
	function pointHeavy(p) {
		return { x: originHeavy(p.x), y: originHeavy(p.y) };
	}
	
	function lineLight(p1, p2) {
		return { p1: pointLight(p1) ,p2: pointLight(p2) };
	}
	
	function lineHeavy(p1, p2) {
		return { p1: pointHeavy(p1) ,p2: pointHeavy(p2) };
	}
	
	function bezierLight(p1, c1, c2, p2) {
		return new Bezier(pointLight(p1), pointLight(c1), pointLight(c2), pointLight(p2));
	}
	
	function bezierHeavy(p1, c1, c2, p2) {
		return new Bezier(pointHeavy(p1), pointHeavy(c1), pointHeavy(c2), pointHeavy(p2));
	}
	
	function contour2GeoJsonLight(contour) {
		let pointsArr = [];
		let j = contour.length - 1;
		for (let i = 0; i < contour.length; i++) {
			if (i + 1 < j && contour[i + 1].kind === 1) {
				let p1 = pointLight(contour[i]);
				let cp1 = pointLight(contour[i + 1]);
				let cp2 = pointLight(contour[i + 2]);
				let p2 = pointLight(contour[i + 3]);
				let curve = approximateBezier(p1, cp1, cp2, p2);
				curve.pop();
				for (const coord of curve) {
					const { x, y } = coord;
					pointsArr.push([ x, y ]);
				}
				i += 2;
			} else {
				const { x, y } = pointLight(contour[i]);
				pointsArr.push([ x, y ]);
			}
		}
		if (
			pointsArr[0][0] !== pointsArr[pointsArr.length - 1][0] ||
			pointsArr[0][1] !== pointsArr[pointsArr.length - 1][1]
		) {
			pointsArr = [...pointsArr, pointsArr[0]];
		}
		return pointsArr;
	}
	
	function contour2GeoJsonHeavy(contour) {
		let pointsArr = [];
		let j = contour.length - 1;
		for (let i = 0; i < contour.length; i++) {
			if (i + 1 < j && contour[i + 1].kind === 1) {
				let p1 = pointHeavy(contour[i]);
				let cp1 = pointHeavy(contour[i + 1]);
				let cp2 = pointHeavy(contour[i + 2]);
				let p2 = pointHeavy(contour[i + 3]);
				let curve = approximateBezier(p1, cp1, cp2, p2);
				curve.pop();
				for (const coord of curve) {
					const { x, y } = coord;
					pointsArr.push([ x, y ]);
				}
				i += 2;
			} else {
				const { x, y } = pointHeavy(contour[i]);
				pointsArr.push([ x, y ]);
			}
		}
		if (
			pointsArr[0][0] !== pointsArr[pointsArr.length - 1][0] ||
			pointsArr[0][1] !== pointsArr[pointsArr.length - 1][1]
		) {
			pointsArr = [...pointsArr, pointsArr[0]];
		}
		return pointsArr;
	}
	
	function point2GeoJsonLight(point) {
		const { x, y } = pointLight(point);
		return [ x, y ];
	}
	
	function point2GeoJsonHeavy(point) {
		const { x, y } = pointHeavy(point);
		return [ x, y ];
	}
	
	function distanceLight(p1, p2) {
		let x1l = originLight(p1.x);
		let x2l = originLight(p2.x);
		let y1l = originLight(p1.y);
		let y2l = originLight(p2.y);
		let xdl = abs(x2l - x1l);
		let ydl = abs(y2l - y1l);
		return sqrt(pow(xdl, 2) + pow(ydl, 2));
	}
	
	function distanceHeavy(p1, p2) {
		let x1h = originHeavy(p1.x);
		let x2h = originHeavy(p2.x);
		let y1h = originHeavy(p1.y);
		let y2h = originHeavy(p2.y);
		let xdh = abs(x2h - x1h);
		let ydh = abs(y2h - y1h);
		return sqrt(pow(xdh, 2) + pow(ydh, 2));
	}
	
	function bearingLight(start, end) {
		let p1 = pointLight(start);
		let p2 = pointLight(end);
		return (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
	}

	function bearingHeavy(start, end) {
		let p1 = pointHeavy(start);
		let p2 = pointHeavy(end);
		return (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
	}
		
	function canBeStrokeEnd(p1, p2, p3, p4) {
		let cornerPoints = p2.kind === 0 && p3.kind === 0;
		let strokeWidthLight = approxEq(distanceLight(p2, p3), params.strokeWidth.light, 20);
		let strokeWidthHeavy = distanceHeavy(p2, p3).isBetween(strokeWidthLight, params.strokeWidth.heavy + 46);
		let bearingLight1 = bearing(lineLight(p1, p2));
		let bearingLight2 = bearing(lineLight(p2, p3));
		let bearingLight3 = bearing(lineLight(p3, p4));
		let anglesLight = angle(bearingLight1, bearingLight2) + angle(bearingLight2, bearingLight3);
		let trapezoidalLight = anglesLight > -200 && anglesLight < -160;
		let bearingHeavy1 = bearing(lineHeavy(p1, p2));
		let bearingHeavy2 = bearing(lineHeavy(p2, p3));
		let bearingHeavy3 = bearing(lineHeavy(p3, p4));
		let anglesHeavy = angle(bearingHeavy1, bearingHeavy2) + angle(bearingHeavy2, bearingHeavy3);
		let trapezoidalHeavy = anglesHeavy > -200 && anglesHeavy < -160;
		return (cornerPoints && strokeWidthLight && strokeWidthHeavy && trapezoidalLight && trapezoidalHeavy);
	}
	
	function canBeRightEnd(bottomRight, topRight) {
		return bottomRight.kind == 0 && topRight.kind == 0 &&
			approxEq(bottomRight.x, topRight.x, 50, 85) &&
			approxEq(distanceLight(topRight, bottomRight), params.strokeWidth.light, 30) &&
			// approxEq(originLight(topRight.y) - originLight(bottomRight.y), params.strokeWidth.light, 20,) &&
			// distanceHeavy(topRight, bottomRight) <= params.strokeWidth.heavy;
			distanceHeavy(topRight, bottomRight) <= params.strokeWidth.heavy;
	}
	
	function canBeTopEnd(topRight, topLeft) {
		// console.log(originLight(topRight.x) - originLight(topLeft.x));
		return topRight.kind == 0 && topLeft.kind == 0 &&
			approxEq(topRight.y, topLeft.y, 20) &&
			approxEq(originLight(topRight.x) - originLight(topLeft.x), params.strokeWidth.light, 20,) &&
			originHeavy(topRight.x) - originHeavy(topLeft.x) <= params.strokeWidth.heavy;
	}
	
	function approxEq(a, b, threshold = 5, thresholdHeavy = false) {
		if (typeof a == 'number' && typeof b == 'number')
			return abs(a - b) <= threshold;
		return abs(originLight(a) - originLight(b)) <= threshold &&
			abs(originHeavy(a) - originHeavy(b)) <= (thresholdHeavy || threshold);
	}

	function isBetweenPoints(a, x, b) {
		return (originLight(a) - 2) <= originLight(x) &&
			originLight(x) <= (originLight(b) + 2) &&
			(originHeavy(a) - 2) <= originHeavy(x) &&
			originHeavy(x) <= (originHeavy(b) + 2);
	}

	function previousNode(contour, idx, corner = false) {
		let current = circularArray(contour, idx);
		let currentXL = originLight(current.x);
		let currentYL = originLight(current.y);
		for (let i = 1; i < contour.length; i++) {
			let previous = circularArray(contour, idx - i);
			if (corner && previous.kind !== 0) continue;
			let prevXL = originLight(previous.x);
			let prevYL = originLight(previous.y);
			if (currentXL !== prevXL || currentYL !== prevYL) {
				return circularIndex(contour, idx - i);
			}
		}
		return  circularIndex(contour, idx - 1);
	}
	
	function nextNode(contour, idx, corner = false) {
		let current = circularArray(contour, idx);
		let currentXL = originLight(current.x);
		let currentYL = originLight(current.y);
		for (let i = 1; i < contour.length; i++) {
			let next = circularArray(contour, idx + i);
			if (corner && next.kind !== 0) continue;
			let nextXL = originLight(next.x);
			let nextYL = originLight(next.y);
			if (currentXL !== nextXL || currentYL !== nextYL) {
				return circularIndex(contour, idx + i);
			}
		}
		return  circularIndex(contour, idx + 1);
	}

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;
		
		const name = glyph.name;
		
		if (references.nunitoGlyphs.includes(name)) {
			glyph.geometry.contours = [];
			let newContours = nunito[name].contours;
			for (let contour of newContours) {
				let pointsArray = [];
				for (let point of contour) {
					pointsArray.push(Ot.Glyph.Point.create(
						makeVariance(point.x[0], point.x[1]),
						makeVariance(point.y[0], point.y[1]),
						point.kind
					));
				}
				glyph.geometry.contours.push(pointsArray);
			}
			glyph.horizontal.start = makeVariance(nunito[name].horizontal.start[0], nunito[name].horizontal.start[1]);
			glyph.horizontal.end = makeVariance(nunito[name].horizontal.end[0], nunito[name].horizontal.end[1]);
		}
		
		if (references.replaceCircles.includes(name)) {
			for (let idx = 0; idx < glyph.geometry.contours.length - 2; idx++) {
				if (
					glyph.geometry.contours[idx].length.isBetween(12, 13) &&
					glyph.geometry.contours[idx + 1].length.isBetween(12, 13)
				) {
					glyph.geometry.contours.splice(idx, 2);
					break;
				}
			}
			let newContours = nunito["circle"].contours;
			for (let contour of newContours) {
				let pointsArray = [];
				for (let point of contour) {
					pointsArray.push(Ot.Glyph.Point.create(
						makeVariance(point.x[0], point.x[1]),
						makeVariance(point.y[0], point.y[1]),
						point.kind
					));
				}
				glyph.geometry.contours.push(pointsArray);
			}
		}
		
		if (references.replaceSquares.includes(name)) {
			for (let idx = 0; idx < glyph.geometry.contours.length - 2; idx++) {
				if (
					(glyph.geometry.contours[idx].length.isBetween(16, 17) && glyph.geometry.contours[idx + 1].length.isBetween(16, 17)) ||
					(glyph.geometry.contours[idx].length.isBetween(4, 5) && glyph.geometry.contours[idx + 1].length.isBetween(4, 5))
				) {
					glyph.geometry.contours.splice(idx, 2);
					break;
				}
			}
			let newContours = nunito["square"].contours;
			for (let contour of newContours) {
				let pointsArray = [];
				for (let point of contour) {
					pointsArray.push(Ot.Glyph.Point.create(
						makeVariance(point.x[0], point.x[1]),
						makeVariance(point.y[0], point.y[1]),
						point.kind
					));
				}
				glyph.geometry.contours.push(pointsArray);
			}
		}
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	let bar = new ProgressBar('\u001b[38;5;82msubstitutions\u001b[0m [1/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
	function progressTick() {
		if (len) {
			var chunk = 1;
			bar.tick(chunk);
			if (bar.curr > 0 && bar.curr < len - 2) { 
				bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m' }, 'force');
			}
			if (bar.curr === len - 1) { 
				bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m' }, 'force');
			}
		}
	}
	// let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/5]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
	// function progressTick(info = "") {
	// 	if (len) {
	// 		var chunk = 1;
	// 		bar.tick(chunk);
	// 		if (bar.curr > 0 && bar.curr < len - 2) { 
	// 			bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', info: info }, 'force');
	// 		}
	// 		if (bar.curr === len - 1) { 
	// 			bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', info: info }, 'force');
	// 		}
	// 	}
	// }

	let count = 0;
	for (let glyph of font.glyphs.items) {
		const name = glyph.name;
		// if (name === "A") {
		// 	console.log(JSON.stringify(glyph));
		// }
		// if (glyph?.geometry?.contours) {
		// 	let data = JSON.stringify(glyph.geometry.contours);
		// 	let filename = `/home/mike/Resource-Han-Rounded/replacements/${name}.json`;
		// 	writeFile(filename, data);
		// }
		// console.log(name);
		
		progressTick(name);
		// checkSingleGlyph(glyph);
		checkSingleGlyph(glyph);
		// if (!references.extendSkip.includes(name)) checkSingleGlyph(glyph);
		// count++;
		// if (count % 1000 == 0) console.log("preExtension:", count, "glyphs processed.");
	}
	// delete references.skipRedundantPoints;
}

module.exports = {
	substitute
};
