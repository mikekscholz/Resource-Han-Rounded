"use strict";

const { Ot } = require("ot-builder");
const Bezier = require("./bezier.js");
const geometric = require("geometric");
const { hangulSios } = require("./correctionsUnicode");
const ProgressBar = require('./node-progress');
const fs = require("node:fs");
const path = require("node:path");
const { angle, approximateBezier, base60, bearing, closestPointOnLine, findIntersection, horizontalSlope, isBetween, midpoint, pointOnLine, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc, max } = Math;

// based on measurement of SHS
const params = {
	strokeWidth: { light: 29, heavy: 162 },
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

function slope(line) {
	let { p1, p2 } = line;
	return (p2.y - p1.y) / (p2.x - p1.x);
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

function correctGlyphs(font, references) {
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
	
	function isBreve(contour) {
		if (contour.length < 15) return false;
		const c = contour;
		const cy0 = originLight(c[0].y);
		const cy1 = originLight(c[1].y);
		const cy13 = originLight(c[13].y);
		const cy14 = originLight(c[14].y);
		return c[0].kind == 0 && c[1].kind == 1 && c[2].kind == 2 && c[3].kind == 0 && c[4].kind == 0 && c[5].kind == 1 && c[6].kind == 2 && c[7].kind == 0 && c[8].kind == 1 && c[9].kind == 2 && c[10].kind == 0 && c[11].kind == 0 && c[12].kind == 1 && c[13].kind == 2 && c[14].kind == 0 && [627,631,783].includes(cy0) && cy0 == cy1 && cy1 == cy13 && cy13 == cy14;
	}
	
	function isTilde(contour) {
		if (contour.length != 21) return false;
		const c = contour;
		const cy0 = originLight(c[0].y);
		const cy1 = originLight(c[1].y);
		const cy19 = originLight(c[19].y);
		const cy20 = originLight(c[20].y);
		return c[0].kind == 0 && c[1].kind == 1 && c[2].kind == 2 && c[3].kind == 0 && c[4].kind == 0 && c[5].kind == 1 && c[6].kind == 2 && c[7].kind == 0 && c[8].kind == 1 && c[9].kind == 2 && c[10].kind == 0 && c[11].kind == 1 && c[12].kind == 2 && c[13].kind == 0 && c[14].kind == 0 && c[15].kind == 1 && c[16].kind == 2 && c[17].kind == 0 && c[18].kind == 1 && c[19].kind == 2 && c[20].kind == 0 && [638, 778, 794, 925].includes(cy0) && cy0 == cy1 && cy1 == cy19 && cy19 == cy20;
	}
	
	function isAcute(c) {
		if (c.length !== 8) return false;
		const s1x = originHeavy(c[1].x) - originHeavy(c[0].x);
		const s1y = originHeavy(c[1].y) - originHeavy(c[0].y);
		const s2x = originHeavy(c[2].x) - originHeavy(c[0].x);
		const s2y = originHeavy(c[2].y) - originHeavy(c[0].y);
		const s3x = originHeavy(c[3].x) - originHeavy(c[0].x);
		const s3y = originHeavy(c[3].y) - originHeavy(c[0].y);
		const s4x = originHeavy(c[4].x) - originHeavy(c[0].x);
		const s4y = originHeavy(c[4].y) - originHeavy(c[0].y);
		const s5x = originHeavy(c[5].x) - originHeavy(c[0].x);
		const s5y = originHeavy(c[5].y) - originHeavy(c[0].y);
		const s6x = originHeavy(c[6].x) - originHeavy(c[0].x);
		const s6y = originHeavy(c[6].y) - originHeavy(c[0].y);
		const s7x = originHeavy(c[7].x) - originHeavy(c[0].x);
		const s7y = originHeavy(c[7].y) - originHeavy(c[0].y);
		return	s1x >= 141	&&	s1x <= 196 && 
				s1y == 0	&&
				s2x >= 244	&&	s2x <= 307 && 
				s2y >= 103	&&	s2y <= 150 &&
				s3x >= 186	&&	s3x <= 239 && 
				s3y >= 156	&&	s3y <= 212 &&
				s4x >= 67	&&	s4x <= 101 && 
				s4y >= 78	&&	s4y <= 130 && 
				s6x >= -57	&&	s6x <= -22 && 
				s6y >= 156	&&	s6y <= 212 &&
				s7x >= -124	&&	s7x <= -79 && 
				s7y >= 103	&&	s7y	<= 150;
	}
	
	function isHookAbove(c) {
		if (c.length !== 14) return false;
		const origin = { x: originHeavy(c[0].x), y: originHeavy(c[0].y) };
		const s1x = originHeavy(c[1].x) - origin.x;
		const s1y = originHeavy(c[1].y) - origin.y;
		const s2x = originHeavy(c[2].x) - origin.x;
		const s2y = originHeavy(c[2].y) - origin.y;
		const s3x = originHeavy(c[3].x) - origin.x;
		const s3y = originHeavy(c[3].y) - origin.y;
		const s4x = originHeavy(c[4].x) - origin.x;
		const s4y = originHeavy(c[4].y) - origin.y;
		const s5x = originHeavy(c[5].x) - origin.x;
		const s5y = originHeavy(c[5].y) - origin.y;
		const s6x = originHeavy(c[6].x) - origin.x;
		const s6y = originHeavy(c[6].y) - origin.y;
		const s7x = originHeavy(c[7].x) - origin.x;
		const s7y = originHeavy(c[7].y) - origin.y;
		const s8x = originHeavy(c[8].x) - origin.x;
		const s8y = originHeavy(c[8].y) - origin.y;
		const s9x = originHeavy(c[9].x) - origin.x;
		const s9y = originHeavy(c[9].y) - origin.y;
		const sAx = originHeavy(c[10].x) - origin.x;
		const sAy = originHeavy(c[10].y) - origin.y;
		const sBx = originHeavy(c[11].x) - origin.x;
		const sBy = originHeavy(c[11].y) - origin.y;
		const sCx = originHeavy(c[12].x) - origin.x;
		const sCy = originHeavy(c[12].y) - origin.y;
		return	s1x >=  74	&&	s1x <=  91 && 
				s1y >=   4	&&	s1y <=  11 &&
				s2x >= 133	&&	s2x <= 167 && 
				s2y >=  30	&&	s2y <=  42 &&
				s3x >= 133	&&	s3x <= 167 && 
				s3y >= 100	&&	s3y <= 121 &&
				s4x >= 133	&&	s4x <= 167 && 
				s4y >= 150	&&	s4y <= 203 && 
				s5x >=  93	&&	s5x <= 115 && 
				s5y >= 189	&&	s5y <= 260 && 
				s6x >= -45	&&	s6x <= -32 && 
				s6y >= 193	&&	s6y <= 265 &&
				s7x >= -56	&&	s7x <= -51 && 
				s7y >= 121	&&	s7y	<= 156 &&
				s8x >=   4	&&	s8x <=  13 && 
				s8y >= 117	&&	s8y	<= 152 &&
				s9x >=  20	&&	s9x <=  38 && 
				s9y >= 105	&&	s9y	<= 136 &&
				sAx >=  20	&&	sAx <=  38 && 
				sAy >=  85	&&	sAy	<= 109 &&
				sBx >=  20	&&	sBx <=  38 && 
				sBy >=  65	&&	sBy	<=  84 &&
				sCx >=   5	&&	sCx <=  16 && 
				sCy >=  58	&&	sCy	<=  76;
	}
	
	function isCircumflex(c) {
		if (c.length !== 8) return false;
		const s1x = originHeavy(c[1].x) - originHeavy(c[0].x);
		const s1y = originHeavy(c[1].y) - originHeavy(c[0].y);
		const s2x = originHeavy(c[2].x) - originHeavy(c[1].x);
		const s2y = originHeavy(c[2].y) - originHeavy(c[1].y);
		const s3x = originHeavy(c[3].x) - originHeavy(c[2].x);
		const s3y = originHeavy(c[3].y) - originHeavy(c[2].y);
		const s4x = originHeavy(c[4].x) - originHeavy(c[3].x);
		const s4y = originHeavy(c[4].y) - originHeavy(c[3].y);
		const s5x = originHeavy(c[5].x) - originHeavy(c[4].x);
		const s5y = originHeavy(c[5].y) - originHeavy(c[4].y);
		const s6x = originHeavy(c[6].x) - originHeavy(c[5].x);
		const s6y = originHeavy(c[6].y) - originHeavy(c[5].y);
		const s7x = originHeavy(c[7].x) - originHeavy(c[6].x);
		const s7y = originHeavy(c[7].y) - originHeavy(c[6].y);
		const s8x = originHeavy(c[0].x) - originHeavy(c[7].x);
		const s8y = originHeavy(c[0].y) - originHeavy(c[7].y);
		return s1x >= 104 && s1x <= 145 && s1y >= 61 && s1y <= 102 &&
		s2x >= 3 && s2x <= 6 && s2y == 0 && s3x >= 104 && s3x <= 146 && s3y >= -102 && s3y <= -61 &&
		s4x >= 56 && s4x <= 78 && s4y >= 46 && s4y <= 64 && s5x >= -124 && s5x <= -99 && s5y >= 94 && s5y <= 149 &&
		s6x >= -196 && s6x <= -140 && s6y == 0 && s7x >= -124 && s7x <= -98 && s7y >= -149 && s7y <= -94 &&
		s8x >= 55 && s8x <= 78 && s8y >= -64 && s8y <= -46;
	}
	
	function approxEq(a, b, threshold = 5) {
		if (typeof a == 'number' && typeof b == 'number')
			return abs(a - b) <= threshold;
		return abs(originLight(a) - originLight(b)) <= threshold &&
			abs(originHeavy(a) - originHeavy(b)) <= threshold;
	}

	function canBeBottomEnd(bottomLeft, bottomRight) {
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
			approxEq(topLeft.x, bottomLeft.x, 20) &&
			approxEq(
				originLight(topLeft.y) - originLight(bottomLeft.y),
				params.strokeWidth.light,
				20,
			) &&
			originHeavy(topLeft.y) - originHeavy(bottomLeft.y) <= params.strokeWidth.heavy;
	}

	function canBeRightEnd(bottomRight, topRight) {
		return bottomRight.kind == 0 && topRight.kind == 0 &&
			approxEq(bottomRight.x, topRight.x, 20) &&
			approxEq(
				originLight(topRight.y) - originLight(bottomRight.y),
				params.strokeWidth.light,
				20,
			) &&
			originHeavy(topRight.y) - originHeavy(bottomRight.y) <= params.strokeWidth.heavy;
	}

	function canBeTopEnd(topRight, topLeft) {
		return topRight.kind == 0 && topLeft.kind == 0 &&
			approxEq(topRight.y, topLeft.y, 20) &&
			approxEq(
				originLight(topRight.x) - originLight(topLeft.x),
				params.strokeWidth.light,
				20,
			) &&
			originHeavy(topRight.x) - originHeavy(topLeft.x) <= params.strokeWidth.heavy;
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
	
	function canBeLeftFalling(topRight, topPeak, topLeft, flatLeft, downLeft) {
		return topRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && downLeft.kind == 0 &&
		originLight(topRight.x) - originLight(topPeak.x) > 0 &&
		originLight(topPeak.x) - originLight(topLeft.x) > 0 &&
		originLight(topLeft.x) - originLight(flatLeft.x) > 0 &&
		originLight(flatLeft.x) - originLight(downLeft.x) == 0 &&
		originLight(topRight.y) - originLight(topPeak.y) <= 0 &&
		originLight(topPeak.y) - originLight(topLeft.y) > 0 &&
		originLight(topLeft.y) - originLight(flatLeft.y) == 0 &&
		originLight(flatLeft.y) - originLight(downLeft.y) > 0;
	}

	function canBeLeftFalling2(right, topRight, topPeak, farLeft, topLeft) {
		return right.kind == 0 && topRight.kind == 0 && topPeak.kind == 0 && farLeft.kind == 0 && topLeft.kind == 0 &&
		originLight(right.x) - originLight(topRight.x) < 0 &&
		originLight(topRight.x) - originLight(topPeak.x) > 0 &&
		originLight(topPeak.x) - originLight(farLeft.x) > 0 &&
		originLight(farLeft.x) - originLight(topLeft.x) < 0 &&
		originLight(right.y) - originLight(topRight.y) < 0 &&
		originLight(topRight.y) - originLight(topPeak.y) < 0 &&
		originLight(topPeak.y) - originLight(farLeft.y) > 0 &&
		originLight(farLeft.y) - originLight(topLeft.y) == 0;
	}

	function isBetweenPoints(a, x, b) {
		return originLight(a) <= originLight(x) &&
			originLight(x) <= originLight(b) + 2 &&
			originHeavy(a) <= originHeavy(x) &&
			originHeavy(x) <= originHeavy(b) + 2;
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(valueDefault, [[masterWghtMax, valueWghtMax - valueDefault]]);
	}
	
	function setCustomRadius(glyphName, idx, radiusMin, radiusMax, force = false) {
		let light = parseFloat(radiusMin.toFixed(1));
		let heavy = parseFloat(radiusMax.toFixed(1));
		if (glyphName in references.customRadiusList === false) {
			references.customRadiusList[glyphName] = [];
		}
		let refArray = references.customRadiusList[glyphName];
		let objIndex = refArray.findIndex((obj) => obj["idx"] === idx);
		if (objIndex === -1) {
			refArray.push({light, heavy, idx});
		} else {
			let ref = refArray[objIndex];
			if (light > ref.light || force) ref.light = light;
			if (heavy > ref.heavy || force) ref.heavy = heavy;
		}
	}
	
	// function reverseContour(contour) {
	// 	let newContour = contour;
	// 	newContour.reverse();
	// 	for (let i = 0; i < newContour.length; i++) {
	// 		let kind = newContour[i].kind;
	// 		switch (kind) {
	// 			case 2:
	// 				newContour[i].kind = 1;
	// 				break;
	// 			case 1:
	// 				newContour[i].kind = 2;
	// 				break;
	// 			default:
	// 				newContour[i].kind = 0;
	// 				break;
	// 		}
	// 	}
	// 	return newContour;
	// }
	
	// Array.prototype.reverseContour = function() {
	// 	this.reverse();
	// 	for (let i = 0; i < this.length; i++) {
	// 		let kind = this[i].kind;
	// 		switch (kind) {
	// 			case 2:
	// 				this[i].kind = 1;
	// 				break;
	// 			case 1:
	// 				this[i].kind = 2;
	// 				break;
	// 			default:
	// 				this[i].kind = 0;
	// 				break;
	// 		}
	// 	}
	// 	return this;
	// };
	
	Object.defineProperty(Array.prototype, "reverseContour", {
		value: function() {
			this.reverse();
			for (let i = 0; i < this.length; i++) {
				let kind = this[i].kind;
				switch (kind) {
					case 2:
						this[i].kind = 1;
						break;
					case 1:
						this[i].kind = 2;
						break;
					default:
						this[i].kind = 0;
						break;
				}
			}
			return this;
		}
	});
	
	// Object.defineProperty(Number.prototype, "isBetween", {
	// 	value: function (a, b) {
	// 		return a <= this.valueOf() &&
	// 			this.valueOf() <= b;
	// 	}
	// });
	
	function checkSingleGlyph(glyph, idxG) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;
		const name = glyph.name;
		let oldContours = glyph.geometry.contours;
		

			
		glyph.geometry.contours = [];
		
		if (name === "uni3229") {
			oldContours.splice(2,2);
			let altContours = font.glyphs.items[idxG - 1].geometry.contours;
			oldContours[0] = altContours[0];
			oldContours[1] = altContours[1];
		}
		if (name === "uni323F") {
			let altContours = font.glyphs.items[idxG - 1].geometry.contours;
			oldContours[11] = altContours[0];
			oldContours[12] = altContours[1];
		}

		
		if (hangulSios.includes(glyph.name)) {
			for (let i = 0; i < oldContours.length - 1; i++) {
				if (
					oldContours[i].length === 10 && oldContours[i + 1].length === 10 &&
					originHeavy(oldContours[i][0].y) === originHeavy(oldContours[i + 1][0].y) &&
					originHeavy(oldContours[i + 1][0].x) - originHeavy(oldContours[i][0].x) > 0 &&
					originHeavy(oldContours[i + 1][0].x) - originHeavy(oldContours[i][0].x) <= 60
				) {
					const m0x1 = originLight(oldContours[i][0].x);
					const m0x2 = originLight(oldContours[i + 1][9].x);
					// const m0x1 = (originLight(oldContours[i + 1][0].x) + originLight(oldContours[i][0].x)) /2;
					// const m0x2 = (originLight(circularArray(oldContours[i + 1], -1).x) + originLight(circularArray(oldContours[i], -1).x)) /2;
					const m0w = abs(m0x1 - m0x2);
					const m0h = m0w / 2;
					const m0y = originLight(oldContours[i][0].y) - originLight(oldContours[i][1].y);
					const m0v = m0y < m0h ? m0h - m0y : 0;
					// const m1x1 = originHeavy(oldContours[i][0].x);
					// const m1x2 = originHeavy(circularArray(oldContours[i + 1], -1).x);
					const m1x1 = (originHeavy(oldContours[i + 1][0].x) + originHeavy(oldContours[i][0].x)) /2;
					const m1x2 = (originHeavy(oldContours[i + 1][9].x) + originHeavy(oldContours[i][9].x)) /2;
					// const m1x2 = (originHeavy(circularArray(oldContours[i + 1], previousNode(oldContours[i + 1], 0)).x) + originHeavy(circularArray(oldContours[i], previousNode(oldContours[i], 0)).x)) /2;
					const m1xo = abs(m1x1 - m1x2);
					const m1w = abs(m1x1 - m1x2) * 1.1;
					const m1xc = (m1w - m1xo) / 2;
					const m1h = m1w / 2;
					const m1y = originHeavy(oldContours[i][0].y) - originHeavy(oldContours[i][1].y);
					const m1v = m1y < m1h ? m1h - m1y : 0;
					setCustomRadius(glyph.name, i, m0h * 1.1, m1h * 1.3, true);
					setCustomRadius(glyph.name, i + 1, m0h * 1.1, m1h * 1.3, true);
					oldContours[i][0] = {
						x: makeVariance(m0x1, m1x1 - m1xc),
						y: makeVariance(originLight(oldContours[i][0].y), originHeavy(oldContours[i][0].y)),
						kind: oldContours[i][0].kind,
					};
					// oldContours[i][10] = {
					// 	x: makeVariance(m0x1, m1x1 - m1xc),
					// 	y: makeVariance(originLight(oldContours[i][0].y), originHeavy(oldContours[i][0].y)),
					// 	kind: oldContours[i][0].kind,
					// };
					oldContours[i][1] = {
						x: makeVariance(m0x1, m1x1 - m1xc),
						y: makeVariance(originLight(oldContours[i][1].y) - m0v, originHeavy(oldContours[i][1].y) - m1v),
						kind: oldContours[i][1].kind,
					};
					oldContours[i][2] = {
						x: makeVariance(m0x1, m1x1 - m1xc),
						y: makeVariance(originLight(oldContours[i][2].y) - m0v, originHeavy(oldContours[i][2].y) - m1v),
						kind: oldContours[i][2].kind,
					};
					oldContours[i][7] = {
						x: makeVariance(m0x2, m1x2 + m1xc),
						y: makeVariance(originLight(oldContours[i][7].y) - m0v, originHeavy(oldContours[i][7].y) - m1v),
						kind: oldContours[i][7].kind,
					};
					oldContours[i][8] = {
						x: makeVariance(m0x2, m1x2 + m1xc),
						y: makeVariance(originLight(oldContours[i][8].y) - m0v, originHeavy(oldContours[i][8].y) - m1v),
						kind: oldContours[i][8].kind,
					};
					oldContours[i][9] = {
						x: makeVariance(m0x2, m1x2 + m1xc),
						y: makeVariance(originLight(oldContours[i][9].y), originHeavy(oldContours[i][9].y)),
						kind: oldContours[i][9].kind,
					};
					oldContours[i + 1][0] = {
						x: makeVariance(m0x1, m1x1 - m1xc),
						y: makeVariance(originLight(oldContours[i + 1][0].y), originHeavy(oldContours[i + 1][0].y)),
						kind: oldContours[i + 1][0].kind,
					};
					// oldContours[i + 1][10] = {
					// 	x: makeVariance(m0x1, m1x1 - m1xc),
					// 	y: makeVariance(originLight(oldContours[i + 1][0].y), originHeavy(oldContours[i + 1][0].y)),
					// 	kind: oldContours[i + 1][0].kind,
					// };
					oldContours[i + 1][1] = {
						x: makeVariance(m0x1, m1x1 - m1xc),
						y: makeVariance(originLight(oldContours[i + 1][1].y) - m0v, originHeavy(oldContours[i + 1][1].y) - m1v),
						kind: oldContours[i + 1][1].kind,
					};
					oldContours[i + 1][2] = {
						x: makeVariance(m0x1, m1x1 - m1xc),
						y: makeVariance(originLight(oldContours[i + 1][2].y) - m0v, originHeavy(oldContours[i + 1][2].y) - m1v),
						kind: oldContours[i + 1][2].kind,
					};
					oldContours[i + 1][7] = {
						x: makeVariance(m0x2, m1x2 + m1xc),
						y: makeVariance(originLight(oldContours[i + 1][7].y) - m0v, originHeavy(oldContours[i + 1][7].y) - m1v),
						kind: oldContours[i + 1][7].kind,
					};
					oldContours[i + 1][8] = {
						x: makeVariance(m0x2, m1x2 + m1xc),
						y: makeVariance(originLight(oldContours[i + 1][8].y) - m0v, originHeavy(oldContours[i + 1][8].y) - m1v),
						kind: oldContours[i + 1][8].kind,
					};
					oldContours[i + 1][9] = {
						x: makeVariance(m0x2, m1x2 + m1xc),
						y: makeVariance(originLight(oldContours[i + 1][9].y), originHeavy(oldContours[i + 1][9].y)),
						kind: oldContours[i + 1][9].kind,
					};
					i++
				}
			}
		}
		
		if (name in references.horizontalLeftFalling) {
			let refs = references.horizontalLeftFalling[name];
			// console.log(refs);
			for (const ref of refs) {
				// console.log(ref);
				let idxC1 = ref.horizontal;
				let idxP1 = ref.horizontalBottomRight;
				let idxC2 = ref.leftFalling;
				let idxP2 = ref.leftFallingTopRight;
				let contour = oldContours[idxC1];
				let contour2 = oldContours[idxC2];
				if (circularIndex(contour2, -3) !== idxP2) {
					// console.log(name, idxP2, circularIndex(contour2, idxP2 + 3));
					let offset = circularIndex(contour2, idxP2 + 3);
					for (let i = 0; i < offset; i++) {
						oldContours[idxC2].push(oldContours[idxC2].shift());
					}
					// console.log(oldContours[idxC2]);
				}
				if ("vertical" in ref) {
					let idxC3 = ref.vertical;
					let idxP2 = 10;
					let idxP3 = ref.verticalTopRight;
					let contour2 = oldContours[idxC2];
					let contour3 = oldContours[idxC3];
					let verticalTopRight = contour3[idxP3];
					let verticalTopLeft = circularArray(contour3, idxP3 + 1);
					let verticalBottomLeft = circularArray(contour3, idxP3 + 2);
					let verticalBottomRight = circularArray(contour3, idxP3 - 1);
					let vtrI = circularIndex(contour3, idxP3);
					let vtlI = circularIndex(contour3, idxP3 + 1);
					let vbrI = circularIndex(contour3, idxP3 - 1);
					let r1 = circularArray(contour2, idxP2 - 3);
					let r2 = circularArray(contour2, idxP2 - 2);
					let r3 = circularArray(contour2, idxP2 - 1);
					let r4 = circularArray(contour2, idxP2);
					let l3 = circularArray(contour2, idxP2 + 6);
					let l4 = circularArray(contour2, idxP2 + 7);
					let r1I = circularIndex(contour2, idxP2 - 3);
					let r2I = circularIndex(contour2, idxP2 - 2);
					let r3I = circularIndex(contour2, idxP2 - 1);
					let r4I = circularIndex(contour2, idxP2);
					let l3I = circularIndex(contour2, idxP2 + 6);
					let l4I = circularIndex(contour2, idxP2 + 7);
					let b1I = circularIndex(contour2, idxP2 + 8);
					let b2I = circularIndex(contour2, idxP2 + 9);
					if (originLight(verticalTopRight.y) < originLight(verticalTopLeft.y)) {
						verticalTopRight = {
							x: makeVariance(originLight(verticalTopRight.x), originHeavy(verticalTopRight.x)),
							y: makeVariance(originLight(verticalTopLeft.y), originHeavy(verticalTopRight.y)),
							kind: verticalTopRight.kind,
						};
					}
					if (originHeavy(verticalBottomRight.y) > originHeavy(r1.y)) {
						oldContours[idxC3][vbrI] = {
							x: makeVariance(originLight(verticalBottomRight.x), originHeavy(verticalBottomRight.x)),
							y: makeVariance(originLight(verticalBottomRight.y), originHeavy(r1.y) - 5),
							kind: verticalBottomRight.kind,
						};
					}
						verticalTopRight = {
							x: makeVariance(originLight(verticalTopRight.x), originHeavy(verticalTopRight.x)),
							y: makeVariance(originLight(verticalTopRight.y), originHeavy(verticalTopRight.y) + 20),
							kind: verticalTopRight.kind,
						};
					let verticalLight = { p1: {x:originLight(verticalTopRight.x), y:originLight(verticalTopRight.y)}, p2: {x:originLight(verticalBottomRight.x), y:originLight(verticalBottomRight.y)} };
					let verticalHeavy = { p1: {x:originHeavy(verticalTopRight.x), y:originHeavy(verticalTopRight.y)}, p2: {x:originHeavy(verticalBottomRight.x), y:originHeavy(verticalBottomRight.y)} };
					let topLeftDiffLightX = originLight(verticalTopLeft.x) - originLight(l4.x);
					let topLeftDiffHeavyX = originHeavy(verticalTopLeft.x) - originHeavy(l4.x);
					let topLeftDiffLightY = originLight(verticalTopLeft.y) - originLight(l4.y);
					let topLeftDiffHeavyY = originHeavy(verticalTopLeft.y) - originHeavy(l4.y);
					let oldRightLight = new Bezier(originLight(r1.x),originLight(r1.y),originLight(r2.x),originLight(r2.y),originLight(r3.x),originLight(r3.y),originLight(r4.x),originLight(r4.y));
					let oldRightHeavy = new Bezier(originHeavy(r1.x),originHeavy(r1.y),originHeavy(r2.x),originHeavy(r2.y),originHeavy(r3.x),originHeavy(r3.y),originHeavy(r4.x),originHeavy(r4.y));
					let intersectRL = oldRightLight.intersects(verticalLight);
					let intersectRH = oldRightHeavy.intersects(verticalHeavy);
					let splitRL = oldRightLight.split(intersectRL[0]);
					let splitRH = oldRightHeavy.split(intersectRH[0]);
					let rightLight = splitRL.right.points;
					let rightHeavy = splitRH.right.points;
					contour2[r1I] = {
						x: makeVariance(rightLight[0].x, rightHeavy[0].x),
						y: makeVariance(rightLight[0].y, rightHeavy[0].y),
						kind: r1.kind,
					};
					contour2[r2I] = {
						x: makeVariance(rightLight[1].x, rightHeavy[1].x),
						y: makeVariance(rightLight[1].y, rightHeavy[1].y),
						kind: r2.kind,
					};
					contour2[r3I] = {
						x: makeVariance(rightLight[2].x, rightHeavy[2].x),
						y: makeVariance(rightLight[2].y, rightHeavy[2].y),
						kind: r3.kind,
					};
					contour2[r4I] = {
						x: makeVariance(rightLight[3].x, rightHeavy[3].x),
						y: makeVariance(rightLight[3].y, rightHeavy[3].y),
						kind: r4.kind,
					};
					contour2[l3I] = {
						x: makeVariance(originLight(l3.x) + topLeftDiffLightX, originHeavy(l3.x) + topLeftDiffHeavyX),
						y: makeVariance(originLight(l3.y), originHeavy(l3.y)),
						kind: l3.kind,
					};
					contour2[l4I] = {
						x: makeVariance(originLight(l4.x) + topLeftDiffLightX, originHeavy(l4.x) + topLeftDiffHeavyX),
						y: makeVariance(originLight(l4.y), originHeavy(l4.y)),
						kind: l4.kind,
					};
					contour2[b1I] = {
						x: makeVariance(originLight(verticalBottomLeft.x), originHeavy(verticalBottomLeft.x)),
						y: makeVariance(originLight(verticalBottomLeft.y), originHeavy(verticalBottomLeft.y)),
						kind: 0,
					};
					contour2[b2I] = {
						x: makeVariance(originLight(verticalBottomRight.x), originHeavy(verticalBottomRight.x)),
						y: makeVariance(originLight(verticalBottomRight.y), originHeavy(verticalBottomRight.y)),
						kind: 0,
					};
					contour3[vtrI] = {
						x: makeVariance(originLight(verticalTopRight.x), originHeavy(verticalTopRight.x)),
						y: makeVariance(originLight(l4.y), originHeavy(l4.y)),
						kind: 0,
					};
					contour3[vtlI] = {
						x: makeVariance(originLight(verticalTopLeft.x), originHeavy(verticalTopLeft.x)),
						y: makeVariance(originLight(l4.y), originHeavy(l4.y)),
						kind: 0,
					};
				}
			}
		}

		if (name in references.horizontalLeftFalling2) {
			let refs = references.horizontalLeftFalling2[name];
			// console.log(refs);
			for (const ref of refs) {
				let idxC2 = ref.leftFalling;
				let idxP2 = ref.leftFallingTopRight;
				let contour2 = oldContours[idxC2];
				if (circularIndex(contour2, -3) !== idxP2) {
					// console.log(name, idxP2, circularIndex(contour2, idxP2 + 3));
					let offset = circularIndex(contour2, idxP2 + 3);
					for (let i = 0; i < offset; i++) {
						oldContours[idxC2].push(oldContours[idxC2].shift());
					}
					// console.log(oldContours[idxC2]);
				}
			}
		}
		if (name in references.horizontalLeftFalling3) {
			let refs = references.horizontalLeftFalling3[name];
			// console.log(refs);
			for (const ref of refs) {
				let idxC2 = ref.leftFalling;
				let idxP2 = ref.leftFallingTopRight;
				let contour2 = oldContours[idxC2];
				if (circularIndex(contour2, -3) !== idxP2) {
					// console.log(name, idxP2, circularIndex(contour2, idxP2 + 3));
					let offset = circularIndex(contour2, idxP2 + 3);
					for (let i = 0; i < offset; i++) {
						oldContours[idxC2].push(oldContours[idxC2].shift());
					}
					// console.log(oldContours[idxC2]);
				}
			}
		}
		if (name in references.horizontalLeftFalling4) {
			let refs = references.horizontalLeftFalling4[name];
			for (const ref of refs) {
				let idxC1 = ref.horizontal;
				let idxP1 = ref.horizontalBottomRight;
				let contour = oldContours[idxC1];
				let horizontalBottomRight = oldContours[idxC1][idxP1];
				let horizontalTopRight = oldContours[idxC1][idxP1 + 1];
				oldContours[idxC1][idxP1 + 1] = {
					x: makeVariance(
						originLight(horizontalBottomRight.x),
						originHeavy(horizontalBottomRight.x)
					),
					y: makeVariance(
						originLight(horizontalTopRight.y),
						originHeavy(horizontalTopRight.y)
					),
					kind: horizontalTopRight.kind,
				};
				let idxC2 = ref.leftFalling;
				let idxP2 = ref.leftFallingTopRight;
				let contour2 = oldContours[idxC2];
				oldContours[idxC2].splice(-6, 3);
			}
		}

		if (name in references.horizontalLeftFalling2b) {
			let refs = references.horizontalLeftFalling2b[name];
			for (const ref of refs) {
				let idxC2 = ref.leftFalling;
				let idxP2 = ref.leftFallingTopRight;
				let contour2 = oldContours[idxC2];
				let r2 = circularArray(contour2, idxP2 - 2);
				let r3 = circularArray(contour2, idxP2 - 1);
				let r4 = circularArray(contour2, idxP2);
				let r5 = circularArray(contour2, idxP2 + 1);
				let r2I = circularIndex(contour2, idxP2 - 2);
				let r3I = circularIndex(contour2, idxP2 - 1);
				let r4I = circularIndex(contour2, idxP2);
				let r5I = circularIndex(contour2, idxP2 + 1);
				// oldContours[idxC2][r2I] = {
				// 	x: makeVariance(originLight(r2.x) + 5, originHeavy(r2.x) + 10),
				// 	y: makeVariance(originLight(r2.y), originHeavy(r2.y)),
				// 	kind: r2.kind,
				// };
				// oldContours[idxC2][r3I] = {
				// 	x: makeVariance(originLight(r3.x) + 5, originHeavy(r3.x) + 10),
				// 	y: makeVariance(originLight(r3.y), originHeavy(r3.y)),
				// 	kind: r3.kind,
				// };
				oldContours[idxC2][r4I] = {
					x: makeVariance(originLight(r4.x), originHeavy(r4.x)),
					y: makeVariance(originLight(r4.y) + 50, originHeavy(r4.y) + 120),
					kind: r4.kind,
				};
				oldContours[idxC2][r5I] = {
					x: makeVariance(originLight(r4.x), originHeavy(r4.x)),
					y: makeVariance(originLight(r5.y) + 50, originHeavy(r5.y) + 120),
					kind: r5.kind,
				};
				if (circularIndex(contour2, -4) !== idxP2) {
					let offset = circularIndex(contour2, idxP2 + 4);
					for (let i = 0; i < offset; i++) {
						oldContours[idxC2].push(oldContours[idxC2].shift());
					}
				}
				oldContours[idxC2].splice(-2, 1);
			}
		}
		
		for (const [idxC, contour] of oldContours.entries()) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			
			const newContour = [...contour];
			

			// if (["uni31A1"].includes(name)) console.log(name, contour);
			// if (["uni3105", "uni30A7", "uni3041", "uni3042", "uni31A0"].includes(name)) console.log(name, contour);
			
			if (["six","uni2465","uni246F","uni2479","uni2483","uni248D","uni2497","uni24FA","uni324D","uni3256","uni32B1","uni32BB","uni32C5","uni335E","uni3368","uni33E5","uni33EF","uni33F9","uniFF16","uni1F107"].includes(glyph.name) && contour.length === 39) {
				let node9 = newContour[9];
				let node10 = newContour[10];
				newContour.splice(10,0,node10);
				newContour.splice(9,0,node9);
				let p10L = extendLineRight(lineLight(contour[8], contour[9]), 40);
				let p10H = extendLineRight(lineHeavy(contour[8], contour[9]), 90);
				let p11L = extendLineRight(lineLight(contour[11], contour[10]), 40);
				let p11H = extendLineRight(lineHeavy(contour[11], contour[10]), 90);
				newContour[10] = {
					x: makeVariance(p10L.x, p10H.x),
					y: makeVariance(p10L.y, p10H.y),
					kind: 1,
				};
				newContour[11] = {
					x: makeVariance(p11L.x, p11H.x),
					y: makeVariance(p11L.y, p11H.y),
					kind: 2,
				};
			}
			
			if (["nine","uni2468","uni2472","uni247C","uni2486","uni2490","uni249A","uni24FD","uni3259","uni32B4","uni32BE","uni32C8","uni3361","uni336B","uni33E8","uni33F2","uni33FC","uniFF19","uni1F10A"].includes(glyph.name) && contour.length === 39) {
				let node15 = newContour[15];
				let node16 = newContour[16];
				newContour.splice(16,0,node16);
				newContour.splice(15,0,node15);
				let p16L = extendLineRight(lineLight(contour[14], contour[15]), 40);
				let p16H = extendLineRight(lineHeavy(contour[14], contour[15]), 90);
				let p17L = extendLineRight(lineLight(contour[17], contour[16]), 40);
				let p17H = extendLineRight(lineHeavy(contour[17], contour[16]), 90);
				newContour[16] = {
					x: makeVariance(p16L.x, p16H.x),
					y: makeVariance(p16L.y, p16H.y),
					kind: 1,
				};
				newContour[17] = {
					x: makeVariance(p17L.x, p17H.x),
					y: makeVariance(p17L.y, p17H.y),
					kind: 2,
				};
			}
			// fix ˇ and ̌
			if (glyph.name == "caron" || glyph.name == "uni030C") {
				newContour[0] = {
					x: makeVariance(
						originLight(contour[0].x) - 3,
						originHeavy(contour[0].x) - 55
					),
					y: makeVariance(
						originLight(contour[0].y) - 12,
						originHeavy(contour[0].y) - 34
					),
					kind: contour[0].kind,
				};
				newContour[1] = {
					x: makeVariance(
						originLight(contour[1].x) + 1,
						originHeavy(contour[1].x) - 1
					),
					y: makeVariance(
						originLight(contour[1].y),
						originHeavy(contour[1].y) + 10
					),
					kind: contour[1].kind,
				};
				newContour[2] = {
					x: makeVariance(
						originLight(contour[2].x) + 7,
						originHeavy(contour[2].x) + 54
					),
					y: makeVariance(
						originLight(contour[2].y) - 12,
						originHeavy(contour[2].y) - 35
					),
					kind: contour[2].kind,
				};
				newContour[3] = {
					x: makeVariance(
						originLight(contour[3].x) + 4,
						originHeavy(contour[3].x) + 4
					),
					y: makeVariance(
						originLight(contour[3].y) + 4,
						originHeavy(contour[3].y) + 45
					),
					kind: contour[3].kind,
				};
				newContour[4] = {
					x: makeVariance(
						originLight(contour[4].x),
						originHeavy(contour[4].x)
					),
					y: makeVariance(
						originLight(contour[4].y) + 1,
						originHeavy(contour[4].y) + 45
					),
					kind: contour[4].kind,
				};
				newContour[5] = {
					x: makeVariance(
						originLight(contour[5].x) + 2,
						originHeavy(contour[5].x) + 4
					),
					y: makeVariance(
						originLight(contour[5].y) + 4,
						originHeavy(contour[5].y) + 45
					),
					kind: contour[5].kind,
				};
				// continue;
			}
			
			if (isAcute(contour)) {
				const centerLight = (originLight(contour[0].x) + originLight(contour[1].x)) / 2;
				const centerHeavy = (originHeavy(contour[0].x) + originHeavy(contour[1].x)) / 2;
				newContour[0] = {
					x: makeVariance(centerLight, centerHeavy),
					y: makeVariance(originLight(contour[0].y) - 15, originHeavy(contour[0].y) - 40),
					kind: 0,
				};
				newContour[2] = {
					x: makeVariance(originLight(contour[2].x), originHeavy(contour[2].x) + 20),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y) - 21),
					kind: 0,
				};
				newContour[3] = {
					x: makeVariance(originLight(contour[3].x), originHeavy(contour[3].x) + 20),
					y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y)),
					kind: 0,
				};
				newContour[6] = {
					x: makeVariance(originLight(contour[6].x), originHeavy(contour[6].x) - 20),
					y: makeVariance(originLight(contour[6].y), originHeavy(contour[6].y)),
					kind: 0,
				};
				newContour[7] = {
					x: makeVariance(originLight(contour[7].x), originHeavy(contour[7].x) - 20),
					y: makeVariance(originLight(contour[7].y), originHeavy(contour[7].y) - 21),
					kind: 0,
				};
				contour.splice(1, 1);
				newContour.splice(1, 1);
				// continue;
			}
			
			if (contour.length === 8) {
				let confirmedCircumflex = false;
				if (isCircumflex(contour)) {
					confirmedCircumflex = true;
				} else {
					let temp = [...contour];
					temp.push(temp.shift());
					if (isCircumflex(temp)) {
						confirmedCircumflex = true;
						contour.push(contour.shift());
						newContour.push(newContour.shift());
					}
				}
				if (confirmedCircumflex) {
					const centerLight = (originLight(contour[6].x) + originLight(contour[5].x)) / 2;
					const centerHeavy = (originHeavy(contour[6].x) + originHeavy(contour[5].x)) / 2;
					newContour[0] = {
						x: makeVariance(originLight(contour[0].x), originHeavy(contour[0].x) - 20),
						y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y) - 20),
						kind: 0,
					};
					newContour[1] = {
						x: makeVariance(originLight(contour[1].x), originHeavy(contour[1].x)),
						y: makeVariance(originLight(contour[1].y), originHeavy(contour[1].y) - 20),
						kind: 0,
					};
					newContour[2] = {
						x: makeVariance(originLight(contour[2].x), originHeavy(contour[2].x)),
						y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y) - 20),
						kind: 0,
					};
					newContour[3] = {
						x: makeVariance(originLight(contour[3].x), originHeavy(contour[3].x) + 20),
						y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y) - 20),
						kind: 0,
					};
					newContour[4] = {
						x: makeVariance(originLight(contour[4].x), originHeavy(contour[4].x) + 20),
						y: makeVariance(originLight(contour[4].y), originHeavy(contour[4].y)),
						kind: 0,
					};
					newContour[5] = {
						x: makeVariance(centerLight, centerHeavy),
						y: makeVariance(originLight(contour[5].y) + 15, originHeavy(contour[5].y) + 20),
						kind: 0,
					};
					newContour[6] = {
						x: makeVariance(originLight(contour[6].x), originHeavy(contour[6].x)),
						y: makeVariance(originLight(contour[6].y), originHeavy(contour[6].y)),
						kind: 0,
					};
					newContour[7] = {
						x: makeVariance(originLight(contour[7].x), originHeavy(contour[7].x) - 20),
						y: makeVariance(originLight(contour[7].y), originHeavy(contour[7].y)),
						kind: 0,
					};
					contour.splice(6, 1);
					newContour.splice(6, 1);
				}
				// continue;
			}
			
			if (isTilde(contour)) {
				newContour[2] = {
					x: makeVariance(originLight(contour[2].x), originHeavy(contour[2].x) - 10),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y) - 14),
					kind: contour[2].kind,
				};
				newContour[3] = {
					x: makeVariance(originLight(contour[3].x), originHeavy(contour[3].x) + 43),
					y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y) - 31),
					kind: contour[3].kind,
				};
				newContour[4] = {
					x: makeVariance(originLight(contour[4].x), originHeavy(contour[4].x) + 48),
					y: makeVariance(originLight(contour[4].y), originHeavy(contour[4].y) + 16),
					kind: contour[4].kind,
				};
				newContour[5] = {
					x: makeVariance(originLight(contour[5].x), originHeavy(contour[5].x) + 1),
					y: makeVariance(originLight(contour[5].y), originHeavy(contour[5].y) - 24),
					kind: contour[5].kind,
				};
				newContour[12] = {
					x: makeVariance(originLight(contour[12].x), originHeavy(contour[12].x) + 10),
					y: makeVariance(originLight(contour[12].y), originHeavy(contour[12].y) + 14),
					kind: contour[12].kind,
				};
				newContour[13] = {
					x: makeVariance(originLight(contour[13].x), originHeavy(contour[13].x) - 43),
					y: makeVariance(originLight(contour[13].y), originHeavy(contour[13].y) + 31),
					kind: contour[13].kind,
				};
				newContour[14] = {
					x: makeVariance(originLight(contour[14].x), originHeavy(contour[14].x) - 48),
					y: makeVariance(originLight(contour[14].y), originHeavy(contour[14].y) - 16),
					kind: contour[14].kind,
				};
				newContour[15] = {
					x: makeVariance(originLight(contour[15].x), originHeavy(contour[15].x) - 1),
					y: makeVariance(originLight(contour[15].y), originHeavy(contour[15].y) + 24),
					kind: contour[15].kind,
				};
			}
			
			if (isBreve(contour)) {
				newContour[0] = {
					x: makeVariance(originLight(contour[0].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
					kind: contour[0].kind,
				};
				newContour[1] = {
					x: makeVariance(originLight(contour[1].x) - 10, originHeavy(contour[0].x) + 130),
					y: makeVariance(originLight(contour[1].y), originHeavy(contour[0].y)),
					kind: contour[1].kind,
				};
				newContour[13] = {
					x: makeVariance(originLight(contour[13].x) + 10, originHeavy(contour[0].x) - 130),
					y: makeVariance(originLight(contour[13].y), originHeavy(contour[0].y)),
					kind: contour[13].kind,
				};
				newContour[2] = {
					x: makeVariance(originLight(contour[2].x) - 17, originHeavy(contour[0].x) + 191),
					y: makeVariance(originLight(contour[2].y) - 31, originHeavy(contour[0].y) + 50),
					kind: contour[2].kind,
				};
				newContour[12] = {
					x: makeVariance(originLight(contour[12].x) + 17, originHeavy(contour[0].x) - 191),
					y: makeVariance(originLight(contour[12].y) - 31, originHeavy(contour[0].y) + 50),
					kind: contour[12].kind,
				};
				newContour[3] = {
					x: makeVariance(originLight(contour[3].x) - 2, originHeavy(contour[0].x) + 231),
					y: makeVariance(originLight(contour[3].y) - 50, originHeavy(contour[0].y) + 130),
					kind: contour[3].kind,
				};
				newContour[11] = {
					x: makeVariance(originLight(contour[11].x) + 2, originHeavy(contour[0].x) - 231),
					y: makeVariance(originLight(contour[11].y) - 50, originHeavy(contour[0].y) + 130),
					kind: contour[11].kind,
				};
				newContour[4] = {
					x: makeVariance(originLight(contour[4].x), originHeavy(contour[0].x) + 133),
					y: makeVariance(originLight(contour[4].y) - 40, originHeavy(contour[0].y) + 178),
					kind: contour[4].kind,
				};
				newContour[10] = {
					x: makeVariance(originLight(contour[10].x), originHeavy(contour[0].x) - 133),
					y: makeVariance(originLight(contour[10].y) - 40, originHeavy(contour[0].y) + 178),
					kind: contour[10].kind,
				};
				newContour[5] = {
					x: makeVariance(originLight(contour[5].x) - 18, originHeavy(contour[0].x) + 107),
					y: makeVariance(originLight(contour[5].y) - 29, originHeavy(contour[0].y) + 126),
					kind: contour[5].kind,
				};
				newContour[9] = {
					x: makeVariance(originLight(contour[9].x) + 18, originHeavy(contour[0].x) - 107),
					y: makeVariance(originLight(contour[9].y) - 29, originHeavy(contour[0].y) + 126),
					kind: contour[9].kind,
				};
				newContour[6] = {
					x: makeVariance(originLight(contour[6].x) - 12, originHeavy(contour[0].x) + 64),
					y: makeVariance(originLight(contour[6].y), originHeavy(contour[0].y) + 100),
					kind: contour[6].kind,
				};
				newContour[8] = {
					x: makeVariance(originLight(contour[8].x) + 12, originHeavy(contour[0].x) - 64),
					y: makeVariance(originLight(contour[8].y), originHeavy(contour[0].y) + 100),
					kind: contour[8].kind,
				};
				newContour[7] = {
					x: makeVariance(originLight(contour[7].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[7].y), originHeavy(contour[0].y) + 100),
					kind: contour[7].kind,
				};
				newContour[14] = {
					x: makeVariance(originLight(contour[14].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[14].y), originHeavy(contour[0].y)),
					kind: contour[14].kind,
				};
				if (name in references.customRadiusList === false) {
					references.customRadiusList[name] = [];
				}
				let refs = references.customRadiusList[name];
				refs.push({light: 15, heavy: 60, idx: idxC});
			}
			
			if (isHookAbove(contour)) {
				for (let i = 0; i < contour.length; i++) {
					newContour[i] = {
						x: makeVariance(originLight(contour[i].x), originHeavy(contour[i].x) + 20),
						y: makeVariance(originLight(contour[i].y), originHeavy(contour[i].y) + 10),
						kind: contour[i].kind,
					};
				}
				newContour[0] = {
					x: makeVariance(originLight(contour[0].x), originHeavy(contour[0].x) + 10),
					y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
					kind: contour[0].kind,
				};
				newContour[13] = {
					x: makeVariance(originLight(contour[13].x), originHeavy(contour[13].x) + 10),
					y: makeVariance(originLight(contour[13].y), originHeavy(contour[13].y)),
					kind: contour[13].kind,
				};
				// newContour[1] = {
				// 	x: makeVariance(originLight(contour[1].x), originHeavy(contour[1].x) + 10),
				// 	y: makeVariance(originLight(contour[1].y), originHeavy(contour[1].y)),
				// 	kind: contour[1].kind,
				// };
				// newContour[12] = {
				// 	x: makeVariance(originLight(contour[12].x), originHeavy(contour[12].x) + 10),
				// 	y: makeVariance(originLight(contour[12].y), originHeavy(contour[12].y)),
				// 	kind: contour[12].kind,
				// };
				if (name in references.customRadiusList === false) {
					references.customRadiusList[name] = [];
				}
				let refs = references.customRadiusList[name];
				refs.push({light: 18, heavy: 40, idx: idxC});
			}
			
			if (["caron", "uni02CA", "uni02CB", "gravecomb", "acutecomb", "uni030C"].includes(glyph.name)) {
				newContour.reverseContour();
			}
			
			// fix ⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴⓿❶❷❸❹❺❻❼❽❾❿
			if (["uni24EB", "uni24EC", "uni24ED", "uni24EE", "uni24EF", "uni24F0", "uni24F1", "uni24F2", "uni24F3", "uni24F4", "uni24FF", "uni2776", "uni2777","uni2778", "uni2779", "uni277A", "uni277B", "uni277C", "uni277D", "uni277E", "uni277F"].includes(glyph.name)) {
				newContour.reverseContour();
			}

			
			// fix horns (Ơ ơ Ư ư)
			if (["Ohorn","ohorn","Uhorn","uhorn","uni1EDA","uni1EDB","uni1EDC","uni1EDD","uni1EDE","uni1EDF","uni1EE0","uni1EE1","uni1EE2","uni1EE3","uni1EE8","uni1EE9","uni1EEA","uni1EEB","uni1EEC","uni1EED","uni1EEE","uni1EEF","uni1EF0","uni1EF1"].includes(glyph.name) && idxC === 0) {
				newContour.splice(14, 0, {
					x: makeVariance(originLight(contour[13].x), originHeavy(contour[13].x)),
					y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
					kind: 0,
				});
			}

			// fix ɑ
			if (glyph.name === "uni0251" && idxC === 0) {
				newContour[10] = {
					x: makeVariance(originLight(contour[10].x), originHeavy(contour[10].x) + 40),
					y: makeVariance(originLight(contour[10].y), originHeavy(contour[10].y)),
					kind: contour[10].kind,
				};
				newContour[11] = {
					x: makeVariance(originLight(contour[11].x), originHeavy(contour[11].x) + 60),
					y: makeVariance(originLight(contour[11].y), originHeavy(contour[11].y)),
					kind: contour[11].kind,
				};
			}

			// fix α
			if (glyph.name === "alpha" && idxC === 0) {
				newContour[10] = {
					x: makeVariance(originLight(contour[10].x), originHeavy(contour[10].x) + 10),
					y: makeVariance(originLight(contour[10].y), originHeavy(contour[10].y)),
					kind: contour[10].kind,
				};
				newContour[11] = {
					x: makeVariance(originLight(contour[11].x), originHeavy(contour[11].x) + 31),
					y: makeVariance(originLight(contour[11].y), originHeavy(contour[11].y)),
					kind: contour[11].kind,
				};
			}

			// fix ι
			if ((glyph.name === "iota" || glyph.name === "l") && idxC === 0) {
				newContour[3] = {
					x: makeVariance(originLight(contour[3].x), originHeavy(contour[3].x) + 19),
					y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y)),
					kind: contour[3].kind,
				};
				newContour[4] = {
					x: makeVariance(originLight(contour[4].x), originHeavy(contour[4].x) + 40),
					y: makeVariance(originLight(contour[4].y), originHeavy(contour[4].y)),
					kind: contour[4].kind,
				};
			}

			// fix µ
			if (["mu","uni03BC"].includes(glyph.name)) {
				newContour[16] = {
					x: makeVariance(543, 683),
					y: makeVariance(26, 137),
					kind: 0,
				};
			}
			// fix ㎂㎌㎍㎕㎛㎲㎶㎼
			if (["uni3382","uni338C","uni338D","uni3395","uni339B","uni33B2","uni33B6","uni33BC"].includes(glyph.name) && idxC === 0) {
				newContour[17] = {
					x: makeVariance(originLight(contour[17].x) + 4, originHeavy(contour[17].x) + 40),
					y: makeVariance(originLight(contour[17].y), originHeavy(contour[17].y)),
					kind: contour[17].kind,
				};
				newContour[18] = {
					x: makeVariance(originLight(contour[18].x) + 10, originHeavy(contour[18].x) + 50),
					y: makeVariance(originLight(contour[18].y), originHeavy(contour[18].y)),
					kind: contour[18].kind,
				};
			}

			// fix κ
			if (glyph.name == "kappa") {
				if (idxC === 0) {
					newContour[2] = {
						x: makeVariance(originLight(contour[2].x), originHeavy(contour[2].x)),
						y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y) + 40),
						kind: contour[2].kind,
					};
				}
				if (idxC === 1) {
					newContour[4] = {
						x: makeVariance(originLight(contour[4].x) - 15, 366),
						y: makeVariance(originLight(contour[4].y) + 15, 423),
						kind: contour[4].kind,
					};
					newContour[5] = {
						x: makeVariance(originLight(contour[5].x) - 15, 252),
						y: makeVariance(originLight(contour[5].y) + 15, 308),
						kind: contour[5].kind,
					};
				}
			}

			// fix К
			if (glyph.name == "uni041A") {
				newContour[13] = {
					x: makeVariance(581, 701),
					y: makeVariance(originLight(contour[13].y), originHeavy(contour[13].y)),
					kind: contour[13].kind,
				};
			}

			// fix Л
			if (glyph.name == "uni041B") {
				newContour[18] = {
					x: makeVariance(9, -13),
					y: makeVariance(originLight(contour[20].y), originHeavy(contour[20].y)),
					kind: contour[20].kind,
				};
			}

			// fix к
			if (glyph.name == "uni043A") {
				newContour[11] = {
					x: makeVariance(475, 581),
					y: makeVariance(originLight(contour[13].y), originHeavy(contour[13].y)),
					kind: contour[13].kind,
				};
			}

			// fix л
			if (glyph.name == "uni043B") {
				newContour[14] = {
					x: makeVariance(15, 6),
					y: makeVariance(originLight(contour[16].y), originHeavy(contour[16].y)),
					kind: contour[16].kind,
				};
			}
			
			// fix ю
			if (glyph.name == "uni044E") {
				if (idxC === 0) {
					newContour[3] = {
						x: makeVariance(314, 471),
						y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y)),
						kind: contour[3].kind,
					};
					newContour[4] = {
						x: makeVariance(314, 471),
						y: makeVariance(originLight(contour[4].y), originHeavy(contour[4].y)),
						kind: contour[4].kind,
					};
				}
			}

			// fix ζ
			if (glyph.name == "zeta") {
				newContour.splice(12, 1);
				newContour[11] = {
					x: contour[11].x,
					y: makeVariance(
						originLight(contour[11].y) - 10,
						originHeavy(contour[11].y) - 50
					),
					kind: contour[11].kind,
				};
				// continue;
			}
			
			// fix Ж
			if (glyph.name == "uni0416") {
				newContour[17] = {
					x: makeVariance(
						originLight(contour[17].x) + 20,
						originHeavy(contour[17].x) + 40
					),
					y: makeVariance(
						originLight(contour[17].y),
						originHeavy(contour[17].y) + 3
					),
					kind: contour[17].kind,
				};
				newContour[18] = {
					x: makeVariance(
						originLight(contour[18].x) + 20,
						originHeavy(contour[18].x) + 40
					),
					y: makeVariance(
						originLight(contour[18].y) + 2,
						originHeavy(contour[18].y) + 3
					),
					kind: contour[18].kind,
				};
				newContour[37] = {
					x: makeVariance(
						originLight(contour[37].x) - 20,
						originHeavy(contour[37].x) - 40
					),
					y: makeVariance(
						originLight(contour[37].y) + 2,
						originHeavy(contour[37].y) + 3
					),
					kind: contour[37].kind,
				};
				newContour[38] = {
					x: makeVariance(
						originLight(contour[38].x) - 20,
						originHeavy(contour[38].x) - 40
					),
					y: makeVariance(
						originLight(contour[38].y),
						originHeavy(contour[38].y) + 3
					),
					kind: contour[38].kind,
				};
				// continue;
			}
			
			// fix ж
			if (glyph.name == "uni0436") {
				newContour[17] = {
					x: makeVariance(
						originLight(contour[17].x) + 20,
						originHeavy(contour[17].x) + 40
					),
					y: makeVariance(
						originLight(contour[17].y),
						originHeavy(contour[17].y) + 3
					),
					kind: contour[17].kind,
				};
				newContour[18] = {
					x: makeVariance(
						originLight(contour[18].x) + 20,
						originHeavy(contour[18].x) + 40
					),
					y: makeVariance(
						originLight(contour[18].y) + 2,
						originHeavy(contour[18].y) + 3
					),
					kind: contour[18].kind,
				};
				newContour[37] = {
					x: makeVariance(
						originLight(contour[37].x) - 20,
						originHeavy(contour[37].x) - 40
					),
					y: makeVariance(
						originLight(contour[37].y) + 2,
						originHeavy(contour[37].y) + 3
					),
					kind: contour[37].kind,
				};
				newContour[38] = {
					x: makeVariance(
						originLight(contour[38].x) - 20,
						originHeavy(contour[38].x) - 40
					),
					y: makeVariance(
						originLight(contour[38].y),
						originHeavy(contour[38].y) + 3
					),
					kind: contour[38].kind,
				};
				// continue;
			}
			// fix ⊊⊋
			if ((glyph.name === "uni228A" || glyph.name === "uni228B") && idxC === 1) {
				newContour[3] = {
					x: makeVariance(
						originLight(contour[3].x),
						originHeavy(contour[3].x) + 34
					),
					y: makeVariance(
						originLight(contour[3].y),
						originHeavy(contour[3].y) + 18
					),
					kind: contour[3].kind,
				};
				newContour[4] = {
					x: makeVariance(
						originLight(contour[4].x),
						originHeavy(contour[4].x) + 34
					),
					y: makeVariance(
						originLight(contour[4].y),
						originHeavy(contour[4].y) + 18
					),
					kind: contour[4].kind,
				};
				newContour[9] = {
					x: makeVariance(
						originLight(contour[9].x),
						originHeavy(contour[9].x) - 34
					),
					y: makeVariance(
						originLight(contour[9].y),
						originHeavy(contour[9].y) - 18
					),
					kind: contour[9].kind,
				};
				newContour[10] = {
					x: makeVariance(
						originLight(contour[10].x),
						originHeavy(contour[10].x) - 34
					),
					y: makeVariance(
						originLight(contour[10].y),
						originHeavy(contour[10].y) - 18
					),
					kind: contour[10].kind,
				};
				// continue;
			}

			// fix ↸
			if (glyph.name == "uni21B8" && idxC === 1) {
				newContour.reverseContour();
			}

			// fix ⇦ ⇧ ⇨ ⇩
			if (["uni21E6","uni21E7","uni21E8","uni21E9"].includes(glyph.name)) {
				if (idxC === 0) {
					newContour.splice(6, 1);
					newContour.splice(4, 1);
				}
				if (idxC === 1) {
					newContour.splice(7, 1);
					newContour.splice(5, 1);
				}
			}

			// fix ⎱
			if (glyph.name == "uni23B1") {
				newContour.reverseContour();
			}

			// fix ➡ ⬅ ⬆ ⬇
			if (["uni27A1","uni2B05","uni2B06","uni2B07"].includes(glyph.name)) {
				newContour.splice(7, 1);
				newContour.splice(5, 1);
			}

			// fix 〕〞
			if (["uni3015", "uni301E"].includes(glyph.name)) {
				newContour.reverseContour();
			}

			// fix 〥
			if (glyph.name == "uni3025") {
				newContour.reverseContour();
			}

			// fix ㄟ ㇝
			if (["uni311F", "uni31DD"].includes(glyph.name)) {
				newContour.reverseContour();
			}

			// fix ㇍
			if (glyph.name == "uni31CD" && idxC === 1) {
				newContour[2] = {
					x: makeVariance(originLight(contour[3].x), originHeavy(contour[3].x)),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
					kind: contour[2].kind,
				};
			}

			// fix ㇋
			if (glyph.name == "uni31CB" && idxC === 1) {
				newContour[0] = {
					x: makeVariance(494,461),
					y: makeVariance(503,534),
					kind: 0,
				};
				newContour[1] = {
					x: makeVariance(475,379),
					y: makeVariance(474,397),
					kind: 0,
				};
			}

			// fix ㇋
			if (glyph.name == "uni31E1" && idxC === 0) {
				newContour[0] = {
					x: makeVariance(568,500),
					y: makeVariance(467,516),
					kind: 0,
				};
				newContour[1] = {
					x: makeVariance(556,446),
					y: makeVariance(436,376),
					kind: 0,
				};
			}

			// fix ㈤
			if (glyph.name == "uni3224" && idxC === 3) {
				newContour[0] = {
					x: makeVariance(180, 191),
					y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
					kind: contour[0].kind,
				};
				newContour[1] = {
					x: makeVariance(180, 191),
					y: makeVariance(originLight(contour[1].y), originHeavy(contour[1].y)),
					kind: contour[1].kind,
				};
			}

			// fix ㈧
			// if (glyph.name == "uni3227" && idxC === 2) {
			// 	newContour[2] = {
			// 		x: makeVariance(616, 664),
			// 		y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
			// 		kind: contour[2].kind,
			// 	};
			// }

			// fix ㈧
			if (glyph.name == ".gid1666" && idxC === 2) {
				newContour[2] = {
					x: makeVariance(616, 664),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
					kind: contour[2].kind,
				};
			}
			// fix ㈧
			if (glyph.name == ".gid1782" && idxC === 2) {
				newContour[2] = {
					x: makeVariance(612, 666),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
					kind: contour[2].kind,
				};
			}
			// fix ㈧
			if ([".gid1784",".gid1668"].includes(glyph.name) && idxC === 2) {
				newContour[0] = {
					x: makeVariance(473, 469),
					y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
					kind: contour[0].kind,
				};
				newContour[1] = {
					x: makeVariance(473, 469),
					y: makeVariance(originLight(contour[1].y), originHeavy(contour[1].y)),
					kind: contour[1].kind,
				};
				newContour[2] = {
					x: makeVariance(599, 673),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
					kind: contour[2].kind,
				};
			}
			// fix ㈧
			if (glyph.name == ".gid1924" && idxC === 2) {
				newContour[2] = {
					x: makeVariance(599, 670),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
					kind: contour[2].kind,
				};
			}

			// fix ㈤
			// if ((glyph.name === "uni323C" && idxC === 10) || (glyph.name === ".gid1952" && idxC === 9)) {
			// 	newContour[0] = {
			// 		x: makeVariance(177, 191),
			// 		y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
			// 		kind: contour[0].kind,
			// 	};
			// 	newContour[1] = {
			// 		x: makeVariance(177, 191),
			// 		y: makeVariance(originLight(contour[1].y), originHeavy(contour[1].y)),
			// 		kind: contour[1].kind,
			// 	};
			// 	newContour[2] = {
			// 		x: makeVariance(826, 813),
			// 		y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
			// 		kind: contour[2].kind,
			// 	};
			// 	newContour[3] = {
			// 		x: makeVariance(826, 813),
			// 		y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y)),
			// 		kind: contour[3].kind,
			// 	};
			// }

			// fix ㈤
			// if ((glyph.name === "uni3243" && idxC === 4) || (glyph.name === ".gid1963" && idxC === 4)) {
			// 	newContour[0] = {
			// 		x: makeVariance(197, 192),
			// 		y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
			// 		kind: contour[0].kind,
			// 	};
			// 	newContour[1] = {
			// 		x: makeVariance(197, 192),
			// 		y: makeVariance(originLight(contour[1].y), originHeavy(contour[1].y)),
			// 		kind: contour[1].kind,
			// 	};
			// 	newContour[2] = {
			// 		x: makeVariance(798, 809),
			// 		y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y)),
			// 		kind: contour[2].kind,
			// 	};
			// 	newContour[3] = {
			// 		x: makeVariance(798, 809),
			// 		y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y)),
			// 		kind: contour[3].kind,
			// 	};
			// }

			// fix ㊇
			// if (glyph.name === "uni3402" && idxC === 3) {
			// 	newContour[11] = {
			// 		x: makeVariance(originLight(contour[11].x), 986),
			// 		y: makeVariance(originLight(contour[11].y), 213),
			// 		kind: contour[11].kind,
			// 	};
			// 	newContour[11] = {
			// 		x: makeVariance(originLight(contour[11].x), 986),
			// 		y: makeVariance(originLight(contour[11].y), 213),
			// 		kind: contour[11].kind,
			// 	};
			// 	newContour[12] = {
			// 		x: makeVariance(originLight(contour[12].x), 870),
			// 		y: makeVariance(originLight(contour[12].y), 189),
			// 		kind: contour[12].kind,
			// 	};
			// 	newContour[13] = {
			// 		x: makeVariance(originLight(contour[13].x), 865),
			// 		y: makeVariance(originLight(contour[13].y), 123),
			// 		kind: contour[13].kind,
			// 	};
			// 	newContour[14] = {
			// 		x: makeVariance(originLight(contour[14].x), 861),
			// 		y: makeVariance(originLight(contour[14].y), 48),
			// 		kind: contour[14].kind,
			// 	};
			// }
			// if (glyph.name === "uni3402" && idxC === 1) {
			// 	newContour[10] = {
			// 		x: makeVariance(originLight(contour[10].x), originHeavy(contour[10].x)),
			// 		y: makeVariance(originLight(contour[10].y), originHeavy(contour[13].y)),
			// 		kind: contour[10].kind,
			// 	};
			// 	newContour[11] = {
			// 		x: makeVariance(originLight(contour[11].x), originHeavy(contour[11].x)),
			// 		y: makeVariance(originLight(contour[11].y), originHeavy(contour[13].y)),
			// 		kind: contour[11].kind,
			// 	};
			// 	newContour[12] = {
			// 		x: makeVariance(originLight(contour[12].x), originHeavy(contour[12].x)),
			// 		y: makeVariance(originLight(contour[12].y), originHeavy(contour[13].y)),
			// 		kind: contour[12].kind,
			// 	};
			// 	newContour[13] = {
			// 		x: makeVariance(originLight(contour[13].x), originHeavy(contour[13].x)),
			// 		y: makeVariance(originLight(contour[13].y), originHeavy(contour[13].y)),
			// 		kind: contour[13].kind,
			// 	};
			// 	// newContour[14] = {
			// 	// 	x: makeVariance(originLight(contour[14].x), 861),
			// 	// 	y: makeVariance(originLight(contour[14].y), 48),
			// 	// 	kind: contour[14].kind,
			// 	// };
			// }

			// fix ㊬
			if ((glyph.name === "uni32AC" || glyph.name ===".gid2097" || glyph.name ===".gid1840") && idxC === 4) {
				newContour[0] = {
					x: makeVariance(originLight(contour[0].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[0].y), 500),
					kind: 0,
				};
				newContour[3] = {
					x: makeVariance(originLight(contour[3].x), originHeavy(contour[3].x)),
					y: makeVariance(originLight(contour[3].y), 500),
					kind: 0,
				};
			}

			if (["uni32C0","uni3359","uni33E0"].includes(glyph.name) && idxC === 0) {
				newContour.reverseContour();
			}

			// fix 㰤
			if (glyph.name == "uni3C24" || glyph.name == "uni3C2D") {
				if (contour.length === 12) {
					newContour[0] = {
						x: contour[0].x,
						y: makeVariance(
							originLight(contour[0].y),
							originHeavy(contour[0].y) + 50
						),
						kind: contour[0].kind,
					};
					newContour[1] = {
						x: contour[1].x,
						y: makeVariance(
							originLight(contour[1].y),
							originHeavy(contour[1].y) - 30
						),
						kind: contour[1].kind,
					};
					newContour[10] = {
						x: contour[10].x,
						y: makeVariance(
							originLight(contour[10].y),
							originHeavy(contour[10].y) - 30
						),
						kind: contour[10].kind,
					};
					newContour[11] = {
						x: contour[11].x,
						y: makeVariance(
							originLight(contour[11].y),
							originHeavy(contour[11].y) + 50
						),
						kind: contour[11].kind,
					};
					// continue;
				}
			}

			// if ((glyph.name == "uni4925" && idxC === 4) || (glyph.name == "uni49CB" && idxC === 4)) {
			// 	newContour[10] = {
			// 		x: makeVariance(originLight(contour[10].x), originHeavy(contour[10].x) + 20),
			// 		y: makeVariance(originLight(contour[10].y), originHeavy(contour[10].y) - 20),
			// 		kind: contour[10].kind,
			// 	};
			// 	newContour[13] = {
			// 		x: makeVariance(originLight(contour[13].x), originHeavy(contour[13].x) + 20),
			// 		y: makeVariance(originLight(contour[13].y), originHeavy(contour[13].y) - 20),
			// 		kind: contour[13].kind,
			// 	};
			// 	newContour.splice(11,2);
			// }

			// if (glyph.name == "uni4AB8" && idxC === 4) {
			// 	newContour[6] = {
			// 		x: makeVariance(originLight(contour[6].x), originHeavy(contour[6].x)),
			// 		y: makeVariance(originLight(contour[6].y), originHeavy(contour[6].y) - 60),
			// 		kind: contour[6].kind,
			// 	};
			// 	newContour[9] = {
			// 		x: makeVariance(originLight(contour[9].x), originHeavy(contour[9].x) + 20),
			// 		y: makeVariance(originLight(contour[9].y), originHeavy(contour[9].y) - 20),
			// 		kind: contour[9].kind,
			// 	};
			// 	newContour.splice(7,2);
			// }

			// if (glyph.name == "uni4AFB" && idxC === 5) {
			// 	newContour[6] = {
			// 		x: makeVariance(originLight(contour[6].x), originHeavy(contour[6].x) + 30),
			// 		y: makeVariance(originLight(contour[6].y), originHeavy(contour[6].y)),
			// 		kind: contour[6].kind,
			// 	};
			// 	newContour[9] = {
			// 		x: makeVariance(originLight(contour[9].x), originHeavy(contour[9].x) + 30),
			// 		y: makeVariance(originLight(contour[9].y), originHeavy(contour[9].y) + 10),
			// 		kind: contour[9].kind,
			// 	};
			// 	newContour.splice(7,2);
			// }

			// fix ㈤
			if (glyph.name === "uni21A45" && idxC === 10) {
				newContour[0] = {
					x: makeVariance(originLight(contour[0].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y) + 8),
					kind: contour[0].kind,
				};
				newContour[1] = {
					x: makeVariance(originLight(contour[1].x), originHeavy(contour[1].x)),
					y: makeVariance(originLight(contour[1].y), originHeavy(contour[1].y) - 14),
					kind: contour[1].kind,
				};
				newContour[2] = {
					x: makeVariance(originLight(contour[2].x), originHeavy(contour[2].x)),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[2].y) - 14),
					kind: contour[2].kind,
				};
				newContour[3] = {
					x: makeVariance(originLight(contour[3].x), originHeavy(contour[3].x)),
					y: makeVariance(originLight(contour[3].y), originHeavy(contour[3].y) + 8),
					kind: contour[3].kind,
				};
				setCustomRadius("uni21A45", 10, 15, 48, true);
			}
			if (glyph.name === "uni30EDE" && idxC === 57) {
				newContour[4] = {
					x: makeVariance(originLight(contour[4].x), originHeavy(contour[4].x) + 40),
					y: makeVariance(originLight(contour[4].y), originHeavy(contour[4].y)),
					kind: contour[4].kind,
				};
				newContour[5] = {
					x: makeVariance(originLight(contour[5].x), originHeavy(contour[5].x) + 40),
					y: makeVariance(originLight(contour[5].y), originHeavy(contour[5].y)),
					kind: contour[5].kind,
				};
				setCustomRadius("uni30EDE", 57, 14.5, 41, true);
			}


			function findExtraTopRightIdx(contour, topRightIdx) {
				for (let i = 0; i < contour.length; i++) {
					if (
						circularArray(contour, topRightIdx - i).kind === 0 && 
						distanceLight(contour[topRightIdx], circularArray(contour, topRightIdx - i)) > 5
					) {
						return circularIndex(contour, topRightIdx - i);
					}
				}
			}
			
			for (let idxP = 0; idxP < contour.length; idxP++) {
				let matched = false;
				let topRightIdx = idxP;
				let topLeftIdx = nextNode(contour, topRightIdx);
				let bottomLeftIdx = nextNode(contour, topLeftIdx);
				let bottomRightIdx = previousNode(contour, topRightIdx);
				if (
					// is top end
					canBeTopEnd(contour[topRightIdx], contour[topLeftIdx]) &&
					approxEq(contour[topRightIdx].x, contour[bottomRightIdx].x) &&
					approxEq(contour[topLeftIdx].x, contour[bottomLeftIdx].x) &&
					abs(originHeavy(contour[topRightIdx].x) - originHeavy(contour[topLeftIdx].x)) > 125
				) {
					const verticalTopRight = contour[idxP];
					const verticalTopLeft = contour[topLeftIdx];
					const verticalBottomLeft = contour[bottomLeftIdx];
					const verticalBottomRight = contour[bottomRightIdx];
						
					// fix tops with extra points too close to right corner preventing rounding
					if (
						abs(originLight(verticalTopRight.x) - originLight(verticalBottomRight.x)) <= 5 &&
						abs(originLight(verticalTopRight.y) - originLight(verticalBottomRight.y)) < 25
						// abs(originLight(verticalTopRight.y) - originLight(circularArray(contour, idxPP1 - 2).y)) > 30 &&
						// abs(originLight(verticalBottomRight.x) - originLight(circularArray(contour, idxPP1 - 2).x)) < 10
					) {
						const deltaM0 = originLight(verticalTopRight.y) - originLight(verticalBottomRight.y);
						const deltaM1 = originHeavy(verticalTopRight.y) - originHeavy(verticalBottomRight.y);
						const diffM0 = deltaM0 < 15 ? 15 - deltaM0 : 0;
						const diffM1 = deltaM1 < 80 ? 80 - deltaM1 : 0;
						// console.log("extend points too close right: " + glyph.name);
						newContour[bottomRightIdx] = {
							// x: verticalBottomRight.x,
							x: makeVariance(
								originLight(verticalTopRight.x),
								originHeavy(verticalTopRight.x)
							),
							y: makeVariance(
								originLight(verticalBottomRight.y) - diffM0,
								originHeavy(verticalBottomRight.y) - diffM1
							),
							kind: verticalBottomRight.kind,
						};
					}
					
					// fix tops with extra points too close to left corner preventing rounding
					if (
						abs(originLight(verticalTopLeft.x) - originLight(verticalBottomLeft.x)) < 3 &&
						abs(originLight(verticalTopLeft.y) - originLight(verticalBottomLeft.y)) < 15 &&
						abs(originHeavy(verticalTopRight.x) - originHeavy(verticalTopLeft.x)) > 125 &&
						verticalBottomLeft.kind === 0
						// originLight(verticalTopLeft.x) == originLight(verticalBottomLeft.x) &&
						// abs(originLight(verticalTopLeft.y) - originLight(verticalBottomLeft.y)) < 30 &&
						// abs(originLight(verticalTopLeft.y) - originLight(circularArray(contour, idxPP1 + 3).y)) > 30 &&
						// abs(originLight(verticalBottomLeft.x) - originLight(circularArray(contour, idxPP1 + 3).x)) < 10
					) {
						const deltaM0 = originLight(verticalTopLeft.y) - originLight(verticalBottomLeft.y);
						const deltaM1 = originHeavy(verticalTopLeft.y) - originHeavy(verticalBottomLeft.y);
						const diffM0 = deltaM0 < 15 ? 15 - deltaM0 : 0;
						const diffM1 = deltaM1 < 80 ? 80 - deltaM1 : 0;
						// console.log("extend points too close left: " + glyph.name);
						newContour[bottomLeftIdx] = {
							x: makeVariance(
								originLight(verticalTopLeft.x),
								originHeavy(verticalTopLeft.x)
							),
							y: makeVariance(
								originLight(verticalBottomLeft.y) - diffM0,
								originHeavy(verticalBottomLeft.y) - diffM1
								),
							kind: verticalBottomLeft.kind,
						};
					}
					matched = true;
					if (
						circularArray(contour, idxP - 1).kind === 0 && circularArray(contour, idxP - 2).kind === 2 &&
						circularArray(contour, idxP - 1).x === circularArray(contour, idxP - 2).x &&
						circularArray(contour, idxP - 1).y === circularArray(contour, idxP - 2).y
					) {
						let degenerated = circularIndex(contour, idxP - 3);
						newContour.splice(degenerated, 2);
					}
				}
				if (matched) break;
			}
			
			// NOTE - sharpen blunted corners.
			let redundantPoints = [];
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);

				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];

				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);

				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);

				if (p2.kind !== 0 || p3.kind !== 0) continue;
				if (
					(
						distanceLight(p2, p3).isBetween(4, 8) &&
						distanceHeavy(p2, p3).isBetween(4, 8) &&
						angle(b1L, b3L).isBetween(15, 88) &&
						angle(b1H, b3H).isBetween(15, 88) &&
						angle(b1L, b2L).isBetween(82, 150) &&
						angle(b1H, b2H).isBetween(82, 150) &&
						angle(b2L, b3L).isBetween(82, 150) &&
						angle(b2H, b3H).isBetween(82, 150)
					) 
					// ||
					// (
					// 	distanceLight(p2, p3).isBetween(20, 60) &&
					// 	distanceHeavy(p2, p3).isBetween(120, 225) &&
					// 	angle(b1L, b3L).isBetween(-15, -88) &&
					// 	angle(b1H, b3H).isBetween(-15, -88) &&
					// 	angle(b1L, b2L).isBetween(-82, -150) &&
					// 	angle(b1H, b2H).isBetween(-82, -150) &&
					// 	angle(b2L, b3L).isBetween(-82, -150) &&
					// 	angle(b2H, b3H).isBetween(-82, -150)
					// )
				) {
					let c1L = findIntersection([pointLight(p1), pointLight(p2), pointLight(p3), pointLight(p4)]);
					let c1H = findIntersection([pointHeavy(p1), pointHeavy(p2), pointHeavy(p3), pointHeavy(p4)]);
					newContour[p2I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};

					if (!redundantPoints.includes(p3I)) redundantPoints.push(p3I);
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
			}

			
			glyph.geometry.contours.push(newContour);
		}
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	let bar = new ProgressBar('\u001b[38;5;82mcorrectGlyphs\u001b[0m [3/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	// let bar = new ProgressBar('\u001b[38;5;82mcorrectGlyphs\u001b[0m [3/5]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	for (const [idxG, glyph] of font.glyphs.items.entries()) {
		const name = glyph.name;
		progressTick();
		if (!references.extendSkip.includes(name) || references.leftFallingCorrections.includes(name)) checkSingleGlyph(glyph, idxG);
		// count++;
		// if (count % 1000 == 0) console.log("correctGlyphs:", count, "glyphs processed.");
	}
	delete references.leftFallingCorrections;
}

module.exports = {
	correctGlyphs
};
