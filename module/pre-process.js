"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Ot } = require("ot-builder");
const geometric = require("geometric");
const Bezier = require("./bezier.js");
const ProgressBar = require('./node-progress');
const { angle, approximateBezier, base60, bearing, closestPointOnLine, findIntersection, horizontalSlope, isBetween, midpoint, pointOnLine, pointToLineDistance, roundTo, turn, verticalSlope } = require("./util");
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

function preProcess(font, references, limit) {
	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);

	function makeVariance(valueDefault, valueWghtMax) {
		let valueLight = roundTo(valueDefault);
		let valueHeavy = roundTo(valueWghtMax - valueDefault);
		return valueFactory.create(valueLight, [[masterWghtMax, valueHeavy]]);
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
	
	function line2GeoJsonLight(p1, p2) {
		let lineObj = lineLight(p1, p2);
		return [[lineObj.p1.x, lineObj.p1.y], [lineObj.p2.x, lineObj.p2.y]];
	}
	
	function line2GeoJsonHeavy(p1, p2) {
		let lineObj = lineHeavy(p1, p2);
		return [[lineObj.p1.x, lineObj.p1.y], [lineObj.p2.x, lineObj.p2.y]];
	}
	
	function intersectLight(p1, p2, p3, p4) {
		return findIntersection([pointLight(p1), pointLight(p2), pointLight(p3), pointLight(p4)]);
	}
	
	function intersectHeavy(p1, p2, p3, p4) {
		return findIntersection([pointHeavy(p1), pointHeavy(p2), pointHeavy(p3), pointHeavy(p4)]);
	}

	function bezierLight(p1, c1, c2, p2) {
		return new Bezier(pointLight(p1), pointLight(c1), pointLight(c2), pointLight(p2));
	}

	function bezierHeavy(p1, c1, c2, p2) {
		return new Bezier(pointHeavy(p1), pointHeavy(c1), pointHeavy(c2), pointHeavy(p2));
	}

	function bezierGeoJson(p1, c1, c2, p2) {
		return new Bezier(p1[0], p1[1], c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
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
				let curve = approximateBezier(p1, cp1, cp2, p2, 5);
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
				let curve = approximateBezier(p1, cp1, cp2, p2, 5);
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
	
	function extendLineGeoJson(start, end, distance) {
		// let slope = slope(line);
		let x1 = start[0];
		let y1 = start[1];
		let x2 = end[0];
		let y2 = end[1];
		let alpha = Math.atan2(y2 - y1, x2 - x1);
		return [ x2 + distance * Math.cos(alpha), y2 + distance * Math.sin(alpha) ]
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
	
	function angleLight(p1, p2, p3) {
		let bearingLight1 = bearingLight(p1, p2);
		let bearingLight2 = bearingLight(p2, p3);
		return angle(bearingLight1, bearingLight2);
	}
	
	function angleHeavy(p1, p2, p3) {
		let bearingHeavy1 = bearingHeavy(p1, p2);
		let bearingHeavy2 = bearingHeavy(p2, p3);
		return angle(bearingHeavy1, bearingHeavy2);
	}
	
	function canBeStrokeEnd(p1, p2, p3, p4) {
		let cornerPoints = p2.kind === 0 && p3.kind === 0;
		let strokeWidthLight = approxEq(distanceLight(p2, p3), params.strokeWidth.light, 20);
		let strokeWidthHeavy = distanceHeavy(p2, p3).isBetween(strokeWidthLight, params.strokeWidth.heavy + 46);
		let bearingLight1 = bearingLight(p1, p2);
		let bearingLight2 = bearingLight(p2, p3);
		let bearingLight3 = bearingLight(p3, p4);
		let anglesLight = angle(bearingLight1, bearingLight2) + angle(bearingLight2, bearingLight3);
		let trapezoidalLight = anglesLight > -244 && anglesLight < -157;
		let bearingHeavy1 = bearingHeavy(p1, p2);
		let bearingHeavy2 = bearingHeavy(p2, p3);
		let bearingHeavy3 = bearingHeavy(p3, p4);
		let anglesHeavy = angle(bearingHeavy1, bearingHeavy2) + angle(bearingHeavy2, bearingHeavy3);
		let trapezoidalHeavy = anglesHeavy > -209 && anglesHeavy < -157;
		return (cornerPoints && strokeWidthLight && strokeWidthHeavy && trapezoidalLight && trapezoidalHeavy);
	}
	
	function strokeEndAnglesLight(p1, p2, p3, p4) {
		let bearingLight1 = bearingLight(p1, p2);
		let bearingLight2 = bearingLight(p2, p3);
		let bearingLight3 = bearingLight(p3, p4);
		let angleLight1 = angle(bearingLight1, bearingLight2);
		let angleLight2 = angle(bearingLight2, bearingLight3);
		return ([angleLight1, angleLight2]);
	}
	
	function strokeEndAnglesHeavy(p1, p2, p3, p4) {
		let bearingHeavy1 = bearingHeavy(p1, p2);
		let bearingHeavy2 = bearingHeavy(p2, p3);
		let bearingHeavy3 = bearingHeavy(p3, p4);
		let angleHeavy1 = angle(bearingHeavy1, bearingHeavy2);
		let angleHeavy2 = angle(bearingHeavy2, bearingHeavy3);
		return ([angleHeavy1, angleHeavy2]);
	}
	function strokeEndAnglesGeo(p1, p2, p3, p4, abs = false) {
		let bearing1 = bearing({p1: { x: p1[0], y: p1[1]}, p2: { x: p2[0], y: p2[1]} });
		let bearing2 = bearing({p1: { x: p2[0], y: p2[1]}, p2: { x: p3[0], y: p3[1]} });
		let bearing3 = bearing({p1: { x: p3[0], y: p3[1]}, p2: { x: p4[0], y: p4[1]} });
		let angle1 = abs ? Math.abs(angle(bearing1, bearing2)) : angle(bearing1, bearing2);
		let angle2 = abs ? Math.abs(angle(bearing2, bearing3)) : angle(bearing2, bearing3);
		return ([angle1, angle2]);
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
		return ((b1L >= 42 && b1L <= 135) && (b2L >= 42 && b2L <= 135) && (b1H >= 42 && b1H <= 135) && (b2H >= 42 && b2H <= 135));
	}
	
	function isSquare(p1, p2) {
		let p1L = pointLight(p1);
		let p2L = pointLight(p2);
		let p1H = pointHeavy(p2);
		let p2H = pointHeavy(p2);
		return ((p1L.x === p2L.x && p1H.x === p2H.x) || (p1L.y === p2L.y && p1H.y === p2H.y));
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

		// if (glyph.name === "uni3110") {
		// 	oldContours[2][8] = {
		// 		x: makeVariance(251, 152),
		// 		y: oldContours[2][8].y,
		// 		kind: oldContours[2][8].kind,
		// 	};
		// 	oldContours[2][9] = {
		// 		x: makeVariance(236, 125),
		// 		y: oldContours[2][9].y,
		// 		kind: oldContours[2][9].kind,
		// 	};
		// 	oldContours[1][0] = {
		// 		x: makeVariance(252, 185),
		// 		y: oldContours[1][0].y,
		// 		kind: oldContours[1][0].kind,
		// 	};
		// 	oldContours[2][0] = {
		// 		x: makeVariance(252, 185),
		// 		y: oldContours[2][0].y,
		// 		kind: oldContours[2][0].kind,
		// 	};
		// 	oldContours[2][12] = {
		// 		x: makeVariance(252, 185),
		// 		y: oldContours[2][0].y,
		// 		kind: oldContours[2][0].kind,
		// 	};
		// }

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
		// if (glyph.name === "uni34D7") {
		// 	oldContours[10][6] = {
		// 		x: makeVariance(originLight(oldContours[10][6].x), 540),
		// 		y: makeVariance(originLight(oldContours[10][6].y), 380),
		// 		kind: oldContours[10][6].kind,
		// 	};
		// 	oldContours[10][7] = {
		// 		x: makeVariance(originLight(oldContours[10][7].x), 599),
		// 		y: makeVariance(originLight(oldContours[10][7].y), 424),
		// 		kind: oldContours[10][7].kind,
		// 	};
		// 	oldContours[10][9] = {
		// 		x: makeVariance(originLight(oldContours[10][9].x), 471),
		// 		y: makeVariance(originLight(oldContours[10][9].y), 426),
		// 		kind: oldContours[10][9].kind,
		// 	};
		// 	oldContours[12][6] = {
		// 		x: makeVariance(originLight(oldContours[12][6].x), 666),
		// 		y: makeVariance(originLight(oldContours[12][6].y), 290),
		// 		kind: oldContours[12][6].kind,
		// 	};
		// 	oldContours[12][7] = {
		// 		x: makeVariance(originLight(oldContours[12][7].x), 780),
		// 		y: makeVariance(originLight(oldContours[12][7].y), 356),
		// 		kind: oldContours[12][7].kind,
		// 	};
		// 	oldContours[12][9] = {
		// 		x: makeVariance(originLight(oldContours[12][9].x), 591),
		// 		y: makeVariance(originLight(oldContours[12][9].y), 347),
		// 		kind: oldContours[12][9].kind,
		// 	};
		// }
		//㕘
		if (glyph.name === "uni3558") {
			oldContours[4][3] = {
				x: makeVariance(originLight(oldContours[4][3].x), originHeavy(oldContours[4][3].x) + 1),
				y: makeVariance(originLight(oldContours[4][3].y), originHeavy(oldContours[4][3].y) - 3),
				kind: oldContours[4][3].kind,
			};
			oldContours[4][4] = {
				x: makeVariance(originLight(oldContours[4][4].x), originHeavy(oldContours[4][4].x) + 1),
				y: makeVariance(originLight(oldContours[4][4].y), originHeavy(oldContours[4][4].y) - 3),
				kind: oldContours[4][4].kind,
			};
		}
		//㗀
		if (glyph.name === "uni35C0") {
			oldContours[12][2] = {
				x: makeVariance(originLight(oldContours[12][2].x) + 2, originHeavy(oldContours[12][2].x)),
				y: makeVariance(originLight(oldContours[12][2].y), originHeavy(oldContours[12][2].y)),
				kind: oldContours[12][2].kind,
			};
			oldContours[12][3] = {
				x: makeVariance(originLight(oldContours[12][3].x) + 2, originHeavy(oldContours[12][3].x)),
				y: makeVariance(originLight(oldContours[12][3].y), originHeavy(oldContours[12][3].y)),
				kind: oldContours[12][3].kind,
			};
		}
		//㗠
		if (glyph.name === "uni35E0") {
			oldContours[11][3] = {
				x: makeVariance(originLight(oldContours[11][3].x), originHeavy(oldContours[11][3].x) + 6),
				y: makeVariance(originLight(oldContours[11][3].y), originHeavy(oldContours[11][3].y)),
				kind: oldContours[11][3].kind,
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
		let sharedPoints = [];
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
									(JSON.stringify(p1l) !== JSON.stringify(p2l) && JSON.stringify(p1h) === JSON.stringify(p2h) && distanceLight(p1, p2) < 4) ||
									(distanceLight(p1, p2) <= 2 && distanceHeavy(p1, p2) <= 2)
								) {
									if (JSON.stringify(contour2[p2I]) === JSON.stringify(circularArray(contour2, p2I + 1))) {
										oldContours[idxC2][circularIndex(contour2, idxP2 + 1)] = Ot.Glyph.Point.create(
											makeVariance(p1l.x, p1h.x),
											makeVariance(p1l.y, p1h.y),
											0
										);
									}
									oldContours[idxC2][p2I] = Ot.Glyph.Point.create(
										makeVariance(p1l.x, p1h.x),
										makeVariance(p1l.y, p1h.y),
										0
									);
									sharedPoints.push({idxC1, p1I, idxC2, p2I});
									// matched = true;
									// break;
								}
							}
						}
						// if (matched) break;
					}
				}
				// if (matched) break;
			}
			// contour = [...contour, contour[0]];
			// if (JSON.stringify(contour[0]) !== JSON.stringify(circularArray(contour, -1))) {
			// 	// oldContours[idxC1].push(contour[0]);
			// 	contour.push(contour[0]);
			// }
		}
		// ANCHOR - fix all intersects like ㄥ to align rounded ends
		// HOVERIMAGE - [img "diagrams/eng2.svg"]
		let engHandledContours = [];
		let engNewContours = [];
		let engNewContoursRadii = [];
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
					abs(originLight(pH3.x) - originLight(pH2.x)) <= 2 &&
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
							let pV10I = nextNode(contour2, pV9I);
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
							let pV10 = circularArray(contour2, pV10I);
							if (
								pV3.kind === 2 && pV4.kind === 0 && pV5.kind === 1 && pV6.kind === 2 &&
								originLight(pV3.x) - 2 <= originLight(pV2.x) &&
								originLight(pV3.y) < originLight(pV2.y) &&
								originLight(pV2.x) <= originLight(pV1.x) &&
								originLight(pV2.y) < originLight(pV1.y) &&
								abs(originLight(pH3.x) - originLight(pV7.x)) <= 2 &&
								abs(originLight(pH3.y) - originLight(pV7.y)) <= 2
							) {
								let pVNew1 = pV9;
								let pVNew1I = pV9I;
								let pVNew0 = pV8;
								let pVNew0I = pV8I;
								if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
									pVNew1 = pV10;
									pVNew1I = pV10I;
									pVNew0 = pV9;
									pVNew0I = pV9I;
								}
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
								let horizontalAngleL = bearingLight(pH0, pH1);
								let horizontalAngleH = bearingHeavy(pH0, pH1);
								let vStrokeTopL = distanceLight(pV0, pVn1);
								let vStrokeTopH = distanceHeavy(pV0, pVn1);
								if (contour2.length.isBetween(10, 13)) {
									let vStrokeBottomL = distanceLight(pV4, pV7);
									let vStrokeBottomH = roundTo(distanceHeavy(pV4, pV7));
									let strokeAvgH = Math.min(hStrokeH, vStrokeTopH);
									let vStrokeDeltaH = vStrokeTopH - strokeAvgH;
									contour2[pVNew0I] = Ot.Glyph.Point.create(
										makeVariance(originLight(pVNew0.x), originHeavy(pV0.x) + strokeAvgH),
										makeVariance(originLight(pVNew0.y), originHeavy(pVNew0.y)),
										0
									);
									contour2[pVNew1I] = Ot.Glyph.Point.create(
										makeVariance(originLight(pVNew1.x), originHeavy(pV0.x) + strokeAvgH),
										makeVariance(originLight(pVNew1.y), originHeavy(pVNew1.y)),
										0
									);
									pVNew0 = contour2[pVNew0I];
									pVNew1 = contour2[pVNew1I];
									vStrokeTopH = strokeAvgH;
									let cornerOffsetL = (originLight(pV1.x) - 1) - originLight(pH3.x);
									let cornerOffsetH = (originHeavy(pV1.x) + 1) - originHeavy(pH3.x);

									let pV1L = point2GeoJsonLight(pV1);
									let pV1H = point2GeoJsonHeavy(pV1);
									let pV2L = point2GeoJsonLight(pV2);
									let pV2H = point2GeoJsonHeavy(pV2);
									let pV3L = point2GeoJsonLight(pV3);
									let pV3H = point2GeoJsonHeavy(pV3);
									let pV4L = point2GeoJsonLight(pV4);
									let pV4H = point2GeoJsonHeavy(pV4);
									let pH3L = point2GeoJsonLight(pH3);
									let pH3H = point2GeoJsonHeavy(pH3);
									let pH4L = point2GeoJsonLight(pH4);
									let pH4H = point2GeoJsonHeavy(pH4);
									if (bearingHeavy(pH0, pH1).isBetween(260,270)) {
										contour[pH3I] = Ot.Glyph.Point.create(
											makeVariance(pV1L[0] - 1, pV1H[0] + 1),
											makeVariance(pH3L[1], pH3H[1]),
											contour[pH3I].kind
										);
										contour[pH4I] = Ot.Glyph.Point.create(
											makeVariance(pH4L[0] + cornerOffsetL, pH4H[0] + cornerOffsetH),
											makeVariance(pH4L[1], pH4H[1]),
											contour[pH4I].kind
										);
									}
									if (bearingHeavy(pH0, pH1) < 260) {
										let hCurveL = bezierLight(pH3, pH4, pH5, pH6);
										let hCurveH = bezierHeavy(pH3, pH4, pH5, pH6);
										let vLineL = {p1: {x: pV1L[0], y: 1100}, p2: {x: pV1L[0], y: -250}};
										let vLineH = {p1: {x: pV1H[0], y: 1100}, p2: {x: pV1H[0], y: -250}};
										let cTL = hCurveL.intersects(vLineL);
										// let cTH = hCurveH.intersects(vLineH);
										let intersectL = hCurveL.compute(cTL[0]);
										// let intersectH = hCurveH.compute(cTH[0]);
										let distL = geometric.lineLength([pH3L, [intersectL.x, intersectL.y]]) - 10;
										// let distH = geometric.lineLength([pH3H, [intersectH.x, intersectH.y]]);
										let nH3L = geometric.pointTranslate(pH3L, geometric.lineAngle(line2GeoJsonLight(pH1, pH0)), distL);
										// let nH3H = geometric.pointTranslate(pH3H, geometric.lineAngle(line2GeoJsonHeavy(pH1, pH0)), distH);
										let nH4L = geometric.pointTranslate(pH4L, geometric.lineAngle(line2GeoJsonLight(pH1, pH0)), distL);
										// let nH4H = geometric.pointTranslate(pH4H, geometric.lineAngle(line2GeoJsonHeavy(pH1, pH0)), distH);
										contour[pH3I] = Ot.Glyph.Point.create(
											makeVariance(nH3L[0], pH3H[0]),
											makeVariance(nH3L[1], pH3H[1]),
											contour[pH3I].kind
										);
										contour[pH4I] = Ot.Glyph.Point.create(
											makeVariance(nH4L[0], pH4H[0]),
											makeVariance(nH4L[1], pH4H[1]),
											contour[pH4I].kind
										);
									}
									pH4 = contour[pH4I];
									pH3 = contour[pH3I];
									pH3L = point2GeoJsonLight(pH3);
									pH3H = point2GeoJsonHeavy(pH3);
									// let nV4L = geometric.pointTranslate(pH3L, 115 + (270 - horizontalAngleL), hStrokeL * 1.24);
									// let nV4L = geometric.pointTranslate(pH3L, 115, vStrokeTopL * 1.25);
									let nV4L = geometric.pointTranslate(pH3L, 115, vStrokeTopL);
									let nV4H = geometric.pointTranslate(pH3H, 115, vStrokeTopH);
									// let nV4L = geometric.pointTranslate(pH3L, 115 + (270 - horizontalAngleL), vStrokeTopL);
									// let nV4H = geometric.pointTranslate(pH3H, 115 + (270 - horizontalAngleH), vStrokeTopH);
									contour2[pV4I] = Ot.Glyph.Point.create(
										makeVariance(nV4L[0], nV4H[0]),
										makeVariance(nV4L[1], nV4H[1]),
										contour2[pV4I].kind
									);
									let nV3L = geometric.pointTranslate(nV4L, 20, vStrokeTopL * 0.3);
									let nV3H = geometric.pointTranslate(nV4H, 20, vStrokeTopH * 0.25);
									contour2[pV3I] = Ot.Glyph.Point.create(
										makeVariance(nV3L[0], nV3H[0]),
										makeVariance(nV3L[1], nV3H[1]),
										contour2[pV3I].kind
									);
									if (name === "uni8BBD") console.log(vStrokeTopL);
									if (name === "uni8BBD") console.log(vStrokeTopH);
									if (name === "uni8BBD") console.log(hStrokeL);
									if (name === "uni8BBD") console.log(hStrokeH);
									contour2[pV2I] = Ot.Glyph.Point.create(
										makeVariance(pV1L[0], pV1H[0]),
										makeVariance(nV4L[1] + (hStrokeL * 0.38), nV4H[1] + (hStrokeH * 0.4)),
										contour2[pV2I].kind
									);
									contour2[pV1I] = Ot.Glyph.Point.create(
										makeVariance(pV1L[0], pV1H[0]),
										makeVariance(nV4L[1] + (hStrokeL * 1.62), nV4H[1] + (hStrokeH * 0.76)),
										contour2[pV1I].kind
									);
									pV1 = contour2[pV1I];
									pV2 = contour2[pV2I];
									pV3 = contour2[pV3I];
									pV4 = contour2[pV4I];
									
									
									// if (vStrokeBottomH > hStrokeH * 1) {
									// 	if (pV0.kind === 0 && pV1.kind === 0 && originLight(pV0.x) - originLight(pV1.x) === 0) {
									// 		function decreaseBottomStroke() {
									// 			let strokeDelta = vStrokeBottomH - hStrokeH * 1;
									// 			if (strokeDelta > 1) {
									// 				// let nodes = [pV3I, pV4I, pV5I, pV8I];
									// 				let nodes = [pV1I, pV2I, pV3I, pV4I, pV5I, pV8I];
									// 				if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
									// 					nodes.push(pV9I);
									// 				} 
									// 				for (let iC of nodes) {
									// 					// let iC = circularIndex(contour2, idxP2 + i);
									// 					let pL = pointLight(contour2[iC]);
									// 					let pH = pointHeavy(contour2[iC]);
									// 					contour2[iC] = Ot.Glyph.Point.create(
									// 						makeVariance(pL.x, pH.x),
									// 						makeVariance(pL.y, pH.y - strokeDelta),
									// 						contour2[iC].kind
									// 					);
									// 				}
									// 				pV1 = contour2[pV1I];
									// 				pV2 = contour2[pV2I];
									// 				pV3 = contour2[pV3I];
									// 				pV4 = contour2[pV4I];
									// 				pV5 = contour2[pV5I];
									// 				pV8 = contour2[pV8I];
									// 				pV9 = contour2[pV9I];
									// 				vStrokeBottomH = roundTo(distanceHeavy(pV4, pH3));
									// 				decreaseBottomStroke();
									// 			}
									// 		}
									// 		decreaseBottomStroke();
									// 	}
									// }
									
									
									// let cornerOffsetH = originHeavy(pV1.x) - originHeavy(pH3.x);
									// let pL = pointLight(contour[pH3I]);
									// let pH = pointHeavy(contour[pH3I]);
									// contour[pH3I] = Ot.Glyph.Point.create(
									// 	makeVariance(pL.x, pH.x + cornerOffsetH),
									// 	makeVariance(pL.y, pH.y),
									// 	contour[pH3I].kind
									// );
									// for (let i of [pV3I, pV4I]) {
									// 	let pL = pointLight(contour2[i]);
									// 	let pH = pointHeavy(contour2[i]);
									// 	contour2[i] = Ot.Glyph.Point.create(
									// 		makeVariance(pL.x, pH.x + cornerOffsetH),
									// 		makeVariance(pL.y, pH.y),
									// 		contour2[i].kind
									// 	);
									// }
									// pH3 = contour[pH3I];
									// pV3 = contour2[pV3I];
									// pV4 = contour2[pV4I];
								}
								/*let vStrokeTopH = distanceHeavy(pV0, pVn1);
								let vStrokeBottomL = distanceLight(pV4, pV7);
								let vStrokeBottomH = roundTo(distanceHeavy(pV4, pV7));

								if (vStrokeBottomH > hStrokeH) {
									if (pV0.kind === 0 && pV1.kind === 0 && originLight(pV0.x) - originLight(pV1.x) === 0) {
										function decreaseBottomStroke() {
											let strokeDelta = vStrokeBottomH - hStrokeH;
											if (strokeDelta > 1) {
												let nodes = [pV3I, pV4I, pV5I, pV8I];
												// let nodes = [pV1I, pV2I, pV3I, pV4I, pV5I, pV8I];
												if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
													nodes.push(pV9I);
												} 
												for (let iC of nodes) {
													// let iC = circularIndex(contour2, idxP2 + i);
													let pL = pointLight(contour2[iC]);
													let pH = pointHeavy(contour2[iC]);
													contour2[iC] = Ot.Glyph.Point.create(
														makeVariance(pL.x, pH.x),
														makeVariance(pL.y, pH.y - strokeDelta),
														contour2[iC].kind
													);
												}
												pV1 = contour2[pV1I];
												pV2 = contour2[pV2I];
												pV3 = contour2[pV3I];
												pV4 = contour2[pV4I];
												pV5 = contour2[pV5I];
												pV8 = contour2[pV8I];
												pV9 = contour2[pV9I];
												vStrokeBottomH = roundTo(distanceHeavy(pV4, pV7));
												decreaseBottomStroke();
											}
										}
										decreaseBottomStroke();
									} else {
										let tValMinL = hStrokeL / vStrokeBottomL;
										let tValMinH = hStrokeH / vStrokeBottomH;
										let tValL = 1;
										let tValH = 1;
										let interpolator3L = geometric.lineInterpolate([point2GeoJsonLight(pV7), point2GeoJsonLight(pV3)]);
										let interpolator3H = geometric.lineInterpolate([point2GeoJsonHeavy(pV7), point2GeoJsonHeavy(pV3)]);
										let interpolator4L = geometric.lineInterpolate([point2GeoJsonLight(pV7), point2GeoJsonLight(pV4)]);
										let interpolator4H = geometric.lineInterpolate([point2GeoJsonHeavy(pV7), point2GeoJsonHeavy(pV4)]);
										let pV1L = point2GeoJsonLight(pV1);
										let pV1H = point2GeoJsonHeavy(pV1);
										let pV2L = point2GeoJsonLight(pV2);
										let pV2H = point2GeoJsonHeavy(pV2);
										let pV3L = interpolator3L(tValL);
										let pV3H = interpolator3H(tValH);
										let pV4L = interpolator4L(tValL);
										let pV4H = interpolator4H(tValH);
										let inflectL;
										let inflectH;
										function testL() {
											pV3L = interpolator3L(tValL);
											pV4L = interpolator4L(tValL);
											let curve = new Bezier(pV1L[0],pV1L[1],pV2L[0],pV2L[1],pV3L[0],pV3L[1],pV4L[0],pV4L[1]);
											inflectL = curve.inflections();
										}
										function testH() {
											pV3H = interpolator3H(tValH);
											pV4H = interpolator4H(tValH);
											let curve = new Bezier(pV1H[0],pV1H[1],pV2H[0],pV2H[1],pV3H[0],pV3H[1],pV4H[0],pV4H[1]);
											inflectH = curve.inflections();
										}
										testL();
										while (inflectL.length === 0 && tValL > tValMinL) {
											tValL -= 0.01;
											testL();
										}
										tValL += 0.01;
										testL();
										testH();
										while (inflectH.length === 0 && tValH > tValMinH) {
											tValH -= 0.01;
											testH();
										}
										tValH += 0.01;
										testH();
										contour2[pV4I] = Ot.Glyph.Point.create(
											makeVariance(pV4L[0], pV4H[0]),
											makeVariance(pV4L[1], pV4H[1]),
											0
										);
										contour2[pV3I] = Ot.Glyph.Point.create(
											makeVariance(pV3L[0], pV3H[0]),
											makeVariance(pV3L[1], pV3H[1]),
											2
										);
										pV4 = contour2[pV4I];
										pV3 = contour2[pV3I];
									}*/
								// }
								
								if (contour2.length.isBetween(17,18)) {
									let objIndex = sharedPoints.findIndex((obj) => (obj["idxC1"] === idxC2 && obj["p1I"] === pV0I) || (obj["idxC2"] === idxC2 && obj["p2I"] === pV0I));
									let pV0Intersects = objIndex >= 0;
									let pVn1I = previousNode(contour2, pV0I);
									let pVn2I = previousNode(contour2, pVn1I);
									let pVNew2I = nextNode(contour2, pVNew1I);
									let pVNew3I = nextNode(contour2, pVNew2I);
									let pVn1 = contour2[pVn1I];
									let pVn2 = contour2[pVn2I];
									let pVNew2 = contour2[pVNew2I];
									let pVNew3 = contour2[pVNew3I];
									let angle1_n2L = geometric.lineAngle(line2GeoJsonLight(pV1, pVn2));
									let angle1_n2H = geometric.lineAngle(line2GeoJsonHeavy(pV1, pVn2));
									let angle2_1L = geometric.lineAngle(line2GeoJsonLight(pV2, pV1));
									let angle2_1H = geometric.lineAngle(line2GeoJsonHeavy(pV2, pV1));
									let angle1_0L = geometric.lineAngle(line2GeoJsonLight(pV1, pV0));
									let angle1_0H = geometric.lineAngle(line2GeoJsonHeavy(pV1, pV0));
									let delta1 = angle1_n2L - angle1_n2H;
									let delta1bL = angle2_1L - angle1_0L;
									let delta1bH = angle2_1L - angle1_0H;
									let angleNew0_New3L = geometric.lineAngle(line2GeoJsonLight(pVNew0, pVNew3));
									let angleNew0_New3H = geometric.lineAngle(line2GeoJsonHeavy(pVNew0, pVNew3));
									let delta2 = angleNew0_New3L - angleNew0_New3H;
									let pV2L = point2GeoJsonLight(pV2);
									let pV2H = point2GeoJsonHeavy(pV2);
									let pV1L = point2GeoJsonLight(pV1);
									let pV1H = point2GeoJsonHeavy(pV1);
									let pV0L = point2GeoJsonLight(pV0);
									let pV0H = point2GeoJsonHeavy(pV0);
									let pVn1L = point2GeoJsonLight(pVn1);
									let pVn1H = point2GeoJsonHeavy(pVn1);
									let pVn2L = point2GeoJsonLight(pVn2);
									let pVn2H = point2GeoJsonHeavy(pVn2);
									let pVNew0L = point2GeoJsonLight(pVNew0);
									let pVNew0H = point2GeoJsonHeavy(pVNew0);
									let pVNew1L = point2GeoJsonLight(pVNew1);
									let pVNew1H = point2GeoJsonHeavy(pVNew1);
									let pVNew2L = point2GeoJsonLight(pVNew2);
									let pVNew2H = point2GeoJsonHeavy(pVNew2);
									let pVNew3L = point2GeoJsonLight(pVNew3);
									let pVNew3H = point2GeoJsonHeavy(pVNew3);
									let nV2H = geometric.pointTranslate(pV1H, angle2_1L - 180, distanceHeavy(pV2, pV1));
									let nV0L = geometric.pointRotate(pV0L, delta1bL, pV1L);
									let nV0H = geometric.pointRotate(pV0H, delta1bH, pV1H);
									let nVn1H;
									let nVn2H;
									let nVNew0H;
									let nVNew1H;
									let nVNew2H;
									let nVNew3H;
									if (pV0Intersects) {
										nVn1H = pVn1H
										nVn2H = pVn2H
										nVNew0H = geometric.pointRotate(pVNew0H, delta2, pVNew3H);
										nVNew1H = geometric.pointRotate(pVNew1H, delta2, pVNew3H);
										nVNew2H = geometric.pointRotate(pVNew2H, delta2, pVNew3H);
										nVNew3H = pVNew3H;
									} else {
										nVn1H = geometric.pointRotate(pVn1H, delta1, pV1H);
										nVn2H = geometric.pointRotate(pVn2H, delta1, pV1H);
										nVNew0H = pVNew0H;
										nVNew1H = geometric.pointRotate(pVNew1H, delta2, pVNew0H);
										nVNew2H = geometric.pointRotate(pVNew2H, delta2, pVNew0H);
										nVNew3H = geometric.pointRotate(pVNew3H, delta2, pVNew0H);
									}
									
									
									
									
									contour2[pV2I] = Ot.Glyph.Point.create(
										makeVariance(pV2L[0], nV2H[0]),
										makeVariance(pV2L[1], nV2H[1]),
										1
									);
									pV2 = contour2[pV2I]
									contour2[pV0I] = Ot.Glyph.Point.create(
										makeVariance(nV0L[0], nV0H[0]),
										makeVariance(nV0L[1], nV0H[1]),
										2
									);
									pV0 = contour2[pV0I]
									contour2[pVn1I] = Ot.Glyph.Point.create(
										makeVariance(pVn1L[0], nVn1H[0]),
										makeVariance(pVn1L[1], nVn1H[1]),
										1
									);
									pVn1 = contour2[pVn1I]
									contour2[pVn2I] = Ot.Glyph.Point.create(
										makeVariance(pVn2L[0], nVn2H[0]),
										makeVariance(pVn2L[1], nVn2H[1]),
										0
									);
									pVn2 = contour2[pVn2I]
									contour2[pVNew0I] = Ot.Glyph.Point.create(
										makeVariance(pVNew0L[0], nVNew0H[0]),
										makeVariance(pVNew0L[1], nVNew0H[1]),
										0
									);
									pVNew0 = contour2[pVNew0I]
									contour2[pVNew1I] = Ot.Glyph.Point.create(
										makeVariance(pVNew1L[0], nVNew1H[0]),
										makeVariance(pVNew1L[1], nVNew1H[1]),
										1
									);
									pVNew1 = contour2[pVNew1I]
									contour2[pVNew2I] = Ot.Glyph.Point.create(
										makeVariance(pVNew2L[0], nVNew2H[0]),
										makeVariance(pVNew2L[1], nVNew2H[1]),
										2
									);
									pVNew2 = contour2[pVNew2I]
									contour2[pVNew3I] = Ot.Glyph.Point.create(
										makeVariance(pVNew3L[0], nVNew3H[0]),
										makeVariance(pVNew3L[1], nVNew3H[1]),
										0
									);
									pVNew3 = contour2[pVNew3I]
								}
								
								if (contour2.length.isBetween(17,20)) {
									let angle2_1L = geometric.lineAngle(line2GeoJsonLight(pV2, pV1));
									let angle2_1H = geometric.lineAngle(line2GeoJsonHeavy(pV2, pV1));
									let pV1L = point2GeoJsonLight(pV1);
									let pV1H = point2GeoJsonHeavy(pV1);
									let pV3L = point2GeoJsonLight(pV3);
									let pV3H = point2GeoJsonHeavy(pV3);
									let pV4L = point2GeoJsonLight(pV4);
									let pV4H = point2GeoJsonHeavy(pV4);
									let pH3L = point2GeoJsonLight(pH3);
									let pH3H = point2GeoJsonHeavy(pH3);
									let pH4L = point2GeoJsonLight(pH4);
									let pH4H = point2GeoJsonHeavy(pH4);
									let nV0L = geometric.pointTranslate(pV1L, angle2_1L, distanceLight(pV0, pV1));
									let nV0H = geometric.pointTranslate(pV1H, angle2_1H, distanceHeavy(pV0, pV1));
									let nV3H = geometric.pointTranslate(pV3H, angle2_1L - 180, 5);
									// let nV4H = geometric.pointTranslate(pV4H, angle2_1L - 180, 20);
									let nV4H = geometric.pointTranslate(pV4H, geometric.lineAngle(line2GeoJsonHeavy(pV4, pH3)) - 70, 20);
									let nH3H = geometric.pointTranslate(pH3H, geometric.lineAngle(line2GeoJsonHeavy(pV4, pH3)) - 70, 40);
									let nH4H = geometric.pointTranslate(pH4H, angle2_1L - 180, 5);
									contour[pH3I] = Ot.Glyph.Point.create(
										makeVariance(pH3L[0], nH3H[0]),
										makeVariance(pH3L[1], nH3H[1]),
										contour[pH3I].kind
									);
									pH3 = contour[pH3I];
									contour[pH4I] = Ot.Glyph.Point.create(
										makeVariance(pH4L[0], nH4H[0]),
										makeVariance(pH4L[1], nH4H[1]),
										contour[pH4I].kind
									);
									pH4 = contour[pH4I];
									contour2[pV4I] = Ot.Glyph.Point.create(
										makeVariance(pV4L[0], nV4H[0]),
										makeVariance(pV4L[1], nV4H[1]),
										contour2[pV4I].kind
									);
									pV4 = contour2[pV4I];
									contour2[pV3I] = Ot.Glyph.Point.create(
										makeVariance(pV3L[0], nV3H[0]),
										makeVariance(pV3L[1], nV3H[1]),
										contour2[pV3I].kind
									);
									pV3 = contour2[pV3I];
									contour2[pV0I] = Ot.Glyph.Point.create(
										makeVariance(nV0L[0], nV0H[0]),
										makeVariance(nV0L[1], nV0H[1]),
										contour2[pV0I].kind
									);
									pV0 = contour2[pV0I]
								}
								
								let angle7_4L = geometric.lineAngle(line2GeoJsonLight(pH3, pV4));
								let angle7_4H = geometric.lineAngle(line2GeoJsonHeavy(pV7, pV4));
								let angle0_1L = geometric.lineAngle(line2GeoJsonLight(pV0, pV1));
								let angle0_1H = geometric.lineAngle(line2GeoJsonHeavy(pV0, pV1));
								let angle1_2L = geometric.lineAngle(line2GeoJsonLight(pV1, pV2));
								let angle1_2H = geometric.lineAngle(line2GeoJsonHeavy(pV1, pV2));
								let length7_4L = geometric.lineLength(line2GeoJsonLight(pV7, pV4));
								let length7_4H = geometric.lineLength(line2GeoJsonHeavy(pH3, pV4));
								let length1_4H = geometric.lineLength(line2GeoJsonHeavy(pV1, pV4));
								let angle4_1L = geometric.lineAngle(line2GeoJsonLight(pV4, pV1));
								let angle4_1H = geometric.lineAngle(line2GeoJsonHeavy(pV4, pV1));
								let angle4_3L = geometric.lineAngle(line2GeoJsonLight(pV4, pV3));
								let angle4_3H = geometric.lineAngle(line2GeoJsonHeavy(pV4, pV3));
								let length4_3L = geometric.lineLength(line2GeoJsonLight(pV4, pV3));
								let length4_3H = geometric.lineLength(line2GeoJsonHeavy(pV4, pV3));
								let p4l = geometric.pointTranslate(point2GeoJsonLight(pH3), angle7_4H, length7_4L);
								let p4h = point2GeoJsonHeavy(pV4);
								let p3l = geometric.pointTranslate(p4l, angle4_3H, length4_3L);
								let p3h = point2GeoJsonHeavy(pV3);
								// 
								// 
								// let p4l = point2GeoJsonLight(pV4);
								// let p4h = geometric.pointTranslate(point2GeoJsonHeavy(pV7), angle7_4L, length7_4H);
								// let p3l = point2GeoJsonLight(pV3);
								// let p3h = geometric.pointTranslate(p4h, angle4_3L, length4_3H);
/* 								if (horizontalAngleH > 260) {
								contour2[pV4I] = Ot.Glyph.Point.create(
									makeVariance(p4l[0], p4h[0]),
									makeVariance(p4l[1], p4h[1]),
									0
								);
								contour2[pV3I] = Ot.Glyph.Point.create(
									makeVariance(p3l[0], p3h[0]),
									makeVariance(p3l[1], p3h[1]),
									2
								);
								pV4 = contour2[pV4I];
								pV3 = contour2[pV3I];
								} */
								
								
								/* if (length1_4H < length7_4H * 0.6) {
									let distance = (length7_4H * 0.6) - length1_4H;
									let pV0L = point2GeoJsonLight(pV0);
									let pV0H = point2GeoJsonHeavy(pV0);
									let pV1L = point2GeoJsonLight(pV1);
									let pV1H = point2GeoJsonHeavy(pV1);
									let pV2L = point2GeoJsonLight(pV2);
									let pV2H = point2GeoJsonHeavy(pV2);
									let angle2_1H = geometric.lineAngle(line2GeoJsonHeavy(pV2, pV1));
									let nV2H = geometric.pointTranslate(pV2H, angle2_1H, distance);
									let nV1H = geometric.pointTranslate(pV1H, angle2_1H, distance);
									contour2[pV2I] = Ot.Glyph.Point.create(
										makeVariance(pV2L[0], nV2H[0]),
										makeVariance(pV2L[1], nV2H[1]),
										1
									);
									contour2[pV1I] = Ot.Glyph.Point.create(
										makeVariance(pV1L[0], nV1H[0]),
										makeVariance(pV1L[1], nV1H[1]),
										0
									);
									pV2 = contour2[pV2I];
									pV1 = contour2[pV1I];
									if (pV0.kind === 2) {
										let nV0H = geometric.pointTranslate(pV0H, angle2_1H, distance);
										contour2[pV0I] = Ot.Glyph.Point.create(
											makeVariance(pV0L[0], nV0H[0]),
											makeVariance(pV0L[1], nV0H[1]),
											2
										);
										pV0 = contour2[pV0I];
									}
								} */
								//---------------------------------------------------------------------------------------------
								if (name === "uni8BBD") console.log(contour2);
								let testPolyL = [contour2GeoJsonLight(contour2)];
								let testPolyH = [contour2GeoJsonHeavy(contour2)];
								let testOffsetL = 0;
								let testOffsetH = 0;
								let pH0L = point2GeoJsonLight(pH0);
								let pH0H = point2GeoJsonHeavy(pH0);
								let pH1L = extendLineGeoJson(pH0L, point2GeoJsonLight(pH1), testOffsetL);
								let pH1H = extendLineGeoJson(pH0H, point2GeoJsonHeavy(pH1), testOffsetH);
								let insideH1L = inside(pH1L, testPolyL);
								let insideH1H = inside(pH1H, testPolyH);
								let intersectH1L = geometric.lineIntersectsPolygon([pH0L, pH1L], testPolyL[0]);
								let intersectH1H = geometric.lineIntersectsPolygon([pH0H, pH1H], testPolyH[0]);
								let distHL;
								let distHH;
								function testL() {
									pH1L = extendLineGeoJson(pH0L, point2GeoJsonLight(pH1), testOffsetL);
									insideH1L = inside(pH1L, testPolyL);
									intersectH1L = geometric.lineIntersectsPolygon([pH0L, pH1L], testPolyL[0]);
									if (pVNew1.kind === 1) {
										let curve = bezierLight(pVNew0, pVNew1, contour2[pVNew1I + 1], contour2[pVNew1I + 2]);
										let project = curve.project({x: pH1L[0], y: pH1L[1]});
										distHL = project.d;
									} else {
										distHL = pointToLineDistance({x: pH1L[0], y: pH1L[1]}, pointLight(pVNew1), pointLight(pVNew0));
									}
								}
								function testH() {
									pH1H = extendLineGeoJson(pH0H, point2GeoJsonHeavy(pH1), testOffsetH);
									insideH1H = inside(pH1H, testPolyH);
									intersectH1H = geometric.lineIntersectsPolygon([pH0H, pH1H], testPolyH[0]);
									if (pVNew1.kind === 1) {
										let curve = bezierHeavy(pVNew0, pVNew1, contour2[pVNew1I + 1], contour2[pVNew1I + 2]);
										let project = curve.project({x: pH1H[0], y: pH1H[1]});
										distHH = project.d;
									} else {
										distHH = pointToLineDistance({x: pH1H[0], y: pH1H[1]}, pointHeavy(pVNew1), pointHeavy(pVNew0));
									}
								}
								testL();
								if (insideH1L !== true) {
									while (insideH1L !== true) {
										if (intersectH1L) {
											testOffsetL -= 5;
										} else {
											testOffsetL += 5;	
										}
										testL();
									}
								}
								testH();
								if (insideH1H !== true) {
									while (insideH1H !== true) {
										if (intersectH1H) {
											testOffsetH -= 5;
										} else {
											testOffsetH += 5;	
										}
										testH();
									}
								}
								if (distHL < 15) {
									while (distHL < 15) {
										testOffsetL += 1;
										testL();
									}
								}
								if (distHH < 60) {
									while (distHH < 30) {
										testOffsetH += 1;
										testH();
									}
								}
								contour[pH1I] = Ot.Glyph.Point.create(
									makeVariance(pH1L[0], pH1H[0]),
									makeVariance(pH1L[1], pH1H[1]),
									0
								);
								pH1 = contour[pH1I];
								//---------------------------------------------------------------

								let testHPolyL = [contour2GeoJsonLight(contour)];
								let testHPolyH = [contour2GeoJsonHeavy(contour)];
								let pV8OffsetL = 0;
								let pV8OffsetH = 0;
								let pV9L = point2GeoJsonLight(pVNew1);
								let pV9H = point2GeoJsonHeavy(pVNew1);
								let pV8L = extendLineGeoJson(pV9L, point2GeoJsonLight(pVNew0), pV8OffsetL);
								let pV8H = extendLineGeoJson(pV9H, point2GeoJsonHeavy(pVNew0), pV8OffsetH);
								let insideV8L = inside(pV8L, testHPolyL);
								let insideV8H = inside(pV8H, testHPolyH);
								let intersectV8L = geometric.lineIntersectsPolygon([pV8L, pV9L], testHPolyL[0]);
								let intersectV8H = geometric.lineIntersectsPolygon([pV8H, pV9H], testHPolyH[0]);
								let distVL = pointToLineDistance({x: pV8L[0], y: pV8L[1]}, pointLight(pH0), pointLight(pH1));
								let distVH = pointToLineDistance({x: pV8H[0], y: pV8H[1]}, pointHeavy(pH0), pointHeavy(pH1));
								function testV8L() {
									pV8L = extendLineGeoJson(pV9L, point2GeoJsonLight(pVNew0), pV8OffsetL);
									insideV8L = inside(pV8L, testHPolyL);
									intersectV8L = geometric.lineIntersectsPolygon([pV8L, pV9L], testHPolyL[0]);
									distVL = pointToLineDistance({x: pV8L[0], y: pV8L[1]}, pointLight(pH0), pointLight(pH1));
								}
								function testV8H() {
									pV8H = extendLineGeoJson(pV9H, point2GeoJsonHeavy(pVNew0), pV8OffsetH);
									insideV8H = inside(pV8H, testHPolyH);
									intersectV8H = geometric.lineIntersectsPolygon([pV8H, pV9H], testHPolyH[0]);
									distVH = pointToLineDistance({x: pV8H[0], y: pV8H[1]}, pointHeavy(pH0), pointHeavy(pH1));
								}
								
								if (insideV8L !== true) {
									while (insideV8L !== true) {
										if (intersectV8L) {
											pV8OffsetL -= 5;
										} else {
											pV8OffsetL += 5;	
										}
										testV8L();
									}
								}
								if (insideV8H !== true) {
									while (insideV8H !== true) {
										if (intersectV8H) {
											pV8OffsetH -= 5;
										} else {
											pV8OffsetH += 5;	
										}
										testV8H();
									}
								}
								if (distVL < 15) {
									while (distVL < 15) {
										pV8OffsetL += 1;
										testV8L();
									}
								}
								if (distVH < 60) {
									while (distVH < 30) {
										pV8OffsetH += 1;
										testV8H();
									}
								}
								if (pVNew0I === pV8I) {
									contour2[pVNew0I] = Ot.Glyph.Point.create(
										makeVariance(pV8L[0], pV8H[0]),
										makeVariance(pV8L[1], pV8H[1]),
										0
									);
									pV8 = contour2[pVNew0I];
									pVNew0 = contour2[pVNew0I];
								} else {
									contour2[pVNew0I] = Ot.Glyph.Point.create(
										makeVariance(pV8L[0], pV8H[0]),
										makeVariance(pV8L[1], pV8H[1]),
										0
									);
									pV9 = contour2[pVNew0I];
									pVNew0 = contour2[pVNew0I];
								}
								//---------------------------------------------------------------
								
								
								/* let pV4pV7DistanceL = distanceLight(pV4, pV7);
								let pV4pV7DistanceH = distanceHeavy(pV4, pV7);
								let pV4pV7AngleL = geometric.lineAngle([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let v4L = point2GeoJsonLight(pV4);
								let v4H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								let v7L = point2GeoJsonLight(pV7);
								let v7H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								contour2[pV4I] = {
									x: makeVariance(v4L[0], v4H[0]),
									y: makeVariance(v4L[1], v4H[1]),
									kind: 0,
								};
								contour2[pV7I] = {
									x: makeVariance(v7L[0], v7H[0]),
									y: makeVariance(v7L[1], v7H[1]),
									kind: 0,
								};
								pV4 = contour2[pV4I];
								pV7 = contour2[pV7I]; */
								
								
								// contour[pH2I] = {
								// 	x: pV4.x,
								// 	y: pV4.y,
								// 	kind: pH2.kind,
								// };

								// if (pH3I === 0) {
								// 	contour.push(contour[0]);
								// }
								// if (JSON.stringify(contour[pH3I]) === JSON.stringify(circularArray(contour, pH3I + 1))) {
								// 	contour[circularIndex(contour, pH3I + 1)] = {
								// 		x: contour[pH3I].x,
								// 		y: contour[pH3I].y,
								// 		kind: contour[circularIndex(contour, pH3I + 1)].kind,
								// 	};
								// }
								if (JSON.stringify(contour2[pV7I]) === JSON.stringify(circularArray(contour2, pV7I + 1))) {
									contour2[circularIndex(contour2, pV7I + 1)] = Ot.Glyph.Point.create(
										contour[pH3I].x,
										contour[pH3I].y,
										contour2[circularIndex(contour2, pV7I + 1)].kind
									);
								}
								contour2[pV7I] = Ot.Glyph.Point.create(
									contour[pH3I].x,
									contour[pH3I].y,
									contour2[pV7I].kind
								);
								pV7 = contour2[pV7I];
								
								let newContour = [];
								let innerCornerSeg = 0;
								let c2StartI = pVNew0I;
								let c2Start = pVNew0;
								let prevPoint;
								// if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
								// 	c2StartI = pV9I;
								// 	c2Start = pV9;
								// } 
								for (let i = 0; i < contour.length; i++) {
									let idx = circularIndex(contour, pH3I + i);
									let pointStr = JSON.stringify(contour[idx]);
									if (pointStr === prevPoint) {
										continue;
									}
									newContour.push(contour[idx]);
									prevPoint = pointStr;
									if (i > 0 && contour[idx].kind === 0) {
										innerCornerSeg++
									}
									if (idx === pH1I) {
										break;
									}
								}
								let iP1L = geometric.pointTranslate(point2GeoJsonLight(pH1), geometric.lineAngle(line2GeoJsonLight(pH1, c2Start)) - 60, 1);
								let iP1H = geometric.pointTranslate(point2GeoJsonHeavy(pH1), geometric.lineAngle(line2GeoJsonHeavy(pH1, c2Start)) - 60, 2);
								let iP2L = geometric.pointTranslate(point2GeoJsonLight(c2Start), geometric.lineAngle(line2GeoJsonLight(pH1, c2Start)) - 120, 1);
								let iP2H = geometric.pointTranslate(point2GeoJsonHeavy(c2Start), geometric.lineAngle(line2GeoJsonHeavy(pH1, c2Start)) - 120, 2);

								let iP1 = Ot.Glyph.Point.create(
									makeVariance(iP1L[0], iP1H[0]),
									makeVariance(iP1L[1], iP1H[1]),
									0
								);
								let iP2 = Ot.Glyph.Point.create(
									makeVariance(iP2L[0], iP2H[0]),
									makeVariance(iP2L[1], iP2H[1]),
									0
								);
								newContour.push(iP1, iP2);
								for (let i = 0; i < contour2.length; i++) {
									let idx = circularIndex(contour2, c2StartI + i);
									let pointStr = JSON.stringify(contour2[idx]);
									if (pointStr === prevPoint) {
										continue;
									}
									newContour.push(contour2[idx]);
									prevPoint = pointStr;
									if (idx === pV4I) {
										break;
									}
								}
								newContour.push(contour2[pV7I]);

								let dL = distanceLight(pV4, pH3) / 2;
								let dH = distanceHeavy(pV4, pH3) / 2;
								engNewContoursRadii.push([dL, dH]);
								
								
								
								
								/*
								if (name === "uni3110") {
									console.log(contour2);
								}
								//NOTE - store points to delete before modifying array.
								let deleteNodes = [];
								let pVd1I = circularIndex(contour2, pV8I - 2);
								let pVd2I = circularIndex(contour2, pV8I - 1);
								if (contour2[pVd1I].kind === 1 && contour2[pVd2I].kind === 2) {
									deleteNodes.push(JSON.stringify(contour2[pVd1I]));
									deleteNodes.push(JSON.stringify(contour2[pVd2I]));
								}
								deleteNodes.push(JSON.stringify(contour2[pV5I]));
								deleteNodes.push(JSON.stringify(contour2[pV6I]));
								*/
								
								
								// let pVd1 = JSON.stringify(contour2[pVd1I]);
								// let pVd2 = JSON.stringify(contour2[pVd2I]);
								
								/*
								let testPolyL = [contour2GeoJsonLight(contour)];
								let testPolyH = [contour2GeoJsonHeavy(contour)];
								let testStart, testEnd;
								let testOffsetL = 1;
								let testOffsetH = 1;
								let extraCorner = false;
								if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
									testStart = pV10;
									testEnd = pV9;
									extraCorner = true;
								} else {
									testStart = pV9;
									testEnd = pV8;
								}
								let sL = point2GeoJsonLight(testStart);
								let eL = point2GeoJsonLight(testEnd);
								let sH = point2GeoJsonHeavy(testStart);
								let eH = point2GeoJsonHeavy(testEnd);
								// let nL = extendLineGeoJson(sL, eL, testOffsetL);
								// let nH = extendLineGeoJson(sH, eH, testOffsetH);
								let nL = [eL[0], eL[1] - testOffsetL];
								let nH = [eH[0], eH[1] - testOffsetH];
								let tL, tH;
								function testL() {
									// nL = extendLineGeoJson(sL, eL, testOffsetL);
									nL = [eL[0], eL[1] - testOffsetL];
									tL = inside(nL, testPolyL);
								}
								function testH() {
									// nH = extendLineGeoJson(sH, eH, testOffsetH);
									nH = [eH[0], eH[1] - testOffsetH];
									tH = inside(nH, testPolyH);
								}
								testL();
								while (tL) {
									testOffsetL++;
									testL();
								}
								testOffsetL--;
								testL();
								testH();
								while (tH) {
									testOffsetH++;
									testH();
								}
								testOffsetH--;
								testH();
								
								let nV8 = Ot.Glyph.Point.create(
									makeVariance(nL[0], nH[0]),
									makeVariance(nL[1], nH[1]),
									0
								);
								
								if (extraCorner) {
									contour2[pV8I] = nV8;
								} else {
									contour2.splice(pV8I, 0, nV8);
								}
								*/
								
								
								/*
								let iHL = intersectLight(pH3, pH4, pH6, pH5);
								let iHH = intersectHeavy(pH3, pH4, pH6, pH5);
								let iVL = intersectLight(pV1, pV2, pV4, pV3);
								let iVH = intersectHeavy(pV1, pV2, pV4, pV3);
								
								let newH = Ot.Glyph.Point.create(
									makeVariance(iHL.x, iHH.x),
									makeVariance(iHL.y, iHH.y),
									0
								);
								let newV = Ot.Glyph.Point.create(
									makeVariance(iVL.x, iVH.x),
									makeVariance(iVL.y, iVH.y),
									0
								);
								contour[pH4I] = newH;
								contour[pH5I] = newH;
								contour2[pV2I] = newV;
								contour2[pV3I] = newV;
								*/
								
								/*
								let pV4pV7DistanceL = distanceLight(pV4, pV7);
								let pV4pV7DistanceH = distanceHeavy(pV4, pV7);
								let pV4pV7AngleL = geometric.lineAngle([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let v4L = geometric.pointTranslate(point2GeoJsonLight(pV4), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.13);
								let v4H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								let v7L = geometric.pointTranslate(point2GeoJsonLight(pV7), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.13);
								let v7H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								contour2[pV4I] = {
									x: makeVariance(v4L[0], v4H[0]),
									y: makeVariance(v4L[1], v4H[1]),
									kind: 0,
								};
								contour2[pV7I] = {
									x: makeVariance(v7L[0], v7H[0]),
									y: makeVariance(v7L[1], v7H[1]),
									kind: 0,
								};
								contour[pH2I] = {
									x: makeVariance(v4L[0], v4H[0]),
									y: makeVariance(v4L[1], v4H[1]),
									kind: 0,
								};
								contour[pH3I] = {
									x: makeVariance(v7L[0], v7H[0]),
									y: makeVariance(v7L[1], v7H[1]),
									kind: 0,
								};
								*/
								
								
								/*
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
								*/
								
								
								
								/*
								let bottomCorner = Ot.Glyph.Point.create(
									makeVariance(originLight(pV4.x), originHeavy(pV4.x)),
									makeVariance(originLight(pV7.y), originHeavy(pV7.y)),
									0
								);
								contour2.splice(pV6I, 0, bottomCorner);
								contour.splice(pH2I + 1, 0, bottomCorner);

								let spliceIdx = [];
								for (let i = 0; i < contour2.length; i++) {
									let pStr = JSON.stringify(contour2[i]);
									if (deleteNodes.includes(pStr)) {
										spliceIdx.push(i);
									}
									// if (spliceIdx.length === 4) break;
								}
								if (spliceIdx.length) {
									spliceIdx.sort((a, b) => b - a);
									for (const i of spliceIdx) {
										contour2.splice(i, 1);
									}
								}
								*/
								
								
								// contour.splice(pH5I, 1);
								// if (name in references.skipRedundantPoints === false) {
								// 	references.skipRedundantPoints[name] = [];
								// }
								// references.skipRedundantPoints[name].push(idxC2);
								// if (name in references.extendUpContourIdx === false) {
								// 	references.extendUpContourIdx[name] = [];
								// }
								// if (!references.extendUpContourIdx[name].includes(idxC2)) {
								// 	references.extendUpContourIdx[name].push(idxC2);
								// }
								glyph.geometry.contours[idxC1] = [...contour];
								glyph.geometry.contours[idxC2] = [...contour2];
								engHandledContours.push(idxC1, idxC2);
								engNewContours.push({newContour, innerCornerSeg});
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
			// if (!engHandledContours.includes(idxC1)) {
			// 	glyph.geometry.contours.push(contour);
			// }
		}
		if (engNewContours.length) {
			engHandledContours.sort((a, b) => b - a);
			for (const i of engHandledContours) {
				glyph.geometry.contours.splice(i, 1);
			}
			for (let i = 0; i < engNewContours.length; i++) {
				let newIdx = glyph.geometry.contours.length;
				let innerCornerSeg = engNewContours[i].innerCornerSeg;
				glyph.geometry.contours.push(engNewContours[i].newContour);
				setCustomRadius(name, newIdx, engNewContoursRadii[i][0], engNewContoursRadii[i][1], true, true);
				/*	if (name in references.skipRoundingContourSeg === false) {
					references.skipRoundingContourSeg[name] = [];
				}
				let refArray = references.skipRoundingContourSeg[name];
				let objIndex = refArray.findIndex((obj) => obj["contourIdx"] === newIdx);
				if (objIndex === -1) {
					refArray.push({ contourIdx: newIdx, segments: [innerCornerSeg, innerCornerSeg + 1, innerCornerSeg + 2] });
				} else {
					let ref = refArray[objIndex];
					if (!ref.segments.includes(innerCornerSeg)) {
						ref.segments.push(innerCornerSeg);
					}
					if (!ref.segments.includes(innerCornerSeg + 1)) {
						ref.segments.push(innerCornerSeg + 1);
					}
					if (!ref.segments.includes(innerCornerSeg + 2)) {
						ref.segments.push(innerCornerSeg + 2);
					}
				} */
				// if (name in references.skipRedundantPoints === false) {
				// 	references.skipRedundantPoints[name] = [];
				// }
				// references.skipRedundantPoints[name].push(newIdx);
				// if (name in references.extendUpContourIdx === false) {
				// 	references.extendUpContourIdx[name] = [];
				// }
				// if (!references.extendUpContourIdx[name].includes(newIdx)) {
				// 	references.extendUpContourIdx[name].push(newIdx);
				// }
				// if (name in references.extendRightContourIdx === false) {
				// 	references.extendRightContourIdx[name] = [];
				// }
				// if (!references.extendRightContourIdx[name].includes(newIdx)) {
				// 	references.extendRightContourIdx[name].push(newIdx);
				// }
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
								console.log('left-falling-4', name);
								// extended = true;
								// break;
							}
						}

						if (matched) {
							if (name in references.extendLeftContourIdx === false) {
								references.extendLeftContourIdx[name] = [];
							}
							references.extendLeftContourIdx[name].push(idxC1);
							// if (name in references.extendIgnoreContourIdx === false) {
							// 	references.extendIgnoreContourIdx[name] = [];
							// }
							// references.extendIgnoreContourIdx[name].push(idxC2);
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
		let upwardRightHooks = [];
		let downwardJHooks = [];

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
							(b10rH.isBetween(85, 125) || b10rH.isBetween(0, 24) || b10rH.isBetween(358, 360)) &&
							(b11rH.isBetween(62, 125) || b11rH.isBetween(0, 24) || b11rH.isBetween(358, 360)) &&
							// b10rH.isBetween(85, 125) &&
							// b11rH.isBetween(62, 125) &&
							p1p2Distance.isBetween(10, 200) &&
							(b3H.isBetween(0, 25) || b3H.isBetween(358, 360)) &&
							corner1Angle.isBetween(-145, -85) &&
							corner2Angle.isBetween(-82, -23) &&
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
								newContour[p8I] = {
									x: makeVariance(originLight(newContour[p8I].x), originHeavy(newContour[p8I].x)),
									y: makeVariance(originLight(newContour[p8I].y) - 1, originHeavy(newContour[p8I].y) - 1),
									kind: newContour[p8I].kind,
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
							if (name in references.skipRedundantPoints === false) {
								references.skipRedundantPoints[name] = [];
							}
							if (!references.skipRedundantPoints[name].includes(idxC1)) {
								references.skipRedundantPoints[name].push(idxC1);
							}
							if (!upwardRightHooks.includes(idxC1)) {
								upwardRightHooks.push(idxC1);
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
					let pDI = circularIndex(newContour, idxP - 4);
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
					let pD = newContour[pDI];
					let pC = newContour[pCI];
					let pB = newContour[pBI];
					let pA = newContour[pAI];
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
						if (strokeDelta > 0 && newContour.length.isBetween(12,32)) {
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
							pD = newContour[pDI];
							pC = newContour[pCI];
							pB = newContour[pBI];
							pA = newContour[pAI];
							p0 = newContour[p0I];
							p1 = newContour[p1I];
							p2 = newContour[p2I];
							p3 = newContour[p3I];
							p4 = newContour[p4I];
						}
						if (strokeDelta < 0 && newContour.length.isBetween(18,19)) {
							for (let i = -4; i <= 4; i++) {
								let iC = circularIndex(newContour, idxP + i);
								let pL = pointLight(newContour[iC]);
								let pH = pointHeavy(newContour[iC]);
								newContour[iC] = {
									x: makeVariance(pL.x, pH.x - strokeDelta),
									y: makeVariance(pL.y, pH.y),
									kind: newContour[iC].kind,
								};
							}
						}
						if (strokeDelta < 0 && newContour.length.isBetween(26,27)) {
							for (let i = -7; i <= 4; i++) {
								let iC = circularIndex(newContour, idxP + i);
								let pL = pointLight(newContour[iC]);
								let pH = pointHeavy(newContour[iC]);
								newContour[iC] = {
									x: makeVariance(pL.x, pH.x - strokeDelta),
									y: makeVariance(pL.y, pH.y),
									kind: newContour[iC].kind,
								};
							}
						}
						pD = newContour[pDI];
						pC = newContour[pCI];
						pB = newContour[pBI];
						pA = newContour[pAI];
						p0 = newContour[p0I];
						p1 = newContour[p1I];
						p2 = newContour[p2I];
						p3 = newContour[p3I];
						p4 = newContour[p4I];
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
						// if (!references.skipRedundantPoints[name].includes(idxC1)) {
						// 	references.skipRedundantPoints[name].push(idxC1);
						// }
						if (!downwardJHooks.includes(idxC1)) {
							downwardJHooks.push(idxC1);
						}
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
			skipContours = [...references.skipRedundantPoints[name]];
		}

		// ANCHOR - build geoJson polygons of glyph for testing points
		let polyGlyphLight = [];
		let polyGlyphHeavy = [];
		function buildPolyGlyph(oldContours) {
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
	}
		buildPolyGlyph(oldContours);
		// ANCHOR - clean up hidden bezier stroke ends
		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				continue;
			}
			let splicePoints = [];
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
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
					// for (const [idxC2, contour2] of oldContours.entries()) {
						// if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
						let polygonLight = polyGlyphLight[idxC1];
						let polygonHeavy = polyGlyphHeavy[idxC1];
						let score = 0;
						// if (inside(point2GeoJsonLight(p2), polygonLight) !== false) score++
						if (inside(point2GeoJsonLight(p3), polygonLight) !== false) score++
						if (inside(point2GeoJsonLight(p4), polygonLight) !== false) score++
						// if (inside(point2GeoJsonLight(p5), polygonLight) !== false) score++
						// if (inside(point2GeoJsonHeavy(p2), polygonHeavy) !== false) score++
						if (inside(point2GeoJsonHeavy(p3), polygonHeavy) !== false) score++
						if (inside(point2GeoJsonHeavy(p4), polygonHeavy) !== false) score++
						// if (inside(point2GeoJsonHeavy(p5), polygonHeavy) !== false) score++
						if (score >= 3) {
							if (!splicePoints.includes(p3I)) splicePoints.push(p3I);
							if (!splicePoints.includes(p4I)) splicePoints.push(p4I);
						}
					// }
				}
				if (canBeStrokeEnd(p1, p2, p4, p5) && p3.kind === 0) {
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
						let polygonLight = polyGlyphLight[idxC2];
						let polygonHeavy = polyGlyphHeavy[idxC2];
						let score = 0;
						if (inside(point2GeoJsonLight(p2), polygonLight) === true) score++
						if (inside(point2GeoJsonLight(p3), polygonLight) === true) score++
						if (inside(point2GeoJsonLight(p4), polygonLight) === true) score++
						// if (inside(point2GeoJsonLight(p5), polygonLight) !== false) score++
						if (inside(point2GeoJsonHeavy(p2), polygonHeavy) === true) score++
						if (inside(point2GeoJsonHeavy(p3), polygonHeavy) === true) score++
						if (inside(point2GeoJsonHeavy(p4), polygonHeavy) === true) score++
						// if (inside(point2GeoJsonHeavy(p5), polygonHeavy) !== false) score++
						if (score === 6 && !splicePoints.includes(p3I)) {
							splicePoints.push(p3I);
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
		
		//NOTE - re-index shared points
		sharedPoints = [];
		for (let idxC1 = 0; idxC1 < oldContours.length; idxC1++) {
			let contour = oldContours[idxC1];
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				let p1I = circularIndex(contour, idxP1);
				let p1 = circularArray(contour, p1I);
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
									(JSON.stringify(p1l) !== JSON.stringify(p2l) && JSON.stringify(p1h) === JSON.stringify(p2h) && distanceLight(p1, p2) < 4) ||
									(distanceLight(p1, p2) <= 2 && distanceHeavy(p1, p2) <= 2)
								) {
									sharedPoints.push({idxC1, p1I, idxC2, p2I});
								}
							}
						}
					}
				}
			}
		}
		
		for (let idxC1 = 0; idxC1 < oldContours.length; idxC1++) {
			let contour = oldContours[idxC1];
			// if (!contour.length.isBetween(4,5) || skipContours.includes(idxC1)) {
			// if (skipContours.includes(idxC1)) {
			// 	continue;
			// }
			for (let idxP1 = 0; idxP1 <= contour.length; idxP1++) {
				const p0I = circularIndex(contour, idxP1);
				const p1I = nextNode(contour, p0I);
				const p2I = nextNode(contour, p1I);
				const p3I = nextNode(contour, p2I);
				let p0 = circularArray(contour, p0I);
				let p1 = circularArray(contour, p1I);
				let p2 = circularArray(contour, p2I);
				let p3 = circularArray(contour, p3I);
				let modified = false;
				if (
					// canBeStrokeEnd(p3, p0, p1, p2) &&
					canBeStrokeEnd(p0, p1, p2, p3) &&
					// canBeStrokeEnd(p1, p2, p3, p0) &&
					isSquare(p1, p2)
					//  && isSquare(p2, p3)
				) {
					let p0L = point2GeoJsonLight(p0);
					let p1L = point2GeoJsonLight(p1);
					let p2L = point2GeoJsonLight(p2);
					let p3L = point2GeoJsonLight(p3);
					let p0H = point2GeoJsonHeavy(p0);
					let p1H = point2GeoJsonHeavy(p1);
					let p2H = point2GeoJsonHeavy(p2);
					let p3H = point2GeoJsonHeavy(p3);
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
						let polygonLight = polyGlyphLight[idxC2];
						let polygonHeavy = polyGlyphHeavy[idxC2];
						let i1L = inside(p1L, polygonLight);
						let i2L = inside(p2L, polygonLight);
						let i1H = inside(p1H, polygonHeavy);
						let i2H = inside(p2H, polygonHeavy);
						if (i1L === true && i1H === true) {
							if (i2L === 0 && i2H !== 0) {
								let idxP2 = polygonLight[0].findIndex((point) => point[1] === p2L[1]);
								if (idxP2 >= 0) {
									let yH = polygonHeavy[0][idxP2][1];
									p2H[1] = yH;
									p3H[1] = yH;
									modified = true;
								}
							}
							if (i2L !== 0 && i2H === 0) {
								let idxP2 = polygonHeavy[0].findIndex((point) => point[1] === p2H[1]);
								if (idxP2 >= 0) {
									let yL = polygonLight[0][idxP2][1];
									p2L[1] = yL;
									p3L[1] = yL;
									modified = true;
								}
							}
						}
						if (i2L === true && i2H === true) {
							if (i1L === 0 && i1H !== 0) {
								let idxP2 = polygonLight[0].findIndex((point) => point[1] === p1L[1]);
								if (idxP2 >= 0) {
									let yH = polygonHeavy[0][idxP2][1];
									p0H[1] = yH;
									p1H[1] = yH;
									modified = true;
								}
							}
							if (i1L !== 0 && i1H === 0) {
								let idxP2 = polygonHeavy[0].findIndex((point) => point[1] === p1H[1]);
								if (idxP2 >= 0) {
									let yL = polygonLight[0][idxP2][1];
									p0L[1] = yL;
									p1L[1] = yL;
									modified = true;
								}
							}
						}
						if (i1L === false && i1H === false) {
							if (i2L === 0 && i2H !== 0) {
								let idxP2 = polygonLight[0].findIndex((point) => point[1] === p2L[1]);
								if (idxP2 >= 0) {
									let yH = polygonHeavy[0][idxP2][1];
									p1H[1] = yH;
									p2H[1] = yH;
									modified = true;
								}
							}
							if (i2L !== 0 && i2H === 0) {
								let idxP2 = polygonHeavy[0].findIndex((point) => point[1] === p2H[1]);
								if (idxP2 >= 0) {
									let yL = polygonLight[0][idxP2][1];
									p1L[1] = yL;
									p2L[1] = yL;
									modified = true;
								}
							}
						}
						if (modified) {
							oldContours[idxC1][p0I] = Ot.Glyph.Point.create(
								makeVariance(p0L[0], p0H[0]),
								makeVariance(p0L[1], p0H[1]),
								oldContours[idxC1][p0I].kind
							);
							oldContours[idxC1][p1I] = Ot.Glyph.Point.create(
								makeVariance(p1L[0], p1H[0]),
								makeVariance(p1L[1], p1H[1]),
								oldContours[idxC1][p1I].kind
							);
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L[0], p2H[0]),
								makeVariance(p2L[1], p2H[1]),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L[0], p3H[0]),
								makeVariance(p3L[1], p3H[1]),
								oldContours[idxC1][p3I].kind
							);
							buildPolyGlyph(oldContours);
						}
						// if (inside(p1L, polygonLight) === 0 || inside(p1H, polygonHeavy) === 0) edge1 = true;
						// if (inside(p2L, polygonLight) === 0 || inside(p2H, polygonHeavy) === 0) edge2 = true;
						// if (inside(p5L, polygonLight) === 0 || inside(p5H, polygonHeavy) === 0) edge5 = true;
						// if (inside(p6L, polygonLight) === 0 || inside(p6H, polygonHeavy) === 0) edge6 = true;
						// if (inside(p1L, polygonLight) !== false && inside(p1H, polygonHeavy) !== false) inside1.push(idxC2);
						// if (inside(p2L, polygonLight) !== false && inside(p2H, polygonHeavy) !== false) inside2.push(idxC2);
						// if (inside(p5L, polygonLight) !== false && inside(p5H, polygonHeavy) !== false) inside5.push(idxC2);
						// if (inside(p6L, polygonLight) !== false && inside(p6H, polygonHeavy) !== false) inside6.push(idxC2);
					}
				}
			}
		}
		buildPolyGlyph(oldContours);
		// ANCHOR - even out mis-matched stroke end lengths
		// HOVERIMAGE - [img "diagrams/mis-matched-stroke-ends.svg"]
		for (let idxC1 = 0; idxC1 < oldContours.length; idxC1++) {
			let contour = oldContours[idxC1];
			if (!contour.length.isBetween(8,9) || skipContours.includes(idxC1)) {
				continue;
			}
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const p0I = circularIndex(contour, idxP1);
				const p1I = nextNode(contour, p0I);
				const p2I = nextNode(contour, p1I);
				const p3I = nextNode(contour, p2I);
				const p4I = nextNode(contour, p3I);
				const p5I = nextNode(contour, p4I);
				const p6I = nextNode(contour, p5I);
				const p7I = nextNode(contour, p6I);
				let p0 = circularArray(contour, p0I);
				let p1 = circularArray(contour, p1I);
				let p2 = circularArray(contour, p2I);
				let p3 = circularArray(contour, p3I);
				let p4 = circularArray(contour, p4I);
				let p5 = circularArray(contour, p5I);
				let p6 = circularArray(contour, p6I);
				let p7 = circularArray(contour, p7I);
				if (
					canBeStrokeEnd(p0, p1, p2, p3) &&
					canBeStrokeEnd(p4, p5, p6, p7) &&
					p0.kind === 2 && p3.kind === 1 &&
					p4.kind === 2 && p7.kind === 1
				) {
					let p0L = point2GeoJsonLight(p0);
					let p1L = point2GeoJsonLight(p1);
					let p2L = point2GeoJsonLight(p2);
					let p3L = point2GeoJsonLight(p3);
					let p4L = point2GeoJsonLight(p4);
					let p5L = point2GeoJsonLight(p5);
					let p6L = point2GeoJsonLight(p6);
					let p7L = point2GeoJsonLight(p7);
					let p0H = point2GeoJsonHeavy(p0);
					let p1H = point2GeoJsonHeavy(p1);
					let p2H = point2GeoJsonHeavy(p2);
					let p3H = point2GeoJsonHeavy(p3);
					let p4H = point2GeoJsonHeavy(p4);
					let p5H = point2GeoJsonHeavy(p5);
					let p6H = point2GeoJsonHeavy(p6);
					let p7H = point2GeoJsonHeavy(p7);
					let curve1L = bezierGeoJson(p1L, p0L, p7L, p6L);
					let curve2L = bezierGeoJson(p2L, p3L, p4L, p5L);
					let curve1H = bezierGeoJson(p1H, p0H, p7H, p6H);
					let curve2H = bezierGeoJson(p2H, p3H, p4H, p5H);
					let curveLength1L = curve1L.length();
					let curveLength2L = curve2L.length();
					let curveLength1H = curve1H.length();
					let curveLength2H = curve2H.length();
					let sideLength1L = geometric.lineLength([p1L, p6L]);
					let sideLength2L = geometric.lineLength([p2L, p5L]);
					let sideLength1H = geometric.lineLength([p1H, p6H]);
					let sideLength2H = geometric.lineLength([p2H, p5H]);

					let endsSquare = (isSquare(p1, p2) || isSquare(p5, p6));
					let curvature1L = sideLength1L / curveLength1L;
					let curvature2L = sideLength2L / curveLength2L;
					let curvature1H = sideLength1H / curveLength1H;
					let curvature2H = sideLength2H / curveLength2H;
					let edge1 = false;
					let edge2 = false;
					let edge5 = false;
					let edge6 = false;
					let inside1 = [];
					let inside2 = [];
					let inside5 = [];
					let inside6 = [];
					let skip12 = false;
					let skip56 = false;
					let objIndex1 = sharedPoints.findIndex((obj) => (obj["idxC1"] === idxC1 && obj["p1I"] === p1I) || (obj["idxC2"] === idxC1 && obj["p2I"] === p1I));
					let objIndex2 = sharedPoints.findIndex((obj) => (obj["idxC1"] === idxC1 && obj["p1I"] === p2I) || (obj["idxC2"] === idxC1 && obj["p2I"] === p2I));
					let objIndex5 = sharedPoints.findIndex((obj) => (obj["idxC1"] === idxC1 && obj["p1I"] === p5I) || (obj["idxC2"] === idxC1 && obj["p2I"] === p5I));
					let objIndex6 = sharedPoints.findIndex((obj) => (obj["idxC1"] === idxC1 && obj["p1I"] === p6I) || (obj["idxC2"] === idxC1 && obj["p2I"] === p6I));
					let fixed1 = objIndex1 >= 0;
					let fixed2 = objIndex2 >= 0;
					let fixed5 = objIndex5 >= 0;
					let fixed6 = objIndex6 >= 0;
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
						let polygonLight = polyGlyphLight[idxC2];
						let polygonHeavy = polyGlyphHeavy[idxC2];
						if (inside(p1L, polygonLight) === 0 || inside(p1H, polygonHeavy) === 0) edge1 = true;
						if (inside(p2L, polygonLight) === 0 || inside(p2H, polygonHeavy) === 0) edge2 = true;
						if (inside(p5L, polygonLight) === 0 || inside(p5H, polygonHeavy) === 0) edge5 = true;
						if (inside(p6L, polygonLight) === 0 || inside(p6H, polygonHeavy) === 0) edge6 = true;
						if (inside(p1L, polygonLight) !== false && inside(p1H, polygonHeavy) !== false) inside1.push(idxC2);
						if (inside(p2L, polygonLight) !== false && inside(p2H, polygonHeavy) !== false) inside2.push(idxC2);
						if (inside(p5L, polygonLight) !== false && inside(p5H, polygonHeavy) !== false) inside5.push(idxC2);
						if (inside(p6L, polygonLight) !== false && inside(p6H, polygonHeavy) !== false) inside6.push(idxC2);
						if (polygonHeavy.length > 1 && inside(p1H, polygonHeavy) ===  true && inside(p2H, polygonHeavy) === true) skip12 = true;
						if (polygonHeavy.length > 1 && inside(p5H, polygonHeavy) ===  true && inside(p6H, polygonHeavy) === true) skip56 = true;
					}
					let midpoint1L = curve1L.get(0.5);
					let midpoint2L = curve2L.get(0.5);
					let midpoint1H = curve1H.get(0.5);
					let midpoint2H = curve2H.get(0.5);
					let sideAngle1L = geometric.lineAngle([p1L, p6L]);
					let sideAngle2L = geometric.lineAngle([p2L, p5L]);
					let sideAngle1H = geometric.lineAngle([p1H, p6H]);
					let sideAngle2H = geometric.lineAngle([p2H, p5H]);
					let sideAngleDelta1 = abs(sideAngle1L - sideAngle1H);
					let sideAngleDelta2 = abs(sideAngle2L - sideAngle2H);
					let sideAngleL = (sideAngle1L + sideAngle2L) / 2;
					let sideAngleH = (sideAngle1H + sideAngle2H) / 2;
					let origin1L, origin2L, origin1H, origin2H;
					if (fixed1 || fixed5) {
						origin1L = p1L;
						origin2L = p5L;
						origin1H = p1H;
						origin2H = p5H;
					} 
					else if (fixed2 || fixed6) {
						origin1L = p6L;
						origin2L = p2L;
						origin1H = p6H;
						origin2H = p2H;
					}
					else {
						origin1L = [midpoint1L.x, midpoint1L.y];
						origin2L = [midpoint2L.x, midpoint2L.y];
						origin1H = [midpoint1H.x, midpoint1H.y];
						origin2H = [midpoint2H.x, midpoint2H.y];
					}

					let endAngles1L = strokeEndAnglesGeo(p0L, p1L, p2L, p3L, true);
					let endAngles2L = strokeEndAnglesGeo(p4L, p5L, p6L, p7L, true);
					let endAngles1H = strokeEndAnglesGeo(p0H, p1H, p2H, p3H, true);
					let endAngles2H = strokeEndAnglesGeo(p4H, p5H, p6H, p7H, true);
					// if (!edge1 && !edge2 && endAngles1H[0].isBetween(-40,-130) && endAngles1H[1].isBetween(-40,-130)) {
					if (!edge1 && !edge2 && !skip12) {
						if (endAngles1L[0] < endAngles1L[1]) {
							let n2L = closestPointOnLine(p1L, [p2L, p3L]);
							let fail = false;
							if (inside2.length > 0) {
								for (const idxC2 of inside2) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonLight = polyGlyphLight[idxC2];
									if (inside(n2L, polygonLight) === false) fail = true;
								}
							// } else {
							// 	for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
							// 		if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
							// 		let polygonLight = polyGlyphLight[idxC2];
							// 		if (inside(n2L, polygonLight) !== false) fail = true;
							// 	}
							}
							if (!fail) {
								p2L = n2L;
							} else {
								p1L = closestPointOnLine(p2L, [p0L, p1L]);
							}
						} else {
							let n1L = closestPointOnLine(p2L, [p0L, p1L]);
							let fail = false;
							if (inside1.length > 0) {
								for (const idxC2 of inside1) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonLight = polyGlyphLight[idxC2];
									if (inside(n1L, polygonLight) === false) fail = true;
								}
							// } else {
							// 	for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
							// 		if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
							// 		let polygonLight = polyGlyphLight[idxC2];
							// 		if (inside(n1L, polygonLight) !== false) fail = true;
							// 	}
							}
							if (!fail) {
								p1L = n1L;
							} else {
								p2L = closestPointOnLine(p1L, [p2L, p3L]);
							}
						}
					}
					// if (!edge5 && !edge6 && endAngles2H[0].isBetween(-40,-130) && endAngles2H[1].isBetween(-40,-130)) {
					if (!edge5 && !edge6 && !skip56) {
						if (endAngles2L[0] < endAngles2L[1]) {
							let n6L = closestPointOnLine(p5L, [p6L, p7L]);
							let fail = false;
							if (inside6.length > 0) {
								for (const idxC2 of inside6) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonLight = polyGlyphLight[idxC2];
									if (inside(n6L, polygonLight) === false) fail = true;
								}
							// } else {
							// 	for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
							// 		if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
							// 		let polygonLight = polyGlyphLight[idxC2];
							// 		if (inside(n6L, polygonLight) !== false) fail = true;
							// 	}
							}
							if (!fail) {
								p6L = n6L;
							} else {
								p5L = closestPointOnLine(p6L, [p4L, p5L]);
							}
						} else {
							let n5L = closestPointOnLine(p6L, [p4L, p5L]);
							let fail = false;
							if (inside5.length > 0) {
								for (const idxC2 of inside5) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonLight = polyGlyphLight[idxC2];
									if (inside(n5L, polygonLight) === false) fail = true;
								}
							// } else {
							// 	for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
							// 		if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
							// 		let polygonLight = polyGlyphLight[idxC2];
							// 		if (inside(n5L, polygonLight) !== false) fail = true;
							// 	}
							}
							if (!fail) {
								p5L = n5L;
							} else {
								p6L = closestPointOnLine(p5L, [p6L, p7L]);
							}
						}
					}
					// if (!edge1 && !edge2 && endAngles1H[0].isBetween(-40,-130) && endAngles1H[1].isBetween(-40,-130)) {
					if (!edge1 && !edge2 && !skip12) {
						if (endAngles1H[0] < endAngles1H[1]) {
							let n2H = closestPointOnLine(p1H, [p2H, p3H]);
							let fail = false;
							if (inside2.length > 0) {
								for (const idxC2 of inside2) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n2H, polygonHeavy) === false) fail = true;
								}
							} else {
								for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n2H, polygonHeavy) !== false) fail = true;
								}
							}
							if (!fail) {
								p2H = n2H;
							} else {
								let n1H = closestPointOnLine(p2H, [p0H, p1H]);
								let m1H = geometric.lineMidpoint([p1H, n1H]);
								p1H = m1H;
								p2H = closestPointOnLine(p1H, [p2H, p3H]);
							}
						} else {
							let n1H = closestPointOnLine(p2H, [p0H, p1H]);
							let fail = false;
							if (inside1.length > 0) {
								for (const idxC2 of inside1) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n1H, polygonHeavy) === false) fail = true;
								}
							} else {
								for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n1H, polygonHeavy) !== false) fail = true;
								}
							}
							if (!fail) {
								p1H = n1H;
							} else {
								let n2H = closestPointOnLine(p1H, [p2H, p3H]);
								let m2H = geometric.lineMidpoint([p2H, n2H]);
								p2H = m2H;
								p1H = closestPointOnLine(p2H, [p0H, p1H]);
							}
						}
					}
					// if (!edge5 && !edge6 && endAngles2H[0].isBetween(-40,-130) && endAngles2H[1].isBetween(-40,-130)) {
					if (!edge5 && !edge6 && !skip56) {
						if (endAngles2H[0] < endAngles2H[1]) {
							let n6H = closestPointOnLine(p5H, [p6H, p7H]);
							let fail = false;
							if (inside6.length > 0) {
								for (const idxC2 of inside6) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n6H, polygonHeavy) === false) fail = true;
								}
							} else {
								for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n6H, polygonHeavy) !== false) fail = true;
								}
							}
							if (!fail) {
								p6H = n6H;
							} else {
								let n5H = closestPointOnLine(p6H, [p4H, p5H]);
								let m5H = geometric.lineMidpoint([p5H, n5H]);
								p5H = m5H;
								p6H = closestPointOnLine(p5H, [p6H, p7H]);
							}
						} else {
							let n5H = closestPointOnLine(p6H, [p4H, p5H]);
							let fail = false;
							if (inside5.length > 0) {
								for (const idxC2 of inside5) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n5H, polygonHeavy) === false) fail = true;
								}
							} else {
								for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
									if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
									let polygonHeavy = polyGlyphHeavy[idxC2];
									if (inside(n5H, polygonHeavy) !== false) fail = true;
								}
							}
							if (!fail) {
								p5H = n5H;
							} else {
								let n6H = closestPointOnLine(p5H, [p6H, p7H]);
								let m6H = geometric.lineMidpoint([p6H, n6H]);
								p6H = m6H;
								p5H = closestPointOnLine(p6H, [p4H, p5H]);
							}
						}
					}
					let endLength1L = geometric.lineLength([p1L, p2L]);
					let endLength2L = geometric.lineLength([p5L, p6L]);
					let endLength1H = geometric.lineLength([p1H, p2H]);
					let endLength2H = geometric.lineLength([p5H, p6H]);
					let strokeL = (endLength1L + endLength2L) / 2;
					let strokeH = (endLength1H + endLength2H) / 2;
					// if (curve1H.length() < 400 && curve2H.length() < 400) {
					if (curvature1H.isBetween(0.978, 1) && curvature2H.isBetween(0.978, 1) && !endsSquare) {
						p1L = geometric.pointRotate(p1L, sideAngleL - sideAngle1L, origin1L);
						p0L = geometric.pointRotate(p0L, sideAngleL - sideAngle1L, origin1L);
						p7L = geometric.pointRotate(p7L, sideAngleL - sideAngle1L, origin1L);
						p6L = geometric.pointRotate(p6L, sideAngleL - sideAngle1L, origin1L);
						
						p2L = geometric.pointRotate(p2L, sideAngleL - sideAngle2L, origin2L);
						p3L = geometric.pointRotate(p3L, sideAngleL - sideAngle2L, origin2L);
						p4L = geometric.pointRotate(p4L, sideAngleL - sideAngle2L, origin2L);
						p5L = geometric.pointRotate(p5L, sideAngleL - sideAngle2L, origin2L);
					}


					

					// if (curve1H.length() < 400 && curve2H.length() < 400) {
					if (curvature1H.isBetween(0.978, 1) && curvature2H.isBetween(0.978, 1) && !endsSquare) {
						p1H = geometric.pointRotate(p1H, sideAngleL - sideAngle1H, origin1H);
						p0H = geometric.pointRotate(p0H, sideAngleL - sideAngle1H, origin1H);
						p7H = geometric.pointRotate(p7H, sideAngleL - sideAngle1H, origin1H);
						p6H = geometric.pointRotate(p6H, sideAngleL - sideAngle1H, origin1H);
						p0H = geometric.pointTranslate(p1H, geometric.lineAngle([p1L, p0L]), geometric.lineLength([p1H, p0H]));
						p7H = geometric.pointTranslate(p6H, geometric.lineAngle([p6L, p7L]), geometric.lineLength([p6H, p7H]));
						p1H = geometric.pointRotate(p1H, sideAngleH - sideAngleL, origin1H);
						p0H = geometric.pointRotate(p0H, sideAngleH - sideAngleL, origin1H);
						p7H = geometric.pointRotate(p7H, sideAngleH - sideAngleL, origin1H);
						p6H = geometric.pointRotate(p6H, sideAngleH - sideAngleL, origin1H);
						
						p2H = geometric.pointRotate(p2H, sideAngleL - sideAngle2H, origin2H);
						p3H = geometric.pointRotate(p3H, sideAngleL - sideAngle2H, origin2H);
						p4H = geometric.pointRotate(p4H, sideAngleL - sideAngle2H, origin2H);
						p5H = geometric.pointRotate(p5H, sideAngleL - sideAngle2H, origin2H);
						p3H = geometric.pointTranslate(p2H, geometric.lineAngle([p2L, p3L]), geometric.lineLength([p2H, p3H]));
						p4H = geometric.pointTranslate(p5H, geometric.lineAngle([p5L, p4L]), geometric.lineLength([p5H, p4H]));
						p2H = geometric.pointRotate(p2H, sideAngleH - sideAngleL, origin2H);
						p3H = geometric.pointRotate(p3H, sideAngleH - sideAngleL, origin2H);
						p4H = geometric.pointRotate(p4H, sideAngleH - sideAngleL, origin2H);
						p5H = geometric.pointRotate(p5H, sideAngleH - sideAngleL, origin2H);
					}
					

					let curStroke1L = geometric.lineLength([p1L, p2L]);
					let curStroke2L = geometric.lineLength([p5L, p6L]);
					let curStroke1H = geometric.lineLength([p1H, p2H]);
					let curStroke2H = geometric.lineLength([p5H, p6H]);
					let adjLength1L = (strokeL - curStroke1L) / 2;
					let adjLength2L = (strokeL - curStroke2L) / 2;
					let adjLength1H = (strokeH - curStroke1H) / 2;
					let adjLength2H = (strokeH - curStroke2H) / 2;
					let adjAngle1L = geometric.lineAngle([p1L, p2L]);
					let adjAngle2L = geometric.lineAngle([p5L, p6L]);
					let adjAngle1H = geometric.lineAngle([p1H, p2H]);
					let adjAngle2H = geometric.lineAngle([p5H, p6H]);
					if (!fixed1 && !fixed2 && !fixed5 && !fixed6) {
						p1H = geometric.pointTranslate(p1H, adjAngle1H - 180, adjLength1H);
						p0H = geometric.pointTranslate(p0H, adjAngle1H - 180, adjLength1H);
						p2H = geometric.pointTranslate(p2H, adjAngle1H, adjLength1H);
						p3H = geometric.pointTranslate(p3H, adjAngle1H, adjLength1H);
						p4H = geometric.pointTranslate(p4H, adjAngle2H - 180, adjLength2H);
						p5H = geometric.pointTranslate(p5H, adjAngle2H - 180, adjLength2H);
						p6H = geometric.pointTranslate(p6H, adjAngle2H, adjLength2H);
						p7H = geometric.pointTranslate(p7H, adjAngle2H, adjLength2H);
						p1L = geometric.pointTranslate(p1L, adjAngle1L - 180, adjLength1L);
						p0L = geometric.pointTranslate(p0L, adjAngle1L - 180, adjLength1L);
						p2L = geometric.pointTranslate(p2L, adjAngle1L, adjLength1L);
						p3L = geometric.pointTranslate(p3L, adjAngle1L, adjLength1L);
						p4L = geometric.pointTranslate(p4L, adjAngle2L - 180, adjLength2L);
						p5L = geometric.pointTranslate(p5L, adjAngle2L - 180, adjLength2L);
						p6L = geometric.pointTranslate(p6L, adjAngle2L, adjLength2L);
						p7L = geometric.pointTranslate(p7L, adjAngle2L, adjLength2L);
					} else if (fixed1 || fixed6) {
						p2H = geometric.pointTranslate(p2H, adjAngle1H, adjLength1H * 2);
						p3H = geometric.pointTranslate(p3H, adjAngle1H, adjLength1H * 2);
						p4H = geometric.pointTranslate(p4H, adjAngle2H - 180, adjLength2H * 2);
						p5H = geometric.pointTranslate(p5H, adjAngle2H - 180, adjLength2H * 2);
						p2L = geometric.pointTranslate(p2L, adjAngle1L, adjLength1L * 2);
						p3L = geometric.pointTranslate(p3L, adjAngle1L, adjLength1L * 2);
						p4L = geometric.pointTranslate(p4L, adjAngle2L - 180, adjLength2L * 2);
						p5L = geometric.pointTranslate(p5L, adjAngle2L - 180, adjLength2L * 2);
					} else if (fixed2 || fixed5) {
						p1H = geometric.pointTranslate(p1H, adjAngle1H - 180, adjLength1H * 2);
						p0H = geometric.pointTranslate(p0H, adjAngle1H - 180, adjLength1H * 2);
						p6H = geometric.pointTranslate(p6H, adjAngle2H, adjLength2H * 2);
						p7H = geometric.pointTranslate(p7H, adjAngle2H, adjLength2H * 2);
						p1L = geometric.pointTranslate(p1L, adjAngle1L - 180, adjLength1L * 2);
						p0L = geometric.pointTranslate(p0L, adjAngle1L - 180, adjLength1L * 2);
						p6L = geometric.pointTranslate(p6L, adjAngle2L, adjLength2L * 2);
						p7L = geometric.pointTranslate(p7L, adjAngle2L, adjLength2L * 2);
					}
					oldContours[idxC1][p0I] = Ot.Glyph.Point.create(
						makeVariance(p0L[0], p0H[0]),
						makeVariance(p0L[1], p0H[1]),
						oldContours[idxC1][p0I].kind
					);
					oldContours[idxC1][p1I] = Ot.Glyph.Point.create(
						makeVariance(p1L[0], p1H[0]),
						makeVariance(p1L[1], p1H[1]),
						oldContours[idxC1][p1I].kind
					);
					oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
						makeVariance(p2L[0], p2H[0]),
						makeVariance(p2L[1], p2H[1]),
						oldContours[idxC1][p2I].kind
					);
					oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
						makeVariance(p3L[0], p3H[0]),
						makeVariance(p3L[1], p3H[1]),
						oldContours[idxC1][p3I].kind
					);
					oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
						makeVariance(p4L[0], p4H[0]),
						makeVariance(p4L[1], p4H[1]),
						oldContours[idxC1][p4I].kind
					);
					oldContours[idxC1][p5I] = Ot.Glyph.Point.create(
						makeVariance(p5L[0], p5H[0]),
						makeVariance(p5L[1], p5H[1]),
						oldContours[idxC1][p5I].kind
					);
					oldContours[idxC1][p6I] = Ot.Glyph.Point.create(
						makeVariance(p6L[0], p6H[0]),
						makeVariance(p6L[1], p6H[1]),
						oldContours[idxC1][p6I].kind
					);
					oldContours[idxC1][p7I] = Ot.Glyph.Point.create(
						makeVariance(p7L[0], p7H[0]),
						makeVariance(p7L[1], p7H[1]),
						oldContours[idxC1][p7I].kind
					);
					let last = oldContours[idxC1].length - 1;
					if ([p0I, p1I, p2I, p3I, p4I, p5I, p6I, p7I].includes(0) === false) {
						
						oldContours[idxC1][0] = Ot.Glyph.Point.create(
							oldContours[idxC1][last].x,
							oldContours[idxC1][last].y,
							oldContours[idxC1][last].kind
						);
					}
					skipContours.push(idxC1);
					break;
				}
			}
		}
		
		// ANCHOR - even out concave stroke end lengths
		for (let idxC1 = 0; idxC1 < oldContours.length; idxC1++) {
			let contour = oldContours[idxC1];
			if (!contour.length.isBetween(6,11) || skipContours.includes(idxC1)) {
				continue;
			}
			if (contour.length.isBetween(6,7)) {
				let matched = false;
				for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
					const p0I = circularIndex(contour, idxP1);
					const p1I = nextNode(contour, p0I);
					const p2I = nextNode(contour, p1I);
					const p3I = nextNode(contour, p2I);
					const p4I = nextNode(contour, p3I);
					const p5I = nextNode(contour, p4I);
					let p0 = circularArray(contour, p0I);
					let p1 = circularArray(contour, p1I);
					let p2 = circularArray(contour, p2I);
					let p3 = circularArray(contour, p3I);
					let p4 = circularArray(contour, p4I);
					let p5 = circularArray(contour, p5I);
					if (
						canBeStrokeEnd(p0, p1, p2, p3) &&
						canBeStrokeEnd(p3, p4, p5, p0) &&
						angleHeavy(p2, p3, p4) === 90
					) {
						let minStroke = Math.min(distanceHeavy(p1, p2), distanceHeavy(p4, p5));
						let p0L = pointLight(p0);
						let p1L = pointLight(p1);
						let p2L = pointLight(p2);
						let p3L = pointLight(p3);
						let p4L = pointLight(p4);
						let p5L = pointLight(p5);
						let p0H = pointHeavy(p0);
						let p1H = pointHeavy(p1);
						let p2H = pointHeavy(p2);
						let p3H = pointHeavy(p3);
						let p4H = pointHeavy(p4);
						let p5H = pointHeavy(p5);
						if (strokeEndBottom(p0, p1, p2, p3) && strokeEndRight(p3, p4, p5, p0)) {
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L.x, p0H.x + minStroke),
								makeVariance(p2L.y, p2H.y),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L.x, p0H.x + minStroke),
								makeVariance(p3L.y, p0H.y - minStroke),
								oldContours[idxC1][p3I].kind
							);
							oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
								makeVariance(p4L.x, p4H.x),
								makeVariance(p4L.y, p0H.y - minStroke),
								oldContours[idxC1][p4I].kind
							);
							matched = true;
							break;
						}
						if (matched) break;
						if (strokeEndLeft(p0, p1, p2, p3) && strokeEndBottom(p3, p4, p5, p0)) {
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L.x, p2H.x),
								makeVariance(p2L.y, p0H.y - minStroke),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L.x, p0H.x - minStroke),
								makeVariance(p3L.y, p0H.y - minStroke),
								oldContours[idxC1][p3I].kind
							);
							oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
								makeVariance(p4L.x, p0H.x - minStroke),
								makeVariance(p4L.y, p4H.y),
								oldContours[idxC1][p4I].kind
							);
							matched = true;
							break;
						}
						if (matched) break;
						if (strokeEndRight(p0, p1, p2, p3) && strokeEndUp(p3, p4, p5, p0)) {
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L.x, p2H.x),
								makeVariance(p2L.y, p0H.y + minStroke),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L.x, p0H.x + minStroke),
								makeVariance(p3L.y, p0H.y + minStroke),
								oldContours[idxC1][p3I].kind
							);
							oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
								makeVariance(p4L.x, p0H.x + minStroke),
								makeVariance(p4L.y, p4H.y),
								oldContours[idxC1][p4I].kind
							);
							matched = true;
							break;
						}
						if (matched) break;
					}
				}
			}
			if (contour.length.isBetween(8,9)) {
				let matched = false;
				for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
					const p0I = circularIndex(contour, idxP1);
					const p1I = nextNode(contour, p0I);
					const p2I = nextNode(contour, p1I);
					const p3I = nextNode(contour, p2I);
					const p4I = nextNode(contour, p3I);
					const p5I = nextNode(contour, p4I);
					const p6I = nextNode(contour, p5I);
					const p7I = nextNode(contour, p6I);
					let p0 = circularArray(contour, p0I);
					let p1 = circularArray(contour, p1I);
					let p2 = circularArray(contour, p2I);
					let p3 = circularArray(contour, p3I);
					let p4 = circularArray(contour, p4I);
					let p5 = circularArray(contour, p5I);
					let p6 = circularArray(contour, p6I);
					let p7 = circularArray(contour, p7I);
					if (
						canBeStrokeEnd(p0, p1, p2, p3) &&
						canBeStrokeEnd(p4, p5, p6, p7) &&
						angleHeavy(p2, p3, p4) === 90 &&
						angleHeavy(p3, p4, p5) === 90
					) {

						let p0L = pointLight(p0);
						let p1L = pointLight(p1);
						let p2L = pointLight(p2);
						let p3L = pointLight(p3);
						let p4L = pointLight(p4);
						let p5L = pointLight(p5);
						let p6L = pointLight(p6);
						let p7L = pointLight(p7);
						let p0H = pointHeavy(p0);
						let p1H = pointHeavy(p1);
						let p2H = pointHeavy(p2);
						let p3H = pointHeavy(p3);
						let p4H = pointHeavy(p4);
						let p5H = pointHeavy(p5);
						let p6H = pointHeavy(p6);
						let p7H = pointHeavy(p7);
						let minStroke = Math.min(distanceHeavy(p1, p2), distanceHeavy(p5, p6), pointToLineDistance(p3H, p0H, p7H));
						if (strokeEndLeft(p0, p1, p2, p3) && strokeEndLeft(p4, p5, p6, p7)) {
							let overlaps = [];
							for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
								let contour2 = oldContours[idxC2];
								if (idxC2 === idxC1 || !contour2.length.isBetween(4,5) || skipContours.includes(idxC2)) {
									continue;
								}
								let score = 0;
								let polygonTest = [
									[
										[p0H.x,p0H.y],
										[p3H.x,p3H.y],
										[p4H.x,p4H.y],
										[p7H.x,p7H.y],
										[p0H.x,p0H.y]
									]
								];
								for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
									let pointTest = point2GeoJsonHeavy(contour2[idxP2]);
									if (inside(pointTest, polygonTest) === true) score++;
								}
								if (score === 2 && !overlaps.includes(idxC2)) overlaps.push(idxC2);
							}
							if (overlaps.length > 0) {
								for (let idxC2 of overlaps) {
									let contour2 = oldContours[idxC2];
									for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
										const q0I = circularIndex(contour2, idxP2);
										const q1I = nextNode(contour2, q0I);
										const q2I = nextNode(contour2, q1I);
										const q3I = nextNode(contour2, q2I);
										let q0 = circularArray(contour2, q0I);
										let q1 = circularArray(contour2, q1I);
										let q2 = circularArray(contour2, q2I);
										let q3 = circularArray(contour2, q3I);
										let q0L = pointLight(q0);
										let q1L = pointLight(q1);
										let q2L = pointLight(q2);
										let q3L = pointLight(q3);
										let q0H = pointHeavy(q0);
										let q1H = pointHeavy(q1);
										let q2H = pointHeavy(q2);
										let q3H = pointHeavy(q3);
										if (q0H.y > q1H.y && q1H.x < q2H.x) {
											oldContours[idxC2][q2I] = Ot.Glyph.Point.create(
												makeVariance(q2L.x, p7H.x - (minStroke / 2)),
												makeVariance(q2L.y, q2H.y),
												oldContours[idxC2][q2I].kind
											);
											oldContours[idxC2][q3I] = Ot.Glyph.Point.create(
												makeVariance(q3L.x, p7H.x - (minStroke / 2)),
												makeVariance(q3L.y, q3H.y),
												oldContours[idxC2][q3I].kind
											);
										}
									}
								}
							}
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L.x, p2H.x),
								makeVariance(p2L.y, p0H.y - minStroke),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L.x, p0H.x - minStroke),
								makeVariance(p3L.y, p0H.y - minStroke),
								oldContours[idxC1][p3I].kind
							);
							oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
								makeVariance(p4L.x, p7H.x - minStroke),
								makeVariance(p4L.y, p7H.y + minStroke),
								oldContours[idxC1][p4I].kind
							);
							oldContours[idxC1][p5I] = Ot.Glyph.Point.create(
								makeVariance(p5L.x, p5H.x),
								makeVariance(p5L.y, p7H.y + minStroke),
								oldContours[idxC1][p5I].kind
							);
							matched = true;
							break;
						}
						if (matched) break;
						if (strokeEndBottom(p0, p1, p2, p3) && strokeEndBottom(p4, p5, p6, p7)) {
							let overlaps = [];
							for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
								let contour2 = oldContours[idxC2];
								if (idxC2 === idxC1 || !contour2.length.isBetween(4,5) || skipContours.includes(idxC2)) {
									continue;
								}
								let score = 0;
								let polygonTest = polyGlyphHeavy[idxC1];
								for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
									let pointTest = point2GeoJsonHeavy(contour2[idxP2]);
									if (inside(pointTest, polygonTest) === true) score++;
								}
								if (score >= 4 && !overlaps.includes(idxC2)) overlaps.push(idxC2);
							}
							if (overlaps.length > 0) {
								for (let idxC2 of overlaps) {
									let contour2 = oldContours[idxC2];
									for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
										const q0I = circularIndex(contour2, idxP2);
										const q1I = nextNode(contour2, q0I);
										const q2I = nextNode(contour2, q1I);
										const q3I = nextNode(contour2, q2I);
										let q0 = circularArray(contour2, q0I);
										let q1 = circularArray(contour2, q1I);
										let q2 = circularArray(contour2, q2I);
										let q3 = circularArray(contour2, q3I);
										let q0L = pointLight(q0);
										let q1L = pointLight(q1);
										let q2L = pointLight(q2);
										let q3L = pointLight(q3);
										let q0H = pointHeavy(q0);
										let q1H = pointHeavy(q1);
										let q2H = pointHeavy(q2);
										let q3H = pointHeavy(q3);
										if (q0H.y > q1H.y && q1H.x < q2H.x) {
											oldContours[idxC2][q0I] = Ot.Glyph.Point.create(
												makeVariance(q0L.x, p0H.x + (minStroke / 2)),
												makeVariance(q0L.y, q0H.y),
												oldContours[idxC2][q0I].kind
											);
											oldContours[idxC2][q1I] = Ot.Glyph.Point.create(
												makeVariance(q1L.x, p0H.x + (minStroke / 2)),
												makeVariance(q1L.y, q1H.y),
												oldContours[idxC2][q1I].kind
											);
											oldContours[idxC2][q2I] = Ot.Glyph.Point.create(
												makeVariance(q2L.x, p7H.x - (minStroke / 2)),
												makeVariance(q2L.y, q2H.y),
												oldContours[idxC2][q2I].kind
											);
											oldContours[idxC2][q3I] = Ot.Glyph.Point.create(
												makeVariance(q3L.x, p7H.x - (minStroke / 2)),
												makeVariance(q3L.y, q3H.y),
												oldContours[idxC2][q3I].kind
											);
										}
									}
								}
							}
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L.x, p0H.x + minStroke),
								makeVariance(p2L.y, p2H.y),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L.x, p0H.x + minStroke),
								makeVariance(p3L.y, p0H.y - minStroke),
								oldContours[idxC1][p3I].kind
							);
							oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
								makeVariance(p4L.x, p7H.x - minStroke),
								makeVariance(p4L.y, p7H.y - minStroke),
								oldContours[idxC1][p4I].kind
							);
							oldContours[idxC1][p5I] = Ot.Glyph.Point.create(
								makeVariance(p5L.x, p7H.x - minStroke),
								makeVariance(p5L.y, p5H.y),
								oldContours[idxC1][p5I].kind
							);
							matched = true;
							break;
						}
						if (matched) break;
						if (strokeEndUp(p0, p1, p2, p3) && strokeEndUp(p4, p5, p6, p7)) {
							let overlaps = [];
							for (let idxC2 = 0; idxC2 < oldContours.length; idxC2++) {
								let contour2 = oldContours[idxC2];
								if (idxC2 === idxC1 || !contour2.length.isBetween(4,5) || skipContours.includes(idxC2)) {
									continue;
								}
								let score = 0;
								let polygonTest = polyGlyphHeavy[idxC1];
								for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
									let pointTest = point2GeoJsonHeavy(contour2[idxP2]);
									if (inside(pointTest, polygonTest) === true) score++;
								}
								if (score >= 4 && !overlaps.includes(idxC2)) overlaps.push(idxC2);
							}
							if (overlaps.length > 0) {
								for (let idxC2 of overlaps) {
									let contour2 = oldContours[idxC2];
									for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
										const q0I = circularIndex(contour2, idxP2);
										const q1I = nextNode(contour2, q0I);
										const q2I = nextNode(contour2, q1I);
										const q3I = nextNode(contour2, q2I);
										let q0 = circularArray(contour2, q0I);
										let q1 = circularArray(contour2, q1I);
										let q2 = circularArray(contour2, q2I);
										let q3 = circularArray(contour2, q3I);
										let q0L = pointLight(q0);
										let q1L = pointLight(q1);
										let q2L = pointLight(q2);
										let q3L = pointLight(q3);
										let q0H = pointHeavy(q0);
										let q1H = pointHeavy(q1);
										let q2H = pointHeavy(q2);
										let q3H = pointHeavy(q3);
										if (q0H.y > q1H.y && q1H.x < q2H.x) {
											oldContours[idxC2][q0I] = Ot.Glyph.Point.create(
												makeVariance(q0L.x, p7H.x + (minStroke / 2)),
												makeVariance(q0L.y, q0H.y),
												oldContours[idxC2][q0I].kind
											);
											oldContours[idxC2][q1I] = Ot.Glyph.Point.create(
												makeVariance(q1L.x, p7H.x + (minStroke / 2)),
												makeVariance(q1L.y, q1H.y),
												oldContours[idxC2][q1I].kind
											);
											oldContours[idxC2][q2I] = Ot.Glyph.Point.create(
												makeVariance(q2L.x, p0H.x - (minStroke / 2)),
												makeVariance(q2L.y, q2H.y),
												oldContours[idxC2][q2I].kind
											);
											oldContours[idxC2][q3I] = Ot.Glyph.Point.create(
												makeVariance(q3L.x, p0H.x - (minStroke / 2)),
												makeVariance(q3L.y, q3H.y),
												oldContours[idxC2][q3I].kind
											);
										}
									}
								}
							}
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L.x, p0H.x - minStroke),
								makeVariance(p2L.y, p2H.y),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L.x, p0H.x - minStroke),
								makeVariance(p3L.y, p0H.y + minStroke),
								oldContours[idxC1][p3I].kind
							);
							oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
								makeVariance(p4L.x, p7H.x + minStroke),
								makeVariance(p4L.y, p7H.y + minStroke),
								oldContours[idxC1][p4I].kind
							);
							oldContours[idxC1][p5I] = Ot.Glyph.Point.create(
								makeVariance(p5L.x, p7H.x + minStroke),
								makeVariance(p5L.y, p5H.y),
								oldContours[idxC1][p5I].kind
							);
							matched = true;
							break;
						}
						if (matched) break;
					}
					if (
						canBeStrokeEnd(p0, p1, p2, p3) &&
						canBeStrokeEnd(p3, p4, p5, p6) &&
						angleHeavy(p2, p3, p4) === 90
					) {
						let minStroke = Math.min(distanceHeavy(p1, p2), distanceHeavy(p4, p5));
						let p0L = pointLight(p0);
						let p1L = pointLight(p1);
						let p2L = pointLight(p2);
						let p3L = pointLight(p3);
						let p4L = pointLight(p4);
						let p5L = pointLight(p5);
						let p6L = pointLight(p6);
						let p0H = pointHeavy(p0);
						let p1H = pointHeavy(p1);
						let p2H = pointHeavy(p2);
						let p3H = pointHeavy(p3);
						let p4H = pointHeavy(p4);
						let p5H = pointHeavy(p5);
						let p6H = pointHeavy(p6);
						if (strokeEndBottom(p0, p1, p2, p3) && strokeEndRight(p3, p4, p5, p6)) {
							oldContours[idxC1][p2I] = Ot.Glyph.Point.create(
								makeVariance(p2L.x, p1H.x + minStroke),
								makeVariance(p2L.y, p2H.y),
								oldContours[idxC1][p2I].kind
							);
							oldContours[idxC1][p3I] = Ot.Glyph.Point.create(
								makeVariance(p3L.x, p1H.x + minStroke),
								makeVariance(p3L.y, p5H.y - minStroke),
								oldContours[idxC1][p3I].kind
							);
							oldContours[idxC1][p4I] = Ot.Glyph.Point.create(
								makeVariance(p4L.x, p4H.x),
								makeVariance(p4L.y, p5H.y - minStroke),
								oldContours[idxC1][p4I].kind
							);
							matched = true;
							break;
						}
						if (matched) break;
					}
				}
			}
			if (contour.length.isBetween(10,11)) {
				for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
					const p0I = circularIndex(contour, idxP1);
					const p1I = nextNode(contour, p0I);
					const p2I = nextNode(contour, p1I);
					const p3I = nextNode(contour, p2I);
					const p4I = nextNode(contour, p3I);
					const p5I = nextNode(contour, p4I);
					const p6I = nextNode(contour, p5I);
					const p7I = nextNode(contour, p6I);
					const p8I = nextNode(contour, p7I);
					const p9I = nextNode(contour, p8I);
					let p0 = circularArray(contour, p0I);
					let p1 = circularArray(contour, p1I);
					let p2 = circularArray(contour, p2I);
					let p3 = circularArray(contour, p3I);
					let p4 = circularArray(contour, p4I);
					let p5 = circularArray(contour, p5I);
					let p6 = circularArray(contour, p6I);
					let p7 = circularArray(contour, p7I);
					let p8 = circularArray(contour, p8I);
					let p9 = circularArray(contour, p9I);
				}
			}
		}

		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			if (JSON.stringify(contour[0]) === JSON.stringify(circularArray(contour, - 1))) contour.pop();
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
	let consoleWidth = process.stdout.columns || 150;
	let bar, progressTick;
	let debug = false;
	if (debug) {
		bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/5]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });

		progressTick = function(info = "") {
			if (len) {
				var chunk = 1;
				bar.tick(chunk);
				if (bar.curr > 0 && bar.curr < len - 2) { 
					bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', info: info }, 'force');
				}
				if (bar.curr === len - 1) { 
					bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', info: info }, 'force');
				}
			}
		}
	} else {
		bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete: '\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });

		progressTick = function() {
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
	}


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

			progressTick(name);
			continue;
		}
		progressTick(name);
		// checkSingleGlyph(glyph);
		// if (!references.preProcessSkip.includes(name) && count < 200) checkSingleGlyph(glyph);
		if (!references.preProcessSkip.includes(name) && (limit === false || count < limit)) checkSingleGlyph(glyph);
		// if (name === "uni8BBD") checkSingleGlyph(glyph);
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
