"use strict";

const { Ot } = require("ot-builder");
const { extendSkip } = require("./exceptions");
const { abs, ceil, floor, round, trunc } = Math;
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
	let length = array && array.length;
	var idx = Math.abs(length + index % length) % length;
	return array[isNaN(idx) ? index : idx];
}

function circularIndex(array, index) {
	var length = array && array.length;
	var idx = Math.abs(length + index % length) % length;
	return isNaN(idx) ? index : idx;
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
		return abs(originLight(a) - originLight(b)) <= threshold &&
			abs(originHeavy(a) - originHeavy(b)) <= threshold;
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
	
	//             1            
	//             ●            
	//           .    .         
	// 3     2 .         .      
	// ●  .  ●              .  0
	// 4                       ●
	// ●                        
	function canBeLeftFalling(topRight, topPeak, topLeft, flatLeft, downLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
		return topRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && downLeft.kind == 0 &&
		leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
		originLight(topRight.x) - originLight(topPeak.x) > 0 &&
		originLight(topPeak.x) - originLight(topLeft.x) > 0 &&
		originLight(topLeft.x) - originLight(flatLeft.x) > 0 &&
		originLight(flatLeft.x) - originLight(downLeft.x) == 0 &&
		originLight(topRight.y) - originLight(topPeak.y) <= 0 &&
		originLight(topPeak.y) - originLight(topLeft.y) > 0 &&
		originLight(topLeft.y) - originLight(flatLeft.y) == 0 &&
		originLight(flatLeft.y) - originLight(downLeft.y) > 0 &&
		originLight(topRight.y) > originLight(bottomRight.y) &&
		originLight(topRight.x) > originLight(bottomRight.x) &&
		originLight(downLeft.y) > originLight(bottomLeft.y) &&
		originLight(downLeft.x) > originLight(bottomLeft.x);
	}
	
	//            2              
	//            ●              
	//         .     .           
	//      .            .       
	// 3 .   4               .  1
	// ●  .  ●                  ●
	//                         0 
	//                         ● 
	function canBeLeftFalling2(topRight, farRight, topPeak, farLeft, topLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
		return topRight.kind == 0 && farRight.kind == 0 && topPeak.kind == 0 && farLeft.kind == 0 && topLeft.kind == 0 &&
		leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
		originLight(topRight.x) - originLight(farRight.x) < 0 &&
		originLight(farRight.x) - originLight(topPeak.x) > 0 &&
		originLight(topPeak.x) - originLight(farLeft.x) > 0 &&
		originLight(farLeft.x) - originLight(topLeft.x) < 0 &&
		originLight(topRight.y) - originLight(farRight.y) < 0 &&
		originLight(farRight.y) - originLight(topPeak.y) < 0 &&
		originLight(topPeak.y) - originLight(farLeft.y) > 0 &&
		abs(originLight(farLeft.y) - originLight(topLeft.y)) <= 2 &&
		originLight(topRight.y) > originLight(bottomRight.y) &&
		originLight(topRight.x) > originLight(bottomRight.x) &&
		originLight(topLeft.y) > originLight(bottomLeft.y) &&
		originLight(topLeft.x) > originLight(bottomLeft.x);
	}
	
	//            1              
	//            ●              
	//         .     .           
	//      .            .       
	// 2 .                   .  0
	// ●                        ●
	// ●                         
	// 3                         
	function canBeLeftFalling3(topRight, topPeak, topLeft, downLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
		return topRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && downLeft.kind == 0 &&
		leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
		originLight(topRight.x) - originLight(topPeak.x) > 0 &&
		originLight(topPeak.x) - originLight(topLeft.x) > 0 &&
		originLight(topLeft.x) - originLight(downLeft.x) === 0 &&
		originLight(topRight.y) - originLight(topPeak.y) < 0 &&
		originLight(topPeak.y) - originLight(topLeft.y) > 0 &&
		originLight(topLeft.y) - originLight(downLeft.y) > 0 &&
		originLight(topRight.y) > originLight(bottomRight.y) &&
		originLight(topRight.x) > originLight(bottomRight.x) &&
		originLight(downLeft.y) > originLight(bottomLeft.y) &&
		originLight(downLeft.x) > originLight(bottomLeft.x);
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
								const verticalBottomRight = circularArray(contour2, idxP2 - 1);
								// const verticalBottomRight = circularArray(contour2, idxP2 - 1).kind === 0 ? circularArray(contour2, idxP2 - 1) :
								// 							circularArray(contour2, idxP2 - 2).kind === 0 ? circularArray(contour2, idxP2 - 2) :
								// 							circularArray(contour2, idxP2 - 3).kind === 0 ? circularArray(contour2, idxP2 - 3) : 
								// 							circularArray(contour2, idxP2 - 4);
								if (
									// and 横's (horizontal's) right end inside 竖 (vertical)
									// ───┬──┬──┐
									//    ┆  ⇨  │
									// ───┼──┘  │
									//    │     │
									isBetween(verticalTopLeft.x, horizontalTopRight.x, verticalTopRight.x) &&
									isBetween(verticalBottomRight.y, horizontalTopRight.y, verticalTopRight.y)
								) {
									let xOffsetL = 2;
									let xOffsetH = 10;
									if (approxEq(horizontalTopRight.y, verticalTopRight.y) || approxEq(horizontalBottomRight.y, verticalBottomRight.y)) {
										xOffsetL = 0;
										xOffsetH = 0;
									}
									newContour[bottomRightIdx] = {
										x: makeVariance(
											originLight(contour2[idxP2].x) - xOffsetL,
											originHeavy(contour2[idxP2].x) - xOffsetH
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									newContour[topRightIdx] = {
										x: makeVariance(
											originLight(contour2[idxP2].x) - xOffsetL,
											originHeavy(contour2[idxP2].x) - xOffsetH
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
									let xOffsetL = 2;
									let xOffsetH = 10;
									if (approxEq(horizontalTopLeft.y, verticalTopLeft.y) || approxEq(horizontalBottomLeft.y, verticalBottomLeft.y)) {
										xOffsetL = 0;
										xOffsetH = 0;
									}
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											originLight(verticalTopLeft.x) + xOffsetL,
											originHeavy(verticalTopLeft.x) + xOffsetH
										),
										y: horizontalBottomLeft.y,
										kind: 0,
									};
									newContour[topLeftIdx] = {
										x: makeVariance(
											originLight(verticalTopLeft.x) + xOffsetL,
											originHeavy(verticalTopLeft.x) + xOffsetH
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
									let xOffsetL = 2;
									let xOffsetH = 10;
									if (approxEq(horizontalTopRight.y, verticalTopRight.y) || approxEq(horizontalBottomRight.y, verticalBottomRight.y)) {
										xOffsetL = 0;
										xOffsetH = 0;
									}
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
								}
							}
							// find 横's (horizontal's) right end inside ㇇'s (horizontal + left-falling)
							if (
								contour2.length > 10 &&
								canBeLeftFalling(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 2).y)) <=1 &&
								originLight(horizontalTopRight.x) > originLight(circularArray(contour2, idxP2 + 3).x) &&
								originLight(horizontalTopRight.x) < originLight(circularArray(contour2, idxP2).x)
							) {
								const leftFallBottomLeft = circularArray(contour2, idxP2 + 7);
								const leftFallBottomRight = circularArray(contour2, idxP2 - 3);
								if (name in references.horizontalLeftFalling === false) {
									references.horizontalLeftFalling[name] = [];
								}
								let refs = references.horizontalLeftFalling[name];
								let ref = { "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2 };
								if (idxC2 + 1 < oldContours.length) {
									for (let idxP3 = 0; idxP3 < oldContours[idxC2 + 1].length; idxP3++) {
										if (// is top end
											canBeTopEnd(oldContours[idxC2 + 1][idxP3], circularArray(oldContours[idxC2 + 1], idxP3 + 1)) &&
											approxEq(oldContours[idxC2 + 1][idxP3].x, circularArray(oldContours[idxC2 + 1], idxP3 - 1).x) &&
											approxEq(circularArray(oldContours[idxC2 + 1], idxP3 + 1).x, circularArray(oldContours[idxC2 + 1], idxP3 + 2).x)
										) {
											const verticalTopRight = oldContours[idxC2 + 1][idxP3];
											const verticalTopLeft = circularArray(oldContours[idxC2 + 1], idxP3 + 1);
											const verticalBottomLeft = circularArray(oldContours[idxC2 + 1], idxP3 + 2);
											const verticalBottomRight = circularArray(oldContours[idxC2 + 1], idxP3 - 1);
											if (
												originLight(verticalTopRight.y) >= originLight(leftFallBottomRight.y) &&
												originLight(verticalTopRight.x) >= originLight(leftFallBottomRight.x) &&
												originLight(verticalBottomRight.y) < originLight(leftFallBottomRight.y) &&
												originLight(verticalBottomRight.x) >= originLight(leftFallBottomRight.x) &&
												originLight(verticalTopLeft.y) >= originLight(leftFallBottomLeft.y) &&
												originLight(verticalTopLeft.x) <= originLight(leftFallBottomLeft.x) &&
												originLight(verticalBottomLeft.y) < originLight(leftFallBottomLeft.y) &&
												originLight(verticalBottomLeft.x) <= originLight(leftFallBottomLeft.x)
											) {
												ref = { "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "vertical": idxC2 + 1, "verticalTopRight": idxP3 };
											}
											break;
										}
									}
									
								}
								refs.push(ref);
							}

							if (
								contour2.length > 10 &&
								canBeLeftFalling2(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 2).y)) <=15 &&
								originLight(horizontalTopRight.x) - originLight(circularArray(contour2, idxP2 + 4).x) > 0 &&
								originLight(contour2[idxP2].x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling2 === false) {
									references.horizontalLeftFalling2[name] = [];
								}
								let refs = references.horizontalLeftFalling2[name];
								refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2 });
							}

							if (
								contour2.length > 10 &&
								canBeLeftFalling3(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 1).y)) <=15 &&
								originLight(horizontalTopRight.x) - originLight(circularArray(contour2, idxP2 + 2).x) > 0 &&
								originLight(contour2[idxP2].x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling3 === false) {
									references.horizontalLeftFalling3[name] = [];
								}
								let refs = references.horizontalLeftFalling3[name];
								refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2 });
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
								// const horizontalBottomRight = circularArray(contour2, idxP2 + 2).kind === 0 ? circularArray(contour2, idxP2 + 2) :
								// circularArray(contour2, idxP2 + 3).kind === 0 ? circularArray(contour2, idxP2 + 3) : circularArray(contour2, idxP2 + 4);
								const horizontalTopRight = circularArray(contour2, idxP2 - 1);
								if (
									// and 竖's (vertical's) bottom inside 横's (horizontal's) left end
									originLight(horizontalTopLeft.x) <= originLight(verticalBottomRight.x) &&
									// isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalBottomLeft.y, horizontalTopLeft.y)
								) {
									let yOffsetL = 14;
									let yOffsetH = 28;
									if (approxEq(horizontalBottomLeft.x, verticalBottomLeft.x) || approxEq(horizontalBottomRight.x, verticalBottomRight.x)) {
										yOffsetL = 0;
										yOffsetH = 0;
									}
									// let leftDistance = abs(originLight(verticalBottomRight.x) - originLight(horizontalBottomRight.x));
									// let rightDistance = abs(originLight(verticalBottomLeft.x) - originLight(horizontalBottomLeft.x));
									// let side = rightDistance < leftDistance ? horizontalBottomRight : horizontalBottomLeft;
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											originLight(verticalBottomLeft.x),
											originHeavy(verticalBottomLeft.x)
										),
										y: makeVariance(
											originLight(horizontalBottomLeft.y) + yOffsetL,
											originHeavy(horizontalBottomLeft.y) + yOffsetH
										),
										kind: 0,
									};
									newContour[bottomRightIdx] = {
										x: makeVariance(
											originLight(verticalBottomRight.x),
											originHeavy(verticalBottomRight.x)
										),
										y: makeVariance(
											originLight(horizontalBottomLeft.y) + yOffsetL,
											originHeavy(horizontalBottomLeft.y) + yOffsetH
										),
										kind: 0,
									};
									// extended = true;
									// break;
								}
								// if (
								// 	// and 竖's (vertical's) top inside 横's (horizontal's) left end
								// 	// originLight(horizontalBottomLeft.x) <= originLight(verticalTopLeft.x) &&
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
											originLight(horizontalTopRight.y),
											originHeavy(horizontalTopRight.y)
										),
										kind: 0,
									};
									newContour[topLeftIdx] = {
										x: verticalTopLeft.x,
										y: makeVariance(
											originLight(horizontalTopLeft.y),
											originHeavy(horizontalTopLeft.y)
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
											originLight(verticalTopLeft.x),
											originHeavy(verticalTopLeft.x)
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											originLight(verticalTopLeft.x),
											originHeavy(verticalTopLeft.x)
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
											originLight(verticalBottomLeft.x),
											originHeavy(verticalBottomLeft.x)
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											originLight(verticalBottomLeft.x),
											originHeavy(verticalBottomLeft.x)
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
			console.log("extendShortStroke: ", count, " glyphs processed.");
	}
}

module.exports = {
	extendShortStroke: extendShortStroke,
};
