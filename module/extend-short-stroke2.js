"use strict";

const { Ot } = require("ot-builder");
const inside = require("point-in-polygon-hao");
const ProgressBar = require('./node-progress');
const { approximateBezier, base60, bearing, horizontalSlope, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc, max } = Math;
const Offset = require('polygon-offset');
let offset = new Offset();

// const { System } = require("detect-collisions");
// const system = new System();
// based on measurement of SHS
const params = {
	strokeWidth: { light: 35, heavy: 175 },
};
let debug = false;

function circularArray(array, index) {
	let length = array && array.length;
	var idx = abs(length + index % length) % length;
	return array[isNaN(idx) ? index : idx];
}

function circularIndex(array, index) {
	var length = array && array.length;
	var idx = abs(length + index % length) % length;
	return isNaN(idx) ? index : idx;
}




function angle(line) {
	let { p1, p2 } = line;
	let deg = (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
	if (p2.x < p1.x && p2.y > p1.y) return deg - 360;
	if (p2.x < p1.x && p2.y < p1.y) return deg - 180;
	if (deg === 360) return 180;
	return deg;
}


// some 横s of 横折s in SHS is shorter than expected.
// extend to align them.
// ─────┬──┬──┐
//      │  │  │
// ─────┼──┘  │
//      │     │
//
function extendShortStroke(font, references) {

	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);

	function originLight(point) {
		return Ot.Var.Ops.originOf(point);
	}
	
	function originHeavy(point) {
		return Ot.Var.Ops.evaluate(point, instanceShsWghtMax);
	}
	
	function distance(p1, p2) {
		let x1l = originLight(p1.x);
		let x2l = originLight(p2.x);
		let y1l = originLight(p1.y);
		let y2l = originLight(p2.y);
		let x1h = originHeavy(p1.x);
		let x2h = originHeavy(p2.x);
		let y1h = originHeavy(p1.y);
		let y2h = originHeavy(p2.y);
		let xdl = x2l - x1l;
		let ydl = y2l - y1l;
		let xdh = x2h - x1h;
		let ydh = y2h - y1h;
		return { distLight: sqrt(pow(xdl, 2) + pow(ydl, 2)), distHeavy: sqrt(pow(xdh, 2) + pow(ydh, 2)) };
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
	
	function approxEq(a, b, threshold = 5, thresholdHeavy = false) {
		if (typeof a == 'number' && typeof b == 'number')
			return abs(a - b) <= threshold;
		return abs(originLight(a) - originLight(b)) <= threshold &&
			abs(originHeavy(a) - originHeavy(b)) <= (thresholdHeavy || threshold);
	}

	function canBeBottomEnd(bottomLeft, bottomRight) {
		// console.log(originLight(topRight.x) - originLight(topLeft.x));
		return bottomLeft.kind == 0 && bottomRight.kind == 0 &&
			approxEq(bottomLeft.y, bottomRight.y, 20) &&
			approxEq(
				originLight(bottomRight.x) - originLight(bottomLeft.x),
				params.strokeWidth.light,
				20,
			) &&
			originHeavy(bottomRight.x) - originHeavy(bottomLeft.x) <= params.strokeWidth.heavy;
	}
	
	function canBeLeftEnd(topLeft, bottomLeft) {
		return topLeft.kind == 0 && bottomLeft.kind == 0 &&
			approxEq(topLeft.x, bottomLeft.x, 40, 75) &&
			approxEq(
				originLight(topLeft.y) - originLight(bottomLeft.y),
				params.strokeWidth.light,
				20,
			) &&
			originHeavy(topLeft.y) - originHeavy(bottomLeft.y) <= params.strokeWidth.heavy;
	}

	function canBeRightEnd(bottomRight, topRight) {
		return bottomRight.kind == 0 && topRight.kind == 0 &&
			approxEq(bottomRight.x, topRight.x, 20, 54) &&
			approxEq(distanceLight(topRight, bottomRight), params.strokeWidth.light, 20,) &&
			// approxEq(originLight(topRight.y) - originLight(bottomRight.y), params.strokeWidth.light, 20,) &&
			// distanceHeavy(topRight, bottomRight) <= params.strokeWidth.heavy;
			originHeavy(topRight.y) - originHeavy(bottomRight.y) <= params.strokeWidth.heavy;
	}

	function canBeTopEnd(topRight, topLeft) {
		// console.log(originLight(topRight.x) - originLight(topLeft.x));
		return topRight.kind == 0 && topLeft.kind == 0 &&
			approxEq(topRight.y, topLeft.y, 20) &&
			approxEq(
				originLight(topRight.x) - originLight(topLeft.x),
				params.strokeWidth.light,
				20,
			) &&
			originHeavy(topRight.x) - originHeavy(topLeft.x) <= params.strokeWidth.heavy;
	}

	function isBetween(a, x, b) {
		return (originLight(a) - 2) <= originLight(x) &&
			originLight(x) <= (originLight(b) + 2) &&
			(originHeavy(a) - 2) <= originHeavy(x) &&
			originHeavy(x) <= (originHeavy(b) + 2);
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(valueDefault, [[masterWghtMax, valueWghtMax - valueDefault]]);
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
	function findBottomLeftCorner(contour, start = 0) {
		for (let i = 0; i < contour.length; i++) {
			let curr = circularArray(contour, start + i);
			if (curr.kind !== 0) continue;
			let prev = contour[previousNode(contour, start + i)];
			let next = contour[nextNode(contour, start + i)];
			let bear1 = bearing(lineLight(prev, curr));
			if (bear1 < 135 || bear1 > 225) continue;
			let dir1 = angle(lineLight(prev, curr));
			let dir2 = angle(lineLight(curr, next));
			let bear2 = bearing(lineLight(curr, next));
			let rotation = abs(dir1 - dir2);
			if (rotation >= 68 && rotation <= 112 && bear2 > 45 && bear2 < 135) return circularIndex(contour, start + i);
		}
	}
	function findBottomRightCorner(contour, start = 0) {
		for (let i = 0; i < contour.length; i++) {
			let curr = circularArray(contour, start + i);
			if (curr.kind !== 0) continue;
			let prev = contour[previousNode(contour, start + i)];
			let next = contour[nextNode(contour, start + i)];
			let bear1 = bearing(lineLight(prev, curr));
			if (bear1 < 45 || bear1 > 135) continue;
			let dir1 = angle(lineLight(prev, curr));
			let dir2 = angle(lineLight(curr, next));
			let bear2 = bearing(lineLight(curr, next));
			// let rotation = abs(dir1 - dir2);
			let rotation = turn(bear1, bear2);
			if ((rotation <= -68 && rotation >= -112) || (rotation <= 95 && rotation >= 85)) return circularIndex(contour, start + i);
		}
	}

	function findTopRightCorner(contour, start = 0) {
		for (let i = 0; i < contour.length; i++) {
			let curr = circularArray(contour, start + i);
			if (curr.kind !== 0) continue;
			let prev = contour[previousNode(contour, start + i)];
			let next = contour[nextNode(contour, start + i)];
			let bear1 = bearing(lineLight(prev, curr));
			if (bear1 < 315 && bear1 > 45) continue;
			let dir1 = angle(lineLight(prev, curr));
			let dir2 = angle(lineLight(curr, next));
			let bear2 = bearing(lineLight(curr, next));
			let rotation = abs(dir1 - dir2);
			if (rotation >= 68 && rotation <= 112 && bear2 > 225 && bear2 < 315) return circularIndex(contour, start + i);
		}
	}
	
	function findTopLeftCorner(contour, start = 0) {
		for (let i = 0; i < contour.length; i++) {
			let curr = circularArray(contour, start + i);
			if (curr.kind !== 0) continue;
			let prev = contour[previousNode(contour, start + i)];
			let next = contour[nextNode(contour, start + i)];
			let bear1 = bearing(lineLight(prev, curr));
			if (bear1 < 225 || bear1 > 315) continue;
			let dir1 = angle(lineLight(prev, curr));
			let dir2 = angle(lineLight(curr, next));
			let bear2 = bearing(lineLight(curr, next));
			let rotation = abs(dir1 - dir2);
			if (rotation >= 68 && rotation <= 112 && bear2 > 225 && bear2 < 315) return circularIndex(contour, start + i);
		}
	}
	
	function canBeStrokeEnd(p1, p2, p3, p4) {
		let cornerPoints = p2.kind === 0 && p3.kind === 0;
		let strokeWidthLight = approxEq(distanceLight(p2, p3), params.strokeWidth.light, 20);
		let strokeWidthHeavy = approxEq(distanceHeavy(p2, p3), params.strokeWidth.heavy, 20);
		let bearingLight1 = bearing(lineLight(p1, p2));
		let bearingLight2 = bearing(lineLight(p2, p3));
		let bearingLight3 = bearing(lineLight(p3, p4));
		let anglesLight = turn(bearingLight1, bearingLight2) + turn(bearingLight2, bearingLight3);
		let trapezoidalLight = anglesLight > -190 && anglesLight < -170;
		let bearingHeavy1 = bearing(lineHeavy(p1, p2));
		let bearingHeavy2 = bearing(lineHeavy(p2, p3));
		let bearingHeavy3 = bearing(lineHeavy(p3, p4));
		let anglesHeavy = turn(bearingHeavy1, bearingHeavy2) + turn(bearingHeavy2, bearingHeavy3);
		let trapezoidalHeavy = anglesHeavy > -190 && anglesHeavy < -170;
		return cornerPoints && strokeWidthLight && strokeWidthHeavy && trapezoidalLight && trapezoidalHeavy;
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
	
	function contour2GeoJsonLight(contour) {
		let pointsArr = [];
		let j = contour.length - 1;
		for (let i = 0; i < contour.length; i++) {
			if (i + 1 < j && contour[i + 1].kind === 1) {
				let p1 = pointLight(contour[i]);
				let cp1 = pointLight(contour[i + 1]);
				let cp2 = pointLight(contour[i + 2]);
				let p2 = pointLight(contour[i + 3]);
				let curve = approximateBezier(p1, cp1, cp2, p2, 0.5);
				curve.pop();
				for (const coord of curve) {
					const { x, y } = coord;
					let point = [ x, y ];
					if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
						continue;
					}
					pointsArr.push(point);
				}
				i += 2;
			} else {
				const { x, y } = pointLight(contour[i]);
				let point = [ x, y ];
				if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
					continue;
				}
				pointsArr.push(point);
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
				let curve = approximateBezier(p1, cp1, cp2, p2, 0.5);
				curve.pop();
				for (const coord of curve) {
					const { x, y } = coord;
					let point = [ x, y ];
					if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
						continue;
					}
					pointsArr.push(point);
				}
				i += 2;
			} else {
				const { x, y } = pointHeavy(contour[i]);
				let point = [ x, y ];
				if (pointsArr.length && pointsArr[pointsArr.length - 1].toString() === point.toString()) {
					continue;
				}
				pointsArr.push(point);
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
	
	function setCustomRadius(glyphName, idx, radiusMin, radiusMax) {
		let light = radiusMin.toFixed(1);
		let heavy = radiusMax.toFixed(1);
		if (glyphName in references.customRadiusList === false) {
			references.customRadiusList[glyphName] = [];
		}
		let refArray = references.customRadiusList[glyphName];
		let objIndex = refArray.findIndex((obj) => obj["idx"] === idx);
		if (objIndex === -1) {
			refArray.push({light, heavy, idx});
		} else {
			let ref = refArray[objIndex];
			if (light > ref.light) ref.light = light;
			if (heavy > ref.heavy) ref.heavy = heavy;
		}
	}

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;
		// console.log(glyph.name);
		const name = glyph.name;
		
		let oldContours = glyph.geometry.contours;
		glyph.geometry.contours = [];
		
		let skipContours = [];
		if (name in references.extendIgnoreContourIdx) {
			skipContours = references.extendIgnoreContourIdx[name];
		}
		
		for (let [idxC1, contour] of oldContours.entries()) {
			// find possible 横s (horizontals)
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const bottomRightIdx = idxP1;
				const topRightIdx = nextNode(contour, bottomRightIdx);
				const topLeftIdx = nextNode(contour, topRightIdx);
				const bottomLeftIdx = previousNode(contour, bottomRightIdx);

				const horizontalAngle = angle(lineLight(circularArray(contour, bottomLeftIdx), circularArray(contour, bottomRightIdx)));
				const horizontalTopSlope = horizontalSlope(lineLight(circularArray(contour, bottomLeftIdx), circularArray(contour, bottomRightIdx)));
				const horizontalBottomSlope = horizontalSlope(lineLight(circularArray(contour, bottomLeftIdx), circularArray(contour, bottomRightIdx)));

				if (!Number.isFinite(horizontalTopSlope)) continue;
				if (!Number.isFinite(horizontalBottomSlope)) continue;
				if (
					// is right end
					canBeRightEnd(circularArray(contour, bottomRightIdx), circularArray(contour, topRightIdx)) &&
					approxEq(horizontalTopSlope, horizontalBottomSlope, 0.4) &&
					originLight(circularArray(contour, bottomRightIdx).x) > originLight(circularArray(contour, bottomLeftIdx).x) &&
					horizontalBottomSlope < 0.5
					// approxEq(horizontalTopRight.y, horizontalTopLeft.y, 34, 37)
					// approxEq(distanceLight(horizontalBottomRight, horizontalTopRight), params.strokeWidth.light, 10) &&
					// approxEq(distanceLight(horizontalTopLeft, horizontalBottomLeft), params.strokeWidth.light, 10) &&
				) {
					debug && console.log(`is right end - idxC1: ${idxC1}, idxP1: ${idxP1}`);
					const horizontalBottomRight = circularArray(contour, bottomRightIdx);
					const horizontalTopRight = circularArray(contour, topRightIdx);
					const horizontalTopLeft = circularArray(contour, topLeftIdx);
					const horizontalBottomLeft = circularArray(contour, bottomLeftIdx);
					const horizontalStrokeLight = originLight(horizontalTopRight.y) - originLight(horizontalBottomRight.y);
					const horizontalStrokeHeavy = originHeavy(horizontalTopRight.y) - originHeavy(horizontalBottomRight.y);
					setCustomRadius(name, idxC1, distanceLight(horizontalBottomRight, horizontalTopRight) / 2, distanceHeavy(horizontalBottomRight, horizontalTopRight) / 2);
					for (const [idxC2, contour2] of oldContours.entries()) {
						// find possible 竖s (verticals)
						if (idxC2 === idxC1 || contour2.length < 4 || skipContours.includes(idxC2)) continue;

						let polygonLight = [contour2GeoJsonLight(contour2)];
						// let polygonLight2 = offset.data(polygonLight).arcSegments(3).margin(1);
						let polygonHeavy = [contour2GeoJsonHeavy(contour2)];
						// let polygonHeavy2 = offset.data(polygonHeavy).arcSegments(3).margin(1);
						let extended = false;
						
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							const corner0 = idxP2;
							const cornerP1 = nextNode(contour2, corner0);
							const cornerP2 = nextNode(contour2, cornerP1);
							const cornerN1 = previousNode(contour2, corner0);
							// const cornerP2 = nextNodeIdx(contour2, cornerP1);
							// const cornerN1 = previousNodeIdx(contour2, corner0);
							if (
								// is top end
								canBeTopEnd(circularArray(contour2, corner0), circularArray(contour2, cornerP1)) &&
								approxEq(circularArray(contour2, corner0).x, circularArray(contour2, cornerN1).x, 180, 250) &&
								approxEq(circularArray(contour2, cornerP1).x, circularArray(contour2, cornerP2).x, 180, 250)
								// canBeTopEnd(verticalTopRight, verticalTopLeft) &&
								// approxEq(verticalTopRight.x, verticalBottomRight.x, 100) &&
								// approxEq(verticalTopLeft.x, verticalBottomLeft.x, 100)
							) {
								const verticalTopRight = circularArray(contour2, corner0);
								const verticalTopLeft = circularArray(contour2, cornerP1);
								const topRightIsEdge = (inside(point2GeoJsonLight(horizontalTopRight), polygonLight) === 0 || inside(point2GeoJsonHeavy(horizontalTopRight), polygonHeavy) === 0);
								// const strokeHeavy = distanceHeavy(verticalTopRight, verticalTopLeft);
								const verticalBottomLeft = circularArray(contour2, findBottomLeftCorner(contour2)) || circularArray(contour2, cornerP2);
								const verticalBottomRight = topRightIsEdge ? circularArray(contour2, cornerN1) : circularArray(contour2, findBottomRightCorner(contour2)) || circularArray(contour2, cornerN1);
								// const verticalBottomLeft = circularArray(contour2, cornerP2);
								// const verticalBottomRight = circularArray(contour2, cornerN1);
								// const verticalBottomRight = circularArray(contour2, previousNodeLTY(contour2, corner0, horizontalBottomRight));
								// let verticalBottomRight;
								// if (originLight(circularArray(contour2, cornerN1).y) > originLight(horizontalBottomRight.y)) {
								// 	let testPoint = cornerN1;
									
								// }
								debug && console.log(`is top end - idxC2: ${idxC2}, idxP2: ${idxP2}`);
								// debug && console.log(verticalBottomLeft);
								// debug && console.log(verticalBottomRight);
								if (
									// and 横's (horizontal's) right end inside 竖 (vertical)
									// ───┬──┬──┐
									//    ┆  ⇨  │
									// ───┼──┘  │
									//    │     │
									isBetween(verticalTopLeft.x, horizontalBottomRight.x, verticalTopRight.x) &&
									(
										isBetween(verticalBottomLeft.y, horizontalTopRight.y, verticalTopLeft.y) ||
										isBetween(verticalBottomRight.y, horizontalTopRight.y, verticalTopRight.y)
									) && horizontalAngle > 45 && horizontalAngle < 135 &&
									(
										(
											inside(point2GeoJsonLight(horizontalBottomRight), polygonLight) !== false &&
											inside(point2GeoJsonLight(horizontalTopRight), polygonLight) !== false
										) || (
											inside(point2GeoJsonHeavy(horizontalBottomRight), polygonHeavy) !== false &&
											inside(point2GeoJsonHeavy(horizontalTopRight), polygonHeavy) !== false
										)
									)
								) {
									// let isCorner = (abs(originLight(horizontalTopRight.y) - originLight(verticalTopRight.y)) < 30) || (abs(originLight(horizontalBottomRight.y) - originLight(verticalBottomRight.y)) < 30);
									// let xOffsetL = isCorner ? 0 : 4;
									// let xOffsetH = isCorner ? 0 : 20;
									
									const verticalRightSlopeLight = verticalSlope(lineLight(verticalBottomRight, verticalTopRight)) || 0;
									const verticalRightSlopeHeavy = verticalSlope(lineHeavy(verticalBottomRight, verticalTopRight)) || 0;
									if (!Number.isFinite(verticalRightSlopeLight)) continue;
									if (!Number.isFinite(verticalRightSlopeHeavy)) continue;
									// const verticalRightSlopeLight = verticalSlope(lineLight(verticalTopRight, circularArray(contour2, cornerN1))) === 0 ? 0 : verticalSlope(lineLight(verticalBottomRight, verticalTopRight));
									// const verticalRightSlopeHeavy = verticalSlope(lineHeavy(verticalTopRight, circularArray(contour2, cornerN1))) === 0 ? 0 : verticalSlope(lineHeavy(verticalBottomRight, verticalTopRight));
									let isCorner = (abs(originLight(horizontalTopRight.y) - originLight(verticalTopRight.y)) < 5) || (abs(originLight(horizontalBottomRight.y) - originLight(verticalBottomRight.y)) < 5);
									let horizontalRightCenterYLight = (originLight(horizontalTopRight.y) + originLight(horizontalBottomRight.y)) / 2;
									let horizontalRightCenterYHeavy = (originHeavy(horizontalTopRight.y) + originHeavy(horizontalBottomRight.y)) / 2;
									let distanceLight = originLight(verticalTopRight.y) - horizontalRightCenterYLight;
									let distanceHeavy = originHeavy(verticalTopRight.y) - horizontalRightCenterYHeavy;
									let xOffsetL = (distanceLight * verticalRightSlopeLight) + (verticalRightSlopeLight === 0 ? 2 : 6);
									let xOffsetH = (distanceHeavy * verticalRightSlopeHeavy) + 4;
									let topDistance = abs(horizontalRightCenterYLight - originLight(verticalTopRight.y));
									let bottomDistance = abs(horizontalRightCenterYLight - originLight(verticalBottomRight.y));
									let side = topDistance < bottomDistance ? isCorner ? verticalTopRight : verticalTopRight : isCorner ? verticalBottomRight : verticalTopRight;
									if (abs(originLight(horizontalTopRight.y) - originLight(verticalTopRight.y)) < 2) {
										newContour[topRightIdx] = {
											x: makeVariance(
												originLight(verticalTopRight.x),
												originHeavy(verticalTopRight.x)
											),
											y: makeVariance(
												originLight(verticalTopRight.y),
												originHeavy(verticalTopRight.y)
											),
											kind: 0,
										};
										newContour[bottomRightIdx] = {
											x: makeVariance(
												originLight(verticalTopRight.x) - (horizontalStrokeLight * verticalRightSlopeLight),
												originHeavy(verticalTopRight.x) - (horizontalStrokeHeavy * verticalRightSlopeHeavy)
											),
											y: makeVariance(
												originLight(horizontalBottomRight.y),
												originHeavy(horizontalBottomRight.y)
											),
											kind: 0,
										};
									} else {
										newContour[bottomRightIdx] = {
											x: makeVariance(
												originLight(side.x) - xOffsetL,
												originHeavy(side.x) - xOffsetH
											),
											y: horizontalBottomRight.y,
											kind: 0,
										};
										newContour[topRightIdx] = {
											x: makeVariance(
												originLight(side.x) - xOffsetL,
												originHeavy(side.x) - xOffsetH
											),
											y: horizontalTopRight.y,
											kind: 0,
										};
									}
									// extended = true;
									// break;
								}
							}
							
							if (
								// is bottom end
								canBeBottomEnd(circularArray(contour2, corner0), circularArray(contour2, cornerP1)) &&
								approxEq(circularArray(contour2, corner0).x, circularArray(contour2, cornerN1).x, 450) &&
								approxEq(circularArray(contour2, cornerP1).x, circularArray(contour2, cornerP2).x, 450)
							) {
								const verticalBottomLeft = contour2[idxP2];
								const verticalBottomRight = circularArray(contour2, idxP2 + 1);
								const verticalTopRight = circularArray(contour2, idxP2 + 2);
								const verticalTopLeft = circularArray(contour2, idxP2 - 1);
								if (
									// and 横's (horizontal's) right end inside 竖 (vertical)
									// isBetween(verticalBottomLeft.x, horizontalBottomRight.x, verticalBottomRight.x) &&
									// isBetween(verticalBottomRight.y, horizontalBottomRight.y, verticalTopRight.y) &&
									// abs(horizontalAngle) < 46
									
									isBetween(verticalBottomLeft.x, horizontalBottomRight.x, verticalTopRight.x) &&
									(
										isBetween(verticalBottomLeft.y, horizontalTopRight.y, verticalTopLeft.y) ||
										isBetween(verticalBottomRight.y, horizontalTopRight.y, verticalTopRight.y)
									) && horizontalAngle > 45 && horizontalAngle < 135 &&
									(
										(
											inside(point2GeoJsonLight(horizontalBottomRight), polygonLight) !== false &&
											inside(point2GeoJsonLight(horizontalTopRight), polygonLight) !== false
										) || (
											inside(point2GeoJsonHeavy(horizontalBottomRight), polygonHeavy) !== false &&
											inside(point2GeoJsonHeavy(horizontalTopRight), polygonHeavy) !== false
										)
									)
								) {
									let isCorner = (approxEq(horizontalTopRight.y, verticalTopRight.y, 30) || approxEq(horizontalBottomRight.y, verticalBottomRight.y, 30));
									let xOffsetL = isCorner ? 0 : 4;
									let xOffsetH = isCorner ? 0 : 20;
									newContour[topRightIdx] = {
										x: makeVariance(
											originLight(verticalBottomRight.x) - xOffsetL,
											originHeavy(verticalBottomRight.x) - xOffsetH
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
									newContour[bottomRightIdx] = {
										x: makeVariance(
											originLight(verticalBottomRight.x) - xOffsetL,
											originHeavy(verticalBottomRight.x) - xOffsetH
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									// extended = true;
									// break;
								}
							}
						}
						if (extended)
							break;
					}
				}

			}
			glyph.geometry.contours.push(newContour);
		}
		
		oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
			// find possible 竖s (verticals)
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const bottomLeftIdx = idxP1;
				const bottomRightIdx = nextNode(contour, bottomLeftIdx);
				const topRightIdx = nextNode(contour, bottomRightIdx);
				const topLeftIdx = previousNode(contour, bottomLeftIdx)
				if (
					// is bottom end
					canBeBottomEnd(contour[bottomLeftIdx], circularArray(contour, bottomRightIdx)) &&
					approxEq(contour[bottomLeftIdx].x, circularArray(contour, topLeftIdx).x, 450) &&
					approxEq(circularArray(contour, bottomRightIdx).x, circularArray(contour, topRightIdx).x, 450)
				) {
					// const bottomLeftIdx = circularIndex(contour, idxP1);
					// const bottomRightIdx = circularIndex(contour, idxP1 + 1);
					// const topRightIdx = circularIndex(contour, idxP1 + 2);
					// const topLeftIdx = circularIndex(contour, idxP1 - 1);
					const verticalBottomLeft = circularArray(contour, bottomLeftIdx);
					const verticalBottomRight = circularArray(contour, bottomRightIdx);
					const verticalTopRight = circularArray(contour, topRightIdx);
					const verticalTopLeft = circularArray(contour, topLeftIdx);

					setCustomRadius(name, idxC1, distanceLight(verticalBottomLeft, verticalBottomRight) / 2, distanceHeavy(verticalBottomLeft, verticalBottomRight) / 2);
					for (const [idxC2, contour2o] of oldContours.entries()) {
						// find possible 横s (horizontals)
						if (idxC2 === idxC1 || contour2o.length < 4 || skipContours.includes(idxC2)) continue;

						let polygonLight = [contour2GeoJsonLight(contour2o)];
						// let polygonLight2 = offset.data(polygonLight).arcSegments(3).margin(1);
						let polygonHeavy = [contour2GeoJsonHeavy(contour2o)];
						// let polygonHeavy2 = offset.data(polygonHeavy).arcSegments(3).margin(1);
						
						let contour2 = contour2o.filter((point) => point.kind === 0);
						let extended = false;
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							if (
								// is left end
								canBeLeftEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].y, circularArray(contour2, idxP2 - 1).y, 85) &&
								approxEq(circularArray(contour2, idxP2 + 1).y, circularArray(contour2, idxP2 + 2).y, 85)
								) {
								const horizontalTopLeftIdx = findTopLeftCorner(contour2, idxP2);
								const horizontalBottomLeftIdx = findBottomLeftCorner(contour2, idxP2);
								const horizontalBottomRightIdx = findBottomRightCorner(contour2, idxP2);
								const horizontalTopRightIdx = findTopRightCorner(contour2, idxP2);
								const horizontalTopLeft = circularArray(contour2, horizontalTopLeftIdx) || circularArray(contour2, idxP2);
								const horizontalBottomLeft = circularArray(contour2, horizontalBottomLeftIdx) || circularArray(contour2, idxP2 + 1);
								const horizontalBottomRight = circularArray(contour2, horizontalBottomRightIdx) || circularArray(contour2, idxP2 + 2);
								const horizontalTopRight = circularArray(contour2, horizontalTopRightIdx) || circularArray(contour2, idxP2 - 1);

								// const horizontalTopLeft = circularArray(contour2, idxP2);
								// const horizontalBottomLeft = circularArray(contour2, idxP2 + 1);
								// const strokeHeavy = distanceHeavy(horizontalTopLeft, horizontalBottomLeft);
								// // const horizontalBottomRight = circularArray(contour2, idxP2 + 2);
								// // const horizontalBottomRight = circularArray(contour2, idxP2 + 2).kind === 0 ? circularArray(contour2, idxP2 + 2) :
								// const horizontalBottomRight = (circularArray(contour2, idxP2 + 2).kind === 0 && distanceHeavy(circularArray(contour2, idxP2 + 2), horizontalBottomLeft) >= strokeHeavy) ? circularArray(contour2, idxP2 + 2) :
								// circularArray(contour2, idxP2 + 3).kind === 0 ? circularArray(contour2, idxP2 + 3) : 
								// circularArray(contour2, idxP2 + 4).kind === 0 ? circularArray(contour2, idxP2 + 4) : circularArray(contour2, idxP2 + 5);
								// const horizontalTopRight = circularArray(contour2, idxP2 - 1);
								if (
									// and 竖's (vertical's) bottom inside 横's (horizontal's) left end
									// originLight(horizontalTopLeft.x) <= originLight(verticalBottomLeft.x) &&
									isBetween(horizontalTopLeft.x, verticalBottomLeft.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalBottomLeft.y, horizontalTopLeft.y) &&
									(
										(
											inside(point2GeoJsonLight(verticalBottomLeft), polygonLight) !== false &&
											inside(point2GeoJsonLight(verticalBottomRight), polygonLight) !== false
										) || (
											inside(point2GeoJsonHeavy(verticalBottomLeft), polygonHeavy) !== false &&
											inside(point2GeoJsonHeavy(verticalBottomRight), polygonHeavy) !== false
										)
									)
								) {
									let isCorner = (abs(originLight(horizontalBottomLeft.x) - originLight(verticalBottomLeft.x)) < 30) || (abs(originLight(horizontalBottomRight.x) - originLight(verticalBottomRight.x)) < 30);
									let horizontalBottomSlopeLight = horizontalSlope(lineLight(horizontalBottomLeft, horizontalBottomRight)) || 0;
									let horizontalBottomSlopeHeavy = horizontalSlope(lineHeavy(horizontalBottomLeft, horizontalBottomRight)) || 0;
									debug && console.log("horizontalBottomSlopeLight", horizontalBottomSlopeLight);
									debug && console.log("horizontalBottomSlopeHeavy", horizontalBottomSlopeHeavy);
									if (!Number.isFinite(horizontalBottomSlopeLight)) continue;
									if (!Number.isFinite(horizontalBottomSlopeHeavy)) continue;
									let verticalBottomCenterXLight = (originLight(verticalBottomLeft.x) + originLight(verticalBottomRight.x)) / 2;
									let verticalBottomCenterXHeavy = (originHeavy(verticalBottomLeft.x) + originHeavy(verticalBottomRight.x)) / 2;
									// let distanceLight = verticalBottomCenterXLight - originLight(horizontalTopLeft.x);
									// let distanceHeavy = verticalBottomCenterXHeavy - originHeavy(horizontalTopLeft.x);
									// // let yOffsetL = isCorner ? 0 : (distanceLight * horizontalTopSlopeLight) + (horizontalTopSlopeLight === 0 ? 10 : 8);
									// let yOffsetL = isCorner ? 0 : (distanceLight * horizontalTopSlopeLight) + 15;
									// let yOffsetH = isCorner ? 0 : (distanceHeavy * horizontalTopSlopeHeavy) + 70;
									// let rightDistance = abs(verticalBottomCenterXLight - originLight(horizontalTopRight.x));
									// let leftDistance = abs(verticalBottomCenterXLight - originLight(horizontalTopLeft.x));
									// let side = rightDistance < leftDistance ? isCorner ? horizontalBottomRight : horizontalTopLeft : isCorner ? horizontalBottomLeft : horizontalTopLeft;
									let distanceLight = verticalBottomCenterXLight - originLight(horizontalBottomLeft.x);
									let distanceHeavy = verticalBottomCenterXHeavy - originHeavy(horizontalBottomLeft.x);
									let yOffsetL = isCorner ? 0 : (distanceLight * horizontalBottomSlopeLight) + (horizontalBottomSlopeLight === 0 ? 10 : 8);
									let yOffsetH = isCorner ? 0 : (distanceHeavy * horizontalBottomSlopeHeavy) + 30;
									let rightDistance = abs(verticalBottomCenterXLight - originLight(horizontalBottomRight.x));
									let leftDistance = abs(verticalBottomCenterXLight - originLight(horizontalBottomLeft.x));
									let side = rightDistance < leftDistance ? isCorner ? horizontalBottomRight : horizontalBottomLeft : isCorner ? horizontalBottomLeft : horizontalBottomLeft;
									
									newContour[bottomLeftIdx] = {
										x: verticalBottomLeft.x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalBottomLeft.y) + yOffsetL,
											// originHeavy(horizontalBottomLeft.y) + yOffsetH
										),
										kind: 0,
									};
									newContour[bottomRightIdx] = {
										x: verticalBottomRight.x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalBottomLeft.y) + yOffsetL,
											// originHeavy(horizontalBottomLeft.y) + yOffsetH
										),
										kind: 0,
									};
									// extended = true;
									// break;
								}
							}
						}
						if (extended)
						break;
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}
		
		oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
			// find possible 横s (horizontals)
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const topLeftIdx = idxP1;
				const bottomLeftIdx = nextNode(contour, topLeftIdx);
				const bottomRightIdx = nextNode(contour, bottomLeftIdx);
				const topRightIdx = previousNode(contour, topLeftIdx);
				if (
					// is left end
					canBeLeftEnd(contour[topLeftIdx], circularArray(contour, bottomLeftIdx)) &&
					approxEq(contour[topLeftIdx].y, circularArray(contour, topRightIdx).y) &&
					approxEq(circularArray(contour, bottomLeftIdx).y, circularArray(contour, bottomRightIdx).y) &&
					originLight(circularArray(contour, bottomRightIdx).x) > originLight(circularArray(contour, bottomLeftIdx).x)
				) {
					// const topLeftIdx = idxP1;
					// const bottomLeftIdx = circularIndex(contour, idxP1 + 1);
					// const bottomRightIdx = circularIndex(contour, idxP1 + 2);
					// const topRightIdx = circularIndex(contour, idxP1 - 1);
					const horizontalTopLeft = contour[topLeftIdx];
					const horizontalBottomLeft = circularArray(contour, bottomLeftIdx);
					const horizontalBottomRight = circularArray(contour, bottomRightIdx);
					const horizontalTopRight = circularArray(contour, topRightIdx);
					const horizontalStrokeLight = originLight(horizontalTopLeft.y) - originLight(horizontalBottomLeft.y);
					const horizontalStrokeHeavy = originHeavy(horizontalTopLeft.y) - originHeavy(horizontalBottomLeft.y);
					
					setCustomRadius(name, idxC1, distanceLight(horizontalBottomLeft, horizontalTopLeft) / 2, distanceHeavy(horizontalBottomLeft, horizontalTopLeft) / 2);
					
					for (const [idxC2, contour2] of oldContours.entries()) {
						// find possible 竖s (verticals)
						if (idxC2 === idxC1 || contour2.length < 4 || skipContours.includes(idxC2)) continue;

						let polygonLight = [contour2GeoJsonLight(contour2)];
						// let polygonLight2 = offset.data(polygonLight).arcSegments(3).margin(1);
						let polygonHeavy = [contour2GeoJsonHeavy(contour2)];
						// let polygonHeavy2 = offset.data(polygonHeavy).arcSegments(3).margin(1);

						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							if (
								// is top end
								canBeTopEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].x, circularArray(contour2, idxP2 - 1).x, 450) &&
								approxEq(circularArray(contour2, idxP2 + 1).x, circularArray(contour2, idxP2 + 2).x, 450)
							) {
								const verticalTopRight = contour2[idxP2];
								const verticalTopLeft = circularArray(contour2, idxP2 + 1);
								const verticalBottomLeft = circularArray(contour2, idxP2 + 2);
								const verticalBottomRight = circularArray(contour2, idxP2 - 1);
								if (
									// and 横's (horizontal's) left end inside 竖 (vertical)
									// ┌──┬──┬───
									// │  ⇦  ┊   
									// │  └──┼───
									// │     │   
									// │     │   
									// │  ┌──┼───
									// │  ⇦  ┊   
									// │  └──┼───
									// │     │   
									isBetween(verticalTopLeft.x, horizontalTopLeft.x, verticalTopRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopLeft.y, verticalTopRight.y) &&
									(
										(
											inside(point2GeoJsonLight(horizontalTopLeft), polygonLight) !== false &&
											inside(point2GeoJsonLight(horizontalBottomLeft), polygonLight) !== false
										) || (
											inside(point2GeoJsonHeavy(horizontalTopLeft), polygonHeavy) !== false &&
											inside(point2GeoJsonHeavy(horizontalBottomLeft), polygonHeavy) !== false
										)
									)
								) {
									let isCorner = (abs(originLight(horizontalTopLeft.y) - originLight(verticalTopLeft.y)) < 30) || (abs(originLight(horizontalBottomLeft.y) - originLight(verticalBottomLeft.y)) < 30);
									let xOffsetL = isCorner ? 0 : 4;
									let xOffsetH = isCorner ? 0 : 20;
									newContour[topLeftIdx] = {
										x: makeVariance(
											originLight(verticalTopLeft.x) + xOffsetL,
											originHeavy(verticalTopLeft.x) + xOffsetH
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											originLight(verticalTopLeft.x) + xOffsetL,
											originHeavy(verticalTopLeft.x) + xOffsetH
										),
										y: horizontalBottomLeft.y,
										kind: 0,
									};
								}
							}
							if (
								// is bottom end
								canBeBottomEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].x, circularArray(contour2, idxP2 - 1).x, 450) &&
								approxEq(circularArray(contour2, idxP2 + 1).x, circularArray(contour2, idxP2 + 2).x, 450)
							) {
								const verticalBottomLeft = contour2[idxP2];
								const verticalBottomRight = circularArray(contour2, nextNode(contour2, idxP2));
								// const verticalTopRight = nextNode(contour2, idxP2 + 1);
								// const verticalTopLeft = previousNode(contour2, idxP2);

								const verticalTopRight = circularArray(contour2, findTopRightCorner(contour2)) || circularArray(contour2, idxP2 + 2);
								const verticalTopLeft = circularArray(contour2, findTopLeftCorner(contour2)) || circularArray(contour2, previousNode(contour2, idxP2));
								// const verticalTopRight = circularArray(contour2, idxP2 + 2);
								// const verticalTopLeft = circularArray(contour2, idxP2 - 1);
								const verticalLeftSlopeLight = verticalSlope(lineLight(verticalBottomLeft, verticalTopLeft));
								const verticalLeftSlopeHeavy = verticalSlope(lineHeavy(verticalBottomLeft, verticalTopLeft));
								debug && console.log("verticalLeftSlopeLight", verticalLeftSlopeLight);
								debug && console.log("verticalLeftSlopeHeavy", verticalLeftSlopeHeavy);
								if (!Number.isFinite(verticalLeftSlopeLight)) continue;
								if (!Number.isFinite(verticalLeftSlopeHeavy)) continue;
								debug && console.log(`is lefts bottom end - idxC2: ${idxC2}, idxP2: ${idxP2}`);
								if (
									// and 横's (horizontal's) left end inside 竖 (vertical)
									isBetween(verticalBottomLeft.x, horizontalBottomLeft.x, verticalBottomRight.x) &&
									isBetween(verticalBottomRight.y, horizontalBottomLeft.y, verticalTopRight.y) &&
									(
										(
											inside(point2GeoJsonLight(horizontalTopLeft), polygonLight) !== false &&
											inside(point2GeoJsonLight(horizontalBottomLeft), polygonLight) !== false
										) || (
											inside(point2GeoJsonHeavy(horizontalTopLeft), polygonHeavy) !== false &&
											inside(point2GeoJsonHeavy(horizontalBottomLeft), polygonHeavy) !== false
										)
									)
								) {
									let isCorner = (abs(originLight(horizontalTopLeft.y) - originLight(verticalTopLeft.y)) < 5) || (abs(originLight(horizontalBottomLeft.y) - originLight(verticalBottomLeft.y)) < 5);
									let horizontalLeftCenterYLight = (originLight(horizontalTopLeft.y) + originLight(horizontalBottomLeft.y)) / 2;
									let horizontalLeftCenterYHeavy = (originHeavy(horizontalTopLeft.y) + originHeavy(horizontalBottomLeft.y)) / 2;
									let distanceLight = horizontalLeftCenterYLight - originLight(verticalBottomLeft.y);
									let distanceHeavy = horizontalLeftCenterYHeavy - originHeavy(verticalBottomLeft.y);
									let xOffsetL = (distanceLight * verticalLeftSlopeLight) + (verticalLeftSlopeLight === 0 ? 2 : 6);
									let xOffsetH = (distanceHeavy * verticalLeftSlopeHeavy) + 4;
									let topDistance = abs(horizontalLeftCenterYLight - originLight(verticalTopLeft.y));
									let bottomDistance = abs(horizontalLeftCenterYLight - originLight(verticalBottomLeft.y));
									let side = topDistance < bottomDistance ? isCorner ? verticalTopLeft : verticalBottomLeft : isCorner ? verticalBottomLeft : verticalBottomLeft;
									if (abs(originLight(horizontalBottomLeft.y) - originLight(verticalBottomLeft.y)) < 2) {
										newContour[bottomLeftIdx] = {
											x: makeVariance(
												originLight(verticalBottomLeft.x),
												originHeavy(verticalBottomLeft.x)
											),
											y: makeVariance(
												originLight(verticalBottomLeft.y),
												originHeavy(verticalBottomLeft.y)
											),
											kind: 0,
										};
										newContour[topLeftIdx] = {
											x: makeVariance(
												originLight(verticalBottomLeft.x) + (horizontalStrokeLight * verticalLeftSlopeLight),
												originHeavy(verticalBottomLeft.x) + (horizontalStrokeHeavy * verticalLeftSlopeHeavy)
											),
											y: makeVariance(
												originLight(horizontalTopLeft.y),
												originHeavy(horizontalTopLeft.y)
											),
											kind: 0,
										};
									} else {
										newContour[topLeftIdx] = {
											x: makeVariance(
												originLight(side.x) + xOffsetL,
												originHeavy(side.x) + xOffsetH
											),
											y: horizontalTopLeft.y,
											kind: 0,
										};
										newContour[bottomLeftIdx] = {
											x: makeVariance(
												originLight(side.x) + xOffsetL,
												originHeavy(side.x) + xOffsetH
											),
											y: horizontalBottomLeft.y,
											kind: 0,
										};
									}
								}
							}
						}
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}
		
		oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
			// find possible 竖s (verticals)
			if (contour.length < 4 || skipContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const topRightIdx = idxP1;
				const topLeftIdx = nextNode(contour, topRightIdx);
				const bottomLeftIdx = nextNode(contour, topLeftIdx);
				const bottomRightIdx = previousNode(contour, topRightIdx);
				if (
					// is top end
					canBeTopEnd(contour[topRightIdx], circularArray(contour, topLeftIdx)) &&
					approxEq(contour[topRightIdx].x, circularArray(contour, bottomRightIdx).x, 85) &&
					approxEq(circularArray(contour, topLeftIdx).x, circularArray(contour, bottomLeftIdx).x, 85)
				) {
					const verticalTopRight = circularArray(contour, topRightIdx);
					const verticalTopLeft = circularArray(contour, topLeftIdx);
					const verticalBottomLeft = circularArray(contour, bottomLeftIdx);
					const verticalBottomRight = circularArray(contour, bottomRightIdx);
					
					const verticalBottomLeftCorner = circularArray(contour, nextNode(contour, topLeftIdx, true));
					const verticalBottomRightCorner = circularArray(contour, previousNode(contour, topRightIdx, true));
					let topLight = distanceLight(verticalTopRight, verticalTopLeft);
					let bottomLight = distanceLight(verticalBottomRightCorner, verticalBottomLeftCorner);
					let topHeavy = distanceHeavy(verticalTopRight, verticalTopLeft);
					let bottomHeavy = distanceHeavy(verticalBottomRightCorner, verticalBottomLeftCorner);
					let heavyRadius;
					if (abs(topLight - bottomLight) < 12) {
						heavyRadius = max(topHeavy, bottomHeavy) / 1.8
					} else {
						heavyRadius = topHeavy / 1.8
					}
					
					setCustomRadius(name, idxC1, topLight / 2, heavyRadius);
					for (const [idxC2, contour2o] of oldContours.entries()) {
						// find possible 横s (horizontals)
						if (idxC2 === idxC1 || contour2o.length < 4 || skipContours.includes(idxC2)) continue;

						let polygonLight = [contour2GeoJsonLight(contour2o)];
						// let polygonLight2 = offset.data(polygonLight).arcSegments(3).margin(1);
						let polygonHeavy = [contour2GeoJsonHeavy(contour2o)];
						// let polygonHeavy2 = offset.data(polygonHeavy).arcSegments(3).margin(1);

						let contour2 = contour2o.filter((point) => point.kind === 0);
						let extended = false;
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							if (
								// is left end
								canBeLeftEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].y, circularArray(contour2, idxP2 - 1).y, 85) &&
								approxEq(circularArray(contour2, idxP2 + 1).y, circularArray(contour2, idxP2 + 2).y, 85)
							) {
								const horizontalTopLeft = contour2[idxP2];
								const horizontalBottomLeft = circularArray(contour2, idxP2 + 1);
								const horizontalBottomRight = circularArray(contour2, idxP2 + 2);
								const horizontalTopRight = circularArray(contour2, previousNode(contour2, idxP2));
								const strokeLight = distanceLight(horizontalTopLeft, horizontalBottomLeft);
								const strokeHeavy = distanceHeavy(horizontalTopLeft, horizontalBottomLeft);
								// const horizontalTopRight = (circularArray(contour2, idxP2 - 1).kind === 0 && distanceHeavy(circularArray(contour2, idxP2 - 1), horizontalTopLeft) >= strokeHeavy) ? circularArray(contour2, idxP2 - 1) :
								// circularArray(contour2, idxP2 - 2).kind === 0 ? circularArray(contour2, idxP2 - 2) : 
								// circularArray(contour2, idxP2 - 3).kind === 0 ? circularArray(contour2, idxP2 - 3) : circularArray(contour2, idxP2 - 4);
								if (
									// and 竖's (vertical's) top inside 横's (horizontal's) left end
									// ┌────────
									// ├─⇧─┐
									// ├╌╌╌┤────
									// │   │
									isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalTopLeft.y, horizontalTopRight.y) &&
									(
										(
											inside(point2GeoJsonLight(verticalTopRight), polygonLight) !== false &&
											inside(point2GeoJsonLight(verticalTopLeft), polygonLight) !== false
										) || (
											inside(point2GeoJsonHeavy(verticalTopRight), polygonHeavy) !== false &&
											inside(point2GeoJsonHeavy(verticalTopLeft), polygonHeavy) !== false
										)
									)
								) {
									let isCorner = (abs(originLight(horizontalTopLeft.x) - originLight(verticalTopLeft.x)) <= 30) || (abs(originLight(horizontalTopRight.x) - originLight(verticalTopRight.x)) < 30);
									// let isCorner = true;

									let hBLXLight = originLight(horizontalBottomLeft.x);
									let hBLYLight = originLight(horizontalBottomLeft.y);
									let hBRXLight = originLight(horizontalBottomRight.x);
									let hBRYLight = originLight(horizontalBottomRight.y);
									let hBLXHeavy = originHeavy(horizontalBottomLeft.x);
									let hBLYHeavy = originHeavy(horizontalBottomLeft.y);
									let hBRXHeavy = originHeavy(horizontalBottomRight.x);
									let hBRYHeavy = originHeavy(horizontalBottomRight.y);
									let horizontalBottomSlopeLight = horizontalSlope({p1: {x: hBLXLight, y: hBLYLight}, p2: {x: hBRXLight, y: hBRYLight}}) || 0;
									let horizontalBottomSlopeHeavy = horizontalSlope({p1: {x: hBLXHeavy, y: hBLYHeavy}, p2: {x: hBRXHeavy, y: hBRYHeavy}}) || 0;
									debug && console.log("horizontalBottomSlopeLight", horizontalBottomSlopeLight);
									debug && console.log("horizontalBottomSlopeHeavy", horizontalBottomSlopeHeavy);
									if (!Number.isFinite(horizontalBottomSlopeLight)) continue;
									if (!Number.isFinite(horizontalBottomSlopeHeavy)) continue;
									let distanceLight = originLight(verticalTopLeft.x) - hBLXLight;
									let distanceHeavy = originHeavy(verticalTopLeft.x) - hBLXHeavy;
									let yOffsetL = isCorner ? 0 : (distanceLight * horizontalBottomSlopeLight) + (strokeLight * 0.85);
									// let yOffsetL = isCorner ? 0 : (distanceLight * horizontalBottomSlopeLight) + (horizontalBottomSlopeLight === 0 ? 20 : 8);
									let yOffsetH = isCorner ? 0 : (distanceHeavy * horizontalBottomSlopeHeavy) + (strokeHeavy * 0.85);
									let rightDistance = abs(originLight(verticalTopRight.x) - originLight(horizontalTopRight.x));
									let leftDistance = abs(originLight(verticalTopLeft.x) - originLight(horizontalTopLeft.x));
									let side = rightDistance < leftDistance ? isCorner ? horizontalTopRight : horizontalBottomLeft : isCorner ? horizontalTopLeft : horizontalBottomLeft;
									newContour[topRightIdx] = {
										// x: verticalTopRight.x,
										x: newContour[topRightIdx].x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalTopRight.y) - yOffsetL,
											// originHeavy(horizontalTopRight.y) - yOffsetH
										),
										kind: 0,
									};
									// contour[topRightIdx] = newContour[topRightIdx];
									// oldContours[idxC1][topRightIdx] = newContour[topRightIdx];
									newContour[topLeftIdx] = {
										// x: verticalTopLeft.x,
										x: newContour[topLeftIdx].x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalTopLeft.y) - yOffsetL,
											// originHeavy(horizontalTopLeft.y) - yOffsetH
										),
										kind: 0,
									};
									// contour[topLeftIdx] = newContour[topLeftIdx];
									// oldContours[idxC1][topLeftIdx] = newContour[topLeftIdx];
									// extended = true;
									// break;
								}
							}
						}
						if (extended)
						break;
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	let bar = new ProgressBar('\u001b[38;5;82mextendShortStroke\u001b[0m [2/6] :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	// let bar = new ProgressBar('\u001b[38;5;82mextendShortStroke\u001b[0m [2/5] :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
		// console.log(name);
		// if (["uni758E"].includes(name)) {
		// 	debug = true;
		// 	console.log(" ");
		// 	console.log(name);
		// } else {
		// 	debug = false;
		// }
		progressTick(name);
		if (!references.extendSkip.includes(name)) checkSingleGlyph(glyph);
		// count++;
		// if (count % 1000 == 0) console.log("extendShortStroke: ", count, " glyphs processed.");
	}
	delete references.extendIgnoreContourIdx;
}

module.exports = {
	extendShortStroke: extendShortStroke,
};
