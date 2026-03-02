"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Ot } = require("ot-builder");
const geometric = require("geometric");
const Bezier = require("./bezier.js");
const ProgressBar = require('./node-progress');
const { angle, approximateBezier, base60, bearing, closestPointOnLine, findIntersection, horizontalSlope, isBetween, midpoint, pointOnLine, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc } = Math;
const inside = require("point-in-polygon-hao");
const polyClockwise = require("polygon-direction");
// let nunito = JSON.parse(fs.readFileSync(`${__dirname}/nunito.json`, 'utf-8'));
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

function preProcess(font, references) {
	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(roundTo(valueDefault), [[masterWghtMax, roundTo(valueWghtMax) - roundTo(valueDefault)]]);
	}

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
		return { p1: pointLight(p1), p2: pointLight(p2) };
	}

	function lineHeavy(p1, p2) {
		return { p1: pointHeavy(p1), p2: pointHeavy(p2) };
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
				let curve = approximateBezier(p1, cp1, cp2, p2, 0.1);
				curve.pop();
				for (const coord of curve) {
					const { x, y } = coord;
					let point = [x, y];
					if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
						continue;
					}
					pointsArr.push(point);
				}
				i += 2;
			} else {
				const { x, y } = pointLight(contour[i]);
				let point = [x, y];
				if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
					continue;
				}
				pointsArr.push(point);
			}
		}
		if (pointsArr[0].toString() !== pointsArr[pointsArr.length - 1].toString()) {
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
				let curve = approximateBezier(p1, cp1, cp2, p2, 0.1);
				curve.pop();
				for (const coord of curve) {
					const { x, y } = coord;
					let point = [x, y];
					if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
						continue;
					}
					pointsArr.push(point);
				}
				i += 2;
			} else {
				const { x, y } = pointHeavy(contour[i]);
				let point = [x, y];
				if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
					continue;
				}
				pointsArr.push(point);
			}
		}
		if (pointsArr[0].toString() !== pointsArr[pointsArr.length - 1].toString()) {
			pointsArr = [...pointsArr, pointsArr[0]];
		}
		return pointsArr;
	}

	function point2GeoJsonLight(point) {
		const { x, y } = pointLight(point);
		return [x, y];
	}

	function point2GeoJsonHeavy(point) {
		const { x, y } = pointHeavy(point);
		return [x, y];
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
		let trapezoidalLight = anglesLight > -244 && anglesLight < -157;
		let bearingHeavy1 = bearing(lineHeavy(p1, p2));
		let bearingHeavy2 = bearing(lineHeavy(p2, p3));
		let bearingHeavy3 = bearing(lineHeavy(p3, p4));
		let anglesHeavy = angle(bearingHeavy1, bearingHeavy2) + angle(bearingHeavy2, bearingHeavy3);
		let trapezoidalHeavy = anglesHeavy > -209 && anglesHeavy < -157;
		return (cornerPoints && strokeWidthLight && strokeWidthHeavy && trapezoidalLight && trapezoidalHeavy);
	}

	function strokeEndUp(p1, p2, p3, p4) {
		let b1L = bearing(lineLight(p1, p2));
		let b2L = bearing(lineLight(p4, p3));
		let b1H = bearing(lineHeavy(p1, p2));
		let b2H = bearing(lineHeavy(p4, p3));
		return ((b1L >= 315 || b1L <= 45) && (b2L >= 315 || b2L <= 45) && (b1H >= 315 || b1H <= 45) && (b2H >= 315 || b2H <= 45));
	}

	function strokeEndLeft(p1, p2, p3, p4) {
		let b1L = bearing(lineLight(p1, p2));
		let b2L = bearing(lineLight(p4, p3));
		let b1H = bearing(lineHeavy(p1, p2));
		let b2H = bearing(lineHeavy(p4, p3));
		return ((b1L >= 225 && b1L <= 315) && (b2L >= 225 && b2L <= 315) && (b1H >= 225 && b1H <= 315) && (b2H >= 225 && b2H <= 315));
	}

	function strokeEndBottom(p1, p2, p3, p4) {
		let b1L = bearing(lineLight(p1, p2));
		let b2L = bearing(lineLight(p4, p3));
		let b1H = bearing(lineHeavy(p1, p2));
		let b2H = bearing(lineHeavy(p4, p3));
		return ((b1L >= 135 && b1L <= 225) && (b2L >= 135 && b2L <= 225) && (b1H >= 135 && b1H <= 225) && (b2H >= 135 && b2H <= 225));
	}

	function strokeEndRight(p1, p2, p3, p4) {
		let b1L = bearing(lineLight(p1, p2));
		let b2L = bearing(lineLight(p4, p3));
		let b1H = bearing(lineHeavy(p1, p2));
		let b2H = bearing(lineHeavy(p4, p3));
		return ((b1L >= 45 && b1L <= 135) && (b2L >= 45 && b2L <= 135) && (b1H >= 45 && b1H <= 135) && (b2H >= 45 && b2H <= 135));
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

	//             1            
	//             ●            
	//           .    .         
	// 3     2 .         .      
	// ●  .  ●              .  0
	// 4                       ●
	// ●                        
	// HOVERIMAGE - [img "diagrams/left-falling.svg"]
	function canBeLeftFalling(topRight, topPeak, topLeft, flatLeft, downLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
		return topRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && downLeft.kind == 0 &&
			leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
			originLight(topRight.x) - originLight(topPeak.x) > 0 &&
			originLight(topPeak.x) - originLight(topLeft.x) > 0 &&
			originLight(topLeft.x) - originLight(flatLeft.x) > 0 &&
			originLight(flatLeft.x) - originLight(downLeft.x) == 0 &&
			originLight(topRight.y) - originLight(topPeak.y) <= 0 &&
			originLight(topPeak.y) - originLight(topLeft.y) > 0 &&
			originLight(topLeft.y) - originLight(flatLeft.y) == 0 &&
			originLight(flatLeft.y) - originLight(downLeft.y) > 0 &&
			originLight(topRight.y) > originLight(bottomRight.y) &&
			originLight(topRight.x) > originLight(bottomRight.x) &&
			originLight(downLeft.y) > originLight(bottomLeft.y) &&
			originLight(downLeft.x) > originLight(bottomLeft.x);
	}

	//            2              
	//            ●              
	//         .     .           
	//      .            .       
	// 3 .   4               .  1
	// ●  .  ●                  ●
	//                         0 
	//                         ● 
	// HOVERIMAGE - [img "diagrams/left-falling2.svg"]
	function canBeLeftFalling2(topRight, farRight, topPeak, farLeft, topLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
		return topRight.kind == 0 && farRight.kind == 0 && topPeak.kind == 0 && farLeft.kind == 0 && topLeft.kind == 0 &&
			leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
			originLight(topRight.x) - originLight(farRight.x) < 0 &&
			originLight(farRight.x) - originLight(topPeak.x) > 0 &&
			originLight(topPeak.x) - originLight(farLeft.x) > 0 &&
			originLight(farLeft.x) - originLight(topLeft.x) < 0 &&
			originLight(topRight.y) - originLight(farRight.y) < 0 &&
			originLight(farRight.y) - originLight(topPeak.y) < 0 &&
			originLight(topPeak.y) - originLight(farLeft.y) > 0 &&
			abs(originLight(farLeft.y) - originLight(topLeft.y)) <= 2 &&
			originLight(topRight.y) > originLight(bottomRight.y) &&
			originLight(topRight.x) > originLight(bottomRight.x) &&
			originLight(topLeft.y) > originLight(bottomLeft.y) &&
			originLight(topLeft.x) > originLight(bottomLeft.x);
	}

	//            2              
	//            ●              
	//      3  .     .           
	//      ●            .       
	// 4 .   5               .  1
	// ●  .  ●                  ●
	//                         0 
	//                         ● 
	// HOVERIMAGE - [img "diagrams/left-falling2b.svg"]
	// function canBeLeftFalling2b(topRight, farRight, topPeak, slopeLeft, farLeft, topLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
	function canBeLeftFalling2b(topRight, farRight, topPeak, slopeLeft, farLeft, topLeft) {
		return topRight.kind == 0 && farRight.kind == 0 && topPeak.kind == 0 && slopeLeft.kind == 0 && farLeft.kind == 0 && topLeft.kind == 0 &&
			// leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
			originLight(topRight.x) < originLight(farRight.x) &&
			originLight(farRight.x) > originLight(topPeak.x) &&
			originLight(topPeak.x) > originLight(slopeLeft.x) &&
			originLight(slopeLeft.x) > originLight(farLeft.x) &&
			originLight(farLeft.x) < originLight(topLeft.x) &&
			originLight(topRight.y) < originLight(farRight.y) &&
			originLight(farRight.y) < originLight(topPeak.y) &&
			originLight(topPeak.y) > originLight(slopeLeft.y) &&
			originLight(slopeLeft.y) > originLight(farLeft.y)
		// &&
		// abs(originLight(farLeft.y) - originLight(topLeft.y)) <= 4 
		// &&
		// originLight(topRight.y) > originLight(bottomRight.y) &&
		// originLight(topRight.x) > originLight(bottomRight.x) &&
		// originLight(topLeft.y) > originLight(bottomLeft.y) &&
		// originLight(topLeft.x) > originLight(bottomLeft.x);
	}

	//            1              
	//            ●              
	//         .     .           
	//      .            .       
	// 2 .                   .  0
	// ●                        ●
	// ●                         
	// 3                         
	// HOVERIMAGE - [img "diagrams/left-falling3.svg"]
	function canBeLeftFalling3(topRight, topPeak, topLeft, downLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
		return topRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && downLeft.kind == 0 &&
			leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
			originLight(topRight.x) - originLight(topPeak.x) > 0 &&
			originLight(topPeak.x) - originLight(topLeft.x) > 0 &&
			originLight(topLeft.x) - originLight(downLeft.x) === 0 &&
			originLight(topRight.y) - originLight(topPeak.y) < 0 &&
			originLight(topPeak.y) - originLight(topLeft.y) > 0 &&
			originLight(topLeft.y) - originLight(downLeft.y) > 0 &&
			originLight(topRight.y) > originLight(bottomRight.y) &&
			originLight(topRight.x) > originLight(bottomRight.x) &&
			originLight(downLeft.y) > originLight(bottomLeft.y) &&
			originLight(downLeft.x) > originLight(bottomLeft.x);
	}

	//               4               
	//               ●               
	//           .        .          
	//  6   5 .                .    3
	//  ●   ●                     2 ●
	//                          1 ○   
	//                        0 ○     
	//                        ●       
	// HOVERIMAGE - [img "diagrams/left-falling4.svg"]
	function canBeLeftFalling4(rightC2, topRight, topRightC1, topRightC2, farRight, topPeak, topLeft, flatLeft, leftC1) {
		return rightC2.kind == 2 && topRight.kind == 0 && topRightC1.kind == 1 && topRightC2.kind == 2 &&
			farRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && leftC1.kind == 1 &&
			originLight(rightC2.x) < originLight(topRight.x) &&
			originLight(rightC2.y) < originLight(topRight.y) &&
			originLight(topRight.x) < originLight(topRightC1.x) &&
			originLight(topRight.y) <= originLight(topRightC1.y) &&
			originLight(topRightC1.x) < originLight(topRightC2.x) &&
			originLight(topRightC1.y) < originLight(topRightC2.y) &&
			originLight(topRightC2.x) < originLight(farRight.x) &&
			originLight(topRightC2.y) < originLight(farRight.y) &&
			originLight(farRight.x) > originLight(topPeak.x) &&
			originLight(farRight.y) < originLight(topPeak.y) &&
			originLight(topPeak.x) > originLight(topLeft.x) &&
			originLight(topPeak.y) > originLight(topLeft.y) &&
			originLight(topLeft.x) > originLight(flatLeft.x) &&
			abs(originLight(topLeft.y) - originLight(flatLeft.y)) < 3 &&
			originLight(flatLeft.x) > originLight(leftC1.x) &&
			originLight(flatLeft.y) > originLight(leftC1.y)
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
		return circularIndex(contour, idx - 1);
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
		return circularIndex(contour, idx + 1);
	}

	function setCustomRadius(glyphName, idx, radiusMin, radiusMax, readOnly = false, force = false) {
		let light = parseFloat(radiusMin.toFixed(1));
		let heavy = parseFloat(radiusMax.toFixed(1));
		if (glyphName in references.customRadiusList === false) {
			references.customRadiusList[glyphName] = [];
		}
		let refArray = references.customRadiusList[glyphName];
		let objIndex = refArray.findIndex((obj) => obj["idx"] === idx);
		if (objIndex === -1) {
			refArray.push({ light, heavy, idx, readOnly });
		} else {
			let ref = refArray[objIndex];
			if (ref.readOnly === false) {
				if (light > ref.light || force) ref.light = light;
				if (heavy > ref.heavy || force) ref.heavy = heavy;
			}
		}
	}

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;

		const name = glyph.name;

		let oldContours = [...glyph.geometry.contours];
		glyph.geometry.contours = [];
		//ぁ
		if (glyph.name === "uni3041") {
			oldContours[0].splice(0, 1);
			oldContours[2].splice(0, 1);
			// console.log(oldContours);
		}

		if (glyph.name === "uni3116") {
			oldContours[1][0] = {
				x: oldContours[1][0].x,
				y: makeVariance(754, 780),
				kind: 0,
			};
			oldContours[1][9] = {
				x: oldContours[1][9].x,
				y: makeVariance(754, 780),
				kind: 0,
			};
			oldContours[3][0] = {
				x: makeVariance(184, 132),
				y: oldContours[3][0].y,
				kind: 0,
			};
			oldContours[3][1] = {
				x: makeVariance(184, 132),
				y: oldContours[3][1].y,
				kind: 0,
			};
		}
		//㒭
		if (glyph.name === "uni34AD") {
			oldContours[8][1] = {
				x: makeVariance(originLight(oldContours[8][1].x), 293),
				y: makeVariance(originLight(oldContours[8][1].y), 147),
				kind: oldContours[8][1].kind,
			};
			oldContours[8][2] = {
				x: makeVariance(originLight(oldContours[8][2].x), 293),
				y: makeVariance(originLight(oldContours[8][2].y), 107),
				kind: oldContours[8][2].kind,
			};
			oldContours[8][3] = {
				x: makeVariance(originLight(oldContours[8][3].x), 249),
				y: makeVariance(originLight(oldContours[8][3].y), 65),
				kind: oldContours[8][3].kind,
			};
			oldContours[8][4] = {
				x: makeVariance(originLight(oldContours[8][4].x), 229),
				y: makeVariance(originLight(oldContours[8][4].y), 53),
				kind: oldContours[8][4].kind,
			};
			oldContours[8][5] = {
				x: makeVariance(originLight(oldContours[8][5].x), 265),
				y: makeVariance(originLight(oldContours[8][5].y), 17),
				kind: oldContours[8][5].kind,
			};
			oldContours[8][6] = {
				x: makeVariance(originLight(oldContours[8][6].x), 292),
				y: makeVariance(originLight(oldContours[8][6].y), -18),
				kind: oldContours[8][6].kind,
			};
		}
		//㓗
		if (glyph.name === "uni34D7") {
			oldContours[10][6] = {
				x: makeVariance(originLight(oldContours[10][6].x), 540),
				y: makeVariance(originLight(oldContours[10][6].y), 380),
				kind: oldContours[10][6].kind,
			};
			oldContours[10][7] = {
				x: makeVariance(originLight(oldContours[10][7].x), 599),
				y: makeVariance(originLight(oldContours[10][7].y), 424),
				kind: oldContours[10][7].kind,
			};
			oldContours[10][9] = {
				x: makeVariance(originLight(oldContours[10][9].x), 471),
				y: makeVariance(originLight(oldContours[10][9].y), 426),
				kind: oldContours[10][9].kind,
			};
			oldContours[12][6] = {
				x: makeVariance(originLight(oldContours[12][6].x), 666),
				y: makeVariance(originLight(oldContours[12][6].y), 290),
				kind: oldContours[12][6].kind,
			};
			oldContours[12][7] = {
				x: makeVariance(originLight(oldContours[12][7].x), 780),
				y: makeVariance(originLight(oldContours[12][7].y), 356),
				kind: oldContours[12][7].kind,
			};
			oldContours[12][9] = {
				x: makeVariance(originLight(oldContours[12][9].x), 591),
				y: makeVariance(originLight(oldContours[12][9].y), 347),
				kind: oldContours[12][9].kind,
			};
		}
		//㘘
		if (glyph.name === "uni3618") {
			oldContours[22][0] = {
				x: makeVariance(195, 180),
				y: makeVariance(originLight(oldContours[22][0].y), originHeavy(oldContours[22][0].y)),
				kind: oldContours[22][0].kind,
			};
			oldContours[22][1] = {
				x: makeVariance(195, 180),
				y: makeVariance(originLight(oldContours[22][1].y), originHeavy(oldContours[22][1].y)),
				kind: oldContours[22][1].kind,
			};
			oldContours[22][2] = {
				x: makeVariance(808, 823),
				y: makeVariance(originLight(oldContours[22][2].y), originHeavy(oldContours[22][2].y)),
				kind: oldContours[22][2].kind,
			};
			oldContours[22][3] = {
				x: makeVariance(808, 823),
				y: makeVariance(originLight(oldContours[22][3].y), originHeavy(oldContours[22][3].y)),
				kind: oldContours[22][3].kind,
			};
		}

		//㈲
		if (glyph.name === ".gid1938") {
			oldContours.push(oldContours.shift());
			oldContours.push(oldContours.shift());
		}
		//轏
		if (glyph.name === "uni8F4F") {
			oldContours.splice(9, 1);
		}

		// for (let [idxC1, contour] of oldContours.entries()) {
		for (let idxC1 = 0; idxC1 < oldContours.length; idxC1++) {
			let contour = oldContours[idxC1];
			// if (contour.length < 4) {
			// 	continue;
			// }

			// fix all 人's starting on midpoint of horizontal line and start on corner
			if (contour.length === 22) {
				const tlefty = originLight(contour[1].y);
				const tcentery = originLight(contour[0].y);
				const trighty = originLight(contour[21].y);
				const tleftx = originLight(contour[1].x);
				const tcenterx = originLight(contour[0].x);
				const trightx = originLight(contour[21].x);
				if (
					tlefty === tcentery &&
					tcentery === trighty &&
					tleftx < tcenterx &&
					tcenterx < trightx &&
					trightx - tleftx < 40
				) {
					contour.shift();
					// oldContours[idxC1].shift();
				}
			}
			// fix points that align exactly in one master but are slightly off in the other
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				let p1I = circularIndex(contour, idxP1);
				let p1 = circularArray(contour, p1I);
				let matched = false;
				if (p1.kind === 0) {
					for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
						let contour2 = oldContours[idxC2];
						if (idxC2 === idxC1) continue;
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							let p2I = circularIndex(contour2, idxP2);
							let p2 = circularArray(contour2, p2I);
							if (p2.kind === 0) {
								let p1l = pointLight(p1);
								let p1h = pointHeavy(p1);
								let p2l = pointLight(p2);
								let p2h = pointHeavy(p2);
								if (
									(JSON.stringify(p1l) === JSON.stringify(p2l) && JSON.stringify(p1h) !== JSON.stringify(p2h) && distanceHeavy(p1, p2) < 4) ||
									(JSON.stringify(p1l) !== JSON.stringify(p2l) && JSON.stringify(p1h) === JSON.stringify(p2h) && distanceLight(p1, p2) < 4)
								) {
									contour2[p2I] = {
										x: makeVariance(p1l.x, p1h.x),
										y: makeVariance(p1l.y, p1h.y),
										kind: 0,
									};
									matched = true;
									break;
								}
							}
						}
						if (matched) break;
					}
				}
				if (matched) break;
			}
			// contour = [...contour, contour[0]];
			// if (JSON.stringify(contour[0]) !== JSON.stringify(circularArray(contour, -1))) {
			// 	// oldContours[idxC1].push(contour[0]);
			// 	contour.push(contour[0]);
			// }
		}
		// fix all intersects like ㄥ to align rounded ends
		// HOVERIMAGE - [img "diagrams/eng2.svg"]
		for (let idxC1 = 0; idxC1 < oldContours.length; idxC1++) {
			let contour = oldContours[idxC1];
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				let pH0I = circularIndex(contour, idxP1);
				let pH1I = nextNode(contour, pH0I);
				let pH2I = nextNode(contour, pH1I);
				let pH3I = nextNode(contour, pH2I);
				let pH4I = nextNode(contour, pH3I);
				let pH5I = nextNode(contour, pH4I);
				let pH6I = nextNode(contour, pH5I);
				let pH0 = circularArray(contour, pH0I);
				let pH1 = circularArray(contour, pH1I);
				let pH2 = circularArray(contour, pH2I);
				let pH3 = circularArray(contour, pH3I);
				let pH4 = circularArray(contour, pH4I);
				let pH5 = circularArray(contour, pH5I);
				let pH6 = circularArray(contour, pH6I);
				if (
					pH3.kind === 0 &&
					pH2.kind === 0 &&
					pH1.kind === 0 &&
					abs(originLight(pH3.x) - originLight(pH2.x)) <= 1 &&
					originLight(pH2.x) < originLight(pH1.x) &&
					originLight(pH3.y) < originLight(pH2.y) &&
					originLight(pH2.y) < originLight(pH1.y)
				) {
					for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
						let contour2 = oldContours[idxC2];
						if (idxC2 === idxC1 || contour2.length < 9) continue;
						let matched = false
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							let pV0I = circularIndex(contour2, idxP2);
							let pV1I = nextNode(contour2, pV0I);
							let pV2I = nextNode(contour2, pV1I);
							let pV3I = nextNode(contour2, pV2I);
							let pV4I = nextNode(contour2, pV3I);
							let pV5I = nextNode(contour2, pV4I);
							let pV6I = nextNode(contour2, pV5I);
							let pV7I = nextNode(contour2, pV6I);
							let pV8I = nextNode(contour2, pV7I, true);
							let pV9I = nextNode(contour2, pV8I);
							let pV0 = circularArray(contour2, pV0I);
							let pV1 = circularArray(contour2, pV1I);
							let pV2 = circularArray(contour2, pV2I);
							let pV3 = circularArray(contour2, pV3I);
							let pV4 = circularArray(contour2, pV4I);
							let pV5 = circularArray(contour2, pV5I);
							let pV6 = circularArray(contour2, pV6I);
							let pV7 = circularArray(contour2, pV7I);
							let pV8 = circularArray(contour2, pV8I);
							let pV9 = circularArray(contour2, pV9I);
							if (
								pV3.kind === 2 && pV4.kind === 0 && pV5.kind === 1 && pV6.kind === 2 &&
								originLight(pV3.x) <= originLight(pV2.x) &&
								originLight(pV3.y) < originLight(pV2.y) &&
								originLight(pV2.x) <= originLight(pV1.x) &&
								originLight(pV2.y) < originLight(pV1.y) &&
								abs(originLight(pH3.x) - originLight(pV7.x)) <= 2 &&
								abs(originLight(pH3.y) - originLight(pV7.y)) <= 2
							) {
								let pVn1 = circularArray(contour2, previousNode(contour2, pV0I));
								let hStrokeL;
								let hStrokeH;
								for (let idxPh = 0; idxPh < contour.length; idxPh++) {
									let h0I = circularIndex(contour, idxPh);
									let h1I = nextNode(contour, h0I);
									let h2I = nextNode(contour, h1I, true);
									let h3I = nextNode(contour, h2I);
									let h0 = circularArray(contour, h0I);
									let h1 = circularArray(contour, h1I);
									let h2 = circularArray(contour, h2I);
									let h3 = circularArray(contour, h3I);
									if (canBeStrokeEnd(h0, h1, h2, h3) && strokeEndRight(h0, h1, h2, h3)) {
										hStrokeL = distanceLight(h1, h2);
										hStrokeH = distanceHeavy(h1, h2);
									}
								}
								let vStrokeTopH = distanceHeavy(pV0, pVn1);
								let vStrokeBottomL = distanceLight(pV4, pV7);
								let vStrokeBottomH = distanceHeavy(pV4, pV7);

								if (vStrokeBottomH > hStrokeH) {
									if (pV0.kind === 0 && pV1.kind === 0 && abs(originLight(pV0.x) - originLight(pV1.x)) <= 1) {
										function decreaseBottomStroke() {
											let strokeDelta = vStrokeBottomH - hStrokeH;
											if (strokeDelta > 1) {
												for (let iC of [pV1I, pV2I, pV3I, pV4I, pV5I]) {
													// let iC = circularIndex(contour2, idxP2 + i);
													let pL = pointLight(contour2[iC]);
													let pH = pointHeavy(contour2[iC]);
													contour2[iC] = {
														x: makeVariance(pL.x, pH.x),
														y: makeVariance(pL.y, pH.y - strokeDelta),
														kind: contour2[iC].kind,
													};
												}
												pV1 = contour2[pV1I];
												pV2 = contour2[pV2I];
												pV3 = contour2[pV3I];
												pV4 = contour2[pV4I];
												pV5 = contour2[pV5I];
												vStrokeBottomH = distanceHeavy(pV4, pV7);
												decreaseBottomStroke();
											}
										}
										decreaseBottomStroke();
										// } else {
										// 	let tValL = hStrokeL / vStrokeBottomL;
										// 	let tValH = hStrokeH / vStrokeBottomH;
										// 	let interpolatorL = geometric.lineInterpolate([point2GeoJsonLight(pV7), point2GeoJsonLight(pV4)]);
										// 	let interpolatorH = geometric.lineInterpolate([point2GeoJsonHeavy(pV7), point2GeoJsonHeavy(pV4)]);
										// 	let pV4L = interpolatorL(tValL);
										// 	let pV4H = interpolatorH(tValH);
										// 	oldContours[idxC2][pV4I] = {
										// 		x: makeVariance(pV4L[0], pV4H[0]),
										// 		y: makeVariance(pV4L[1], pV4H[1]),
										// 		kind: 0,
										// 	};
										// 	pV4 = oldContours[idxC2][pV4I];
									}
								}

								contour[pH2I] = {
									x: pV4.x,
									y: pV4.y,
									kind: pH2.kind,
								};

								if (pH3I === 0) {
									contour.push(contour[0]);
								}
								// if (JSON.stringify(contour[pH3I]) === JSON.stringify(circularArray(contour, pH3I + 1))) {
								// 	contour[circularIndex(contour, pH3I + 1)] = {
								// 		x: contour[pH3I].x,
								// 		y: contour[pH3I].y,
								// 		kind: contour[circularIndex(contour, pH3I + 1)].kind,
								// 	};
								// }
								if (JSON.stringify(contour2[pV7I]) === JSON.stringify(circularArray(contour2, pV7I + 1))) {
									contour2[circularIndex(contour2, pV7I + 1)] = {
										x: contour[pH3I].x,
										y: contour[pH3I].y,
										kind: contour2[circularIndex(contour2, pV7I + 1)].kind,
									};
								}
								contour2[pV7I] = {
									x: contour[pH3I].x,
									y: contour[pH3I].y,
									kind: contour2[pV7I].kind,
								};

								// if (
								// 	originLight(pV0.x) === originLight(pV1.x) &&
								// 	originHeavy(pV0.x) === originHeavy(pV1.x) &&
								// 	bearingHeavy(pH0, pH1).isBetween(260,270)
								// ) {

								// }

								// let dL = distanceLight(pV4, pV7) / 2;
								// let dH = distanceHeavy(pV4, pV7) / 2;
								//NOTE - store points to delete before modifying array.
								let pVd1I = nextNode(contour2, pV7I);
								let pVd2I = nextNode(contour2, pVd1I);
								let pVd1 = JSON.stringify(contour2[pVd1I]);
								let pVd2 = JSON.stringify(contour2[pVd2I]);

								let pV4pV7DistanceL = distanceLight(pV4, pV7);
								let pV4pV7DistanceH = distanceHeavy(pV4, pV7);
								let pV3pV4AngleL = geometric.lineAngle([point2GeoJsonLight(pV3), point2GeoJsonLight(pV4)]);
								let pV3pV4AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV3), point2GeoJsonHeavy(pV4)]);
								let pH4pH3AngleL = geometric.lineAngle([point2GeoJsonLight(pH4), point2GeoJsonLight(pH3)]);
								let pH4pH3AngleH = geometric.lineAngle([point2GeoJsonHeavy(pH4), point2GeoJsonHeavy(pH3)]);
								let pV4pV7AngleL = geometric.lineAngle([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let pV4pV7MidpointL = geometric.lineMidpoint([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7MidpointH = geometric.lineMidpoint([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let c1L = geometric.pointTranslate(point2GeoJsonLight(pV4), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.2);
								let c1H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.2);
								let c4L = geometric.pointTranslate(point2GeoJsonLight(pV7), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.2);
								let c4H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.2);
								let mL = geometric.pointTranslate(pV4pV7MidpointL, pV4pV7AngleL - 90, pV4pV7DistanceL * 0.25);
								let mH = geometric.pointTranslate(pV4pV7MidpointH, pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								let e1L = geometric.pointTranslate(mL, pV4pV7AngleL + 180, pV4pV7DistanceL * 0.15);
								let e1H = geometric.pointTranslate(mH, pV4pV7AngleH + 180, pV4pV7DistanceH * 0.15);
								let e2L = geometric.pointTranslate(mL, pV4pV7AngleL, pV4pV7DistanceL * 0.15);
								let e2H = geometric.pointTranslate(mH, pV4pV7AngleH, pV4pV7DistanceH * 0.15);
								let c2L = geometric.pointTranslate(e1L, pV4pV7AngleL + 180, pV4pV7DistanceL * 0.2);
								let c2H = geometric.pointTranslate(e1H, pV4pV7AngleH + 180, pV4pV7DistanceH * 0.2);
								let c3L = geometric.pointTranslate(e2L, pV4pV7AngleL, pV4pV7DistanceL * 0.2);
								let c3H = geometric.pointTranslate(e2H, pV4pV7AngleH, pV4pV7DistanceH * 0.2);

								let ext1 = Ot.Glyph.Point.create(
									makeVariance(c1L[0], c1H[0]),
									makeVariance(c1L[1], c1H[1]),
									1
								);
								let ext2 = Ot.Glyph.Point.create(
									makeVariance(c2L[0], c2H[0]),
									makeVariance(c2L[1], c2H[1]),
									2
								);
								let ext3 = Ot.Glyph.Point.create(
									makeVariance(e1L[0], e1H[0]),
									makeVariance(e1L[1], e1H[1]),
									0
								);
								let ext4 = Ot.Glyph.Point.create(
									makeVariance(e2L[0], e2H[0]),
									makeVariance(e2L[1], e2H[1]),
									0
								);
								let ext5 = Ot.Glyph.Point.create(
									makeVariance(c3L[0], c3H[0]),
									makeVariance(c3L[1], c3H[1]),
									1
								);
								let ext6 = Ot.Glyph.Point.create(
									makeVariance(c4L[0], c4H[0]),
									makeVariance(c4L[1], c4H[1]),
									2
								);

								contour2[pV5I] = ext1;
								contour2[pV6I] = ext6;
								contour2.splice(pV6I, 0, ext2, ext3, ext4, ext5);
								contour.splice(pH2I + 1, 0, ext1, ext2, ext3, ext4, ext5, ext6, pH3);


								let spliceIdx = [];
								for (let i = 0; i < contour2.length; i++) {
									let pStr = JSON.stringify(contour2[i]);
									let pK = contour2[i].kind;
									if ([1, 2].includes(pK) && (pStr === pVd1 || pStr === pVd2)) {
										spliceIdx.push(i);
									}
									if (spliceIdx.length === 2) break;
								}
								if (spliceIdx.length === 2) {
									spliceIdx.sort((a, b) => b - a);
									for (const i of spliceIdx) {
										contour2.splice(i, 1);
									}
								}
								// if (name in references.skipRedundantPoints === false) {
								// 	references.skipRedundantPoints[name] = [];
								// }
								// references.skipRedundantPoints[name].push(idxC2);
								if (name in references.extendUpContourIdx === false) {
									references.extendUpContourIdx[name] = [];
								}
								if (!references.extendUpContourIdx[name].includes(idxC2)) {
									references.extendUpContourIdx[name].push(idxC2);
								}
								glyph.geometry.contours[idxC1] = [...contour];
								glyph.geometry.contours[idxC2] = [...contour2];
								matched = true;
								break;
							}
						}
						if (matched) break;
					}
				}
			}
			if (glyph.geometry.contours[idxC1] === undefined) {
				glyph.geometry.contours[idxC1] = [...contour];
			}
		}
		
		oldContours = [...glyph.geometry.contours];
		glyph.geometry.contours = [];

		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				// glyph.geometry.contours.push(oldContours[idxC1]);
				continue;
			}

			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const bottomRightIdx = idxP1;
				const topRightIdx = nextNode(contour, bottomRightIdx);
				const topLeftIdx = nextNode(contour, topRightIdx);
				const bottomLeftIdx = previousNode(contour, bottomRightIdx);

				const horizontalTopSlope = horizontalSlope(lineLight(circularArray(contour, topLeftIdx), circularArray(contour, topRightIdx)));
				const horizontalBottomSlope = horizontalSlope(lineLight(circularArray(contour, bottomLeftIdx), circularArray(contour, bottomRightIdx)));
				if (
					// is right end
					canBeRightEnd(circularArray(contour, bottomRightIdx), circularArray(contour, topRightIdx)) &&
					approxEq(horizontalTopSlope, horizontalBottomSlope, 0.8) &&
					originLight(circularArray(contour, bottomRightIdx).x) > originLight(circularArray(contour, bottomLeftIdx).x)
					//  &&
					// horizontalBottomSlope < 0.5
					// approxEq(horizontalTopRight.y, horizontalTopLeft.y, 34, 37)
					// approxEq(distanceLight(horizontalBottomRight, horizontalTopRight), params.strokeWidth.light, 10) &&
					// approxEq(distanceLight(horizontalTopLeft, horizontalBottomLeft), params.strokeWidth.light, 10) &&
				) {
					const horizontalBottomRight = contour[bottomRightIdx];
					const horizontalTopRight = circularArray(contour, topRightIdx);
					const horizontalTopLeft = circularArray(contour, topLeftIdx);
					const horizontalBottomLeft = circularArray(contour, bottomLeftIdx);
					const horizontalStrokeLight = originLight(horizontalTopRight.y) - originLight(horizontalBottomRight.y);
					const horizontalStrokeHeavy = originHeavy(horizontalTopRight.y) - originHeavy(horizontalBottomRight.y);
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1) continue;
						let extended = false;
						let matched = false;
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							// find 横's (horizontal's) right end inside ㇇'s (horizontal + left-falling)
							if (
								contour2.length > 10 &&
								canBeLeftFalling(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 2).y)) <= 1 &&
								originLight(horizontalTopRight.x) > originLight(circularArray(contour2, idxP2 + 3).x) &&
								originLight(horizontalBottomRight.y) > originLight(circularArray(contour2, idxP2 - 2).y) &&
								originLight(horizontalTopRight.x) < originLight(circularArray(contour2, idxP2).x)
							) {
								const leftFallBottomLeft = circularArray(contour2, idxP2 + 7);
								const leftFallBottomRight = circularArray(contour2, idxP2 - 3);
								if (name in references.horizontalLeftFalling === false) {
									references.horizontalLeftFalling[name] = [];
								}
								let refs = references.horizontalLeftFalling[name];
								let ref = { "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "1" };
								for (let idxC3 = 0; idxC3 < oldContours.length; idxC3++) {
									if ([idxC1, idxC2].includes(idxC3)) continue;
									let vertMatched = false;
									for (let idxP3 = 0; idxP3 < oldContours[idxC3].length; idxP3++) {
										if (// is top end
											canBeTopEnd(oldContours[idxC3][idxP3], circularArray(oldContours[idxC3], idxP3 + 1)) &&
											approxEq(oldContours[idxC3][idxP3].x, circularArray(oldContours[idxC3], idxP3 - 1).x) &&
											approxEq(circularArray(oldContours[idxC3], idxP3 + 1).x, circularArray(oldContours[idxC3], idxP3 + 2).x)
										) {
											const verticalTopRight = oldContours[idxC3][idxP3];
											const verticalTopLeft = circularArray(oldContours[idxC3], idxP3 + 1);
											const verticalBottomLeft = circularArray(oldContours[idxC3], idxP3 + 2);
											const verticalBottomRight = circularArray(oldContours[idxC3], idxP3 - 1);
											if (
												originLight(verticalTopRight.y) >= originLight(leftFallBottomRight.y) &&
												originLight(verticalTopRight.x) >= originLight(leftFallBottomRight.x) &&
												originLight(verticalBottomRight.y) < originLight(leftFallBottomRight.y) &&
												originLight(verticalBottomRight.x) >= originLight(leftFallBottomRight.x) &&
												originLight(verticalTopLeft.y) >= originLight(leftFallBottomLeft.y) &&
												originLight(verticalTopLeft.x) <= originLight(leftFallBottomLeft.x) &&
												originLight(verticalBottomLeft.y) < originLight(leftFallBottomLeft.y) &&
												originLight(verticalBottomLeft.x) <= originLight(leftFallBottomLeft.x) &&
												originHeavy(verticalTopRight.y) >= originHeavy(leftFallBottomRight.y) &&
												originHeavy(verticalTopRight.x) >= originHeavy(leftFallBottomRight.x) &&
												originHeavy(verticalBottomRight.y) < originHeavy(leftFallBottomRight.y) &&
												originHeavy(verticalBottomRight.x) >= originHeavy(leftFallBottomRight.x) &&
												originHeavy(verticalTopLeft.y) >= originHeavy(leftFallBottomLeft.y) &&
												originHeavy(verticalTopLeft.x) <= originHeavy(leftFallBottomLeft.x) &&
												originHeavy(verticalBottomLeft.y) < originHeavy(leftFallBottomLeft.y) &&
												originHeavy(verticalBottomLeft.x) <= originHeavy(leftFallBottomLeft.x)
											) {
												ref = { "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "vertical": idxC3, "verticalTopRight": idxP3, "leftFallingType": "1" };
												if (name in references.skipRedundantPoints === false) {
													references.skipRedundantPoints[name] = [];
												}
												references.skipRedundantPoints[name].push(idxC3);
												if (name in references.extendIgnoreContourIdx === false) {
													references.extendIgnoreContourIdx[name] = [];
												}
												references.extendIgnoreContourIdx[name].push(idxC3);
												vertMatched = true;
												break;
											}
										}
									}
									if (vertMatched) break;
								}
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push(ref);
									matched = true;
									extended = true;
								}

								// break;
							}

							if (
								contour2.length > 10 &&
								canBeLeftFalling2(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								originLight(horizontalTopRight.y) <= originLight(circularArray(contour2, idxP2 + 2).y) &&
								originLight(horizontalTopRight.x) > originLight(circularArray(contour2, idxP2 + 3).x) &&
								originLight(contour2[idxP2].x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling2 === false) {
									references.horizontalLeftFalling2[name] = [];
								}
								let refs = references.horizontalLeftFalling2[name];
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "2" });
									matched = true;
									extended = true;
								}

								// break;
							}
							let lfI0 = idxP2;
							let lfI1 = nextNode(contour2, lfI0)
							let lfI2 = nextNode(contour2, lfI1)
							let lfI3 = nextNode(contour2, lfI2)
							let lfI4 = nextNode(contour2, lfI3)
							let lfI5 = nextNode(contour2, lfI4)
							let lfI6 = nextNode(contour2, lfI5)
							if (
								contour2.length > 10 &&
								canBeLeftFalling2b(contour2[idxP2], circularArray(contour2, lfI1), circularArray(contour2, lfI2), circularArray(contour2, lfI3), circularArray(contour2, lfI4), circularArray(contour2, lfI5)) &&
								// canBeLeftFalling2b(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 + 8), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								originLight(horizontalTopRight.y) < originLight(circularArray(contour2, lfI2).y) &&
								originLight(horizontalTopRight.x) > originLight(circularArray(contour2, lfI4).x) &&
								originLight(contour2[idxP2].x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling2b === false) {
									references.horizontalLeftFalling2b[name] = [];
								}
								let refs = references.horizontalLeftFalling2b[name];
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "2b" });
									matched = true;
									extended = true;
								}
								// extended = true;
								// break;
							}

							if (
								contour2.length > 10 &&
								canBeLeftFalling3(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 1).y)) <= 15 &&
								originLight(horizontalTopRight.x) - originLight(circularArray(contour2, idxP2 + 2).x) > 0 &&
								originLight(contour2[idxP2].x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling3 === false) {
									references.horizontalLeftFalling3[name] = [];
								}
								let refs = references.horizontalLeftFalling3[name];
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "3" });
									matched = true;
									extended = true;
								}
								// extended = true;
								// break;
							}
							if (
								contour2.length > 10 &&
								canBeLeftFalling4(circularArray(contour2, idxP2 - 4), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1), contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 3).y)) <= 15 &&
								abs(originLight(horizontalTopRight.x) - originLight(circularArray(contour2, idxP2 + 3).x)) <= 30 &&
								originLight(circularArray(contour2, idxP2).x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling4 === false) {
									references.horizontalLeftFalling4[name] = [];
								}
								let refs = references.horizontalLeftFalling4[name];
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingTopLeft": circularIndex(contour2, idxP2 + 3), "leftFallingType": "4" });
									matched = true;
									extended = true;
								}
								// extended = true;
								// break;
							}
						}

						if (matched) {
							if (name === "uni3106") console.log("uni3106");
							if (name in references.extendLeftContourIdx === false) {
								references.extendLeftContourIdx[name] = [];
							}
							references.extendLeftContourIdx[name].push(idxC1);
							if (name in references.extendIgnoreContourIdx === false) {
								references.extendIgnoreContourIdx[name] = [];
							}
							references.extendIgnoreContourIdx[name].push(idxC2);
							if (name in references.skipRedundantPoints === false) {
								references.skipRedundantPoints[name] = [];
							}
							references.skipRedundantPoints[name].push(idxC1, idxC2);
							if (!references.leftFallingCorrections.includes(name)) references.leftFallingCorrections.push(name);
							let dL = distanceLight(horizontalBottomRight, horizontalTopRight) / 2;
							let dH = distanceHeavy(horizontalBottomRight, horizontalTopRight) / 2;
							setCustomRadius(name, idxC1, dL, dH, true, true);
						}
						// if (extended) continue;
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}

		oldContours = glyph.geometry.contours;

		glyph.geometry.contours = [];


		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			let newContour = [...contour];

			// ANCHOR - fix upward right hooks
			// HOVERIMAGE - [img "diagrams/right-upward-hook.svg"]
			if (newContour.length > 12) {
				for (let idxP = 0; idxP < newContour.length; idxP++) {
					let p0 = circularArray(newContour, previousNode(newContour, idxP));
					let p1 = circularArray(newContour, idxP);
					let p2 = circularArray(newContour, idxP + 1);
					let p3 = circularArray(newContour, idxP + 2);
					let p4 = circularArray(newContour, idxP + 3);
					let p5 = circularArray(newContour, idxP + 4);
					let p6 = circularArray(newContour, idxP + 5);
					let p7 = circularArray(newContour, idxP + 6);
					let p8 = circularArray(newContour, idxP + 7);
					let p9 = circularArray(newContour, idxP + 8);
					let p10 = circularArray(newContour, idxP + 9);
					let p11 = circularArray(newContour, idxP + 10);
					if (p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && p5.kind === 1 && p6.kind === 2 && p7.kind === 0 && p8.kind === 1 && p9.kind === 2 && p10.kind === 0) {
						let b0H = bearing(lineHeavy(p0, p1));
						let b1H = bearing(lineHeavy(p1, p2));
						let b3H = bearing(lineHeavy(p3, p4));
						let b4H = bearing(lineHeavy(p4, p5));
						let b6H = bearing(lineHeavy(p6, p7));
						let b7H = bearing(lineHeavy(p7, p8));
						let b10rH = bearing(lineHeavy(p10, p9));
						let b11rH = bearing(lineHeavy(p11, p10));
						let corner1Angle = angle(b3H, b4H);
						let corner2Angle = angle(b6H, b7H);
						let combinedAngle = corner1Angle + corner2Angle;
						let p1p2Distance = distanceHeavy(p1, p2);
						let p1p4Distance = distanceHeavy(p1, p4);
						let p4p7DistanceL = distanceLight(p4, p7);
						let p4p7DistanceH = distanceHeavy(p4, p7);
						let hookHeight = originHeavy(p7.y) - originHeavy(p10.y);
						let hookWidth = originHeavy(p4.x) - originHeavy(p7.x);
						let strokeWidth = originHeavy(p10.y) - originHeavy(p1.y);
						let p2AngleCorrectionL = turn(bearing(lineLight(p0, p1)), bearing(lineLight(p1, p2)));
						let p2AngleCorrectionH = turn(bearing(lineHeavy(p0, p1)), bearing(lineHeavy(p1, p2)));
						let p3AngleCorrectionL = turn(bearing(lineLight(p8, p7)), bearing(lineLight(p3, p4)));
						let p3AngleCorrectionH = turn(bearing(lineHeavy(p8, p7)), bearing(lineHeavy(p3, p4)));
						let p9AngleCorrectionL = turn(bearing(lineLight(p11, p10)), bearing(lineLight(p10, p9)));
						let p9AngleCorrectionH = turn(bearing(lineHeavy(p11, p10)), bearing(lineHeavy(p10, p9)));
						if (
							hookHeight > 10 &&
							// b0H.isBetween(85, 132) &&
							// b1H.isBetween(85, 132) &&
							(b0H.isBetween(85, 132) || b0H.isBetween(8, 34)) &&
							(b1H.isBetween(85, 132) || b1H.isBetween(8, 34)) &&
							(b10rH.isBetween(85, 125) || b10rH.isBetween(0, 24)) &&
							(b11rH.isBetween(62, 125) || b11rH.isBetween(0, 24)) &&
							// b10rH.isBetween(85, 125) &&
							// b11rH.isBetween(62, 125) &&
							p1p2Distance.isBetween(10, 200) &&
							(b3H.isBetween(0, 25) || b3H.isBetween(358, 360)) &&
							corner1Angle.isBetween(-145, -86) &&
							corner2Angle.isBetween(-79, -23) &&
							combinedAngle.isBetween(-170, -142) &&
							p4p7DistanceH.isBetween(60, 160) &&
							p1p4Distance.isBetween(50, 330)
						) {
							let p0I = previousNode(newContour, idxP);
							let p1I = circularIndex(newContour, idxP);
							let p2I = circularIndex(newContour, idxP + 1);
							let p3I = circularIndex(newContour, idxP + 2);
							let p4I = circularIndex(newContour, idxP + 3);
							let p5I = circularIndex(newContour, idxP + 4);
							let p6I = circularIndex(newContour, idxP + 5);
							let p7I = circularIndex(newContour, idxP + 6);
							let p8I = circularIndex(newContour, idxP + 7);
							let p9I = circularIndex(newContour, idxP + 8);
							let p10I = circularIndex(newContour, idxP + 9);
							let p11I = circularIndex(newContour, idxP + 10);
							let p2rL = geometric.pointRotate(point2GeoJsonLight(p2), p2AngleCorrectionL, point2GeoJsonLight(p1));
							let p2rH = geometric.pointRotate(point2GeoJsonHeavy(p2), p2AngleCorrectionH, point2GeoJsonHeavy(p1));
							let p3rL = geometric.pointRotate(point2GeoJsonLight(p3), p3AngleCorrectionL, point2GeoJsonLight(p4));
							let p3rH = geometric.pointRotate(point2GeoJsonHeavy(p3), p3AngleCorrectionH, point2GeoJsonHeavy(p4));
							let p9rL = geometric.pointRotate(point2GeoJsonLight(p9), p9AngleCorrectionL, point2GeoJsonLight(p10));
							let p9rH = geometric.pointRotate(point2GeoJsonHeavy(p9), p9AngleCorrectionH, point2GeoJsonHeavy(p10));
							newContour[p2I] = {
								x: makeVariance(p2rL[0], p2rH[0]),
								y: makeVariance(p2rL[1], p2rH[1]),
								kind: newContour[p2I].kind,
							};
							newContour[p3I] = {
								x: makeVariance(p3rL[0], p3rH[0]),
								y: makeVariance(p3rL[1], p3rH[1]),
								kind: 2,
							};
							let p7p8midH = midpoint(pointHeavy(p7), pointHeavy(p8));
							let p4L = closestPointOnLine(pointLight(p7), lineLight(newContour[p3I], p4));
							let p4H = closestPointOnLine(p7p8midH, lineHeavy(newContour[p3I], p4));
							let p7L = closestPointOnLine(pointLight(p4), lineLight(p8, p7));
							let p7H = closestPointOnLine(pointHeavy(p4), lineHeavy(p8, p7));
							if (!pointOnLine(p7H, lineHeavy(p7, p8), 0, true)) {
								newContour[p4I] = {
									x: makeVariance(p4L.x, p4H.x),
									y: makeVariance(p4L.y, p4H.y),
									kind: 0,
								};
								newContour[p7I] = {
									x: makeVariance(originLight(p7.x), p7p8midH.x),
									y: makeVariance(originLight(p7.y), p7p8midH.y),
									kind: 0,
								};
							} else {
								newContour[p7I] = {
									x: makeVariance(p7L.x, p7H.x),
									y: makeVariance(p7L.y, p7H.y),
									kind: 0,
								};
							}
							let p4p7DistanceNewH = distanceHeavy(newContour[p4I], newContour[p7I]);
							let p4p7OffsetH = p4p7DistanceNewH < p4p7DistanceH ? (p4p7DistanceH * 0.9) - p4p7DistanceNewH : 0;
							if (p4p7OffsetH) {
								let p4p7AngleH = geometric.lineAngle([point2GeoJsonHeavy(newContour[p7I]), point2GeoJsonHeavy(newContour[p4I])]);
								let p4tL = pointLight(newContour[p4I]);
								let p4tH = geometric.pointTranslate(point2GeoJsonHeavy(newContour[p4I]), p4p7AngleH, p4p7OffsetH);
								let p3tL = pointLight(newContour[p3I]);
								let p3tH = geometric.pointTranslate(point2GeoJsonHeavy(newContour[p3I]), p4p7AngleH, p4p7OffsetH);
								newContour[p4I] = {
									x: makeVariance(p4tL.x, p4tH[0]),
									y: makeVariance(p4tL.y, p4tH[1]),
									kind: 0,
								};
								newContour[p3I] = {
									x: makeVariance(p3tL.x, p3tH[0]),
									y: makeVariance(p3tL.y, p3tH[1]),
									kind: 2,
								};
							}

							let p5L = extendLineRight(lineLight(newContour[p3I], newContour[p4I]), p4p7DistanceL * 0.6);
							let p5H = extendLineRight(lineHeavy(newContour[p3I], newContour[p4I]), p4p7DistanceH * 0.6);
							let p6L = extendLineRight(lineLight(newContour[p8I], newContour[p7I]), p4p7DistanceL * 0.6);
							let p6H = extendLineRight(lineHeavy(newContour[p8I], newContour[p7I]), p4p7DistanceH * 0.6);
							newContour[p5I] = {
								x: makeVariance(p5L.x, p5H.x),
								y: makeVariance(p5L.y, p5H.y),
								kind: 1,
							};
							newContour[p6I] = {
								x: makeVariance(p6L.x, p6H.x),
								y: makeVariance(p6L.y, p6H.y),
								kind: 2,
							};
							newContour[p9I] = {
								x: makeVariance(p9rL[0], p9rH[0]),
								y: makeVariance(p9rL[1], p9rH[1]),
								kind: newContour[p9I].kind,
							};
							if (p4p7OffsetH) {
								for (let i = 0; i < newContour.length; i++) {
									let pointL = pointLight(newContour[i]);
									let pointH = pointHeavy(newContour[i]);
									newContour[i] = {
										x: makeVariance(pointL.x, pointH.x - p4p7OffsetH),
										y: makeVariance(pointL.y, pointH.y),
										kind: newContour[i].kind,
									};
								}
							}
							break;
						}
					}
				}
			}

			// ANCHOR - fix downward j hooks
			// HOVERIMAGE - [img "diagrams/j-hook.svg"]
			if (newContour.length > 12) {
				for (let idxP = 0; idxP < newContour.length; idxP++) {
					let pCI = circularIndex(newContour, idxP - 3);
					let pBI = circularIndex(newContour, idxP - 2);
					let pAI = circularIndex(newContour, idxP - 1);
					let p0I = circularIndex(newContour, idxP);
					let p1I = circularIndex(newContour, idxP + 1);
					let p2I = circularIndex(newContour, idxP + 2);
					let p3I = circularIndex(newContour, idxP + 3);
					let p4I = circularIndex(newContour, idxP + 4);
					let p5I = circularIndex(newContour, idxP + 5);
					let p6I = circularIndex(newContour, idxP + 6);
					let p7I = circularIndex(newContour, idxP + 7);
					let p8I = circularIndex(newContour, idxP + 8);
					let p9I = circularIndex(newContour, idxP + 9);
					let p10I = circularIndex(newContour, idxP + 10);
					let p11I = circularIndex(newContour, idxP + 11);
					let p12I = circularIndex(newContour, idxP + 12);
					let pC = newContour[pCI];
					let p0 = newContour[p0I];
					let p1 = newContour[p1I];
					let p2 = newContour[p2I];
					let p3 = newContour[p3I];
					let p4 = newContour[p4I];
					let p5 = newContour[p5I];
					let p6 = newContour[p6I];
					let p7 = newContour[p7I];
					let p8 = newContour[p8I];
					let p9 = newContour[p9I];
					let p12 = newContour[p12I];
					let b2L = bearingLight(p2, p3);
					let b3L = bearingLight(p3, p4);
					let b5L = bearingLight(p5, p6);
					let b6L = bearingLight(p6, p7);
					let b2H = bearingHeavy(p2, p3);
					let b3H = bearingHeavy(p3, p4);
					let b5H = bearingHeavy(p5, p6);
					let b6H = bearingHeavy(p6, p7);
					let pCH = pointHeavy(pC);
					let p0H = pointHeavy(p0);
					let p3H = pointHeavy(p3);
					let p6L = pointLight(p6);
					let p6H = pointHeavy(p6);
					let p12H = pointHeavy(p12);
					let p0p6HDelta = p0H.x - p6H.x;
					let strokeX = p12H.x - pCH.x;
					let strokeY = p3H.y - p6H.y;
					let strokeDelta = strokeY - strokeX;
					if (
						p0.kind === 0 && p1.kind === 1 && p2.kind === 2 && p3.kind === 0 &&
						p4.kind === 1 && p5.kind === 2 && p6.kind === 0 && p7.kind === 1 &&
						b2L.isBetween(265, 280) === true && b2H.isBetween(265, 280) === true &&
						b3H.isBetween(140, 168) === true && b5H.isBetween(165, 185) === true
					) {
						if (strokeDelta > 0) {
							for (let i = -3; i <= 4; i++) {
								let iC = circularIndex(newContour, idxP + i);
								let pL = pointLight(newContour[iC]);
								let pH = pointHeavy(newContour[iC]);
								newContour[iC] = {
									x: makeVariance(pL.x, pH.x),
									y: makeVariance(pL.y, pH.y - strokeDelta),
									kind: newContour[iC].kind,
								};
							}
							p0 = newContour[p0I];
							p1 = newContour[p1I];
							p2 = newContour[p2I];
							p3 = newContour[p3I];
							p4 = newContour[p4I];
						}
						if (p0H.x <= p6H.x && p0p6HDelta.isBetween(-10, 0)) {
							newContour[p6I] = {
								x: makeVariance(p6L.x, p0H.x - 1),
								y: makeVariance(p6L.y, p6H.y),
								kind: p6.kind,
							};
							p6 = newContour[p6I];
						}
						let c0Lo = bezierLight(p0, p1, p2, p3);
						let c0Ho = bezierHeavy(p0, p1, p2, p3);
						let c0Lp = c0Lo.project(pointLight(p6));
						let c0Hp = c0Ho.project(pointHeavy(p6));
						let c0Ls = c0Lo.split(c0Lp.t);
						let c0Hs = c0Ho.split(c0Hp.t);
						let c0L = c0Ls.left.points;
						let c0H = c0Hs.left.points;
						for (let i = 0; i < 4; i++) {
							newContour[p0I + i] = {
								x: makeVariance(c0L[i].x, c0H[i].x),
								y: makeVariance(c0L[i].y, c0H[i].y),
								kind: newContour[p0I + i].kind,
							};
						}
						let p4L = extendLineRight(lineLight(newContour[p2I], newContour[p3I]), c0Lp.d * 0.6);
						let p4H = extendLineRight(lineHeavy(newContour[p2I], newContour[p3I]), c0Hp.d * 0.6);
						let p5L = extendLineRight(lineLight(newContour[p7I], newContour[p6I]), c0Lp.d * 0.6);
						let p5H = extendLineRight(lineHeavy(newContour[p7I], newContour[p6I]), c0Hp.d * 0.6);
						newContour[p4I] = {
							x: makeVariance(p4L.x, p4H.x),
							y: makeVariance(p4L.y, p4H.y),
							kind: 1,
						};
						newContour[p5I] = {
							x: makeVariance(p5L.x, p5H.x),
							y: makeVariance(p5L.y, p5H.y),
							kind: 2,
						};
						break;
					}
				}
			}

			glyph.geometry.contours.push(newContour);
		}

		oldContours = glyph.geometry.contours;

		glyph.geometry.contours = [];

		let skipContours = [];
		if (name in references.skipRedundantPoints) {
			skipContours = references.skipRedundantPoints[name];
		}

		let polyGlyphLight = [];
		let polyGlyphHeavy = [];
		let rawPolyLight = [];
		let rawPolyHeavy = [];
		let rawPolyLightCW = [];
		let rawPolyHeavyCW = [];

		for (let [idxC1, contour] of oldContours.entries()) {
			let polyLight = contour2GeoJsonLight(contour);
			let polyHeavy = contour2GeoJsonHeavy(contour);
			if (polyClockwise(polyLight)) {
				rawPolyLightCW.push(polyLight);
				rawPolyHeavyCW.push(polyHeavy);
				rawPolyLight.push(undefined);
				rawPolyHeavy.push(undefined);
				skipContours.push(idxC1);
			} else {
				rawPolyLight.push(polyLight);
				rawPolyHeavy.push(polyHeavy);
				rawPolyLightCW.push(undefined);
				rawPolyHeavyCW.push(undefined);
			}
		}

		for (let idxN1 = 0; idxN1 < rawPolyLight.length; idxN1++) {
			if (rawPolyLight[idxN1] === undefined) {
				polyGlyphLight[idxN1] = undefined;
				polyGlyphHeavy[idxN1] = undefined;
				continue;
			}
			let polyLight = [];
			let polyHeavy = [];
			polyLight.push(rawPolyLight[idxN1]);
			polyHeavy.push(rawPolyHeavy[idxN1]);
			for (let [idxN2, polygonCW] of rawPolyLightCW.entries()) {
				if (polygonCW === undefined) continue;
				let fail = false;
				for (let coord of polygonCW) {
					let test = inside(coord, polyLight);
					if (test !== true) {
						fail = true;
						break;
					}
				}
				if (fail) continue;
				polyLight.push(rawPolyLightCW[idxN2]);
				polyHeavy.push(rawPolyHeavyCW[idxN2]);
				polyGlyphLight[idxN2] = idxN1;
				polyGlyphHeavy[idxN2] = idxN1;
				rawPolyLightCW[idxN2] = undefined;
				rawPolyHeavyCW[idxN2] = undefined;
			}
			polyGlyphLight[idxN1] = polyLight;
			polyGlyphHeavy[idxN1] = polyHeavy;
		}

		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				continue;
			}
			let splicePoints = [];
			for (let idxP1 = 0; idxP1 <= contour.length; idxP1++) {
				const p1I = circularIndex(contour, idxP1);
				const p2I = nextNode(contour, p1I);
				const p3I = nextNode(contour, p2I);
				const p4I = nextNode(contour, p3I);
				const p5I = nextNode(contour, p4I);
				const p6I = nextNode(contour, p5I);
				const p1 = circularArray(contour, p1I);
				const p2 = circularArray(contour, p2I);
				const p3 = circularArray(contour, p3I);
				const p4 = circularArray(contour, p4I);
				const p5 = circularArray(contour, p5I);
				const p6 = circularArray(contour, p6I);
				if (canBeStrokeEnd(p1, p2, p5, p6) && p3.kind === 1 && p4.kind === 2) {
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
						let polygonLight = polyGlyphLight[idxC2];
						let polygonHeavy = polyGlyphHeavy[idxC2];
						let score = 0;
						if (inside(point2GeoJsonLight(p2), polygonLight) !== false) score++
						if (inside(point2GeoJsonLight(p3), polygonLight) === true) score++
						if (inside(point2GeoJsonLight(p4), polygonLight) === true) score++
						if (inside(point2GeoJsonLight(p5), polygonLight) !== false) score++
						if (inside(point2GeoJsonHeavy(p2), polygonHeavy) !== false) score++
						if (inside(point2GeoJsonHeavy(p3), polygonHeavy) === true) score++
						if (inside(point2GeoJsonHeavy(p4), polygonHeavy) === true) score++
						if (inside(point2GeoJsonHeavy(p5), polygonHeavy) !== false) score++
						if (score >= 7) {
							splicePoints.push(p3I, p4I);
						}
					}
				}
			}
			if (splicePoints.length) {
				splicePoints.sort((a, b) => b - a);
				for (const i of splicePoints) {
					oldContours[idxC1].splice(i, 1);
				}
			}
		}

		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			if (JSON.stringify(contour[0]) === JSON.stringify(circularArray(contour, - 1))) contour.pop()
			let newContour = [...contour];


			let redundantPoints = [];


			// ANCHOR - cleanup double flare serifs.
			// HOVERIMAGE - [img "diagrams/doubleflare.svg"]

			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 5);
				let p7I = circularIndex(newContour, idxP1 + 6);
				let p8I = circularIndex(newContour, idxP1 + 7);
				let p9I = nextNode(newContour, p8I);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let p7 = newContour[p7I];
				let p8 = newContour[p8I];
				let p9 = newContour[p9I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b5L = bearingLight(p5, p6);
				let b6L = bearingLight(p6, p7);
				let b7L = bearingLight(p7, p8);
				let b8L = bearingLight(p8, p9);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				let b5H = bearingHeavy(p5, p6);
				let b6H = bearingHeavy(p6, p7);
				let b7H = bearingHeavy(p7, p8);
				let b8H = bearingHeavy(p8, p9);

				// let kinds = false;
				let kinds = (p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && p5.kind === 0 && p6.kind === 1 && p7.kind === 2 && p8.kind === 0 && (p9.kind === 1 || p9.kind === 0);
				if (
					(
						kinds &&
						distanceLight(p3, p4) > 0 &&
						distanceLight(p5, p6) > 0 &&
						angle(b3L, b4L).isBetween(-89, -75) &&
						angle(b4L, b5L).isBetween(-89, -75) &&
						distanceLight(p1, p4) < 200 &&
						distanceLight(p5, p8) < 200 &&
						turn(b0L, b1L).isBetween(-5, 9) &&
						turn(b8L, b7L).isBetween(-5, 9) &&
						turn(b1L, b3L).isBetween(-5, 30) &&
						turn(b5L, b7L).isBetween(0, 30) &&
						abs(angle(b1L, b7L)) < 8 &&
						angle(b1L, b4L).isBetween(-97, -85) &&
						angle(b4L, b7L).isBetween(-95, -85)
					) ||
					(
						kinds &&
						distanceHeavy(p3, p4) > 0 &&
						distanceHeavy(p5, p6) > 0 &&
						angle(b3H, b4H).isBetween(-89, -75) &&
						angle(b4H, b5H).isBetween(-89, -75) &&
						distanceHeavy(p1, p4) < 300 &&
						distanceHeavy(p5, p8) < 300 &&
						turn(b0H, b1H).isBetween(-5, 9) &&
						turn(b8H, b7H).isBetween(-5, 9) &&
						turn(b1H, b3H).isBetween(-5, 30) &&
						turn(b5H, b7H).isBetween(0, 30) &&
						abs(angle(b1H, b7H)) < 8 &&
						angle(b1H, b4H).isBetween(-98, -85) &&
						angle(b4H, b7H).isBetween(-95, -85)
					)
				) {
					let c1L = findIntersection([pointLight(p0), pointLight(p1), pointLight(p4), pointLight(p5)]);
					let c1H = findIntersection([pointHeavy(p0), pointHeavy(p1), pointHeavy(p4), pointHeavy(p5)]);
					let c2L = findIntersection([pointLight(p9), pointLight(p8), pointLight(p4), pointLight(p5)]);
					let c2H = findIntersection([pointHeavy(p9), pointHeavy(p8), pointHeavy(p4), pointHeavy(p5)]);

					newContour[p4I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};

					newContour[p5I] = {
						x: makeVariance(c2L.x, c2H.x),
						y: makeVariance(c2L.y, c2H.y),
						kind: 0,
					};
					let indices = [p1I, p2I, p3I, p6I, p7I, p8I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup concave square corners.
			// HOVERIMAGE - [img "diagrams/concavesquare.svg"]

			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 5);
				let p7I = circularIndex(newContour, idxP1 + 6);
				let p8I = circularIndex(newContour, idxP1 + 7);
				let p9I = nextNode(newContour, p8I);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let p7 = newContour[p7I];
				let p8 = newContour[p8I];
				let p9 = newContour[p9I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b5L = bearingLight(p5, p6);
				let b6L = bearingLight(p6, p7);
				let b7L = bearingLight(p8, p7);
				let b8L = bearingLight(p9, p8);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				let b5H = bearingHeavy(p5, p6);
				let b6H = bearingHeavy(p6, p7);
				let b7H = bearingHeavy(p8, p7);
				let b8H = bearingHeavy(p9, p8);
				let kinds2 = (p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && p5.kind === 1 && p6.kind === 2 && p7.kind === 0 && (p8.kind === 1 || p8.kind === 0);
				if (
					(
						kinds2 &&
						distanceLight(p3, p4) > 0 &&
						distanceLight(p4, p5) > 0 &&
						distanceLight(p1, p4) < 200 &&
						distanceLight(p4, p7) < 200 &&
						angle(b3L, b4L).isBetween(-91, -75) &&
						abs(turn(b0L, b1L)) < 8 &&
						abs(turn(bearingLight(p7, p8), b6L)) < 8 &&
						angle(b0L, bearingLight(p7, p8)).isBetween(-95, -85)
					) ||
					(
						kinds2 &&
						distanceHeavy(p3, p4) > 0 &&
						distanceHeavy(p4, p5) > 0 &&
						distanceHeavy(p1, p4) < 300 &&
						distanceHeavy(p4, p7) < 300 &&
						angle(b3H, b4H).isBetween(-91, -75) &&
						abs(turn(b0H, b1H)) < 8 &&
						abs(turn(bearingHeavy(p7, p8), b6H)) < 8 &&
						angle(b0H, bearingHeavy(p7, p8)).isBetween(-95, -85)
					)
				) {
					let c1L = findIntersection([pointLight(p0), pointLight(p1), pointLight(p7), pointLight(p8)]);
					let c1H = findIntersection([pointHeavy(p0), pointHeavy(p1), pointHeavy(p7), pointHeavy(p8)]);
					newContour[p4I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					let indices = [p1I, p2I, p3I, p5I, p6I, p7I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup flare serif segment end.
			// HOVERIMAGE - [img "diagrams/flare-end.svg"]

			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let b0L = bearingLight(p0, p1);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				// let kinds3 = false;
				let kinds3 = (p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && (p5.kind === 1 || p5.kind === 0);
				if (
					(
						kinds3 &&
						angle(b3L, b4L).isBetween(-89, -70) &&
						angle(b0L, b4L).isBetween(-95, -85) &&
						pointOnLine([pointLight(p1), pointLight(p2)], lineLight(p0, p4), 2) &&
						pointOnLine(pointLight(p3), lineLight(p0, p4), 6) &&
						distanceLight(p0, p4) < 200
					) &&
					(
						kinds3 &&
						angle(b3H, b4H).isBetween(-89, -70) &&
						angle(b0H, b4H).isBetween(-95, -85) &&
						pointOnLine([pointHeavy(p1), pointHeavy(p2)], lineHeavy(p0, p4), 4) &&
						pointOnLine(pointHeavy(p3), lineHeavy(p0, p4), 8) &&
						distanceHeavy(p0, p4) < 300
					)
				) {
					let c1L = findIntersection([pointLight(p0), pointLight(p1), pointLight(p4), pointLight(p5)]);
					let c1H = findIntersection([pointHeavy(p0), pointHeavy(p1), pointHeavy(p4), pointHeavy(p5)]);
					newContour[p4I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					let indices = [p1I, p2I, p3I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup flare serif segment start.
			// HOVERIMAGE - [img "diagrams/flare-start.svg"]

			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 4);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b4H = bearingHeavy(p4, p5);
				// let kinds4 = false
				let kinds4 = p0.kind === 0 && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && (p5.kind === 1 || p5.kind === 0);
				// let kinds4 = (p0.kind === 2 || p0.kind === 0) &&
				if (
					(
						// false &&
						kinds4 &&
						angle(b1L, b2L).isBetween(-89, -70) &&
						angle(b1L, b4L).isBetween(-95, -85) &&
						turn(b2L, b4L).isBetween(0, 30) &&
						pointOnLine(pointLight(p3), lineLight(p2, p6), 12) &&
						pointOnLine([pointLight(p4), pointLight(p5)], lineLight(p2, p6), 12) &&
						distanceLight(p2, p5) < 200 &&
						angle(b0L, b1L).isBetween(-95, -70)
						// angle(b0L, b1L) + angle(b1L, b2L).isBetween(-179,-160)
					) &&
					(
						kinds4 &&
						angle(b1H, b2H).isBetween(-89, -70) &&
						angle(b1H, b4H).isBetween(-95, -85) &&
						turn(b2L, b4L).isBetween(0, 30) &&
						pointOnLine(pointHeavy(p3), lineHeavy(p2, p6), 12) &&
						pointOnLine([pointHeavy(p4), pointHeavy(p5)], lineHeavy(p2, p6), 12) &&
						distanceHeavy(p2, p5) < 300 &&
						angle(b0H, b1H).isBetween(-95, -70)
						// angle(b0H, b1H) + angle(b1H, b2H).isBetween(-179,-160)
					)
				) {
					let c2L = findIntersection([pointLight(p1), pointLight(p2), pointLight(p5), pointLight(p6)]);
					let c2H = findIntersection([pointHeavy(p1), pointHeavy(p2), pointHeavy(p5), pointHeavy(p6)]);
					if (distanceLight(p1, c2L) < 60 && distanceHeavy(p1, c2H) < 200) {
						newContour[p2I] = {
							x: makeVariance(c2L.x, c2H.x),
							y: makeVariance(c2L.y, c2H.y),
							kind: 0,
						};
						let indices = [p3I, p4I, p5I];
						for (const idx of indices) {
							if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
						}
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup degenerate curve control points.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = circularIndex(newContour, idxP1 - 1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 5);
				let p7I = circularIndex(newContour, idxP1 + 6);
				let p8I = circularIndex(newContour, idxP1 + 7);
				let p9I = circularIndex(newContour, idxP1 + 8);
				let p10I = circularIndex(newContour, idxP1 + 9);
				let p11I = circularIndex(newContour, idxP1 + 10);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let p7 = newContour[p7I];
				let p8 = newContour[p8I];
				let p9 = newContour[p9I];
				let p10 = newContour[p10I];
				let p11 = newContour[p11I];
				let b1L = bearingLight(p1, p2);
				let b3L = bearingLight(p3, p4);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				let b6H = bearingHeavy(p6, p7);
				let b7H = bearingHeavy(p7, p8);
				let b10rH = bearingHeavy(p10, p9);
				let b11rH = bearingHeavy(p11, p10);
				let corner1Angle = angle(b3H, b4H);
				let corner2Angle = angle(b6H, b7H);
				let combinedAngle = corner1Angle + corner2Angle;
				let p1p2Distance = distanceHeavy(p1, p2);
				let p1p4Distance = distanceHeavy(p1, p4);
				let p4p7DistanceH = distanceHeavy(p4, p7);
				let hookHeight = originHeavy(p7.y) - originHeavy(p10.y);
				let jHook = (b1H.isBetween(140, 165) && b3H.isBetween(165, 185));
				let jHookAfter = (b4H.isBetween(140, 165) && b6H.isBetween(165, 185));
				let upRightHook = (
					hookHeight > 10 &&
					(b0H.isBetween(85, 132) || b0H.isBetween(8, 14)) &&
					(b1H.isBetween(85, 132) || b1H.isBetween(8, 14)) &&
					(b10rH.isBetween(85, 125) || b10rH.isBetween(0, 6)) &&
					(b11rH.isBetween(62, 125) || b11rH.isBetween(0, 6)) &&
					p1p2Distance.isBetween(25, 200) && (b3H.isBetween(0, 15) || b3H.isBetween(358, 360)) && corner1Angle.isBetween(-145, -85) && corner2Angle.isBetween(-75, -23) && combinedAngle.isBetween(-170, -142) && p4p7DistanceH.isBetween(60, 160) && p1p4Distance.isBetween(80, 330));
				if (upRightHook) {
					idxP1 = idxP1 + 11;
					continue;
				}
				if (jHookAfter) {
					idxP1 = idxP1 + 8;
					continue;
				}
				let distL = distanceLight(p1, p4);
				let distH = distanceHeavy(p1, p4);
				let toleranceL = distL * 0.022;
				let toleranceH = distH * 0.03;
				if (
					p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && !jHook &&
					(
						(
							distL < 280 && distH < 280 && (turn(b1L, b3L).isBetween(-5, 5) || turn(b1H, b3H).isBetween(-5, 5)) &&
							pointOnLine([pointLight(p2), pointLight(p3)], lineLight(p1, p4), toleranceL) &&
							pointOnLine([pointHeavy(p2), pointHeavy(p3)], lineHeavy(p1, p4), toleranceH)
						) || (
							pointOnLine([pointLight(p2), pointLight(p3)], lineLight(p1, p4), 2) &&
							pointOnLine([pointHeavy(p2), pointHeavy(p3)], lineHeavy(p1, p4), 3)
						)
						//  || (
						// 	(pointOnLine(pointLight(p2), lineLight(p1, p4), 1) || pointOnLine(pointHeavy(p2), lineHeavy(p1, p4), 1)) &&
						// 	(pointOnLine(pointLight(p3), lineLight(p1, p4), 1) || pointOnLine(pointHeavy(p3), lineHeavy(p1, p4), 1))
						// )
					)
				) {
					let indices = [p2I, p3I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup collinear corner points.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				if (
					p1.kind === 0 && p2.kind === 0 && p3.kind === 0 &&
					distanceLight(p1, p2) > 10 && distanceLight(p2, p3) > 10 &&
					distanceHeavy(p1, p2) > 10 && distanceHeavy(p2, p3) > 10 &&
					// pointOnLine(pointLight(p2), lineLight(p1, p3), 7) && 
					// pointOnLine(pointHeavy(p2), lineHeavy(p1, p3), 8)
					turn(b1L, b2L).isBetween(-5, 3.5) &&
					turn(b1H, b2H).isBetween(-7, 5)
				) {
					if (!redundantPoints.includes(p2I)) redundantPoints.push(p2I);
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup degenerate curve control points again resulting from corner cleanup.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = circularIndex(newContour, idxP1 - 1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 5);
				let p7I = circularIndex(newContour, idxP1 + 6);
				let p8I = circularIndex(newContour, idxP1 + 7);
				let p9I = circularIndex(newContour, idxP1 + 8);
				let p10I = circularIndex(newContour, idxP1 + 9);
				let p11I = circularIndex(newContour, idxP1 + 10);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let p7 = newContour[p7I];
				let p8 = newContour[p8I];
				let p9 = newContour[p9I];
				let p10 = newContour[p10I];
				let p11 = newContour[p11I];
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				let b6H = bearingHeavy(p6, p7);
				let b7H = bearingHeavy(p7, p8);
				let b10rH = bearingHeavy(p10, p9);
				let b11rH = bearingHeavy(p11, p10);
				let corner1Angle = angle(b3H, b4H);
				let corner2Angle = angle(b6H, b7H);
				let combinedAngle = corner1Angle + corner2Angle;
				let p1p2Distance = distanceHeavy(p1, p2);
				let p1p4Distance = distanceHeavy(p1, p4);
				let p4p7DistanceH = distanceHeavy(p4, p7);
				let hookHeight = originHeavy(p7.y) - originHeavy(p10.y);
				let jHookAfter = (b4H.isBetween(140, 165) && b6H.isBetween(165, 185));
				let upRightHook = (
					hookHeight > 10 &&
					(b0H.isBetween(85, 132) || b0H.isBetween(8, 14)) &&
					(b1H.isBetween(85, 132) || b1H.isBetween(8, 14)) &&
					(b10rH.isBetween(85, 125) || b10rH.isBetween(0, 6)) &&
					(b11rH.isBetween(62, 125) || b11rH.isBetween(0, 6)) &&
					p1p2Distance.isBetween(25, 200) && (b3H.isBetween(0, 15) || b3H.isBetween(358, 360)) && corner1Angle.isBetween(-145, -85) && corner2Angle.isBetween(-75, -23) && combinedAngle.isBetween(-170, -142) && p4p7DistanceH.isBetween(60, 160) && p1p4Distance.isBetween(80, 330));
				if (jHookAfter) {
					idxP1 = idxP1 + 8;
					continue;
				}
				if (upRightHook) {
					idxP1 = idxP1 + 11;
					continue;
				}
				let kinds = p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0;
				if (
					kinds &&
					(pointOnLine([pointLight(p2), pointLight(p3)], lineLight(p1, p4), 1)) &&
					(pointOnLine([pointHeavy(p2), pointHeavy(p3)], lineHeavy(p1, p4), 2))
				) {
					let indices = [p2I, p3I];
					for (const idx of indices) {
						if (redundantPoints.includes(idx) === false) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup tapered endcaps.
			// HOVERIMAGE - [img "diagrams/tapered-endcap.svg"]
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = circularIndex(newContour, idxP1);
				let p1I = nextNode(newContour, p0I);
				let p2I = nextNode(newContour, p1I);
				let p3I = nextNode(newContour, p2I);
				let p4I = nextNode(newContour, p3I);
				let p5I = nextNode(newContour, p4I);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				if (
					// false &&
					p1.kind === 0 && p2.kind === 0 && p3.kind === 0 && p4.kind === 0 &&
					distanceLight(p1, p2).isBetween(5, 200) &&
					distanceLight(p3, p4).isBetween(5, 200) &&
					distanceHeavy(p1, p2).isBetween(5, 200) &&
					distanceHeavy(p3, p4).isBetween(5, 200) &&
					approxEq(distanceLight(p2, p3), params.strokeWidth.light, 20) &&
					approxEq(distanceHeavy(p2, p3), params.strokeWidth.heavy, 48) &&
					turn(b0L, b1L).isBetween(-2, 30) &&
					turn(b0H, b1H).isBetween(0, 30) &&
					angle(b1L, b2L).isBetween(-95, -70) &&
					angle(b2L, b3L).isBetween(-95, -70) &&
					angle(b1L, b2L) + angle(b2L, b3L).isBetween(-182, -100) &&
					angle(b1H, b2H).isBetween(-95, -70) &&
					angle(b2H, b3H).isBetween(-95, -70) &&
					angle(b1H, b2H) + angle(b2H, b3H).isBetween(-182, -100) &&
					turn(b3L, b4L).isBetween(0, 30) &&
					turn(b3H, b4H).isBetween(0, 30)
				) {
					let c1L = closestPointOnLine(pointLight(p1), lineLight(p2, p3));
					let c1H = closestPointOnLine(pointHeavy(p1), lineHeavy(p2, p3));
					let c2L = closestPointOnLine(pointLight(p4), lineLight(p2, p3));
					let c2H = closestPointOnLine(pointHeavy(p4), lineHeavy(p2, p3));
					newContour[p2I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					newContour[p3I] = {
						x: makeVariance(c2L.x, c2H.x),
						y: makeVariance(c2L.y, c2H.y),
						kind: 0,
					};
					let indices = [p1I, p4I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// NOTE - cleanup tapered segment end.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = circularIndex(newContour, idxP1 - 1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				if (
					(p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 0 && p3.kind === 0 &&
					distanceLight(p1, p2).isBetween(5, 200) &&
					distanceHeavy(p1, p2).isBetween(5, 200) &&
					approxEq(distanceLight(p2, p3), params.strokeWidth.light, 20) &&
					approxEq(distanceHeavy(p2, p3), params.strokeWidth.heavy, 48) &&
					turn(b0L, b1L).isBetween(-2, 30) &&
					turn(b0H, b1H).isBetween(-3, 30) &&
					angle(b1L, b2L).isBetween(-89, -75) &&
					angle(b0L, b2L).isBetween(-95, -80) &&
					angle(b1H, b2H).isBetween(-89, -75) &&
					angle(b0H, b2H).isBetween(-95, -80)
				) {
					let c1L = closestPointOnLine(pointLight(p1), lineLight(p2, p3));
					let c1H = closestPointOnLine(pointHeavy(p1), lineHeavy(p2, p3));
					newContour[p2I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					let indices = [p1I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a, b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
			}

			if (newContour[0].kind === 1) {
				newContour.unshift(newContour.pop());
			}

			if (newContour[0].kind === 2) {
				newContour.unshift(newContour.pop());
				newContour.unshift(newContour.pop());
			}

			if (circularArray(newContour, -1).kind !== 0) newContour = [...newContour, newContour[0]];

			glyph.geometry.contours.push(newContour);
		}

	}

	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete: '\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });

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
	for (const glyph of font.glyphs.items) {
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

		if (references.nunitoGlyphs.includes(name) && glyph?.geometry?.contours) {
			// glyph.geometry.contours = [];
			// let newContours = nunito[name].contours;
			// for (let contour of newContours) {
			// 	let pointsArray = [];
			// 	for (let point of contour) {
			// 		pointsArray.push(Ot.Glyph.Point.create(
			// 			makeVariance(point.x[0], point.x[1]),
			// 			makeVariance(point.y[0], point.y[1]),
			// 			point.kind
			// 		));
			// 	}
			// 	glyph.geometry.contours.push(pointsArray);
			// }
			// glyph.horizontal.start = makeVariance(nunito[name].horizontal.start[0], nunito[name].horizontal.start[1]);
			// glyph.horizontal.end = makeVariance(nunito[name].horizontal.end[0], nunito[name].horizontal.end[1]);

			progressTick(name);
			continue;
		}
		progressTick(name);
		// checkSingleGlyph(glyph);
		if (!references.preProcessSkip.includes(name)) checkSingleGlyph(glyph);
		// if (name === "uni2ECE") checkSingleGlyph(glyph);
		// if (!references.extendSkip.includes(name)) checkSingleGlyph(glyph);
		count++;
		// if (count % 1000 == 0) console.log("preExtension:", count, "glyphs processed.");
	}
	// let engJson = `${__dirname}/../engGlyphs.json`;
	// let engData = JSON.stringify(engGlyphs, null, "\t");
	// fs.writeFileSync(engJson, engData, { flush: true });
	// delete references.skipRedundantPoints;
}

module.exports = {
	preProcess
};
