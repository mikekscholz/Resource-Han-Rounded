"use strict";

const { Ot } = require("ot-builder");
const inside = require("point-in-polygon-hao");
const geometric = require("geometric");
const polyClockwise = require("polygon-direction");
const ProgressBar = require('./node-progress');
const { angle, approximateBezier, base60, bearing, horizontalSlope, isBetween, roundTo, turn, verticalSlope, closestPointOnLine } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc, max, min } = Math;

// based on measurement of SHS
const params = {
	strokeWidth: { light: 35, heavy: 180 },
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

// some 横s of 横折s in SHS is shorter than expected.
// extend to align them.
// ─────┬──┬──┐
//      │  │  │
// ─────┼──┘  │
//      │     │
//
function extendShortStroke(font, references, limit) {

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
		return bottomLeft.kind == 0 && bottomRight.kind == 0 &&
			approxEq(bottomLeft.y, bottomRight.y, 20, 54) &&
			approxEq(originLight(bottomRight.x) - originLight(bottomLeft.x), params.strokeWidth.light, 20,) &&
			originHeavy(bottomRight.x) - originHeavy(bottomLeft.x) <= params.strokeWidth.heavy;
	}
	
	function canBeLeftEnd(topLeft, bottomLeft) {
		return topLeft.kind == 0 && bottomLeft.kind == 0 &&
			approxEq(topLeft.x, bottomLeft.x, 40, 75) &&
			approxEq(originLight(topLeft.y) - originLight(bottomLeft.y), params.strokeWidth.light, 20,) &&
			originHeavy(topLeft.y) - originHeavy(bottomLeft.y) <= params.strokeWidth.heavy;
	}

	function canBeRightEnd(bottomRight, topRight) {
		return bottomRight.kind == 0 && topRight.kind == 0 &&
			approxEq(bottomRight.x, topRight.x, 25, 100) &&
			approxEq(distanceLight(topRight, bottomRight), params.strokeWidth.light, 20,) &&
			originHeavy(topRight.y) - originHeavy(bottomRight.y) <= params.strokeWidth.heavy;
	}

	function canBeTopEnd(topRight, topLeft) {
		return topRight.kind == 0 && topLeft.kind == 0 &&
			approxEq(topRight.y, topLeft.y, 20, 54) &&
			approxEq( originLight(topRight.x) - originLight(topLeft.x), params.strokeWidth.light, 20,) &&
			originHeavy(topRight.x) - originHeavy(topLeft.x) <= params.strokeWidth.heavy;
	}
	function canBePolyTop(topRight, topLeft) {
		return topRight.kind == 0 && topLeft.kind == 0 &&
			approxEq(topRight.y, topLeft.y, 20, 54) &&
			originLight(topRight.x) - originLight(topLeft.x) >= params.strokeWidth.heavy * 2 &&
			originHeavy(topRight.x) - originHeavy(topLeft.x) >= params.strokeWidth.heavy * 2;
	}

	function isBetweenPoints(a, x, b) {
		return (originLight(a) - 2) <= originLight(x) &&
			originLight(x) <= (originLight(b) + 2) &&
			(originHeavy(a) - 2) <= originHeavy(x) &&
			originHeavy(x) <= (originHeavy(b) + 2);
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(parseFloat(valueDefault.toFixed(2)), [[masterWghtMax, parseFloat(valueWghtMax.toFixed(2)) - parseFloat(valueDefault.toFixed(2))]]);
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
			let bear2 = bearing(lineLight(curr, next));
			let rotation = turn(bear1, bear2);
			if (rotation <= -68 && rotation >= -112 && bear2 > 45 && bear2 < 135) return circularIndex(contour, start + i);
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
			let bear2 = bearing(lineLight(curr, next));
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
			let bear2 = bearing(lineLight(curr, next));
			let rotation = turn(bear1, bear2);
			if (rotation <= -68 && rotation >= -112 && bear2 > 225 && bear2 < 315) return circularIndex(contour, start + i);
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
			let bear2 = bearing(lineLight(curr, next));
			let rotation = turn(bear1, bear2);
			if (rotation <= -68 && rotation >= -112 && bear2 > 225 && bear2 < 315) return circularIndex(contour, start + i);
		}
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
		return ((b1L >= 70 && b1L <= 110) && (b2L >= 70 && b2L <= 110) && (b1H >= 70 && b1H <= 110) && (b2H >= 70 && b2H <= 110));
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
	
	function contour2GeoJsonLight(contour) {
		let pointsArr = [];
		let j = contour.length - 1;
		for (let i = 0; i < contour.length; i++) {
			if (i + 1 < j && contour[i + 1].kind === 1) {
				let p1 = pointLight(contour[i]);
				let cp1 = pointLight(contour[i + 1]);
				let cp2 = pointLight(contour[i + 2]);
				let p2 = pointLight(contour[i + 3]);
				let curve = approximateBezier(p1, cp1, cp2, p2, 0.05);
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
				let curve = approximateBezier(p1, cp1, cp2, p2, 0.05);
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
		if (pointsArr[0].toString() !== pointsArr[pointsArr.length - 1].toString()) {
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
	
	function extendLineGeoJson(start, end, distance) {
		// let slope = slope(line);
		let x1 = start[0];
		let y1 = start[1];
		let x2 = end[0];
		let y2 = end[1];
		let alpha = Math.atan2(y2 - y1, x2 - x1);
		return [ x2 + distance * Math.cos(alpha), y2 + distance * Math.sin(alpha) ]
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
			refArray.push({light, heavy, idx, readOnly});
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
		// console.log(glyph.name);
		const name = glyph.name;
		
		let oldContours = glyph.geometry.contours;
		glyph.geometry.contours = [];
		
		let skipContours = [];
		let readOnlyContours = [];
		let leftOnlyContours = [];
		let rightOnlyContours = [];
		let upOnlyContours = [];
		if (name in references.extendIgnoreContourIdx) {
			skipContours = [...references.extendIgnoreContourIdx[name]];
		}
		if (name in references.extendReadOnlyContourIdx) {
			readOnlyContours = [...references.extendReadOnlyContourIdx[name]];
		}
		if (name in references.extendLeftContourIdx) {
			leftOnlyContours = [...references.extendLeftContourIdx[name]];
		}
		if (name in references.extendUpContourIdx) {
			upOnlyContours = [...references.extendUpContourIdx[name]];
		}
		if (name in references.extendRightContourIdx) {
			rightOnlyContours = [...references.extendRightContourIdx[name]];
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
				// pass means all points of hole are inside current polygon
				polyLight.push(rawPolyLightCW[idxN2]); // add hole to current polygon
				polyHeavy.push(rawPolyHeavyCW[idxN2]);
				polyGlyphLight[idxN2] = idxN1; // set holes slot to index of containing polygon
				polyGlyphHeavy[idxN2] = idxN1;
				rawPolyLightCW[idxN2] = undefined; // remove from holes array
				rawPolyHeavyCW[idxN2] = undefined;
				if (!skipContours.includes(idxN2)) skipContours.push(idxN2);
				if (!readOnlyContours.includes(idxN1)) readOnlyContours.push(idxN1);
			}
			polyGlyphLight[idxN1] = polyLight;
			polyGlyphHeavy[idxN1] = polyHeavy;
		}
		
		for (let idxC1 = 0; idxC1 < oldContours.length; idxC1++) {
			let contour = oldContours[idxC1];
			// NOTE - Compute each contour's radius for improved rounding
			let strokeEnds = [];
			
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				// const p1I = previousNode(contour, idxP1);
				// const p2I = circularIndex(contour, idxP1);
				const p1I = circularIndex(contour, idxP1);
				const p2I = nextNode(contour, p1I, true);
				const p3I = nextNode(contour, p2I, true);
				const p4I = nextNode(contour, p3I);
				const p1 = circularArray(contour, p1I);
				const p2 = circularArray(contour, p2I);
				const p3 = circularArray(contour, p3I);
				const p4 = circularArray(contour, p4I);
				if (canBeStrokeEnd(p1, p2, p3, p4)) {
					let squarePointL = closestPointOnLine(point2GeoJsonLight(p2), line2GeoJsonLight(p3, p4));
					let squarePointH = closestPointOnLine(point2GeoJsonHeavy(p2), line2GeoJsonHeavy(p3, p4));
					setCustomRadius(name, idxC1, geometric.lineLength([point2GeoJsonLight(p2), squarePointL]) / 2, geometric.lineLength([point2GeoJsonHeavy(p2), squarePointH]) / 2);
					strokeEnds.push([p2,p3]);
				}
			}
			if (polyGlyphLight[idxC1] !== undefined && polyGlyphHeavy[idxC1].length > 1) {
				let outerBounds = geometric.polygonBounds(polyGlyphHeavy[idxC1][0]);
				let outerLeft = outerBounds[0][0];
				let outerBottom = outerBounds[0][1];
				let outerRight = outerBounds[1][0];
				let outerTop = outerBounds[1][1];
				let outerWidth = outerRight - outerLeft;
				let outerHeight = outerTop - outerBottom;
				let innerBounds = [];
				for (let i = 1; i < polyGlyphHeavy[idxC1].length; i++) {
					innerBounds.push(geometric.polygonBounds(polyGlyphHeavy[idxC1][i]));
				}
				let stacking = false;
				let horizontal = 1;
				let vertical = 1;
				let innerLeft0 = innerBounds[0][0][0];
				let innerBottom0 = innerBounds[0][0][1];
				let innerRight0 = innerBounds[0][1][0];
				let innerTop0 = innerBounds[0][1][1];
				outerWidth -= (innerRight0 - innerLeft0);
				outerHeight -= (innerTop0 - innerBottom0);
				if (innerBounds.length > 1) {
					for (let i = 1; i < innerBounds.length; i++) {
						if (innerBounds[i][0][0] > innerBounds[i - 1][1][0]) {
							horizontal++;
							outerWidth -= (innerBounds[i][1][0] - innerBounds[i][0][0]);
						}
						if (innerBounds[i][1][0] < innerBounds[i - 1][0][0]) {
							horizontal++;
							outerWidth -= (innerBounds[i][1][0] - innerBounds[i][0][0]);
						}
						if (innerBounds[i][0][1] > innerBounds[i - 1][1][1]) {
							vertical++;
							outerHeight -= (innerBounds[i][1][1] - innerBounds[i][0][1]);
						}
						if (innerBounds[i][1][1] < innerBounds[i - 1][0][1]) {
							vertical++;
							outerHeight -= (innerBounds[i][1][1] - innerBounds[i][0][1]);
						}
					}
				}
				let hStroke = outerHeight / (vertical + 1);
				let vStroke = outerWidth / (horizontal + 1);
				let stroke = (hStroke + vStroke) / 2;
				setCustomRadius(name, idxC1, 15, stroke / 2, true, true);
			}
			let endsHidden = false;
			let corners = contour.filter((point) => point.kind === 0);
			// if (strokeEnds.length === 2 && corners.length.isBetween(4,5) && !skipContours.includes(idxC1) && !leftOnlyContours.includes(idxC1)) {
			if (strokeEnds.length === 2 && corners.length.isBetween(4,5) && !leftOnlyContours.includes(idxC1)) {
				for (const end of strokeEnds) {
					const [ p1, p2 ] = end;
					let hidden = false;
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined) continue;
						let polygonLight = polyGlyphLight[idxC2];
						let polygonHeavy = polyGlyphHeavy[idxC2];
						if (
							(
								inside(point2GeoJsonLight(p1), polygonLight) === true &&
								inside(point2GeoJsonLight(p2), polygonLight) === true
							) && (
								inside(point2GeoJsonHeavy(p1), polygonHeavy) === true &&
								inside(point2GeoJsonHeavy(p2), polygonHeavy) === true
							)
						) {
							hidden = true;
							break;
						}
					}
					endsHidden = hidden;
					if (!hidden) break;
				}
				if (endsHidden) {
					setCustomRadius(name, idxC1, 1, 1, false, true);
				}
			}
			
			if (contour.length < 4 || skipContours.includes(idxC1) || readOnlyContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			
			
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
				let polygonLight = polyGlyphLight[idxC1];
				let polygonHeavy = polyGlyphHeavy[idxC1];
				if (canBeStrokeEnd(p1, p2, p3, p4)) {
					let p1l = point2GeoJsonLight(p1);
					let p2l = point2GeoJsonLight(p2);
					let p3l = point2GeoJsonLight(p3);
					let p4l = point2GeoJsonLight(p4);
					let p1h = point2GeoJsonHeavy(p1);
					let p2h = point2GeoJsonHeavy(p2);
					let p3h = point2GeoJsonHeavy(p3);
					let p4h = point2GeoJsonHeavy(p4);
					let e2l = 1;
					let e3l = 1;
					let e2h = 1;
					let e3h = 1;
					let n2l = extendLineGeoJson(p1l, p2l, e2l);
					let n2h = extendLineGeoJson(p1h, p2h, e2h);
					let n3l = extendLineGeoJson(p4l, p3l, e3l);
					let n3h = extendLineGeoJson(p4h, p3h, e3h);
					if (
						inside(n2l, polygonLight) === true &&
						inside(n3l, polygonLight) === true &&
						inside(n2h, polygonHeavy) === true &&
						inside(n3h, polygonHeavy) === true
					) {
						let t2l;
						let t2h;
						let t3l;
						let t3h;
						let i2l = false;
						let i2h = false;
						let i3l = false;
						let i3h = false;
						let j2l = false;
						let j2h = false;
						let j3l = false;
						let j3h = false;
						// let heavyLimit = endsHidden ? 20 : (polyGlyphHeavy[idxC1].length > 1) ? 55 : 120;
						function test2l() {
							n2l = extendLineGeoJson(p1l, p2l, e2l);
							t2l = inside(n2l, polygonLight) === true;
							// i2l = geometric.lineIntersectsPolygon([n2l, n3l], polyGlyphLight[idxC1][0]);
							// j2l = geometric.lineIntersectsPolygon([n2l, p1l], polygonLight[0]);
						}
						function test2h() {
							n2h = extendLineGeoJson(p1h, p2h, e2h);
							t2h = inside(n2h, polygonHeavy) === true;
							// i2h = geometric.lineIntersectsPolygon([n2h, n3h], polyGlyphHeavy[idxC1][0]);
							// j2h = geometric.lineIntersectsPolygon([n2h, p1h], polygonHeavy[0]);
						}
						function test3l() {
							n3l = extendLineGeoJson(p4l, p3l, e3l);
							t3l = inside(n3l, polygonLight) === true;
							// i3l = geometric.lineIntersectsPolygon([n2l, n3l], polyGlyphLight[idxC1][0]);
							// j3l = geometric.lineIntersectsPolygon([p4l, n3l], polygonLight[0]);
						}
						function test3h() {
							n3h = extendLineGeoJson(p4h, p3h, e3h);
							t3h = inside(n3h, polygonHeavy) === true;
							// i3h = geometric.lineIntersectsPolygon([n2h, n3h], polyGlyphHeavy[idxC1][0]);
							// j3h = geometric.lineIntersectsPolygon([p4h, n3h], polygonHeavy[0]);
						}
						test2l();
						if (t2l) {
							while (t2l) {
								e2l++;
								test2l();
							}
							e2l--;
							test2l();
						}
						
						test3l();
						if (t3l) {
							while (t3l) {
								e3l++;
								test3l();
							}
							e3l--;
							test3l();
						}

						test2h();
						if (t2h) {
							while (t2h) {
								e2h++;
								test2h();
							}
							e2h--;
							test2h();
						}
						
						test3h();
						if (t3h) {
							while (t3h) {
								e3h++;
								test3h();
							}	
							e3h--;
							test3h();
						}
						
						// if (e2l === e3l && e2h !== e3h) {
						// 	let minH = min(e2h, e3h);
						// 	e2h = minH;
						// 	e3h = minH;
						// }
						
						contour[p2I] = {
							x: makeVariance(n2l[0], n2h[0]),
							y: makeVariance(n2l[1], n2h[1]),
							kind: p2.kind
						}
						contour[p3I] = {
							x: makeVariance(n3l[0], n3h[0]),
							y: makeVariance(n3l[1], n3h[1]),
							kind: p3.kind
						}
						// newContour[p2I] = {
						// 	x: makeVariance(n2l[0], n2h[0]),
						// 	y: makeVariance(n2l[1], n2h[1]),
						// 	kind: p2.kind
						// }
						// newContour[p3I] = {
						// 	x: makeVariance(n3l[0], n3h[0]),
						// 	y: makeVariance(n3l[1], n3h[1]),
						// 	kind: p3.kind
						// }
					}
				}
			}
			const newContour = [...contour];
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
				if (canBeStrokeEnd(p1, p2, p3, p4)) {
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1 || polyGlyphLight[idxC2] === undefined || skipContours.includes(idxC2)) continue;
						// if (polyGlyphLight[idxC2] === undefined || skipContours.includes(idxC2)) continue;
						let isLeft = strokeEndLeft(p1, p2, p3, p4);
						let isUp = strokeEndUp(p1, p2, p3, p4);
						let isRight = strokeEndRight(p1, p2, p3, p4);
						if (upOnlyContours.includes(idxC1) && !isUp) {
							// idxP1++
							// continue;
							break;
						}
						if (leftOnlyContours.includes(idxC1) && !isLeft) {
							// idxP1++
							// continue;
							break;
						}
						if (rightOnlyContours.includes(idxC1) && !isRight) {
							// idxP1++
							// continue;
							break;
						}
						let polygonLight = polyGlyphLight[idxC2];
						let polygonHeavy = polyGlyphHeavy[idxC2];
						let score = 0;
						let edge = 0;
						if (inside(point2GeoJsonLight(p2), polygonLight) !== false) score++;
						if (inside(point2GeoJsonLight(p3), polygonLight) !== false) score++;
						if (inside(point2GeoJsonHeavy(p2), polygonHeavy) !== false) score++;
						if (inside(point2GeoJsonHeavy(p3), polygonHeavy) !== false) score++;
						if (inside(point2GeoJsonLight(p2), polygonLight) === 0) edge++;
						if (inside(point2GeoJsonLight(p3), polygonLight) === 0) edge++;
						if (inside(point2GeoJsonHeavy(p2), polygonHeavy) === 0) edge++;
						if (inside(point2GeoJsonHeavy(p3), polygonHeavy) === 0) edge++;
						if (score >= 3) {
							let p1l = point2GeoJsonLight(p1);
							let p2l = point2GeoJsonLight(p2);
							let p3l = point2GeoJsonLight(p3);
							let p4l = point2GeoJsonLight(p4);
							let p1h = point2GeoJsonHeavy(p1);
							let p2h = point2GeoJsonHeavy(p2);
							let p3h = point2GeoJsonHeavy(p3);
							let p4h = point2GeoJsonHeavy(p4);
							let e2l = 0;
							let e3l = 0;
							let e2h = 0;
							let e3h = 0;
							let n2l = extendLineGeoJson(p1l, p2l, e2l);
							let n2h = extendLineGeoJson(p1h, p2h, e2h);
							let n3l = extendLineGeoJson(p4l, p3l, e3l);
							let n3h = extendLineGeoJson(p4h, p3h, e3h);
							let t2l;
							let t2h;
							let t3l;
							let t3h;
							let i2l = false;
							let i2h = false;
							let i3l = false;
							let i3h = false;
							let j2l = false;
							let j2h = false;
							let j3l = false;
							let j3h = false;
							let heavyLimit = endsHidden ? 20 : (polygonHeavy.length > 1) ? 55 : 120;
							let intersects = false;
							if (edge.isBetween(1,2)) {
								function test2l() {
									n2l = extendLineGeoJson(p1l, p2l, e2l);
									t2l = inside(n2l, polygonLight) !== false;
								}
								function test2h() {
									n2h = extendLineGeoJson(p1h, p2h, e2h);
									t2h = inside(n2h, polygonHeavy) !== false;
								}
								function test3l() {
									n3l = extendLineGeoJson(p4l, p3l, e3l);
									t3l = inside(n3l, polygonLight) !== false;
								}
								function test3h() {
									n3h = extendLineGeoJson(p4h, p3h, e3h);
									t3h = inside(n3h, polygonHeavy) !== false;
								}
								test2l();
								while (t2l) {
									e2l++;
									test2l();
								}
								e2l--;
								test2l();
								test2h();
								while (t2h) {
									e2h++;
									test2h();
								}
								e2h--;
								test2h();
								test3l();
								while (t3l) {
									e3l++;
									test3l();
								}
								e3l--;
								test3l();
								test3h();
								while (t3h) {
									e3h++;
									test3h();
								}
								e3h--;
								test3h();
								if (inside(p2l, polygonLight) === 0 && inside(p2h, polygonHeavy) === false) {
									e2h = e3h;
									test2h();
								}
							} else {
								function test2l() {
									n2l = extendLineGeoJson(p1l, p2l, e2l);
									t2l = inside(n2l, polygonLight);
									i2l = geometric.lineIntersectsPolygon([n2l, n3l], polygonLight[0]);
									j2l = geometric.lineIntersectsPolygon([n2l, p1l], polygonLight[0]);
								}
								function test2h() {
									n2h = extendLineGeoJson(p1h, p2h, e2h);
									t2h = inside(n2h, polygonHeavy);
									i2h = geometric.lineIntersectsPolygon([n2h, n3h], polygonHeavy[0]);
									j2h = geometric.lineIntersectsPolygon([n2h, p1h], polygonHeavy[0]);
								}
								function test3l() {
									n3l = extendLineGeoJson(p4l, p3l, e3l);
									t3l = inside(n3l, polygonLight);
									i3l = geometric.lineIntersectsPolygon([n2l, n3l], polygonLight[0]);
									j3l = geometric.lineIntersectsPolygon([p4l, n3l], polygonLight[0]);
								}
								function test3h() {
									n3h = extendLineGeoJson(p4h, p3h, e3h);
									t3h = inside(n3h, polygonHeavy);
									i3h = geometric.lineIntersectsPolygon([n2h, n3h], polygonHeavy[0]);
									j3h = geometric.lineIntersectsPolygon([p4h, n3h], polygonHeavy[0]);
								}
								test2l();
								// if (!t2l) {
								// 	while (!t2l) {
								// 		e2l++;
								// 		test2l();
								// 	}
								// }
								// if (t2l) {
								// 	while (t2l && e2l <= 20 && (!i2l || !j2l)) {
								if (t2l || (!t2l && i2l && !j2l)) {
									while ((t2l || (!t2l && i2l && !j2l)) && e2l <= 20 && (!i2l || !j2l)) {	
										e2l++;
										test2l();
									}
									e2l = e2l - 5;
									test2l();
								}
								
								test3l();
								// if (!t3l) {
								// 	while (!t3l) {
								// 		e3l++;
								// 		test3l();
								// 	}
								// }
								// if (t3l) {
								// 	while (t3l && e3l <= 20 && (!i3l || !j3l)) {
								if (t3l || (!t3l && i3l && !j3l)) {
									while ((t3l || (!t3l && i3l && !j3l)) && e3l <= 20 && (!i3l || !j3l)) {	
										e3l++;
										test3l();
									}
									e3l = e3l - 5;
									test3l();
								}

								test2h();
								if (t2h || (!t2h && i2h && !j2h)) {
									while ((t2h || (!t2h && i2h && !j2h)) && e2h <= heavyLimit && (!i2h || !j2h)) {
										e2h++;
										test2h();
									}
									e2h = e2h - 5;
									test2h();
								}
								
								test3h();
								if (t3h || (!t3h && i3h && !j3h)) {
									while ((t3h || (!t3h && i3h && !j3h)) && e3h <= heavyLimit && (!i3h || !j3h)) {
										e3h++;
										test3h();
									}	
									e3h = e3h - 5;
									test3h();
								}
								
								if (e2l === e3l && e2h !== e3h) {
									let minL = min(e2l, e3l);
									e2l = minL;
									e3l = minL;
									let minH = min(e2h, e3h);
									e2h = minH;
									e3h = minH;
									test2l();
									test3l();
									test2h();
									test3h();
								}
							}
							newContour[p2I] = {
								x: makeVariance(n2l[0], n2h[0]),
								y: makeVariance(n2l[1], n2h[1]),
								kind: p2.kind
							}
							newContour[p3I] = {
								x: makeVariance(n3l[0], n3h[0]),
								y: makeVariance(n3l[1], n3h[1]),
								kind: p3.kind
							}
							if (JSON.stringify(contour[p2I]) === JSON.stringify(circularArray(contour, p2I + 1))) {
								newContour[circularIndex(contour, p2I + 1)] = {
									x: makeVariance(n2l[0], n2h[0]),
									y: makeVariance(n2l[1], n2h[1]),
									kind: p2.kind
								}
							}
						}
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}
		// if (name in references.extendIgnoreContourIdx) {
		// 	delete references.extendIgnoreContourIdx[name];
		// }
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	// let bar = new ProgressBar('\u001b[38;5;82mextendShortStroke\u001b[0m [2/6] :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
	// function progressTick() {
	// 	if (len) {
	// 		var chunk = 1;
	// 		bar.tick(chunk);
	// 		if (bar.curr > 0 && bar.curr < len - 2) { 
	// 			bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m' }, 'force');
	// 		}
	// 		if (bar.curr === len - 1) { 
	// 			bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m' }, 'force');
	// 		}
	// 	}
	// }
	let bar = new ProgressBar('\u001b[38;5;82mextendShortStroke\u001b[0m [2/5] :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
	function progressTick(info = "") {
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

	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		progressTick(name);
		if (!references.extendSkip.includes(name) && !references.nunitoGlyphs.includes(name) && (limit === false || count < limit)) checkSingleGlyph(glyph);
		count++;
	}
	delete references.extendIgnoreContourIdx;
}

module.exports = {
	extendShortStroke: extendShortStroke,
};
