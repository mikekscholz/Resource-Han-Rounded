"use strict";

const { Ot } = require("ot-builder");
const { extendSkip } = require("./exceptions");

// based on measurement of SHS
const params = {
	strokeWidth: { light: 29, heavy: 155 },
};

function circularArray(arr, idx) {
	const quotient = Math.floor(idx / arr.length);
	const remainder = idx - quotient * arr.length;
	return arr[remainder];
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

	function canBeRightEnd(bottomRight, topRight) {
		return bottomRight.kind == 0 && topRight.kind == 0 &&
			approxEq(bottomRight.x, topRight.x, 20) &&
			approxEq(
				Ot.Var.Ops.originOf(topRight.y) - Ot.Var.Ops.originOf(bottomRight.y),
				params.strokeWidth.light,
				8,
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
	
	// 
	function canBeLeftFalling(topRight, topPeak, topLeft, flatLeft, downLeft) {
		// console.log(Ot.Var.Ops.originOf(topRight.x),Ot.Var.Ops.originOf(topPeak.x),Ot.Var.Ops.originOf(topLeft.x),Ot.Var.Ops.originOf(flatLeft.x),Ot.Var.Ops.originOf(downLeft.x));
		// console.log(Ot.Var.Ops.originOf(topRight.y),Ot.Var.Ops.originOf(topPeak.y),Ot.Var.Ops.originOf(topLeft.y),Ot.Var.Ops.originOf(flatLeft.y),Ot.Var.Ops.originOf(downLeft.y));
		if (
		topRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && downLeft.kind == 0 &&
		Ot.Var.Ops.originOf(topRight.x) - Ot.Var.Ops.originOf(topPeak.x) > 0 &&
		Ot.Var.Ops.originOf(topPeak.x) - Ot.Var.Ops.originOf(topLeft.x) > 0 &&
		Ot.Var.Ops.originOf(topLeft.x) - Ot.Var.Ops.originOf(flatLeft.x) > 0 &&
		Ot.Var.Ops.originOf(flatLeft.x) - Ot.Var.Ops.originOf(downLeft.x) == 0 &&
		Ot.Var.Ops.originOf(topRight.y) - Ot.Var.Ops.originOf(topPeak.y) < 0 &&
		Ot.Var.Ops.originOf(topPeak.y) - Ot.Var.Ops.originOf(topLeft.y) > 0 &&
		Ot.Var.Ops.originOf(topLeft.y) - Ot.Var.Ops.originOf(flatLeft.y) == 0 &&
		Ot.Var.Ops.originOf(flatLeft.y) - Ot.Var.Ops.originOf(downLeft.y) > 0
		) {
			// console.log(topRight.kind, topPeak.kind, topLeft.kind, flatLeft.kind, downLeft.kind);
			return true;
		}
		else {
			return false;
		}
	}

	function isBetween(a, x, b) {
		return Ot.Var.Ops.originOf(a) <= Ot.Var.Ops.originOf(x) &&
			Ot.Var.Ops.originOf(x) <= Ot.Var.Ops.originOf(b) &&
			Ot.Var.Ops.evaluate(a, instanceShsWghtMax) <= Ot.Var.Ops.evaluate(x, instanceShsWghtMax) &&
			Ot.Var.Ops.evaluate(x, instanceShsWghtMax) <= Ot.Var.Ops.evaluate(b, instanceShsWghtMax) + 2;
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(valueDefault, [[masterWghtMax, valueWghtMax - valueDefault]]);
	}

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;
		const oldContours = glyph.geometry.contours;
		glyph.geometry.contours = [];

		for (const contour of oldContours) {
			// find possible 横s (horizontals)
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}

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
					const horizontalBottomRight = contour[idx];
					const horizontalTopRight = circularArray(contour, idx + 1);

					for (const ctr of oldContours) {
						// find possible 竖s (verticals)
						if (ctr == contour || ctr.length < 4)
							continue;
						let extended = false;
						for (let ctrIdx = 0; ctrIdx < ctr.length; ctrIdx++) {
							if (
								// is top end
								canBeTopEnd(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1)) &&
								approxEq(ctr[ctrIdx].x, circularArray(ctr, ctrIdx - 1).x) &&
								approxEq(circularArray(ctr, ctrIdx + 1).x, circularArray(ctr, ctrIdx + 2).x)
							) {
								const verticalTopRight = ctr[ctrIdx];
								const verticalTopLeft = circularArray(ctr, ctrIdx + 1);
								const verticalBottomLeft = circularArray(ctr, ctrIdx + 2);
								const verticalBottomRight = circularArray(ctr, ctrIdx - 1);
								if (
									// and 横's (horizontal's) right end inside 竖 (vertical)
									// approxEq(verticalTopRight.y, horizontalTopRight.y) &&
									isBetween(verticalTopLeft.x, horizontalTopRight.x, verticalTopRight.x)&&
									isBetween(verticalBottomLeft.y, horizontalTopRight.y, verticalTopLeft.y)
								) {
									newContour[bottomRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x),
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax)
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									newContour[topRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x),
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax)
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
									extended = true;
									break;
								}
							}
							// find ㇇'s (horizontal + left-falling)
							if (
								ctr.length > 4 &&
								canBeLeftFalling(ctr[ctrIdx], circularArray(ctr, ctrIdx + 1), circularArray(ctr, ctrIdx + 2), circularArray(ctr, ctrIdx + 3), circularArray(ctr, ctrIdx + 4)) &&
								abs(Ot.Var.Ops.originOf(horizontalTopRight.y) - Ot.Var.Ops.originOf(circularArray(ctr, ctrIdx + 2).y)) <=1 &&
								Ot.Var.Ops.originOf(horizontalTopRight.x) - Ot.Var.Ops.originOf(circularArray(ctr, ctrIdx + 3).x) >= 0
								) {
									newContour[bottomRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x) - 5,
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) - 13
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									newContour[topRightIdx] = {
										x: makeVariance(
											Ot.Var.Ops.originOf(ctr[ctrIdx].x) - 5,
											Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) - 13
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
									// newContour[bottomRightIdx] = {
									// 	x: makeVariance(
									// 		(Ot.Var.Ops.originOf(ctr[ctrIdx].x) + Ot.Var.Ops.originOf(ctr[ctrIdx + 1].x)) / 2,
									// 		(Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) + Ot.Var.Ops.evaluate(ctr[ctrIdx + 1].x, instanceShsWghtMax)) /2
									// 	),
									// 	y: horizontalBottomRight.y,
									// 	kind: 0,
									// };
									// newContour[topRightIdx] = {
									// 	x: makeVariance(
									// 		(Ot.Var.Ops.originOf(ctr[ctrIdx].x) + Ot.Var.Ops.originOf(ctr[ctrIdx + 1].x)) / 2,
									// 		(Ot.Var.Ops.evaluate(ctr[ctrIdx].x, instanceShsWghtMax) + Ot.Var.Ops.evaluate(ctr[ctrIdx + 1].x, instanceShsWghtMax)) /2
									// 	),
									// 	y: horizontalTopRight.y,
									// 	kind: 0,
									// };
									extended = true;
									break;
								}
						}
						if (extended)
							break;
					}
				}
				if (
					contour.length > 4 &&
					canBeLeftFalling(contour[idx], circularArray(contour, idx + 1), circularArray(contour, idx + 2), circularArray(contour, idx + 3), circularArray(contour, idx + 4))
					) {
						newContour[idx + 1] = {
							x: newContour[idx + 1].x,
							y: newContour[idx + 2].y,
							kind: 0,
						};
					}
			}

			glyph.geometry.contours.push(newContour);
		}
	}

	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
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
