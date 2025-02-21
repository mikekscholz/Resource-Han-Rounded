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

	function isBetween(a, x, b) {
		return originLight(a) <= originLight(x) &&
			originLight(x) <= originLight(b) + 2 &&
			originHeavy(a) <= originHeavy(x) &&
			originHeavy(x) <= originHeavy(b) + 2;
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(parseFloat(valueDefault.toFixed(4)), [[masterWghtMax, parseFloat(valueWghtMax.toFixed(4)) - parseFloat(valueDefault.toFixed(4))]]);
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
			let h1I = circularIndex(contour, idxP1);
			let h2I = circularIndex(contour, idxP1 + 1);
			let h3I = circularIndex(contour, idxP1 + 2);
			let h4I = circularIndex(contour, idxP1 + 3);
			let h5I = circularIndex(contour, idxP1 + 4);
			let h6I = circularIndex(contour, idxP1 + 5);
			let h7I = circularIndex(contour, idxP1 + 6);
			let h8I = circularIndex(contour, idxP1 + 7);
			let h9I = circularIndex(contour, idxP1 + 8);
			let h1 = contour[h1I];
			let h2 = contour[h2I];
			let h3 = contour[h3I];
			let h4 = contour[h4I];
			let h5 = contour[h5I];
			let h6 = contour[h6I];
			let h7 = contour[h7I];
			let h8 = contour[h8I];
			let h9 = contour[h9I];
			let h1xL = originLight(h1.x)
			let h1yL = originLight(h1.y)
			let h1xH = originHeavy(h1.x)
			let h1yH = originHeavy(h1.y)
			let h2xL = originLight(h2.x)
			let h2yL = originLight(h2.y)
			let h2xH = originHeavy(h2.x)
			let h2yH = originHeavy(h2.y)
			let h3xL = originLight(h3.x)
			let h3yL = originLight(h3.y)
			let h3xH = originHeavy(h3.x)
			let h3yH = originHeavy(h3.y)
			let h4xL = originLight(h4.x)
			let h4yL = originLight(h4.y)
			let h4xH = originHeavy(h4.x)
			let h4yH = originHeavy(h4.y)
			let h5xL = originLight(h5.x)
			let h5yL = originLight(h5.y)
			let h5xH = originHeavy(h5.x)
			let h5yH = originHeavy(h5.y)
			let h6xL = originLight(h6.x)
			let h6yL = originLight(h6.y)
			let h6xH = originHeavy(h6.x)
			let h6yH = originHeavy(h6.y)
			let h7xL = originLight(h7.x)
			let h7yL = originLight(h7.y)
			let h7xH = originHeavy(h7.x)
			let h7yH = originHeavy(h7.y)
			let h8xL = originLight(h8.x)
			let h8yL = originLight(h8.y)
			let h8xH = originHeavy(h8.x)
			let h8yH = originHeavy(h8.y)
			let r1I = circularIndex(contour2, -7);
			let r2I = circularIndex(contour2, -6);
			let r3I = circularIndex(contour2, -5);
			let r4I = circularIndex(contour2, -4);
			let r5I = circularIndex(contour2, -3);
			let r6I = circularIndex(contour2, -2);
			let r7I = circularIndex(contour2, -1);
			let r1 = contour2[r1I];
			let r2 = contour2[r2I];
			let r3 = contour2[r3I];
			let r4 = contour2[r4I];
			let r5 = contour2[r5I];
			let r6 = contour2[r6I];
			let r7 = contour2[r7I];
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
			let hXLMax = ((r4xH - h1xL) + 800);
			let hXHMax = ((r4xH - h1xH) + 800);
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
				hCurveLight = new Bezier(h1xL + hXL, h1yL + hYL, h2xL + hXL, h2yL + hYL, h3xL + hXL, h3yL + hYL, h4xL + hXL, h4yL + hYL);
			}
			function generateCurve2Heavy() {
				hCurveHeavy = new Bezier(h1xH + hXH, h1yH + hYH, h2xH + hXH, h2yH + hYH, h3xH + hXH, h3yH + hYH, h4xH + hXH, h4yH + hYH);
			}
			function checkIntersectLight(threshold = 0.5) {
				intersectLight = vCurveLight.intersects(hCurveLight, threshold);
			}
			function checkIntersectHeavy(threshold = 0.5) {
				intersectHeavy = vCurveHeavy.intersects(hCurveHeavy, threshold);
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
				checkIntersectLight(2);
			}
			while (intersectLight.length !== 0) {
				hXL = hXL - 1;
				hYL = hXL * horizontalSlope;
				generateCurve2Light();
				checkIntersectLight(1);
			}
			while (intersectLight.length === 0) {
				hXL = hXL + 0.1;
				hYL = hXL * horizontalSlope;
				generateCurve2Light();
				checkIntersectLight(0.5);
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
				checkIntersectHeavy(20);
			}
			while (intersectHeavy.length !== 0) {
				hXH = hXH - 10;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy(10);
			}
			while (intersectHeavy.length === 0) {
				hXH = hXH + 2;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy(5);
			}
			while (intersectHeavy.length !== 0) {
				hXH = hXH - 1;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy(1);
			}
			while (intersectHeavy.length === 0) {
				hXH = hXH + 0.1;
				hYH = hXH * horizontalSlope;
				generateCurve2Heavy();
				checkIntersectHeavy(0.5);
			}
			// if (badCurve) return;
			let type4OffsetH = 0;
			if (ref.leftFallingType === "4") {
				type4OffsetH = r4xH - (h4xH + hXH);
			}
			let splitLight = vCurveLight.split(intersectLight[0].split('/')[0]);
			let splitHeavy = vCurveHeavy.split(intersectHeavy[0].split('/')[0]);
			let pointsLight = splitLight.left.points;
			let pointsHeavy = splitHeavy.left.points;
	
			oldContours[idxC1][h1I] = {
				x: makeVariance(h1xL + hXL, h1xH + hXH + type4OffsetH),
				y: makeVariance(h1yL + hYL, h1yH + hYH),
				kind: h1.kind,
			};
			oldContours[idxC1][h2I] = {
				x: makeVariance(h2xL + hXL, h2xH + hXH + type4OffsetH),
				y: makeVariance(h2yL + hYL, h2yH + hYH),
				kind: h2.kind,
			};
			oldContours[idxC1][h3I] = {
				x: makeVariance(h3xL + hXL, h3xH + hXH + type4OffsetH),
				y: makeVariance(h3yL + hYL, h3yH + hYH),
				kind: h3.kind,
			};
			oldContours[idxC1][h4I] = {
				x: makeVariance(h4xL + hXL, h4xH + hXH + type4OffsetH),
				y: makeVariance(h4yL + hYL, h4yH + hYH),
				kind: h4.kind,
			};
			oldContours[idxC1][h5I] = {
				x: makeVariance(h5xL + hXL, h5xH + hXH + type4OffsetH),
				y: makeVariance(h5yL + hYL, h5yH + hYH),
				kind: h5.kind,
			};
			oldContours[idxC1][h6I] = {
				x: makeVariance(h6xL + hXL, h6xH + hXH + type4OffsetH),
				y: makeVariance(h6yL + hYL, h6yH + hYH),
				kind: h6.kind,
			};
			oldContours[idxC1][h7I] = {
				x: makeVariance(h7xL + hXL, h7xH + hXH + type4OffsetH),
				y: makeVariance(h7yL + hYL, h7yH + hYH),
				kind: h7.kind,
			};
			oldContours[idxC1][h8I] = {
				x: makeVariance(h8xL + hXL, h8xH + hXH + type4OffsetH),
				y: makeVariance(h8yL + hYL, h8yH + hYH),
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
				x: makeVariance(pointsLight[3].x, pointsHeavy[3].x + type4OffsetH),
				y: makeVariance(pointsLight[3].y, pointsHeavy[3].y),
				kind: r4.kind,
			};
			oldContours[idxC2][r5I] = {
				x: makeVariance(pointsLight[3].x, pointsHeavy[3].x),
				y: makeVariance(pointsLight[3].y, pointsHeavy[3].y),
				kind: r5.kind,
			};
			oldContours[idxC2][r6I] = {
				x: makeVariance(pointsLight[3].x, pointsHeavy[3].x),
				y: makeVariance(pointsLight[3].y, pointsHeavy[3].y),
				kind: r6.kind,
			};
			oldContours[idxC2][r7I] = {
				x: makeVariance(pointsLight[3].x, pointsHeavy[3].x),
				y: makeVariance(pointsLight[3].y, pointsHeavy[3].y),
				kind: r7.kind,
			};
			if ("leftFallingTopLeft" in ref) {
				// console.log(oldContours[idxC1])
				let modified = false;
				let lP1I = ref.leftFallingTopLeft;
				let lC1I = lP1I + 1;
				let lC2I = lP1I + 2;
				let lP2I = lP1I + 3;
				let lP1 = oldContours[idxC2][lP1I];
				let lC1 = oldContours[idxC2][lC1I];
				let lC2 = oldContours[idxC2][lC2I];
				let lP2 = oldContours[idxC2][lP2I];
				let lP1L = pointLight(lP1);
				let lC1L = pointLight(lC1);
				let lC2L = pointLight(lC2);
				let lP2L = pointLight(lP2);
				let lP1H = pointHeavy(lP1);
				let lC1H = pointHeavy(lC1);
				let lC2H = pointHeavy(lC2);
				let lP2H = pointHeavy(lP2);
				// let horizontalPolyLight = [contour2GeoJsonLight(oldContours[idxC1])];
				// let horizontalPolyHeavy = [contour2GeoJsonHeavy(oldContours[idxC1])];
				// let geoLeftP1Light = point2GeoJsonLight(lP1);
				// let geoLeftP1Heavy = point2GeoJsonHeavy(lP1);
				// if (inside(geoLeftP1Light, horizontalPolyLight) === false) {
					// let hP1L = pointLight(h5);
					// let hC1L = pointLight(h6);
					// let hC2L = pointLight(h7);
					// let hP2L = pointLight(h8);
					// let horizontalCurve2Light = new Bezier(hP1L.x, hP1L.y, hC1L.x, hC1L.y, hC2L.x, hC2L.y, hP2L.x, hP2L.y);
					let horizontalCurve2Light = new Bezier(h5xL + hXL,h5yL + hYL,h6xL + hXL,h6yL + hYL,h7xL + hXL,h7yL + hYL,h8xL + hXL,h8yL + hYL);
					let verticalCurve2Light = new Bezier(lP1L.x, lP1L.y, lC1L.x, lC1L.y, lC2L.x, lC2L.y, lP2L.x, lP2L.y);
					let intersectLight2 = verticalCurve2Light.intersects(horizontalCurve2Light);
					if (intersectLight2.length > 0) {
						let splitLight2 = verticalCurve2Light.split(intersectLight2[0].split('/')[0]);
						lP1L = splitLight2.right.points[0]
						lC1L = splitLight2.right.points[1]
						lC2L = splitLight2.right.points[2]
						lP2L = splitLight2.right.points[3]
						modified = true;
					}
					// }
					// if (inside(geoLeftP1Heavy, horizontalPolyHeavy) === false) {
						// let hP1H = pointHeavy(h5);
						// let hC1H = pointHeavy(h6);
						// let hC2H = pointHeavy(h7);
						// let hP2H = pointHeavy(h8);
						// let horizontalCurve2Heavy = new Bezier(hP1H.x, hP1H.y, hC1H.x, hC1H.y, hC2H.x, hC2H.y, hP2H.x, hP2H.y);
					let horizontalCurve2Heavy = new Bezier(h5xH + hXH, h5yH + hYH, h6xH + hXH, h6yH + hYH, h7xH + hXH, h7yH + hYH, h8xH + hXH, h8yH + hYH);
					let verticalCurve2Heavy = new Bezier(lP1H.x, lP1H.y, lC1H.x, lC1H.y, lC2H.x, lC2H.y, lP2H.x, lP2H.y);
					let intersectHeavy2 = verticalCurve2Heavy.intersects(horizontalCurve2Heavy);
					if (intersectHeavy2.length > 0) {
						let splitHeavy2 = verticalCurve2Heavy.split(intersectHeavy2[0].split('/')[0]);
						lP1H = splitHeavy2.right.points[0]
						lC1H = splitHeavy2.right.points[1]
						lC2H = splitHeavy2.right.points[2]
						lP2H = splitHeavy2.right.points[3]
						modified = true;
					}
				// }
				// if (modified) {
					oldContours[idxC2][lP1I] = {
						x: makeVariance(lP1L.x, lP1H.x + type4OffsetH),
						y: makeVariance(lP1L.y, lP1H.y),
						kind: lP1.kind,
					};
					oldContours[idxC2][lC1I] = {
						x: makeVariance(lC1L.x, lC1H.x),
						y: makeVariance(lC1L.y, lC1H.y),
						kind: lC1.kind,
					};
					oldContours[idxC2][lC2I] = {
						x: makeVariance(lC2L.x, lC2H.x),
						y: makeVariance(lC2L.y, lC2H.y),
						kind: lC2.kind,
					};
					oldContours[idxC2][lP2I] = {
						x: makeVariance(lP2L.x, lP2H.x),
						y: makeVariance(lP2L.y, lP2H.y),
						kind: lP2.kind,
					};
				// }
			}
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
	let bar = new ProgressBar('\u001b[38;5;82mpostProcessing\u001b[0m [5/6]    :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	// let bar = new ProgressBar('\u001b[38;5;82mpostProcessing\u001b[0m [5/6]    :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
		// if (replacements.includes(name)) {
		// 	glyph.geometry.contours = JSON.parse(fs.readFileSync(`${__dirname}/../replacements/${name}.json`, 'utf-8'));
		// 	if (name === "alpha") console.log(JSON.stringify(glyph));
		// progressTick();
		// 	continue;
		// }
		if (!references.extendSkip.includes(name) && count < 3000) checkSingleGlyph(glyph);
		count++;
		// if (count % 200 == 0) console.log("postProcessing: ", count, " glyphs processed.");
	}
}

module.exports = {
	postProcess
};
