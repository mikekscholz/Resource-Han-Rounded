"use strict";

const { Ot } = require("ot-builder");
const inside = require("point-in-polygon-hao");
const Bezier = require("./bezier.js");
const ProgressBar = require('./node-progress');
const { approximateBezier, base60, bearing, horizontalSlope, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc } = Math;

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
	let slope = (p2.y - p1.y) / (p2.x - p1.x);
	return isNaN(slope) ? 0 : slope;
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
				distanceLight(circularArray(contour, i), circularArray(contour, i + 7)) < 60 &&
				distanceHeavy(circularArray(contour, i), circularArray(contour, i + 7)) < 160 &&
				originLight(circularArray(contour, i - 1).x) < originLight(circularArray(contour, i).x)
				// originLight(contour[i].x) < originLight(circularArray(contour, i + 3).x) &&
				// originLight(contour[i].y) < originLight(circularArray(contour, i + 3).y) &&
				// originLight(circularArray(contour, i + 7).x) < originLight(circularArray(contour, i + 4).x) &&
				// originLight(circularArray(contour, i + 7).y) > originLight(circularArray(contour, i + 4).y)
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
		
		function fixLeftFallingBezier(ref) {
			let idxC1 = ref.horizontal;
			// let idxP1 = ref.horizontalBottomRight;
			let idxC2 = ref.leftFalling;
			// let idxP2 = ref.leftFallingTopRight;
			let contour = oldContours[idxC1];
			let contour2 = oldContours[idxC2];
			let idxP1 = findBottomRight(contour);
			let h0 = circularArray(contour, idxP1 - 1);
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
			let r1 = circularArray(contour2, -7);
			let r2 = circularArray(contour2, -6);
			let r3 = circularArray(contour2, -5);
			let r4 = circularArray(contour2, -4);
			let r5 = circularArray(contour2, -3);
			let r6 = circularArray(contour2, -2);
			let r7 = circularArray(contour2, -1);
			let r1I = circularIndex(contour2, -7);
			let r2I = circularIndex(contour2, -6);
			let r3I = circularIndex(contour2, -5);
			let r4I = circularIndex(contour2, -4);
			let r5I = circularIndex(contour2, -3);
			let r6I = circularIndex(contour2, -2);
			let r7I = circularIndex(contour2, -1);
			let r1xL = originLight(r1.x);
			let r1yL = originLight(r1.y);
			let r2xL = originLight(r2.x);
			let r2yL = originLight(r2.y);
			let r3xL = originLight(r3.x);
			let r3yL = originLight(r3.y);
			let r4xL = originLight(r4.x);
			let r4yL = originLight(r4.y);
			let r1xH = originHeavy(r1.x);
			let r1yH = originHeavy(r1.y);
			let r2xH = originHeavy(r2.x);
			let r2yH = originHeavy(r2.y);
			let r3xH = originHeavy(r3.x);
			let r3yH = originHeavy(r3.y);
			let r4xH = originHeavy(r4.x);
			let r4yH = originHeavy(r4.y);
			// degenerated bezier correction
			let r2xLC = 0;
			let r2yLC = 0;
			let r3xLC = 0;
			let r3yLC = 0;
			let r2xHC = 0;
			let r2yHC = 0;
			let r3xHC = 0;
			let r3yHC = 0;
			// let r4yHC = 0;
			// if (abs(originHeavy(h4.y) - r4yH) < 10) {
				// r4yHC = 10;
				// r2xHC = 10;
			// }
			if (r1xH === r2xH && r1yH === r2yH) {
				let vSlope = slope({p1: {x: r1xH, y: r1yH}, p2: {x: r3xH, y: r3yH}});
				r2xHC = 2;
				r2yHC = (2 * vSlope);
			}
			
			let vCurveLight;
			let vCurveHeavy;
			
			// let hSL = slope(lineLight(h0, h1));
			// let hSH = slope(lineHeavy(h0, h1));
			let horizontalSlope = ref?.horizontalSlope || 0;
			
			let hXL = 0;
			let hYL = 0;
			let hXH = 0;
			let hYH = 0;
			let hXLMax = ((r4xH - originLight(h1.x)) + 800);
			let hXHMax = ((r4xH - originHeavy(h1.x)) + 800);
			let hCurveLight;
			let hCurveHeavy;
			let intersectLight = [];
			let intersectHeavy = [];
			function generateCurve1Light() {
				vCurveLight = new Bezier(r1xL,r1yL,r2xL + r2xLC,r2yL + r2yLC,r3xL + r3xLC,r3yL + r3yLC,r4xL,r4yL);
			}
			function generateCurve1Heavy() {
				vCurveHeavy = new Bezier(r1xH,r1yH,r2xH + r2xHC,r2yH + r2yHC,r3xH + r3xHC,r3yH + r3yHC,r4xH,r4yH);
			}
			function generateCurve2Light() {
				hCurveLight = new Bezier(originLight(h1.x) + hXL,originLight(h1.y) + hYL,originLight(h2.x) + hXL,originLight(h2.y) + hYL,originLight(h3.x) + hXL,originLight(h3.y) + hYL,originLight(h4.x) + hXL,originLight(h4.y) + hYL);
			}
			function generateCurve2Heavy() {
				hCurveHeavy = new Bezier(originHeavy(h1.x) + hXH,originHeavy(h1.y) + hYH,originHeavy(h2.x) + hXH,originHeavy(h2.y) + hYH,originHeavy(h3.x) + hXH,originHeavy(h3.y) + hYH,originHeavy(h4.x) + hXH,originHeavy(h4.y) + hYH);
			}
			function checkIntersectLight() {
				intersectLight = vCurveLight.intersects(hCurveLight);
			}
			function checkIntersectHeavy() {
				intersectHeavy = vCurveHeavy.intersects(hCurveHeavy);
			}
			
			generateCurve1Light();
			generateCurve2Light();
			while (intersectLight.length === 0) {
				if (hXL >= hXLMax) {
					// console.log(name, "correcting for light degenerated bezier curve.");
					// console.log(name, hSH);
					hXL = 0;
					generateCurve2Light();
					r2xLC++;
					r3xLC++;
					generateCurve1Light();
					// badCurve = true;
					// break;
				}
				hXL = hXL + 6;
				hYL = hXL * horizontalSlope;
				generateCurve2Light();
				checkIntersectLight();
			}
			while (intersectLight.length !== 0) {
				hXL = hXL - 1;
				hYL = hXL * horizontalSlope;
				generateCurve2Light();
				checkIntersectLight();
			}
			while (intersectLight.length === 0) {
				hXL = hXL + 0.1;
				hYL = hXL * horizontalSlope;
				generateCurve2Light();
				checkIntersectLight();
			}
			
			generateCurve1Heavy();
			generateCurve2Heavy();
			let badCurve = false;
			while (intersectHeavy.length === 0) {
				if (hXH >= hXHMax) {
					// console.log(name, "correcting for heavy degenerated bezier curve.");
					// console.log(name, hSH);
					hXH = 0;
					generateCurve2Heavy();
					r2xHC++;
					generateCurve1Heavy();
					// badCurve = true;
					// break;
				}
				hXH = hXH + 30;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy();
			}
			while (intersectHeavy.length !== 0) {
				hXH = hXH - 10;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy();
			}
			while (intersectHeavy.length === 0) {
				hXH = hXH + 2;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy();
			}
			while (intersectHeavy.length !== 0) {
				hXH = hXH - 1;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy();
			}
			while (intersectHeavy.length === 0) {
				hXH = hXH + 0.1;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy();
			}
			// if (badCurve) return;
			let splitLight = vCurveLight.split(intersectLight[0].split('/')[0]);
			let splitHeavy = vCurveHeavy.split(intersectHeavy[0].split('/')[0]);
			let pointsLight = splitLight.left.points;
			let pointsHeavy = splitHeavy.left.points;
	
			oldContours[idxC1][h1I] = {
				x: makeVariance(originLight(h1.x) + hXL, originHeavy(h1.x) + hXH),
				y: makeVariance(originLight(h1.y) + hYL, originHeavy(h1.y) + hYH),
				kind: h1.kind,
			};
			oldContours[idxC1][h2I] = {
				x: makeVariance(originLight(h2.x) + hXL, originHeavy(h2.x) + hXH),
				y: makeVariance(originLight(h2.y) + hYL, originHeavy(h2.y) + hYH),
				kind: h2.kind,
			};
			oldContours[idxC1][h3I] = {
				x: makeVariance(originLight(h3.x) + hXL, originHeavy(h3.x) + hXH),
				y: makeVariance(originLight(h3.y) + hYL, originHeavy(h3.y) + hYH),
				kind: h3.kind,
			};
			oldContours[idxC1][h4I] = {
				x: makeVariance(originLight(h4.x) + hXL, originHeavy(h4.x) + hXH),
				y: makeVariance(originLight(h4.y) + hYL, originHeavy(h4.y) + hYH),
				kind: h4.kind,
			};
			oldContours[idxC1][h5I] = {
				x: makeVariance(originLight(h5.x) + hXL, originHeavy(h5.x) + hXH),
				y: makeVariance(originLight(h5.y) + hYL, originHeavy(h5.y) + hYH),
				kind: h5.kind,
			};
			oldContours[idxC1][h6I] = {
				x: makeVariance(originLight(h6.x) + hXL, originHeavy(h6.x) + hXH),
				y: makeVariance(originLight(h6.y) + hYL, originHeavy(h6.y) + hYH),
				kind: h6.kind,
			};
			oldContours[idxC1][h7I] = {
				x: makeVariance(originLight(h7.x) + hXL, originHeavy(h7.x) + hXH),
				y: makeVariance(originLight(h7.y) + hYL, originHeavy(h7.y) + hYH),
				kind: h7.kind,
			};
			oldContours[idxC1][h8I] = {
				x: makeVariance(originLight(h8.x) + hXL, originHeavy(h8.x) + hXH),
				y: makeVariance(originLight(h8.y) + hYL, originHeavy(h8.y) + hYH),
				kind: h8.kind,
			};
	
			
			
			oldContours[idxC2][r1I] = {
				x: makeVariance(pointsLight[0].x, pointsHeavy[0].x),
				y: makeVariance(pointsLight[0].y, pointsHeavy[0].y),
				kind: r1.kind,
			};
			oldContours[idxC2][r2I] = {
				x: makeVariance(pointsLight[1].x - r2xLC, pointsHeavy[1].x - r2xHC),
				y: makeVariance(pointsLight[1].y - r2yLC, pointsHeavy[1].y - r2yHC),
				kind: r2.kind,
			};
			oldContours[idxC2][r3I] = {
				x: makeVariance(pointsLight[2].x - r3xLC, pointsHeavy[2].x - r3xHC),
				y: makeVariance(pointsLight[2].y - r3yLC, pointsHeavy[2].y - r3yHC),
				kind: r3.kind,
			};
			oldContours[idxC2][r4I] = {
				x: makeVariance(pointsLight[3].x, pointsHeavy[3].x),
				y: makeVariance(pointsLight[3].y, pointsHeavy[3].y),
				kind: r4.kind,
			};
			oldContours[idxC2][r5I] = {
				x: makeVariance(pointsLight[3].x - 2, pointsHeavy[3].x - 10),
				y: makeVariance(pointsLight[3].y + 2, pointsHeavy[3].y + 10),
				kind: r5.kind,
			};
			oldContours[idxC2][r6I] = {
				x: makeVariance(originLight(h8.x) + hXL, originHeavy(h8.x) + hXH),
				y: makeVariance(originLight(h8.y) + hYL - 2, originHeavy(h8.y) + hYH - 10),
				kind: r6.kind,
			};
			oldContours[idxC2][r7I] = {
				x: makeVariance(originLight(h8.x) + hXL - 1, originHeavy(h8.x) + hXH - 1),
				y: makeVariance(originLight(h8.y) + hYL - 2, originHeavy(h8.y) + hYH - 10),
				kind: r7.kind,
			};
		}
		
		if (name in references.horizontalLeftFalling) {
			let refs = references.horizontalLeftFalling[name];
			// progressTick();
			progressTick(name);
			for (const ref of refs) {
				fixLeftFallingBezier(ref);
			}
		}
		
		if (name in references.horizontalLeftFalling2) {
			let refs = references.horizontalLeftFalling2[name];
			// progressTick();
			progressTick(name);
			for (const ref of refs) {
				fixLeftFallingBezier(ref);
			}
		}
		
		if (name in references.horizontalLeftFalling3) {
			let refs = references.horizontalLeftFalling3[name];
			// progressTick();
			progressTick(name);
			for (const ref of refs) {
				fixLeftFallingBezier(ref);
			}
		}
		
		if (name in references.horizontalLeftFalling4) {
			let refs = references.horizontalLeftFalling4[name];
			// progressTick();
			progressTick(name);
			for (const ref of refs) {
				fixLeftFallingBezier(ref);
			}
		}
		
		if (name in references.horizontalLeftFalling2b) {
			let refs = references.horizontalLeftFalling2b[name];
			// progressTick();
			progressTick(name);
			for (const ref of refs) {
				fixLeftFallingBezier(ref);
			}
		}
		
		for (const contour of oldContours) {
			glyph.geometry.contours.push(contour);
		}
	}
	
	let progressLength = 0;
	
	["horizontalLeftFalling","horizontalLeftFalling2","horizontalLeftFalling2b","horizontalLeftFalling3","horizontalLeftFalling4"].forEach((key) => {
		progressLength += Object.keys(references[key]).length;
	});
	
	// let len = references.horizontalLeftFalling.length + references.horizontalLeftFalling2.length + references.horizontalLeftFalling3.length + references.horizontalLeftFalling4.length;

	let len = progressLength;
	let consoleWidth = process.stdout.columns || 150
	// let bar = new ProgressBar('\u001b[38;5;82mpostProcessing\u001b[0m [5/6]    :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	let bar = new ProgressBar('\u001b[38;5;82mpostProcessing\u001b[0m [5/6]    :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
		// console.log(name);
		// if (replacements.includes(name)) {
		// 	glyph.geometry.contours = JSON.parse(fs.readFileSync(`${__dirname}/../replacements/${name}.json`, 'utf-8'));
		// 	if (name === "alpha") console.log(JSON.stringify(glyph));
		// progressTick();
		// 	continue;
		// }
		if (!references.extendSkip.includes(name)) checkSingleGlyph(glyph);
		// count++;
		// if (count % 200 == 0) console.log("postProcessing: ", count, " glyphs processed.");
	}
}

module.exports = {
	postProcess
};
