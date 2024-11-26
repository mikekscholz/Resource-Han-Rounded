"use strict";

const { Ot } = require("ot-builder");
const { extendSkip } = require("./exceptions");

// based on measurement of SHS
const params = {
	strokeWidth: { light: 29, heavy: 162 },
};

function circularArray(arr, idx) {
	const quotient = Math.floor(idx / arr.length);
	const remainder = idx - quotient * arr.length;
	return arr[remainder];
}

function circularIndex(arr, idx) {
	const quotient = Math.floor(idx / arr.length);
	const remainder = idx - quotient * arr.length;
	return remainder;
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
function extendShortStroke(font) {
	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);

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

		let oldContours = glyph.geometry.contours;
		
		// console.log(glyph.name);
		// if (glyph.name == ".gid58"){
		// 	oldContours[1].splice(1,1);
		// 	oldContours[1].splice(7,1);
		// 	oldContours[3].splice(1,1);
		// 	oldContours[3].splice(7,1);
		// 	// console.log(oldContours);
		// }
		glyph.geometry.contours = [];
		
		for (const contour of oldContours) {
			// find possible 横s (horizontals)
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			// fix 人's starting on midpoint of horizontal line and start on corner
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
					contour.shift();
				}
			}
			
			let trimmed = false;
			
			const newContour = [...contour];

			for (let idx = 0; idx < contour.length; idx++) {
				if (
					// is right end
					canBeRightEnd(contour[idx], circularArray(contour, idx + 1)) &&
					approxEq(contour[idx].y, circularArray(contour, idx - 1).y) &&
					approxEq(circularArray(contour, idx + 1).y, circularArray(contour, idx + 2).y)
				) {
					const bottomRightIdx = idx;
					const topRightIdx = (idx + 1) % contour.length;
					const topLeftIdx = (idx + 2) % contour.length;
					const bottomLeftIdx = (idx - 1) % contour.length;
					const horizontalBottomRight = contour[idx];
					const horizontalTopRight = circularArray(contour, idx + 1);
					const horizontalTopLeft = circularArray(contour, idx + 2);
					const horizontalBottomLeft = circularArray(contour, idx - 1);

					for (const ctr of oldContours) {
						// find possible 竖s (verticals)
						if (ctr == contour || ctr.length < 4)
							continue;
						let extended = false;
						for (let ctrIdx = 0; ctrIdx < ctr.length; ctrIdx++) {
							if (
								// is top end
								canBeTopEnd(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1)) &&
								approxEq(ctr[ctrIdx].x, circularArray(ctr, ctrIdx - 1).x, 450) &&
								approxEq(circularArray(ctr, ctrIdx + 1).x, circularArray(ctr, ctrIdx + 2).x, 450)
							) {
								const verticalTopRight = ctr[ctrIdx];
								const verticalTopLeft = circularArray(ctr, ctrIdx + 1);
								const verticalBottomLeft = circularArray(ctr, ctrIdx + 2);
								const verticalBottomRight = circularArray(ctr, ctrIdx - 1);
								if (
									// and 横's (horizontal's) right end inside 竖 (vertical)
									isBetween(verticalTopLeft.x, horizontalTopRight.x, verticalTopRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopRight.y, verticalTopRight.y)
								) {
									newContour[bottomRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x),
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) - 3
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									newContour[topRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x),
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) - 3
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
									// extended = true;
									// break;
								}
								if (
									// and 横's (horizontal's) left end inside 竖 (vertical)
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
								canBeBottomEnd(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1)) &&
								approxEq(ctr[ctrIdx].x, circularArray(ctr, ctrIdx - 1).x, 450) &&
								approxEq(circularArray(ctr, ctrIdx + 1).x, circularArray(ctr, ctrIdx + 2).x, 450)
							) {
								const verticalBottomLeft = ctr[ctrIdx];
								const verticalBottomRight = circularArray(ctr, ctrIdx + 1);
								const verticalTopRight = circularArray(ctr, ctrIdx + 2);
								const verticalTopLeft = circularArray(ctr, ctrIdx - 1);
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
								ctr.length > 4 &&
								canBeLeftFalling(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1), circularArray(ctr, ctrIdx + 2), circularArray(ctr, ctrIdx + 3), circularArray(ctr, ctrIdx + 4)) &&
								abs(Ot.Var.Ops.originOf(horizontalTopRight.y) - Ot.Var.Ops.originOf(circularArray(ctr, ctrIdx + 2).y)) <=1 &&
								Ot.Var.Ops.originOf(horizontalTopRight.x) - Ot.Var.Ops.originOf(circularArray(ctr, ctrIdx + 3).x) >= 0
								) {
									newContour[bottomRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x) - 5,
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) - 19
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									newContour[topRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x) - 5,
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) - 19
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
					canBeBottomEnd(contour[idx], circularArray(contour, idx + 1)) &&
					approxEq(contour[idx].x, circularArray(contour, idx - 1).x, 450) &&
					approxEq(circularArray(contour, idx + 1).x, circularArray(contour, idx + 2).x, 450)
				) {
					const bottomLeftIdx = idx;
					const bottomRightIdx = (idx + 1) % contour.length;
					const topRightIdx = (idx + 2) % contour.length;
					const topLeftIdx = (idx - 1) % contour.length;
					const verticalBottomLeft = contour[idx];
					const verticalBottomRight = circularArray(contour, idx + 1);
					const verticalTopRight = circularArray(contour, idx + 2);
					const verticalTopLeft = circularArray(contour, idx - 1);

					for (const ctr of oldContours) {
						// find possible 横s (horizontals)
						if (ctr == contour || ctr.length < 4)
							continue;
						let extended = false;
						for (let ctrIdx = 0; ctrIdx < ctr.length; ctrIdx++) {
							if (
								// is left end
								canBeLeftEnd(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1)) &&
								approxEq(ctr[ctrIdx].y, circularArray(ctr, ctrIdx - 1).y, 60) &&
								approxEq(circularArray(ctr, ctrIdx + 1).y, circularArray(ctr, ctrIdx + 2).y, 60)
							) {
								const htopLeftIdx = idx;
								const hbottomLeftIdx = (idx + 1) % contour.length;
								const hbottomRightIdx = (idx + 2) % contour.length;
								const htopRightIdx = (idx - 1) % contour.length;
								const horizontalTopLeft = ctr[ctrIdx];
								const horizontalBottomLeft = circularArray(ctr, ctrIdx + 1);
								const horizontalBottomRight = circularArray(ctr, ctrIdx + 2);
								const horizontalTopRight = circularArray(ctr, ctrIdx - 1);
								if (
									// and 竖's (vertical's) bottom inside 横's (horizontal's) left end
									Ot.Var.Ops.originOf(horizontalTopLeft.x) <= Ot.Var.Ops.originOf(verticalBottomRight.x) &&
									// isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalBottomLeft.y, horizontalTopLeft.y)
								) {
									newContour[bottomLeftIdx] = {
										x: verticalBottomLeft.x,
										y: horizontalBottomLeft.y,
										kind: 0,
									};
									newContour[bottomRightIdx] = {
										x: verticalBottomRight.x,
										y: horizontalBottomRight.y,
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
					canBeTopEnd(contour[idx], circularArray(contour, idx + 1)) &&
					approxEq(contour[idx].x, circularArray(contour, idx - 1).x, 80) &&
					approxEq(circularArray(contour, idx + 1).x, circularArray(contour, idx + 2).x, 80)
				) {
					const topRightIdx = idx;
					const topLeftIdx = (idx + 1) % contour.length;
					const bottomLeftIdx = (idx + 2) % contour.length;
					const bottomRightIdx = (idx - 1) % contour.length;
					const verticalTopRight = contour[idx];
					const verticalTopLeft = circularArray(contour, idx + 1);
					const verticalBottomLeft = circularArray(contour, idx + 2);
					const verticalBottomRight = circularArray(contour, idx - 1);
					
					if (
						Ot.Var.Ops.originOf(verticalTopLeft.x) == Ot.Var.Ops.originOf(verticalBottomLeft.x) &&
						Ot.Var.Ops.originOf(verticalTopLeft.y) - Ot.Var.Ops.originOf(verticalBottomLeft.y) < 30
					) {
						newContour[bottomLeftIdx] = {
							x: verticalBottomLeft.x,
							y: makeVariance(
								Ot.Var.Ops.originOf(verticalTopLeft.y) - 30,
								Ot.Var.Ops.evaluate(verticalTopLeft.y, instanceShsWghtMax) - 80
							),
							kind: verticalBottomLeft.kind,
						};
					}
					if (
						Ot.Var.Ops.originOf(verticalTopRight.x) == Ot.Var.Ops.originOf(verticalBottomRight.x) &&
						Ot.Var.Ops.originOf(verticalTopRight.y) - Ot.Var.Ops.originOf(verticalBottomRight.y) < 30
					) {
						newContour[bottomRightIdx] = {
							x: verticalBottomRight.x,
							y: makeVariance(
								Ot.Var.Ops.originOf(verticalTopRight.y) - 30,
								Ot.Var.Ops.evaluate(verticalTopRight.y, instanceShsWghtMax) - 80
							),
							kind: verticalBottomRight.kind,
						};
					}

					for (const ctr of oldContours) {
						// find possible 横s (horizontals)
						if (ctr == contour || ctr.length < 4)
							continue;
						let extended = false;
						for (let ctrIdx = 0; ctrIdx < ctr.length; ctrIdx++) {
							if (
								// is left end
								canBeLeftEnd(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1)) &&
								approxEq(ctr[ctrIdx].y, circularArray(ctr, ctrIdx - 1).y, 60) &&
								approxEq(circularArray(ctr, ctrIdx + 1).y, circularArray(ctr, ctrIdx + 2).y, 60)
							) {
								const horizontalTopLeft = ctr[ctrIdx];
								const horizontalBottomLeft = circularArray(ctr, ctrIdx + 1);
								const horizontalBottomRight = circularArray(ctr, ctrIdx + 2);
								const horizontalTopRight = circularArray(ctr, ctrIdx - 1);
								if (
									// and 竖's (vertical's) top inside 横's (horizontal's) left end
									isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalTopLeft.y, horizontalTopRight.y)
								) {
									newContour[topRightIdx] = {
										x: verticalTopRight.x,
										y: horizontalTopRight.y,
										kind: 0,
									};
									newContour[topLeftIdx] = {
										x: verticalTopLeft.x,
										y: horizontalTopLeft.y,
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
					canBeLeftEnd(contour[idx], circularArray(contour, idx + 1)) &&
					approxEq(contour[idx].y, circularArray(contour, idx - 1).y) &&
					approxEq(circularArray(contour, idx + 1).y, circularArray(contour, idx + 2).y)
				) {
					const topLeftIdx = idx;
					const bottomLeftIdx = (idx + 1) % contour.length;
					const bottomRightIdx = (idx + 2) % contour.length;
					const topRightIdx = (idx - 1) % contour.length;
					const horizontalTopLeft = contour[idx];
					const horizontalBottomLeft = circularArray(contour, idx + 1);
					const horizontalBottomRight = circularArray(contour, idx + 2);
					const horizontalTopRight = circularArray(contour, idx - 1);

					for (const ctr of oldContours) {
						// find possible 竖s (verticals)
						if (ctr == contour || ctr.length < 4) continue;
						for (let ctrIdx = 0; ctrIdx < ctr.length; ctrIdx++) {
							if (
								// is top end
								canBeTopEnd(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1)) &&
								approxEq(ctr[ctrIdx].x, circularArray(ctr, ctrIdx - 1).x, 450) &&
								approxEq(circularArray(ctr, ctrIdx + 1).x, circularArray(ctr, ctrIdx + 2).x, 450)
							) {
								const verticalTopRight = ctr[ctrIdx];
								const verticalTopLeft = circularArray(ctr, ctrIdx + 1);
								const verticalBottomLeft = circularArray(ctr, ctrIdx + 2);
								const verticalBottomRight = circularArray(ctr, ctrIdx - 1);
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
								canBeBottomEnd(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1)) &&
								approxEq(ctr[ctrIdx].x, circularArray(ctr, ctrIdx - 1).x, 450) &&
								approxEq(circularArray(ctr, ctrIdx + 1).x, circularArray(ctr, ctrIdx + 2).x, 450)
							) {
								const verticalBottomLeft = ctr[ctrIdx];
								const verticalBottomRight = circularArray(ctr, ctrIdx + 1);
								const verticalTopRight = circularArray(ctr, ctrIdx + 2);
								const verticalTopLeft = circularArray(ctr, ctrIdx - 1);
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
				// // optimize ㇒ in ㇇'s (horizontal + left-falling) for rounding
				// if (
				// 	contour.length > 10 &&
				// 	canBeLeftFalling(contour[idx], circularArray(contour, idx + 1), circularArray(contour, idx + 2), circularArray(contour, idx + 3), circularArray(contour, idx + 4)) && trimmed === false
				// 	) {
				// 		newContour[idx] = {
				// 			x: newContour[idx].x,
				// 			y: makeVariance(
				// 				Ot.Var.Ops.originOf(circularArray(contour, idx + 2).y) - 5,
				// 				Ot.Var.Ops.evaluate(circularArray(contour, idx + 2).y, instanceShsWghtMax) - 28
				// 				),
				// 				kind: 0,
				// 			};
				// 			newContour[idx + 1] = {
				// 				x: circularArray(contour, idx + 1).x,
				// 				y: circularArray(contour, idx + 2).y,
				// 				kind: 0,
				// 			};
				// 			const point1 = circularArray(newContour, idx + 3);
				// 			const point2 = circularArray(newContour, idx + 4);
				// 			const indexp1 = newContour.indexOf(point1);
				// 			console.log(indexp1);
				// 			newContour.splice(indexp1, 1);
				// 			const indexp2 = newContour.indexOf(point2);
				// 			console.log(indexp2);
				// 			newContour.splice(indexp2, 1);
				// 			trimmed = true;
				// 	}
			}
			// fix ж
			if (glyph.name == "uni0436" || glyph.name == "uni0416") {
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
				}
			}
			// optimize ㇒ in ㇇'s (horizontal + left-falling) for rounding
			if (contour.length > 10) {
				for (let idx = 0; idx < contour.length; idx++) {
					if (
						canBeLeftFalling(contour[idx], circularArray(contour, idx + 1), circularArray(contour, idx + 2), circularArray(contour, idx + 3), circularArray(contour, idx + 4))
					) {
						newContour[idx] = {
							x: newContour[idx].x,
							y: makeVariance(
								Ot.Var.Ops.originOf(circularArray(contour, idx + 2).y) - 7,
								Ot.Var.Ops.evaluate(circularArray(contour, idx + 2).y, instanceShsWghtMax) - 25
								),
								kind: 0,
							};
							newContour[idx + 1] = {
								x: circularArray(contour, idx + 1).x,
								y: circularArray(contour, idx + 2).y,
								kind: 0,
							};
							const point1 = circularArray(newContour, idx + 2);
							const point2 = circularArray(newContour, idx + 3);
							const indexp1 = newContour.indexOf(point1);
							// console.log(indexp1);
							newContour.splice(indexp1, 1);
							const indexp2 = newContour.indexOf(point2);
							// console.log(indexp2);
							newContour.splice(indexp2, 1);
							// trimmed = true;
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
