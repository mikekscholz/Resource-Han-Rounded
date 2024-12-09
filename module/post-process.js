"use strict";

const { Ot } = require("ot-builder");
const {Bezier} = require("./bezier.js");
const { extendSkip } = require("./exceptions");
const { hangulSios } = require("./correctionsUnicode");
const fs = require("node:fs");
const path = require("node:path");
const { abs, ceil, floor, round, trunc } = Math;

// const replacementsDir = fs.readdirSync(__dirname + "/../replacements");
// let replacements = [];
// replacementsDir.forEach(file => {
// 	replacements.push(path.basename(file, '.json'));
// });

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
	let x2 = line.p2.x + distance;
	let y2 = line.p2.y + round(distance * slope(line));
	return { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }};
}

function postProcess(font, references) {
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

	function isBetween(a, x, b) {
		return originLight(a) <= originLight(x) &&
			originLight(x) <= originLight(b) + 2 &&
			originHeavy(a) <= originHeavy(x) &&
			originHeavy(x) <= originHeavy(b) + 2;
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(valueDefault, [[masterWghtMax, valueWghtMax - valueDefault]]);
	}
	
	function findBottomRight(contour) {
		for (let i = 0; i < contour.length; i++) {
			if (
				contour[i].kind === 0 && circularArray(contour, i + 1).kind === 1 && circularArray(contour, i + 2).kind === 2 && circularArray(contour, i + 3).kind === 0 && circularArray(contour, i + 4).kind === 0 && circularArray(contour, i + 5).kind === 1 && circularArray(contour, i + 6).kind === 2 && circularArray(contour, i + 7).kind === 0 &&
				originLight(contour[i].x) < originLight(circularArray(contour, i + 3).x) &&
				originLight(contour[i].y) < originLight(circularArray(contour, i + 3).y) &&
				originLight(circularArray(contour, i + 7).x) < originLight(circularArray(contour, i + 4).x) &&
				originLight(circularArray(contour, i + 7).y) > originLight(circularArray(contour, i + 4).y)
				// abs(originLight(contour[i].x) - originLight(circularArray(contour, i + 7).x)) <= 2 &&
				// abs(originLight(circularArray(contour, i + 3).x) - originLight(circularArray(contour, i + 4).x)) <= 2 &&
				// abs(originLight(circularArray(contour, i + 3).y) - originLight(circularArray(contour, i + 4).y)) <= 2
			) {
				return i;
			}
		}
	}

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;
		const name = glyph.name;
		let oldContours = glyph.geometry.contours;
		

			
		glyph.geometry.contours = [];
		
		if (name in references.horizontalLeftFalling) {
			let refs = references.horizontalLeftFalling[name];
			for (const ref of refs) {
				let idxC1 = ref.horizontal;
				// let idxP1 = ref.horizontalBottomRight;
				let idxC2 = ref.leftFalling;
				// let idxP2 = ref.leftFallingTopRight;
				let contour = oldContours[idxC1];
				let contour2 = oldContours[idxC2];
				let idxP1 = findBottomRight(contour);
				let h1 = circularArray(contour, idxP1);
				let h2 = circularArray(contour, idxP1 + 1);
				let h3 = circularArray(contour, idxP1 + 2);
				let h4 = circularArray(contour, idxP1 + 3);
				let h5 = circularArray(contour, idxP1 + 4);
				let h6 = circularArray(contour, idxP1 + 5);
				let h7 = circularArray(contour, idxP1 + 6);
				let h8 = circularArray(contour, idxP1 + 7);
				let h1I = circularIndex(contour, idxP1);
				let h2I = circularIndex(contour, idxP1 + 1);
				let h3I = circularIndex(contour, idxP1 + 2);
				let h4I = circularIndex(contour, idxP1 + 3);
				let h5I = circularIndex(contour, idxP1 + 4);
				let h6I = circularIndex(contour, idxP1 + 5);
				let h7I = circularIndex(contour, idxP1 + 6);
				let h8I = circularIndex(contour, idxP1 + 7);
				let hXL = 0;
				let hXH = 0;
				let hCurveLight = new Bezier(originLight(h1.x) + hXL,originLight(h1.y),originLight(h2.x) + hXL,originLight(h2.y),originLight(h3.x) + hXL,originLight(h3.y),originLight(h4.x) + hXL,originLight(h4.y));
				let hCurveHeavy = new Bezier(originHeavy(h1.x) + hXH,originHeavy(h1.y),originHeavy(h2.x) + hXH,originHeavy(h2.y),originHeavy(h3.x) + hXH,originHeavy(h3.y),originHeavy(h4.x) + hXH,originHeavy(h4.y));
				let r1 = circularArray(contour2, -7);
				let r2 = circularArray(contour2, -6);
				let r3 = circularArray(contour2, -5);
				let r4 = circularArray(contour2, -4);
				let r5 = circularArray(contour2, -3);
				let r1I = circularIndex(contour2, -7);
				let r2I = circularIndex(contour2, -6);
				let r3I = circularIndex(contour2, -5);
				let r4I = circularIndex(contour2, -4);
				let r5I = circularIndex(contour2, -3);
				let r1xH = originHeavy(r1.x);
				let r1yH = originHeavy(r1.y);
				let r2xH = originHeavy(r2.x);
				let r2yH = originHeavy(r2.y);
				let r3xH = originHeavy(r3.x);
				let r3yH = originHeavy(r3.y);
				let r4xH = originHeavy(r4.x);
				let r4yH = originHeavy(r4.y);
				if (r1xH === r2xH && r1yH === r2yH) {
					r2xH = r2xH + 2;
					r2yH = r2yH + 4;
				}
				if (name === "uni637B") {
					r2xH = r2xH + 10;
					// console.log(hCurveHeavy);
					// console.log(vCurveHeavy);
				}
				let vCurveLight = new Bezier(originLight(r1.x),originLight(r1.y),originLight(r2.x),originLight(r2.y),originLight(r3.x),originLight(r3.y),originLight(r4.x),originLight(r4.y));
				let vCurveHeavy = new Bezier(r1xH,r1yH,r2xH,r2yH,r3xH,r3yH,r4xH,r4yH);
				let intersectLight = [];
				while (intersectLight.length === 0) {
					hXL++
					// if (name === "uni637B") {
					// 	console.log(intersectLight);
					// 	console.log("hXL", hXL);
					// }
					hCurveLight = new Bezier(originLight(h1.x) + hXL,originLight(h1.y),originLight(h2.x) + hXL,originLight(h2.y),originLight(h3.x) + hXL,originLight(h3.y),originLight(h4.x) + hXL,originLight(h4.y));
					intersectLight = vCurveLight.intersects(hCurveLight);
				}
				let intersectHeavy = [];
				while (intersectHeavy.length === 0) {
					hXH++
					// if (name === "uni637B") {
					// 	console.log(intersectHeavy);
					// 	console.log("hXH", hXH);
					// }
					hCurveHeavy = new Bezier(originHeavy(h1.x) + hXH,originHeavy(h1.y),originHeavy(h2.x) + hXH,originHeavy(h2.y),originHeavy(h3.x) + hXH,originHeavy(h3.y),originHeavy(h4.x) + hXH,originHeavy(h4.y));
					intersectHeavy = vCurveHeavy.intersects(hCurveHeavy);
				}
				let splitLight = vCurveLight.split(intersectLight[0].split('/')[0]);
				let splitHeavy = vCurveHeavy.split(intersectHeavy[0].split('/')[0]);
				let pointsLight = splitLight.left.points;
				let pointsHeavy = splitHeavy.left.points;

				oldContours[idxC1][h1I] = {
					x: makeVariance(originLight(h1.x) + hXL, originHeavy(h1.x) + hXH),
					y: makeVariance(originLight(h1.y), originHeavy(h1.y)),
					kind: h1.kind,
				};
				oldContours[idxC1][h2I] = {
					x: makeVariance(originLight(h2.x) + hXL, originHeavy(h2.x) + hXH),
					y: makeVariance(originLight(h2.y), originHeavy(h2.y)),
					kind: h2.kind,
				};
				oldContours[idxC1][h3I] = {
					x: makeVariance(originLight(h3.x) + hXL, originHeavy(h3.x) + hXH),
					y: makeVariance(originLight(h3.y), originHeavy(h3.y)),
					kind: h3.kind,
				};
				oldContours[idxC1][h4I] = {
					x: makeVariance(originLight(h4.x) + hXL, originHeavy(h4.x) + hXH),
					y: makeVariance(originLight(h4.y), originHeavy(h4.y)),
					kind: h4.kind,
				};
				oldContours[idxC1][h5I] = {
					x: makeVariance(originLight(h4.x) + hXL, originHeavy(h4.x) + hXH),
					y: makeVariance(originLight(h5.y), originHeavy(h5.y)),
					kind: h5.kind,
				};
				oldContours[idxC1][h6I] = {
					x: makeVariance(originLight(h4.x) + hXL, originHeavy(h4.x) + hXH),
					y: makeVariance(originLight(h6.y), originHeavy(h6.y)),
					kind: h6.kind,
				};
				oldContours[idxC1][h7I] = {
					x: makeVariance(originLight(h7.x) + hXL, originHeavy(h7.x) + hXH),
					y: makeVariance(originLight(h7.y), originHeavy(h7.y)),
					kind: h7.kind,
				};
				oldContours[idxC1][h8I] = {
					x: makeVariance(originLight(h8.x) + hXL, originHeavy(h8.x) + hXH),
					y: makeVariance(originLight(h8.y), originHeavy(h8.y)),
					kind: h8.kind,
				};

				
				
				oldContours[idxC2][r1I] = {
					x: makeVariance(pointsLight[0].x, pointsHeavy[0].x),
					y: makeVariance(pointsLight[0].y, pointsHeavy[0].y),
					kind: r1.kind,
				};
				oldContours[idxC2][r2I] = {
					x: makeVariance(pointsLight[1].x, pointsHeavy[1].x),
					y: makeVariance(pointsLight[1].y, pointsHeavy[1].y),
					kind: r2.kind,
				};
				oldContours[idxC2][r3I] = {
					x: makeVariance(pointsLight[2].x, pointsHeavy[2].x),
					y: makeVariance(pointsLight[2].y, pointsHeavy[2].y),
					kind: r3.kind,
				};
				oldContours[idxC2][r4I] = {
					x: makeVariance(pointsLight[3].x, pointsHeavy[3].x),
					y: makeVariance(pointsLight[3].y, pointsHeavy[3].y),
					kind: r4.kind,
				};
				oldContours[idxC2][r5I] = {
					x: makeVariance(pointsLight[3].x, pointsHeavy[3].x),
					y: makeVariance(pointsLight[3].y + 2, pointsHeavy[3].y + 10),
					kind: r5.kind,
				};
			}
		}
		// if (name in references.horizontalLeftFalling) {
		// 	let refs = references.horizontalLeftFalling[name];
		// 	// console.log(refs);
		// 	for (const ref of refs) {
		// 		// console.log(ref);
		// 		let idxC1 = ref.horizontal;
		// 		let idxP1 = ref.horizontalBottomRight;
		// 		let idxC2 = ref.leftFalling;
		// 		let idxP2 = ref.leftFallingTopRight;
		// 		let contour = oldContours[idxC1];
		// 		let contour2 = oldContours[idxC2];
		// 		let horizontalBottomLeft = circularArray(contour, idxP1 - 1);
		// 		let horizontalBottomRight = contour[idxP1];
		// 		let horizontalTopRight = circularArray(contour, idxP1 + 1);
		// 		let horizontalHeightLight = (originLight(horizontalTopRight.y) - originLight(horizontalBottomRight.y)) / 2;
		// 		let horizontalHeightHeavy = (originHeavy(horizontalTopRight.y) - originHeavy(horizontalBottomRight.y)) / 2;
		// 		let tP = circularArray(contour2, idxP2 + 1);
		// 		let tL = circularArray(contour2, idxP2 + 2);
		// 		let fL = circularArray(contour2, idxP2 + 3);
		// 		let tPI = circularIndex(contour2, idxP2 + 1);
		// 		let tLI = circularIndex(contour2, idxP2 + 2);
		// 		let fLI = circularIndex(contour2, idxP2 + 3);
		// 		let bottomLight = { p1: {x:originLight(horizontalBottomLeft.x), y:originLight(horizontalBottomLeft.y)}, p2: {x:originLight(horizontalBottomRight.x), y:originLight(horizontalBottomRight.y)} };
		// 		let bottomHeavy = { p1: {x:originHeavy(horizontalBottomLeft.x), y:originHeavy(horizontalBottomLeft.y)}, p2: {x:originHeavy(horizontalBottomRight.x), y:originHeavy(horizontalBottomRight.y)} };
		// 		let extensionLight = (originLight(contour2[idxP2].x) - originLight(contour[idxP1].x)) + 10;
		// 		let extensionHeavy = (originHeavy(contour2[idxP2].x) - originHeavy(contour[idxP1].x)) + 10;
		// 		let bottomLightExt = extendLineRight(bottomLight, extensionLight);
		// 		let bottomHeavyExt = extendLineRight(bottomHeavy, extensionHeavy);
		// 		let r1 = circularArray(contour2, idxP2 - 3);
		// 		let r2 = circularArray(contour2, idxP2 - 2);
		// 		let r3 = circularArray(contour2, idxP2 - 1);
		// 		let r4 = circularArray(contour2, idxP2);
		// 		let l1 = circularArray(contour2, idxP2 + 4);
		// 		let l2 = circularArray(contour2, idxP2 + 5);
		// 		let l3 = circularArray(contour2, idxP2 + 6);
		// 		let l4 = circularArray(contour2, idxP2 + 7);
		// 		let r1I = circularIndex(contour2, idxP2 - 3);
		// 		let r2I = circularIndex(contour2, idxP2 - 2);
		// 		let r3I = circularIndex(contour2, idxP2 - 1);
		// 		let r4I = circularIndex(contour2, idxP2);
		// 		let l1I = circularIndex(contour2, idxP2 + 4);
		// 		let l2I = circularIndex(contour2, idxP2 + 5);
		// 		let l3I = circularIndex(contour2, idxP2 + 6);
		// 		let l4I = circularIndex(contour2, idxP2 + 7);
		// 		let oldRightLight = new Bezier(originLight(r1.x),originLight(r1.y),originLight(r2.x),originLight(r2.y),originLight(r3.x),originLight(r3.y),originLight(r4.x),originLight(r4.y));
		// 		let oldRightHeavy = new Bezier(originHeavy(r1.x),originHeavy(r1.y),originHeavy(r2.x),originHeavy(r2.y),originHeavy(r3.x),originHeavy(r3.y),originHeavy(r4.x),originHeavy(r4.y));
		// 		let oldLeftLight = new Bezier(originLight(l1.x),originLight(l1.y),originLight(l2.x),originLight(l2.y),originLight(l3.x),originLight(l3.y),originLight(l4.x),originLight(l4.y));
		// 		let oldLeftHeavy = new Bezier(originHeavy(l1.x),originHeavy(l1.y),originHeavy(l2.x),originHeavy(l2.y),originHeavy(l3.x),originHeavy(l3.y),originHeavy(l4.x),originHeavy(l4.y));
		// 		let intersectRL = oldRightLight.intersects(bottomLightExt);
		// 		let intersectRH = oldRightHeavy.intersects(bottomHeavyExt);
		// 		let intersectLL = oldLeftLight.intersects(bottomLightExt);
		// 		let intersectLH = oldLeftHeavy.intersects(bottomHeavyExt);
		// 		let splitRL = oldRightLight.split(intersectRL[0]);
		// 		let splitRH = oldRightHeavy.split(intersectRH[0]);
		// 		let splitLL = oldLeftLight.split(intersectLL[0]);
		// 		let splitLH = oldLeftHeavy.split(intersectLH[0]);
		// 		let rightLight = splitRL.left.points;
		// 		let rightHeavy = splitRH.left.points;
		// 		let leftLight = splitLL.right.points;
		// 		let leftHeavy = splitLH.right.points;
		// 		let rightC2LineLight = { p1: {x:rightLight[2].x, y:rightLight[2].y}, p2: {x:rightLight[3].x, y:rightLight[3].y} };
		// 		let rightC2LineHeavy = { p1: {x:rightLight[2].x, y:rightLight[2].y}, p2: {x:rightLight[3].x, y:rightLight[3].y} };
		// 		oldContours[idxC2][tPI] = {
		// 			x: makeVariance(rightLight[3].x + (horizontalHeightLight / slope(rightC2LineLight)), rightHeavy[3].x + (horizontalHeightHeavy / slope(rightC2LineHeavy))),
		// 			y: makeVariance(originLight(horizontalBottomRight.y) + horizontalHeightLight, originHeavy(horizontalBottomRight.y) + horizontalHeightHeavy),
		// 			kind: tP.kind,
		// 		};
		// 		oldContours[idxC2][tLI] = {
		// 			x: makeVariance(rightLight[3].x - (horizontalHeightLight / 2 / slope(rightC2LineLight)), rightHeavy[3].x - (horizontalHeightHeavy / 2 / slope(rightC2LineHeavy))),
		// 			y: makeVariance(originLight(horizontalTopRight.y), originHeavy(horizontalTopRight.y)),
		// 			kind: tL.kind,
		// 		};
		// 		oldContours[idxC2][fLI] = {
		// 			x: makeVariance(leftLight[0].x, leftHeavy[0].x),
		// 			y: makeVariance(originLight(horizontalTopRight.y), originHeavy(horizontalTopRight.y)),
		// 			kind: fL.kind,
		// 		};
		// 		oldContours[idxC2][r1I] = {
		// 			x: makeVariance(rightLight[0].x, rightHeavy[0].x),
		// 			y: makeVariance(rightLight[0].y, rightHeavy[0].y),
		// 			kind: r1.kind,
		// 		};
		// 		oldContours[idxC2][l1I] = {
		// 			x: makeVariance(leftLight[0].x, leftHeavy[0].x),
		// 			y: makeVariance(originLight(horizontalBottomRight.y), originHeavy(horizontalBottomRight.y)),
		// 			kind: l1.kind,
		// 		};
		// 		oldContours[idxC2][r2I] = {
		// 			x: makeVariance(rightLight[1].x, rightHeavy[1].x),
		// 			y: makeVariance(rightLight[1].y, rightHeavy[1].y),
		// 			kind: r2.kind,
		// 		};
		// 		oldContours[idxC2][l2I] = {
		// 			x: makeVariance(leftLight[1].x, leftHeavy[1].x),
		// 			y: makeVariance(leftLight[1].y, leftHeavy[1].y),
		// 			kind: l2.kind,
		// 		};
		// 		oldContours[idxC2][r3I] = {
		// 			x: makeVariance(rightLight[2].x, rightHeavy[2].x),
		// 			y: makeVariance(rightLight[2].y, rightHeavy[2].y),
		// 			kind: r3.kind,
		// 		};
		// 		oldContours[idxC2][l3I] = {
		// 			x: makeVariance(leftLight[2].x, leftHeavy[2].x),
		// 			y: makeVariance(leftLight[2].y, leftHeavy[2].y),
		// 			kind: l3.kind,
		// 		};
		// 		oldContours[idxC2][r4I] = {
		// 			x: makeVariance(rightLight[3].x, rightHeavy[3].x),
		// 			y: makeVariance(originLight(horizontalBottomRight.y), originHeavy(horizontalBottomRight.y)),
		// 			kind: r4.kind,
		// 		};
		// 		oldContours[idxC2][l4I] = {
		// 			x: makeVariance(leftLight[3].x, leftHeavy[3].x),
		// 			y: makeVariance(leftLight[3].y, leftHeavy[3].y),
		// 			kind: l4.kind,
		// 		};
		// 		oldContours[idxC1][idxP1 + 1] = {
		// 			x: makeVariance(rightLight[3].x, rightHeavy[3].x),
		// 			y: makeVariance(originLight(horizontalTopRight.y), originHeavy(horizontalTopRight.y)),
		// 			kind: tL.kind,
		// 		};
		// 		oldContours[idxC1][idxP1] = {
		// 			x: makeVariance(rightLight[3].x, rightHeavy[3].x),
		// 			y: makeVariance(originLight(horizontalBottomRight.y), originHeavy(horizontalBottomRight.y)),
		// 			kind: fL.kind,
		// 		};
		// 	}
		// }
		
		for (const contour of oldContours) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			
			const newContour = [...contour];

			// // optimize ㇒ in ㇇'s (horizontal + left-falling) for rounding
			// if (contour.length > 10) {
			// 	let matched = false;
			// 	for (let idx = 0; idx < contour.length; idx++) {
			// 		const tRI = idx;						//topRight
			// 		const tPI = circularIndex(contour, idx + 1);	//topPeak
			// 		const tLI = circularIndex(contour, idx + 2);	//topLeft
			// 		const fLI = circularIndex(contour, idx + 3);	//flatLeft
			// 		const dLI = circularIndex(contour, idx + 4);	//downLeft
			// 		if (
			// 			canBeLeftFalling(contour[tRI], contour[tPI], contour[tLI], contour[fLI], contour[dLI]) &&
			// 			originLight(contour[idx].x) - originLight(circularArray(contour, idx - 2).x) > 50 &&
			// 			originLight(contour[idx].y) > originLight(circularArray(contour, idx - 2).y)
			// 		) {
			// 			// newContour[tRI - 1] = {
			// 			// 	x: newContour[tRI - 1].x,
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[tRI - 1].y) - 10,
			// 			// 		originHeavy(contour[tRI - 1].y) - 30
			// 			// 	),
			// 			// 	kind: newContour[tRI - 1].kind,
			// 			// };
			// 			// newContour[tRI] = {
			// 			// 	x: newContour[tRI].x,
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[tLI].y) - 25,
			// 			// 		originHeavy(contour[tLI].y) - 90
			// 			// 	),
			// 			// 	kind: 0,
			// 			// };
			// 			// newContour[tPI] = {
			// 			// 	x: makeVariance(
			// 			// 		originLight(contour[tRI].x),
			// 			// 		originHeavy(contour[tRI].x)
			// 			// 	),
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[tLI].y),
			// 			// 		originHeavy(contour[tLI].y)
			// 			// 	),
			// 			// 	kind: 0,
			// 			// };
			// 			// newContour[dLI] = {
			// 			// 	x: contour[dLI].x,
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[dLI].y) - 5,
			// 			// 		originHeavy(contour[dLI].y) - 25
			// 			// 	),
			// 			// 	kind: 0,
			// 			// };
			// 			// newContour.splice(tLI, 1);
			// 			newContour.splice(tPI, 1);
			// 			newContour.splice(fLI, 1);
			// 			contour.splice(tPI, 1);
			// 			contour.splice(fLI, 1);
			// 			matched = true;
			// 		}
			// 		if (matched) break;
			// 	}
			// }

			// if (contour.length > 10) {
			// 	let matched = false;
			// 	for (let idx = 0; idx < contour.length; idx++) {
			// 		const rI = idx;						//right
			// 		const tRI = circularIndex(contour, idx + 1);						//topRight
			// 		const tPI = circularIndex(contour, idx + 2);	//topPeak
			// 		const fLI = circularIndex(contour, idx + 3);	//farLeft
			// 		const tLI = circularIndex(contour, idx + 4);	//topLeft
			// 		if (
			// 			canBeLeftFalling2(contour[rI], contour[tRI], contour[tPI], contour[fLI], contour[tLI]) &&
			// 			originLight(contour[idx].x) - originLight(circularArray(contour, idx - 2).x) > 50 &&
			// 			originLight(contour[idx].y) > originLight(circularArray(contour, idx - 2).y)
			// 		) {
			// 			// newContour[tRI - 1] = {
			// 			// 	x: newContour[tRI - 1].x,
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[tRI - 1].y) - 10,
			// 			// 		originHeavy(contour[tRI - 1].y) - 30
			// 			// 	),
			// 			// 	kind: newContour[tRI - 1].kind,
			// 			// };
			// 			// newContour[tRI] = {
			// 			// 	x: newContour[tRI].x,
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[tLI].y) - 25,
			// 			// 		originHeavy(contour[tLI].y) - 90
			// 			// 	),
			// 			// 	kind: 0,
			// 			// };
			// 			// newContour[tPI] = {
			// 			// 	x: makeVariance(
			// 			// 		originLight(contour[tRI].x),
			// 			// 		originHeavy(contour[tRI].x)
			// 			// 	),
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[tLI].y),
			// 			// 		originHeavy(contour[tLI].y)
			// 			// 	),
			// 			// 	kind: 0,
			// 			// };
			// 			// newContour[dLI] = {
			// 			// 	x: contour[dLI].x,
			// 			// 	y: makeVariance(
			// 			// 		originLight(contour[dLI].y) - 5,
			// 			// 		originHeavy(contour[dLI].y) - 25
			// 			// 	),
			// 			// 	kind: 0,
			// 			// };
			// 			// newContour.splice(tLI, 1);
			// 			newContour.splice(tPI, 1);
			// 			newContour.splice(fLI, 1);
			// 			matched = true;
			// 		}
			// 		if (matched) break;
			// 	}
			// }
			


			// if (glyph.name == "uni2E88"){
			// 	// const logcontours = glyph.geometry.contours;
			// 	console.log(oldContours);
			// 	// console.log(newContour);
			// }
			
			glyph.geometry.contours.push(newContour);
		}
	}


	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		console.log(name);
		// if (replacements.includes(name)) {
		// 	glyph.geometry.contours = JSON.parse(fs.readFileSync(`${__dirname}/../replacements/${name}.json`, 'utf-8'));
		// 	if (name === "alpha") console.log(JSON.stringify(glyph));
			
		// 	continue;
		// }
		if (extendSkip.includes(name)) continue;
		checkSingleGlyph(glyph)
		count++;
		if (count % 200 == 0)
			console.log("postProcessing: ", count, " glyphs processed.");
	}
}

module.exports = {
	postProcess
};
