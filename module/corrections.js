"use strict";

const { Ot } = require("ot-builder");
const { extendSkip } = require("./exceptions");
const { hangulSios } = require("./correctionsUnicode");
const fs = require("node:fs");
const path = require("node:path");

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
	var idx = Math.abs(length + index % length) % length;
	return array[isNaN(idx) ? index : idx];
}

function circularIndex(array, index) {
	var length = array && array.length;
	var idx = Math.abs(length + index % length) % length;
	return isNaN(idx) ? index : idx;
}

function abs(num) {
	return num >= 0 ? num : -num;
}

function correctGlyphs(font) {
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
		const cy0 = Ot.Var.Ops.originOf(c[0].y);
		const cy1 = Ot.Var.Ops.originOf(c[1].y);
		const cy13 = Ot.Var.Ops.originOf(c[13].y);
		const cy14 = Ot.Var.Ops.originOf(c[14].y);
		return c[0].kind == 0 && c[1].kind == 1 && c[2].kind == 2 && c[3].kind == 0 && c[4].kind == 0 && c[5].kind == 1 && c[6].kind == 2 && c[7].kind == 0 && c[8].kind == 1 && c[9].kind == 2 && c[10].kind == 0 && c[11].kind == 0 && c[12].kind == 1 && c[13].kind == 2 && c[14].kind == 0 && [627,631,783].includes(cy0) && cy0 == cy1 && cy1 == cy13 && cy13 == cy14;
	}
	
	function isTilde(contour) {
		if (contour.length != 21) return false;
		const c = contour;
		const cy0 = Ot.Var.Ops.originOf(c[0].y);
		const cy1 = Ot.Var.Ops.originOf(c[1].y);
		const cy19 = Ot.Var.Ops.originOf(c[19].y);
		const cy20 = Ot.Var.Ops.originOf(c[20].y);
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
		return abs(Ot.Var.Ops.originOf(a) - Ot.Var.Ops.originOf(b)) <= threshold &&
			abs(Ot.Var.Ops.evaluate(a, instanceShsWghtMax) - Ot.Var.Ops.evaluate(b, instanceShsWghtMax)) <= threshold;
	}

	function canBeBottomEnd(bottomLeft, bottomRight) {
		return bottomLeft.kind == 0 && bottomRight.kind == 0 &&
			approxEq(bottomLeft.y, bottomRight.y, 20) &&
			approxEq(
				Ot.Var.Ops.originOf(bottomRight.x) - Ot.Var.Ops.originOf(bottomLeft.x),
				params.strokeWidth.light,
				20,
			) &&
			Ot.Var.Ops.evaluate(bottomRight.x, instanceShsWghtMax) - Ot.Var.Ops.evaluate(bottomLeft.x, instanceShsWghtMax) <= params.strokeWidth.heavy;
	}
	
	function canBeLeftEnd(topLeft, bottomLeft) {
		return topLeft.kind == 0 && bottomLeft.kind == 0 &&
			approxEq(topLeft.x, bottomLeft.x, 20) &&
			approxEq(
				Ot.Var.Ops.originOf(topLeft.y) - Ot.Var.Ops.originOf(bottomLeft.y),
				params.strokeWidth.light,
				20,
			) &&
			Ot.Var.Ops.evaluate(topLeft.y, instanceShsWghtMax) - Ot.Var.Ops.evaluate(bottomLeft.y, instanceShsWghtMax) <= params.strokeWidth.heavy;
	}

	function canBeRightEnd(bottomRight, topRight) {
		return bottomRight.kind == 0 && topRight.kind == 0 &&
			approxEq(bottomRight.x, topRight.x, 20) &&
			approxEq(
				Ot.Var.Ops.originOf(topRight.y) - Ot.Var.Ops.originOf(bottomRight.y),
				params.strokeWidth.light,
				20,
			) &&
			Ot.Var.Ops.evaluate(topRight.y, instanceShsWghtMax) - Ot.Var.Ops.evaluate(bottomRight.y, instanceShsWghtMax) <= params.strokeWidth.heavy;
	}

	function canBeTopEnd(topRight, topLeft) {
		return topRight.kind == 0 && topLeft.kind == 0 &&
			approxEq(topRight.y, topLeft.y, 20) &&
			approxEq(
				Ot.Var.Ops.originOf(topRight.x) - Ot.Var.Ops.originOf(topLeft.x),
				params.strokeWidth.light,
				20,
			) &&
			Ot.Var.Ops.evaluate(topRight.x, instanceShsWghtMax) - Ot.Var.Ops.evaluate(topLeft.x, instanceShsWghtMax) <= params.strokeWidth.heavy;
	}

	function canBeLeftFalling(topRight, topPeak, topLeft, flatLeft, downLeft) {
		return topRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && downLeft.kind == 0 &&
		Ot.Var.Ops.originOf(topRight.x) - Ot.Var.Ops.originOf(topPeak.x) > 0 &&
		Ot.Var.Ops.originOf(topPeak.x) - Ot.Var.Ops.originOf(topLeft.x) > 0 &&
		Ot.Var.Ops.originOf(topLeft.x) - Ot.Var.Ops.originOf(flatLeft.x) > 0 &&
		Ot.Var.Ops.originOf(flatLeft.x) - Ot.Var.Ops.originOf(downLeft.x) == 0 &&
		Ot.Var.Ops.originOf(topRight.y) - Ot.Var.Ops.originOf(topPeak.y) <= 0 &&
		Ot.Var.Ops.originOf(topPeak.y) - Ot.Var.Ops.originOf(topLeft.y) > 0 &&
		Ot.Var.Ops.originOf(topLeft.y) - Ot.Var.Ops.originOf(flatLeft.y) == 0 &&
		Ot.Var.Ops.originOf(flatLeft.y) - Ot.Var.Ops.originOf(downLeft.y) > 0;
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
		return Ot.Var.Ops.originOf(a) <= Ot.Var.Ops.originOf(x) &&
			Ot.Var.Ops.originOf(x) <= Ot.Var.Ops.originOf(b) + 2 &&
			Ot.Var.Ops.evaluate(a, instanceShsWghtMax) <= Ot.Var.Ops.evaluate(x, instanceShsWghtMax) &&
			Ot.Var.Ops.evaluate(x, instanceShsWghtMax) <= Ot.Var.Ops.evaluate(b, instanceShsWghtMax) + 2;
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(valueDefault, [[masterWghtMax, valueWghtMax - valueDefault]]);
	}

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;

		let oldContours = glyph.geometry.contours;
		

			
		glyph.geometry.contours = [];
		
		if (hangulSios.includes(glyph.name)) {
			for (let i = 0; i < oldContours.length - 1; i++) {
				if (
					oldContours[i].length === 10 && oldContours[i + 1].length === 10 &&
					originHeavy(oldContours[i][0].y) === originHeavy(oldContours[i + 1][0].y) &&
					originHeavy(oldContours[i + 1][0].x) - originHeavy(oldContours[i][0].x) > 0 &&
					originHeavy(oldContours[i + 1][0].x) - originHeavy(oldContours[i][0].x) < 60
				) {
					const m0x1 = (originLight(oldContours[i + 1][0].x) + originLight(oldContours[i][0].x)) /2;
					const m0x2 = (originLight(circularArray(oldContours[i + 1], -1).x) + originLight(circularArray(oldContours[i], -1).x)) /2;
					const m0w = abs(m0x1 - m0x2);
					const m0h = m0w / 2;
					const m0y = originLight(oldContours[i][0].y) - originLight(oldContours[i][1].y);
					const m0v = m0y < m0h ? m0h - m0y : 0;
					const m1x1 = (originHeavy(oldContours[i + 1][0].x) + originHeavy(oldContours[i][0].x)) /2;
					const m1x2 = (originHeavy(circularArray(oldContours[i + 1], -1).x) + originHeavy(circularArray(oldContours[i], -1).x)) /2;
					const m1w = abs(m1x1 - m1x2);
					const m1h = m1w / 2;
					const m1y = originHeavy(oldContours[i][0].y) - originHeavy(oldContours[i][1].y);
					const m1v = m1y < m1h ? m1h - m1y : 0;
					
					oldContours[i][0] = {
						x: makeVariance(m0x1, m1x1),
						y: makeVariance(originLight(oldContours[i][0].y), originHeavy(oldContours[i][0].y)),
						kind: oldContours[i][0].kind,
					};
					oldContours[i][1] = {
						x: makeVariance(m0x1, m1x1),
						y: makeVariance(originLight(oldContours[i][1].y) - m0v, originHeavy(oldContours[i][1].y) - m1v),
						kind: oldContours[i][1].kind,
					};
					oldContours[i][2] = {
						x: makeVariance(m0x1, m1x1),
						y: makeVariance(originLight(oldContours[i][2].y) - m0v, originHeavy(oldContours[i][2].y) - m1v),
						kind: oldContours[i][2].kind,
					};
					oldContours[i][7] = {
						x: makeVariance(m0x2, m1x2),
						y: makeVariance(originLight(oldContours[i][7].y) - m0v, originHeavy(oldContours[i][7].y) - m1v),
						kind: oldContours[i][7].kind,
					};
					oldContours[i][8] = {
						x: makeVariance(m0x2, m1x2),
						y: makeVariance(originLight(oldContours[i][8].y) - m0v, originHeavy(oldContours[i][8].y) - m1v),
						kind: oldContours[i][8].kind,
					};
					oldContours[i][9] = {
						x: makeVariance(m0x2, m1x2),
						y: makeVariance(originLight(oldContours[i][9].y), originHeavy(oldContours[i][9].y)),
						kind: oldContours[i][9].kind,
					};
					oldContours[i + 1][0] = {
						x: makeVariance(m0x1, m1x1),
						y: makeVariance(originLight(oldContours[i + 1][0].y), originHeavy(oldContours[i + 1][0].y)),
						kind: oldContours[i + 1][0].kind,
					};
					oldContours[i + 1][1] = {
						x: makeVariance(m0x1, m1x1),
						y: makeVariance(originLight(oldContours[i + 1][1].y) - m0v, originHeavy(oldContours[i + 1][1].y) - m1v),
						kind: oldContours[i + 1][1].kind,
					};
					oldContours[i + 1][2] = {
						x: makeVariance(m0x1, m1x1),
						y: makeVariance(originLight(oldContours[i + 1][2].y) - m0v, originHeavy(oldContours[i + 1][2].y) - m1v),
						kind: oldContours[i + 1][2].kind,
					};
					oldContours[i + 1][7] = {
						x: makeVariance(m0x2, m1x2),
						y: makeVariance(originLight(oldContours[i + 1][7].y) - m0v, originHeavy(oldContours[i + 1][7].y) - m1v),
						kind: oldContours[i + 1][7].kind,
					};
					oldContours[i + 1][8] = {
						x: makeVariance(m0x2, m1x2),
						y: makeVariance(originLight(oldContours[i + 1][8].y) - m0v, originHeavy(oldContours[i + 1][8].y) - m1v),
						kind: oldContours[i + 1][8].kind,
					};
					oldContours[i + 1][9] = {
						x: makeVariance(m0x2, m1x2),
						y: makeVariance(originLight(oldContours[i + 1][9].y), originHeavy(oldContours[i + 1][9].y)),
						kind: oldContours[i + 1][9].kind,
					};
					i++
				}
			}
		}
		
		for (const contour of oldContours) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			// fix all 人's starting on midpoint of horizontal line and start on corner
			if (contour.length === 22) {
				const tlefty = Ot.Var.Ops.originOf(contour[1].y);
				const tcentery = Ot.Var.Ops.originOf(contour[0].y);
				const trighty = Ot.Var.Ops.originOf(contour[21].y);
				const tleftx = Ot.Var.Ops.originOf(contour[1].x);
				const tcenterx = Ot.Var.Ops.originOf(contour[0].x);
				const trightx = Ot.Var.Ops.originOf(contour[21].x);
				if (
					tlefty === tcentery && 
					tcentery === trighty && 
					tleftx < tcenterx && 
					tcenterx < trightx && 
					trightx - tleftx < 40
				) {
					// console.log("corrected 人: " + glyph.name);
					contour.shift();
				}
			}
			
			const newContour = [...contour];

			// if (glyph.name == "uni31A0") console.log(glyph.name, contour);
			
			// fix ˇ and ̌
			if (glyph.name == "caron" || glyph.name == "uni030C") {
				newContour[0] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[0].x) - 3,
						Ot.Var.Ops.evaluate(contour[0].x, instanceShsWghtMax) - 55
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[0].y) - 12,
						Ot.Var.Ops.evaluate(contour[0].y, instanceShsWghtMax) - 34
					),
					kind: contour[0].kind,
				};
				newContour[1] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[1].x) + 1,
						Ot.Var.Ops.evaluate(contour[1].x, instanceShsWghtMax) - 1
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[1].y),
						Ot.Var.Ops.evaluate(contour[1].y, instanceShsWghtMax) + 10
					),
					kind: contour[1].kind,
				};
				newContour[2] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[2].x) + 7,
						Ot.Var.Ops.evaluate(contour[2].x, instanceShsWghtMax) + 54
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[2].y) - 12,
						Ot.Var.Ops.evaluate(contour[2].y, instanceShsWghtMax) - 35
					),
					kind: contour[2].kind,
				};
				newContour[3] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[3].x) + 4,
						Ot.Var.Ops.evaluate(contour[3].x, instanceShsWghtMax) + 4
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[3].y) + 4,
						Ot.Var.Ops.evaluate(contour[3].y, instanceShsWghtMax) + 45
					),
					kind: contour[3].kind,
				};
				newContour[4] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[4].x),
						Ot.Var.Ops.evaluate(contour[4].x, instanceShsWghtMax)
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[4].y) + 1,
						Ot.Var.Ops.evaluate(contour[4].y, instanceShsWghtMax) + 45
					),
					kind: contour[4].kind,
				};
				newContour[5] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[5].x) + 2,
						Ot.Var.Ops.evaluate(contour[5].x, instanceShsWghtMax) + 4
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[5].y) + 4,
						Ot.Var.Ops.evaluate(contour[5].y, instanceShsWghtMax) + 45
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
					newContour.splice(6, 1);
				}
				// continue;
			}
			
			if (isTilde(contour)) {
				// console.log("corrected tilde: " + glyph.name);
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
				// continue;
			}
			
			if (isBreve(contour)) {
				// console.log("corrected breve: " + glyph.name);
				newContour[0] = {
					x: makeVariance(originLight(contour[0].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[0].y), originHeavy(contour[0].y)),
					kind: contour[0].kind,
				};
				newContour[1] = {
					x: makeVariance(originLight(contour[1].x), originHeavy(contour[0].x) + 130),
					y: makeVariance(originLight(contour[1].y), originHeavy(contour[0].y)),
					kind: contour[1].kind,
				};
				newContour[2] = {
					x: makeVariance(originLight(contour[2].x), originHeavy(contour[0].x) + 218),
					y: makeVariance(originLight(contour[2].y), originHeavy(contour[0].y) + 74),
					kind: contour[2].kind,
				};
				newContour[3] = {
					x: makeVariance(originLight(contour[3].x), originHeavy(contour[0].x) + 231),
					y: makeVariance(originLight(contour[3].y), originHeavy(contour[0].y) + 130),
					kind: contour[3].kind,
				};
				newContour[4] = {
					x: makeVariance(originLight(contour[4].x), originHeavy(contour[0].x) + 113),
					y: makeVariance(originLight(contour[4].y), originHeavy(contour[0].y) + 158),
					kind: contour[4].kind,
				};
				newContour[5] = {
					x: makeVariance(originLight(contour[5].x), originHeavy(contour[0].x) + 97),
					y: makeVariance(originLight(contour[5].y), originHeavy(contour[0].y) + 120),
					kind: contour[5].kind,
				};
				newContour[6] = {
					x: makeVariance(originLight(contour[6].x), originHeavy(contour[0].x) + 50),
					y: makeVariance(originLight(contour[6].y), originHeavy(contour[0].y) + 100),
					kind: contour[6].kind,
				};
				newContour[7] = {
					x: makeVariance(originLight(contour[7].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[7].y), originHeavy(contour[0].y) + 100),
					kind: contour[7].kind,
				};
				newContour[8] = {
					x: makeVariance(originLight(contour[8].x), originHeavy(contour[0].x) - 50),
					y: makeVariance(originLight(contour[8].y), originHeavy(contour[0].y) + 100),
					kind: contour[8].kind,
				};
				newContour[9] = {
					x: makeVariance(originLight(contour[9].x), originHeavy(contour[0].x) - 97),
					y: makeVariance(originLight(contour[9].y), originHeavy(contour[0].y) + 120),
					kind: contour[9].kind,
				};
				newContour[10] = {
					x: makeVariance(originLight(contour[10].x), originHeavy(contour[0].x) - 113),
					y: makeVariance(originLight(contour[10].y), originHeavy(contour[0].y) + 158),
					kind: contour[10].kind,
				};
				newContour[11] = {
					x: makeVariance(originLight(contour[11].x), originHeavy(contour[0].x) - 231),
					y: makeVariance(originLight(contour[11].y), originHeavy(contour[0].y) + 130),
					kind: contour[11].kind,
				};
				newContour[12] = {
					x: makeVariance(originLight(contour[12].x), originHeavy(contour[0].x) - 218),
					y: makeVariance(originLight(contour[12].y), originHeavy(contour[0].y) + 74),
					kind: contour[12].kind,
				};
				newContour[13] = {
					x: makeVariance(originLight(contour[13].x), originHeavy(contour[0].x) - 130),
					y: makeVariance(originLight(contour[13].y), originHeavy(contour[0].y)),
					kind: contour[13].kind,
				};
				newContour[14] = {
					x: makeVariance(originLight(contour[14].x), originHeavy(contour[0].x)),
					y: makeVariance(originLight(contour[14].y), originHeavy(contour[0].y)),
					kind: contour[14].kind,
				};
				// continue;
			}
			// if (isBreve(contour)) {
			// 	console.log(glyph.name);
			// 	newContour[2] = {
			// 		x: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[2].x),
			// 			Ot.Var.Ops.evaluate(contour[2].x, instanceShsWghtMax) + 21
			// 		),
			// 		y: contour[2].y,
			// 		kind: contour[2].kind,
			// 	};
			// 	newContour[3] = {
			// 		x: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[3].x),
			// 			Ot.Var.Ops.evaluate(contour[3].x, instanceShsWghtMax) + 11
			// 		),
			// 		y: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[3].y),
			// 			Ot.Var.Ops.evaluate(contour[3].y, instanceShsWghtMax) + 17
			// 		),
			// 		kind: contour[3].kind,
			// 	};
			// 	newContour[5] = {
			// 		x: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[5].x),
			// 			Ot.Var.Ops.evaluate(contour[5].x, instanceShsWghtMax) + 10
			// 		),
			// 		y: contour[5].y,
			// 		kind: contour[5].kind,
			// 	};
			// 	newContour[9] = {
			// 		x: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[9].x),
			// 			Ot.Var.Ops.evaluate(contour[9].x, instanceShsWghtMax) - 10
			// 		),
			// 		y: contour[9].y,
			// 		kind: contour[9].kind,
			// 	};
			// 	newContour[11] = {
			// 		x: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[11].x),
			// 			Ot.Var.Ops.evaluate(contour[11].x, instanceShsWghtMax) - 10
			// 		),
			// 		y: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[11].y),
			// 			Ot.Var.Ops.evaluate(contour[11].y, instanceShsWghtMax) + 17
			// 		),
			// 		kind: contour[11].kind,
			// 	};
			// 	newContour[12] = {
			// 		x: makeVariance(
			// 			Ot.Var.Ops.originOf(contour[12].x),
			// 			Ot.Var.Ops.evaluate(contour[12].x, instanceShsWghtMax) - 22
			// 		),
			// 		y: contour[12].y,
			// 		kind: contour[12].kind,
			// 	};
			// }
			// fix ζ
			if (glyph.name == "zeta") {
				newContour.splice(12, 1);
				newContour[11] = {
					x: contour[11].x,
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[11].y) - 10,
						Ot.Var.Ops.evaluate(contour[11].y, instanceShsWghtMax) - 50
					),
					kind: contour[11].kind,
				};
				// continue;
			}
			
			// fix Ж and ж
			if (glyph.name == "uni0416" || glyph.name == "uni0436") {
				newContour[17] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[17].x) + 20,
						Ot.Var.Ops.evaluate(contour[17].x, instanceShsWghtMax) + 40
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[17].y),
						Ot.Var.Ops.evaluate(contour[17].y, instanceShsWghtMax) + 3
					),
					kind: contour[17].kind,
				};
				newContour[18] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[18].x) + 20,
						Ot.Var.Ops.evaluate(contour[18].x, instanceShsWghtMax) + 40
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[18].y) + 2,
						Ot.Var.Ops.evaluate(contour[18].y, instanceShsWghtMax) + 3
					),
					kind: contour[18].kind,
				};
				newContour[37] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[37].x) - 20,
						Ot.Var.Ops.evaluate(contour[37].x, instanceShsWghtMax) - 40
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[37].y) + 2,
						Ot.Var.Ops.evaluate(contour[37].y, instanceShsWghtMax) + 3
					),
					kind: contour[37].kind,
				};
				newContour[38] = {
					x: makeVariance(
						Ot.Var.Ops.originOf(contour[38].x) - 20,
						Ot.Var.Ops.evaluate(contour[38].x, instanceShsWghtMax) - 40
					),
					y: makeVariance(
						Ot.Var.Ops.originOf(contour[38].y),
						Ot.Var.Ops.evaluate(contour[38].y, instanceShsWghtMax) + 3
					),
					kind: contour[38].kind,
				};
				// continue;
			}

			// fix 㰤
			if (glyph.name == "uni3C24" || glyph.name == "uni3C2D") {
				if (contour.length === 12) {
					newContour[0] = {
						x: contour[0].x,
						y: makeVariance(
							Ot.Var.Ops.originOf(contour[0].y),
							Ot.Var.Ops.evaluate(contour[0].y, instanceShsWghtMax) + 50
						),
						kind: contour[0].kind,
					};
					newContour[1] = {
						x: contour[1].x,
						y: makeVariance(
							Ot.Var.Ops.originOf(contour[1].y),
							Ot.Var.Ops.evaluate(contour[1].y, instanceShsWghtMax) - 30
						),
						kind: contour[1].kind,
					};
					newContour[10] = {
						x: contour[10].x,
						y: makeVariance(
							Ot.Var.Ops.originOf(contour[10].y),
							Ot.Var.Ops.evaluate(contour[10].y, instanceShsWghtMax) - 30
						),
						kind: contour[10].kind,
					};
					newContour[11] = {
						x: contour[11].x,
						y: makeVariance(
							Ot.Var.Ops.originOf(contour[11].y),
							Ot.Var.Ops.evaluate(contour[11].y, instanceShsWghtMax) + 50
						),
						kind: contour[11].kind,
					};
					// continue;
				}
			}
			// optimize ㇒ in ㇇'s (horizontal + left-falling) for rounding
			if (contour.length > 10) {
				let matched = false;
				for (let idx = 0; idx < contour.length; idx++) {
					const l = contour.length;
					const tRI = idx;						//topRight
					const tPI = circularIndex(contour, idx + 1);	//topPeak
					const tLI = circularIndex(contour, idx + 2);	//topLeft
					const fLI = circularIndex(contour, idx + 3);	//flatLeft
					const dLI = circularIndex(contour, idx + 4);	//downLeft
					if (
						canBeLeftFalling(contour[tRI], contour[tPI], contour[tLI], contour[fLI], contour[dLI]) &&
						originLight(contour[idx].x) - originLight(circularArray(contour, idx - 2).x) > 50 &&
						originLight(contour[idx].y) > originLight(circularArray(contour, idx - 2).y)
					) {
						// newContour[tRI - 1] = {
						// 	x: newContour[tRI - 1].x,
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tRI - 1].y) - 10,
						// 		Ot.Var.Ops.evaluate(contour[tRI - 1].y, instanceShsWghtMax) - 30
						// 	),
						// 	kind: newContour[tRI - 1].kind,
						// };
						// newContour[tRI] = {
						// 	x: newContour[tRI].x,
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tLI].y) - 25,
						// 		Ot.Var.Ops.evaluate(contour[tLI].y, instanceShsWghtMax) - 90
						// 	),
						// 	kind: 0,
						// };
						// newContour[tPI] = {
						// 	x: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tRI].x),
						// 		Ot.Var.Ops.evaluate(contour[tRI].x, instanceShsWghtMax)
						// 	),
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tLI].y),
						// 		Ot.Var.Ops.evaluate(contour[tLI].y, instanceShsWghtMax)
						// 	),
						// 	kind: 0,
						// };
						// newContour[dLI] = {
						// 	x: contour[dLI].x,
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[dLI].y) - 5,
						// 		Ot.Var.Ops.evaluate(contour[dLI].y, instanceShsWghtMax) - 25
						// 	),
						// 	kind: 0,
						// };
						// newContour.splice(tLI, 1);
						newContour.splice(tPI, 1);
						newContour.splice(fLI, 1);
						contour.splice(tPI, 1);
						contour.splice(fLI, 1);
						matched = true;
					}
					if (matched) break;
				}
			}

			if (contour.length > 10) {
				let matched = false;
				for (let idx = 0; idx < contour.length; idx++) {
					const rI = idx;						//right
					const tRI = circularIndex(contour, idx + 1);						//topRight
					const tPI = circularIndex(contour, idx + 2);	//topPeak
					const fLI = circularIndex(contour, idx + 3);	//farLeft
					const tLI = circularIndex(contour, idx + 4);	//topLeft
					if (
						canBeLeftFalling2(contour[rI], contour[tRI], contour[tPI], contour[fLI], contour[tLI]) &&
						originLight(contour[idx].x) - originLight(circularArray(contour, idx - 2).x) > 50 &&
						originLight(contour[idx].y) > originLight(circularArray(contour, idx - 2).y)
					) {
						// newContour[tRI - 1] = {
						// 	x: newContour[tRI - 1].x,
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tRI - 1].y) - 10,
						// 		Ot.Var.Ops.evaluate(contour[tRI - 1].y, instanceShsWghtMax) - 30
						// 	),
						// 	kind: newContour[tRI - 1].kind,
						// };
						// newContour[tRI] = {
						// 	x: newContour[tRI].x,
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tLI].y) - 25,
						// 		Ot.Var.Ops.evaluate(contour[tLI].y, instanceShsWghtMax) - 90
						// 	),
						// 	kind: 0,
						// };
						// newContour[tPI] = {
						// 	x: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tRI].x),
						// 		Ot.Var.Ops.evaluate(contour[tRI].x, instanceShsWghtMax)
						// 	),
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[tLI].y),
						// 		Ot.Var.Ops.evaluate(contour[tLI].y, instanceShsWghtMax)
						// 	),
						// 	kind: 0,
						// };
						// newContour[dLI] = {
						// 	x: contour[dLI].x,
						// 	y: makeVariance(
						// 		Ot.Var.Ops.originOf(contour[dLI].y) - 5,
						// 		Ot.Var.Ops.evaluate(contour[dLI].y, instanceShsWghtMax) - 25
						// 	),
						// 	kind: 0,
						// };
						// newContour.splice(tLI, 1);
						newContour.splice(tPI, 1);
						newContour.splice(fLI, 1);
						matched = true;
					}
					if (matched) break;
				}
			}
			
			for (let idx = 0; idx < contour.length; idx++) {
				let matched = false;
				if (
					// is top end
					canBeTopEnd(contour[idx], circularArray(contour, idx + 1)) &&
					approxEq(contour[idx].x, circularArray(contour, idx - 1).x) &&
					approxEq(circularArray(contour, idx + 1).x, circularArray(contour, idx + 2).x)
				) {
					const verticalTopRight = contour[idx];
					const verticalTopLeft = circularArray(contour, idx + 1);
					// const verticalBottomLeftIdx = circularIndex(contour, idx + 2);
					const verticalBottomLeftIdx = 
												circularArray(contour, idx + 2).kind === 0 ? circularIndex(contour, idx + 2) :
												circularArray(contour, idx + 3).kind === 0 ? circularIndex(contour, idx + 3) : circularIndex(contour, idx + 4);
												// circularIndex(contour, idx + 5);
					const verticalBottomLeft = circularArray(contour, verticalBottomLeftIdx);
					const verticalBottomRightIdx = 
												circularArray(contour, idx - 1).kind === 0 ? circularIndex(contour, idx - 1) :
												circularArray(contour, idx - 2).kind === 0 ? circularIndex(contour, idx - 2) :
												circularArray(contour, idx - 3).kind === 0 ? circularIndex(contour, idx - 3) : 
												circularIndex(contour, idx - 4);
					const verticalBottomRight = circularArray(contour, verticalBottomRightIdx);
						
					// fix tops with extra points too close to right corner preventing rounding
					if (
						abs(originLight(verticalTopRight.x) - originLight(verticalBottomRight.x)) <= 5 &&
						abs(originLight(verticalTopRight.y) - originLight(verticalBottomRight.y)) < 30
						// abs(originLight(verticalTopRight.y) - originLight(circularArray(contour, idxP1 - 2).y)) > 30 &&
						// abs(originLight(verticalBottomRight.x) - originLight(circularArray(contour, idxP1 - 2).x)) < 10
					) {
						const deltaM0 = originLight(verticalTopRight.y) - originLight(verticalBottomRight.y);
						const deltaM1 = originHeavy(verticalTopRight.y) - originHeavy(verticalBottomRight.y);
						const diffM0 = deltaM0 < 30 ? 30 - deltaM0 : 0;
						const diffM1 = deltaM1 < 80 ? 80 - deltaM1 : 0;
						// console.log("extend points too close right: " + glyph.name);
						newContour[verticalBottomRightIdx] = {
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
						abs(originLight(verticalTopLeft.y) - originLight(verticalBottomLeft.y)) < 30
						// Ot.Var.Ops.originOf(verticalTopLeft.x) == Ot.Var.Ops.originOf(verticalBottomLeft.x) &&
						// abs(Ot.Var.Ops.originOf(verticalTopLeft.y) - Ot.Var.Ops.originOf(verticalBottomLeft.y)) < 30 &&
						// abs(Ot.Var.Ops.originOf(verticalTopLeft.y) - Ot.Var.Ops.originOf(circularArray(contour, idxP1 + 3).y)) > 30 &&
						// abs(Ot.Var.Ops.originOf(verticalBottomLeft.x) - Ot.Var.Ops.originOf(circularArray(contour, idxP1 + 3).x)) < 10
					) {
						const deltaM0 = originLight(verticalTopLeft.y) - originLight(verticalBottomLeft.y);
						const deltaM1 = originHeavy(verticalTopLeft.y) - originHeavy(verticalBottomLeft.y);
						const diffM0 = deltaM0 < 30 ? 30 - deltaM0 : 0;
						const diffM1 = deltaM1 < 80 ? 80 - deltaM1 : 0;
						// console.log("extend points too close left: " + glyph.name);
						newContour[verticalBottomLeftIdx] = {
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
				}
				if (matched) break;
			}

			if (glyph.name == "uni36C4"){
				// const logcontours = glyph.geometry.contours;
				console.log(contour);
				console.log(newContour);
			}
			glyph.geometry.contours.push(newContour);
		}
	}


	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		// if (replacements.includes(name)) {
		// 	glyph.geometry.contours = JSON.parse(fs.readFileSync(`${__dirname}/../replacements/${name}.json`, 'utf-8'));
		// 	if (name === "alpha") console.log(JSON.stringify(glyph));
			
		// 	continue;
		// }
		if (extendSkip.includes(name)) continue;
		checkSingleGlyph(glyph)
		count++;
		if (count % 1000 == 0)
			console.log("correctGlyphs:", count, "glyphs processed.");
	}
}

module.exports = {
	correctGlyphs
};
