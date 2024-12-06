"use strict";

const { Ot } = require("ot-builder");
const { extendSkip } = require("./exceptions");

// based on measurement of SHS
const params = {
	strokeWidth: { light: 33, heavy: 165 },
};

// function circularArray(arr, idxP1) {
// 	const quotient = Math.floor(idxP1 / arr.length);
// 	const remainder = idxP1 - quotient * arr.length;
// 	return arr[remainder];
// }
function circularArray(array, index) {
	var length = array && array.length;
	var idxP1 = Math.abs(length + index % length) % length;
	return array[isNaN(idxP1) ? index : idxP1];
}

function circularIndex(array, index) {
	var length = array && array.length;
	var idxP1 = Math.abs(length + index % length) % length;
	return isNaN(idxP1) ? index : idxP1;
}

function abs(num) {
	return num >= 0 ? num : -num;
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
	
	function approxEq(a, b, threshold = 5) {
		if (typeof a == 'number' && typeof b == 'number')
			return abs(a - b) <= threshold;
		return abs(Ot.Var.Ops.originOf(a) - Ot.Var.Ops.originOf(b)) <= threshold &&
			abs(Ot.Var.Ops.evaluate(a, instanceShsWghtMax) - Ot.Var.Ops.evaluate(b, instanceShsWghtMax)) <= threshold;
	}

	function canBeBottomEnd(bottomLeft, bottomRight) {
		// console.log(Ot.Var.Ops.originOf(topRight.x) - Ot.Var.Ops.originOf(topLeft.x));
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
		// console.log(Ot.Var.Ops.originOf(topRight.x) - Ot.Var.Ops.originOf(topLeft.x));
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
		// console.log(glyph.name);
		const name = glyph.name;
		let oldContours = glyph.geometry.contours;
		
		// console.log(glyph.name);
		if (glyph.name == "uni2EE6"){
		// 	oldContours[1].splice(1,1);
		// 	oldContours[1].splice(7,1);
		// 	oldContours[3].splice(1,1);
		// 	oldContours[3].splice(7,1);
			// console.log(oldContours);
		}
		glyph.geometry.contours = [];
		
		for (const [idxC1, contour] of oldContours.entries()) {
			// find possible 横s (horizontals)
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			
			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				
				if (
					// is right end
					canBeRightEnd(contour[idxP1], circularArray(contour, idxP1 + 1)) &&
					approxEq(contour[idxP1].y, circularArray(contour, idxP1 - 1).y) &&
					approxEq(circularArray(contour, idxP1 + 1).y, circularArray(contour, idxP1 + 2).y)
				) {
					const bottomRightIdx = idxP1;
					const topRightIdx = circularIndex(contour, idxP1 + 1);
					const topLeftIdx = circularIndex(contour, idxP1 + 2);
					const bottomLeftIdx = circularIndex(contour, idxP1 - 1);
					const horizontalBottomRight = contour[idxP1];
					const horizontalTopRight = circularArray(contour, idxP1 + 1);
					const horizontalTopLeft = circularArray(contour, idxP1 + 2);
					const horizontalBottomLeft = circularArray(contour, idxP1 - 1);

					for (const [idxC2, contour2] of oldContours.entries()) {
						// find possible 竖s (verticals)
						if (contour2 == contour || contour2.length < 4)
							continue;
						let extended = false;
						
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
								// const verticalBottomRight = circularArray(contour2, idxP2 - 1);
								const verticalBottomRight = circularArray(contour2, idxP2 - 1).kind === 0 ? circularArray(contour2, idxP2 - 1) :
															circularArray(contour2, idxP2 - 2).kind === 0 ? circularArray(contour2, idxP2 - 2) :
															circularArray(contour2, idxP2 - 3).kind === 0 ? circularArray(contour2, idxP2 - 3) : 
															circularArray(contour2, idxP2 - 4);
								if (
									// and 横's (horizontal's) right end inside 竖 (vertical)
									// ───┬──┬──┐
									//    ┆  ⇨  │
									// ───┼──┘  │
									//    │     │
									isBetween(verticalTopLeft.x, horizontalTopRight.x, verticalTopRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopRight.y, verticalTopRight.y)
								) {
									newContour[bottomRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(contour2[idxP2].x),
											Ot.Var.Ops.evaluate(contour2[idxP2].x, instanceShsWghtMax)
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									newContour[topRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(contour2[idxP2].x),
											Ot.Var.Ops.evaluate(contour2[idxP2].x, instanceShsWghtMax)
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
								}
								if (
									// and 横's (horizontal's) left end inside 竖 (vertical)
									// ┌──┬──┬───
									// │  ⇦  ┊   
									// │  └──┼───
									// │     │   
									isBetween(verticalTopLeft.x, horizontalTopLeft.x, verticalTopRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopLeft.y, verticalTopRight.y)
								) {
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalTopLeft.x),
											Ot.Var.Ops.evaluate(verticalTopLeft.x, instanceShsWghtMax)
										),
										y: horizontalBottomLeft.y,
										kind: 0,
									};
									newContour[topLeftIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalTopLeft.x),
											Ot.Var.Ops.evaluate(verticalTopLeft.x, instanceShsWghtMax)
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									// extended = true;
									// break;
								}
							}
							if (
								// is bottom end
								canBeBottomEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].x, circularArray(contour2, idxP2 - 1).x, 450) &&
								approxEq(circularArray(contour2, idxP2 + 1).x, circularArray(contour2, idxP2 + 2).x, 450)
							) {
								const verticalBottomLeft = contour2[idxP2];
								const verticalBottomRight = circularArray(contour2, idxP2 + 1);
								const verticalTopRight = circularArray(contour2, idxP2 + 2);
								const verticalTopLeft = circularArray(contour2, idxP2 - 1);
								if (
									// and 横's (horizontal's) right end inside 竖 (vertical)
									isBetween(verticalBottomLeft.x, horizontalTopRight.x, verticalBottomRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopRight.y, verticalTopRight.y)
								) {
									newContour[topRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalBottomRight.x),
											Ot.Var.Ops.evaluate(verticalBottomRight.x, instanceShsWghtMax)
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
									newContour[bottomRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalBottomRight.x),
											Ot.Var.Ops.evaluate(verticalBottomRight.x, instanceShsWghtMax)
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
								}
							}
							// find 横's (horizontal's) right end inside ㇇'s (horizontal + left-falling)
							if (
								contour2.length > 10 &&
								canBeLeftFalling(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4)) &&
								abs(Ot.Var.Ops.originOf(horizontalTopRight.y) - Ot.Var.Ops.originOf(circularArray(contour2, idxP2 + 2).y)) <=1 &&
								Ot.Var.Ops.originOf(horizontalTopRight.x) - Ot.Var.Ops.originOf(circularArray(contour2, idxP2 + 3).x) >= 0
							) {
								if (name in references.horizontalLeftFalling === false) {
									references.horizontalLeftFalling[name] = [];
								}
								
								let refs = references.horizontalLeftFalling[name];
								refs.push({ "horizontal": idxC1, "leftFalling": idxC2 });
								
								
								newContour[bottomRightIdx] = {
									x: makeVariance(
										Ot.Var.Ops.originOf(contour2[idxP2].x),
										Ot.Var.Ops.evaluate(contour2[idxP2].x, instanceShsWghtMax) - 1
									),
									y: horizontalBottomRight.y,
									kind: 0,
								};
								newContour[topRightIdx] = {
									x: makeVariance(
										Ot.Var.Ops.originOf(contour2[idxP2].x),
										Ot.Var.Ops.evaluate(contour2[idxP2].x, instanceShsWghtMax) - 1
									),
									y: horizontalTopRight.y,
									kind: 0,
								};
							}
						}
						if (extended)
							break;
					}
				}
				if (
					// is bottom end
					canBeBottomEnd(contour[idxP1], circularArray(contour, idxP1 + 1)) &&
					approxEq(contour[idxP1].x, circularArray(contour, idxP1 - 1).x, 450) &&
					approxEq(circularArray(contour, idxP1 + 1).x, circularArray(contour, idxP1 + 2).x, 450)
				) {
					const bottomLeftIdx = idxP1;
					const bottomRightIdx = circularIndex(contour, idxP1 + 1);
					const topRightIdx = circularIndex(contour, idxP1 + 2);
					const topLeftIdx = circularIndex(contour, idxP1 - 1);
					const verticalBottomLeft = contour[idxP1];
					const verticalBottomRight = circularArray(contour, idxP1 + 1);
					const verticalTopRight = circularArray(contour, idxP1 + 2);
					const verticalTopLeft = circularArray(contour, idxP1 - 1);

					for (const [idxC2, contour2] of oldContours.entries()) {
						// find possible 横s (horizontals)
						if (contour2 == contour || contour2.length < 4)
							continue;
						let extended = false;
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							if (
								// is left end
								canBeLeftEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].y, circularArray(contour2, idxP2 - 1).y, 20) &&
								approxEq(circularArray(contour2, idxP2 + 1).y, circularArray(contour2, idxP2 + 2).y, 20)
							) {
								const horizontalTopLeft = contour2[idxP2];
								const horizontalBottomLeft = circularArray(contour2, idxP2 + 1);
								const horizontalBottomRight = circularArray(contour2, idxP2 + 2);
								const horizontalTopRight = circularArray(contour2, idxP2 - 1);
								if (
									// and 竖's (vertical's) bottom inside 横's (horizontal's) left end
									Ot.Var.Ops.originOf(horizontalTopLeft.x) <= Ot.Var.Ops.originOf(verticalBottomRight.x) &&
									// isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalBottomLeft.y, horizontalTopLeft.y)
								) {
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalBottomLeft.x),
											Ot.Var.Ops.evaluate(verticalBottomLeft.x, instanceShsWghtMax)
										),
										y: makeVariance(
											Ot.Var.Ops.originOf(horizontalBottomLeft.y),
											Ot.Var.Ops.evaluate(horizontalBottomLeft.y, instanceShsWghtMax)
										),
										kind: 0,
									};
									newContour[bottomRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalBottomRight.x),
											Ot.Var.Ops.evaluate(verticalBottomRight.x, instanceShsWghtMax)
										),
										y: makeVariance(
											Ot.Var.Ops.originOf(horizontalBottomLeft.y),
											Ot.Var.Ops.evaluate(horizontalBottomLeft.y, instanceShsWghtMax)
										),
										kind: 0,
									};
									// extended = true;
									// break;
								}
								// if (
								// 	// and 竖's (vertical's) top inside 横's (horizontal's) left end
								// 	// Ot.Var.Ops.originOf(horizontalBottomLeft.x) <= Ot.Var.Ops.originOf(verticalTopLeft.x) &&
								// 	isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
								// 	isBetween(horizontalBottomLeft.y, verticalTopLeft.y, horizontalTopRight.y)
								// ) {
								// 	newContour[topRightIdx] = {
								// 		x: verticalTopRight.x,
								// 		y: horizontalTopRight.y,
								// 		kind: 0,
								// 	};
								// 	newContour[topLeftIdx] = {
								// 		x: verticalTopLeft.x,
								// 		y: horizontalTopLeft.y,
								// 		kind: 0,
								// 	};
								// 	// extended = true;
								// 	// break;
								// }
							}
						}
					}
				}
				if (
					// is top end
					canBeTopEnd(contour[idxP1], circularArray(contour, idxP1 + 1)) &&
					approxEq(contour[idxP1].x, circularArray(contour, idxP1 - 1).x) &&
					approxEq(circularArray(contour, idxP1 + 1).x, circularArray(contour, idxP1 + 2).x)
				) {
					const topRightIdx = idxP1;
					const topLeftIdx = circularIndex(contour, idxP1 + 1);
					const bottomLeftIdx = circularIndex(contour, idxP1 + 2);
					const bottomRightIdx = circularIndex(contour, idxP1 - 1);
					const verticalTopRight = contour[idxP1];
					const verticalTopLeft = circularArray(contour, idxP1 + 1);
					const verticalBottomLeft = circularArray(contour, idxP1 + 2);
					const verticalBottomRight = circularArray(contour, idxP1 - 1);

					for (const [idxC2, contour2] of oldContours.entries()) {
						// find possible 横s (horizontals)
						if (contour2 == contour || contour2.length < 4)
							continue;
						
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							if (
								// is left end
								canBeLeftEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].y, circularArray(contour2, idxP2 - 1).y, 60) &&
								approxEq(circularArray(contour2, idxP2 + 1).y, circularArray(contour2, idxP2 + 2).y, 60)
							) {
								const horizontalTopLeft = contour2[idxP2];
								const horizontalBottomLeft = circularArray(contour2, idxP2 + 1);
								const horizontalBottomRight = circularArray(contour2, idxP2 + 2);
								const horizontalTopRight = circularArray(contour2, idxP2 - 1);
								if (
									// and 竖's (vertical's) top inside 横's (horizontal's) left end
									// ┌────────
									// ├─⇧─┐
									// ├╌╌╌┤────
									// │   │
									isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalTopLeft.y, horizontalTopRight.y)
								) {
									newContour[topRightIdx] = {
										x: verticalTopRight.x,
										y: makeVariance(
											Ot.Var.Ops.originOf(horizontalTopRight.y),
											Ot.Var.Ops.evaluate(horizontalTopRight.y, instanceShsWghtMax)
										),
										kind: 0,
									};
									newContour[topLeftIdx] = {
										x: verticalTopLeft.x,
										y: makeVariance(
											Ot.Var.Ops.originOf(horizontalTopLeft.y),
											Ot.Var.Ops.evaluate(horizontalTopLeft.y, instanceShsWghtMax)
										),
										kind: 0,
									};
									// extended = true;
									// break;
								}
							}
						}
					}
				}
				if (
					// is left end
					canBeLeftEnd(contour[idxP1], circularArray(contour, idxP1 + 1)) &&
					approxEq(contour[idxP1].y, circularArray(contour, idxP1 - 1).y) &&
					approxEq(circularArray(contour, idxP1 + 1).y, circularArray(contour, idxP1 + 2).y)
				) {
					const topLeftIdx = idxP1;
					const bottomLeftIdx = circularIndex(contour, idxP1 + 1);
					const bottomRightIdx = circularIndex(contour, idxP1 + 2);
					const topRightIdx = circularIndex(contour, idxP1 - 1);
					const horizontalTopLeft = contour[idxP1];
					const horizontalBottomLeft = circularArray(contour, idxP1 + 1);
					const horizontalBottomRight = circularArray(contour, idxP1 + 2);
					const horizontalTopRight = circularArray(contour, idxP1 - 1);

					for (const [idxC2, contour2] of oldContours.entries()) {
						// find possible 竖s (verticals)
						if (contour2 == contour || contour2.length < 4) continue;
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
									isBetween(verticalTopLeft.x, horizontalTopLeft.x, verticalTopRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopLeft.y, verticalTopRight.y)
								) {
									newContour[topLeftIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalTopLeft.x),
											Ot.Var.Ops.evaluate(verticalTopLeft.x, instanceShsWghtMax)
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalTopLeft.x),
											Ot.Var.Ops.evaluate(verticalTopLeft.x, instanceShsWghtMax)
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
								const verticalBottomRight = circularArray(contour2, idxP2 + 1);
								const verticalTopRight = circularArray(contour2, idxP2 + 2);
								const verticalTopLeft = circularArray(contour2, idxP2 - 1);
								if (
									// and 横's (horizontal's) left end inside 竖 (vertical)
									isBetween(verticalBottomLeft.x, horizontalTopLeft.x, verticalBottomRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopLeft.y, verticalTopRight.y)
								) {
									newContour[topLeftIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalBottomLeft.x),
											Ot.Var.Ops.evaluate(verticalBottomLeft.x, instanceShsWghtMax)
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(verticalBottomLeft.x),
											Ot.Var.Ops.evaluate(verticalBottomLeft.x, instanceShsWghtMax)
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
			glyph.geometry.contours.push(newContour);
		}
	}


	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		// console.log(name);
		if (extendSkip.includes(name)) continue;
		checkSingleGlyph(glyph)
		count++;
		if (count % 1000 == 0)
			console.log("extendShortStroke:", count, "glyphs processed.");
	}
}

module.exports = {
	extendShortStroke: extendShortStroke,
};
