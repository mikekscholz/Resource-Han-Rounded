"use strict";

const { Ot } = require("ot-builder");
const { extendSkip } = require("./exceptions");
const ProgressBar = require('./node-progress');
const { abs, ceil, floor, pow, round, sqrt, trunc } = Math;
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
		let xdl = x2l - x1l;
		let ydl = y2l - y1l;
		return sqrt(pow(xdl, 2) + pow(ydl, 2));
	}
	
	function distanceHeavy(p1, p2) {
		let x1h = originHeavy(p1.x);
		let x2h = originHeavy(p2.x);
		let y1h = originHeavy(p1.y);
		let y2h = originHeavy(p2.y);
		let xdh = x2h - x1h;
		let ydh = y2h - y1h;
		return sqrt(pow(xdh, 2) + pow(ydh, 2));
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
			approxEq(topLeft.x, bottomLeft.x, 40) &&
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
	
	//               4               
	//               ●               
	//           .        .          
	//  6   5 .                .    3
	//  ●   ●                     2 ●
	//                          1 ○   
	//                        0 ○     
	//                        ●       
	function canBeLeftFalling4(rightC2, topRight, topRightC1, topRightC2, farRight, topPeak, topLeft, flatLeft, leftC1) {
		return rightC2.kind == 2 && topRight.kind == 0 && topRightC1.kind == 1 && topRightC2.kind == 2 &&
		farRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && leftC1.kind == 1 &&
		originLight(rightC2.x) < originLight(topRight.x) &&
		originLight(rightC2.y) < originLight(topRight.y) &&
		originLight(topRight.x) < originLight(topRightC1.x) &&
		originLight(topRight.y) <= originLight(topRightC1.y) &&
		originLight(topRightC1.x) < originLight(topRightC2.x) &&
		originLight(topRightC1.y) < originLight(topRightC2.y) &&
		originLight(topRightC2.x) < originLight(farRight.x) &&
		originLight(topRightC2.y) < originLight(farRight.y) &&
		originLight(farRight.x) > originLight(topPeak.x) &&
		originLight(farRight.y) < originLight(topPeak.y) &&
		originLight(topPeak.x) > originLight(topLeft.x) &&
		originLight(topPeak.y) > originLight(topLeft.y) &&
		originLight(topLeft.x) > originLight(flatLeft.x) &&
		abs(originLight(topLeft.y) - originLight(flatLeft.y)) < 3 &&
		originLight(flatLeft.x) > originLight(leftC1.x) &&
		originLight(flatLeft.y) > originLight(leftC1.y)
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
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
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
									// let xOffsetL = 2;
									// let xOffsetH = 10;
									// if (approxEq(horizontalTopRight.y, verticalTopRight.y) || approxEq(horizontalBottomRight.y, verticalBottomRight.y)) {
									// 	xOffsetL = 0;
									// 	xOffsetH = 0;
									// }
									let isCorner = (abs(originLight(horizontalTopRight.y) - originLight(verticalTopRight.y)) < 30) || (abs(originLight(horizontalBottomRight.y) - originLight(verticalBottomRight.y)) < 30);
									let xOffsetL = isCorner ? 0 : 4;
									let xOffsetH = isCorner ? 0 : 20;
									newContour[bottomRightIdx] = {
										x: makeVariance(
											originLight(contour2[idxP2].x) - xOffsetL,
											originHeavy(contour2[idxP2].x) - xOffsetH
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									// contour[bottomRightIdx] = newContour[bottomRightIdx];
									// oldContours[idxC1][bottomRightIdx] = newContour[bottomRightIdx];
									newContour[topRightIdx] = {
										x: makeVariance(
											originLight(contour2[idxP2].x) - xOffsetL,
											originHeavy(contour2[idxP2].x) - xOffsetH
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
									// contour[topRightIdx] = newContour[topRightIdx];
									// oldContours[idxC1][topRightIdx] = newContour[topRightIdx];
								}
								// if (
								// 	// and 横's (horizontal's) left end inside 竖 (vertical)
								// 	// ┌──┬──┬───
								// 	// │  ⇦  ┊   
								// 	// │  └──┼───
								// 	// │     │   
								// 	isBetween(verticalTopLeft.x, horizontalTopLeft.x, verticalTopRight.x) &&
								// 	isBetween(verticalBottomRight.y, horizontalTopLeft.y, verticalTopRight.y)
								// ) {
								// 	// let xOffsetL = 2;
								// 	// let xOffsetH = 10;
								// 	// if (approxEq(horizontalTopLeft.y, verticalTopLeft.y) || approxEq(horizontalBottomLeft.y, verticalBottomLeft.y)) {
								// 	// 	xOffsetL = 0;
								// 	// 	xOffsetH = 0;
								// 	// }
								// 	let isCorner = (abs(originLight(horizontalTopLeft.y) - originLight(verticalTopLeft.y)) < 5) || (abs(originLight(horizontalBottomLeft.y) - originLight(verticalBottomLeft.y)) < 5);
								// 	let xOffsetL = isCorner ? 0 : 4;
								// 	let xOffsetH = isCorner ? 0 : 20;
								// 	newContour[bottomLeftIdx] = {
								// 		x: makeVariance(
								// 			originLight(verticalTopLeft.x) + xOffsetL,
								// 			originHeavy(verticalTopLeft.x) + xOffsetH
								// 		),
								// 		y: horizontalBottomLeft.y,
								// 		kind: 0,
								// 	};
								// 	// contour[bottomLeftIdx] = newContour[bottomLeftIdx];
								// 	// oldContours[idxC1][bottomLeftIdx] = newContour[bottomLeftIdx];
								// 	newContour[topLeftIdx] = {
								// 		x: makeVariance(
								// 			originLight(verticalTopLeft.x) + xOffsetL,
								// 			originHeavy(verticalTopLeft.x) + xOffsetH
								// 		),
								// 		y: horizontalTopLeft.y,
								// 		kind: 0,
								// 	};
								// 	// contour[topLeftIdx] = newContour[topLeftIdx];
								// 	// oldContours[idxC1][topLeftIdx] = newContour[topLeftIdx];
								// 	// extended = true;
								// 	// break;
								// }
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
									// let xOffsetL = 2;
									// let xOffsetH = 10;
									// if (approxEq(horizontalTopRight.y, verticalTopRight.y) || approxEq(horizontalBottomRight.y, verticalBottomRight.y)) {
									// 	xOffsetL = 0;
									// 	xOffsetH = 0;
									// }
									let isCorner = (approxEq(horizontalTopRight.y, verticalTopRight.y, 30) || approxEq(horizontalBottomRight.y, verticalBottomRight.y, 30));
									let xOffsetL = isCorner ? 0 : 4;
									let xOffsetH = isCorner ? 0 : 20;
									newContour[topRightIdx] = {
										x: makeVariance(
											originLight(verticalBottomRight.x) - xOffsetL,
											originHeavy(verticalBottomRight.x) - xOffsetH
										),
										y: horizontalTopRight.y,
										kind: 0,
									};
									// contour[topRightIdx] = newContour[topRightIdx];
									// oldContours[idxC1][topRightIdx] = newContour[topRightIdx];
									newContour[bottomRightIdx] = {
										x: makeVariance(
											originLight(verticalBottomRight.x) - xOffsetL,
											originHeavy(verticalBottomRight.x) - xOffsetH
										),
										y: horizontalBottomRight.y,
										kind: 0,
									};
									// contour[bottomRightIdx] = newContour[bottomRightIdx];
									// oldContours[idxC1][bottomRightIdx] = newContour[bottomRightIdx];
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
								for (let idxC3 = 0; idxC3 < oldContours.length; idxC3++) {
									if ([idxC1, idxC2].includes(idxC3)) continue;
									let vertMatched = false;
									for (let idxP3 = 0; idxP3 < oldContours[idxC3].length; idxP3++) {
										if (// is top end
											canBeTopEnd(oldContours[idxC3][idxP3], circularArray(oldContours[idxC3], idxP3 + 1)) &&
											approxEq(oldContours[idxC3][idxP3].x, circularArray(oldContours[idxC3], idxP3 - 1).x) &&
											approxEq(circularArray(oldContours[idxC3], idxP3 + 1).x, circularArray(oldContours[idxC3], idxP3 + 2).x)
										) {
											const verticalTopRight = oldContours[idxC3][idxP3];
											const verticalTopLeft = circularArray(oldContours[idxC3], idxP3 + 1);
											const verticalBottomLeft = circularArray(oldContours[idxC3], idxP3 + 2);
											const verticalBottomRight = circularArray(oldContours[idxC3], idxP3 - 1);
											if (
												originLight(verticalTopRight.y) >= originLight(leftFallBottomRight.y) &&
												originLight(verticalTopRight.x) >= originLight(leftFallBottomRight.x) &&
												originLight(verticalBottomRight.y) < originLight(leftFallBottomRight.y) &&
												originLight(verticalBottomRight.x) >= originLight(leftFallBottomRight.x) &&
												originLight(verticalTopLeft.y) >= originLight(leftFallBottomLeft.y) &&
												originLight(verticalTopLeft.x) <= originLight(leftFallBottomLeft.x) &&
												originLight(verticalBottomLeft.y) < originLight(leftFallBottomLeft.y) &&
												originLight(verticalBottomLeft.x) <= originLight(leftFallBottomLeft.x) &&
												originHeavy(verticalTopRight.y) >= originHeavy(leftFallBottomRight.y) &&
												originHeavy(verticalTopRight.x) >= originHeavy(leftFallBottomRight.x) &&
												originHeavy(verticalBottomRight.y) < originHeavy(leftFallBottomRight.y) &&
												originHeavy(verticalBottomRight.x) >= originHeavy(leftFallBottomRight.x) &&
												originHeavy(verticalTopLeft.y) >= originHeavy(leftFallBottomLeft.y) &&
												originHeavy(verticalTopLeft.x) <= originHeavy(leftFallBottomLeft.x) &&
												originHeavy(verticalBottomLeft.y) < originHeavy(leftFallBottomLeft.y) &&
												originHeavy(verticalBottomLeft.x) <= originHeavy(leftFallBottomLeft.x)
											) {
												ref = { "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "vertical": idxC3, "verticalTopRight": idxP3 };
												vertMatched = true;
												break;
											}
										}
									}
									if (vertMatched) break;
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
								let filtered = contour2.filter((point) => point.kind === 0);
								let segment = filtered.indexOf(contour2[idxP2]);
								if (name in references.horizontalLeftFalling2 === false) {
									references.horizontalLeftFalling2[name] = [];
								}
								let refs = references.horizontalLeftFalling2[name];
								refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingTopRightSgmt": segment });
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
							if (
								contour2.length > 10 &&
								canBeLeftFalling4(circularArray(contour2, idxP2 - 1), contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 6).y)) <= 15 &&
								abs(originLight(horizontalTopRight.x) - originLight(circularArray(contour2, idxP2 + 6).x)) <= 30 &&
								originLight(circularArray(contour2, idxP2 + 3).x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling4 === false) {
									references.horizontalLeftFalling4[name] = [];
								}
								let refs = references.horizontalLeftFalling4[name];
								refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2 });
							}
						}
						if (extended)
							break;
					}
				}

			}
			glyph.geometry.contours.push(newContour);
		}
		
		oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
			// find possible 横s (horizontals)
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			
			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				if (
					// is bottom end
					canBeBottomEnd(contour[idxP1], circularArray(contour, idxP1 + 1)) &&
					approxEq(contour[idxP1].x, circularArray(contour, idxP1 - 1).x, 450) &&
					approxEq(circularArray(contour, idxP1 + 1).x, circularArray(contour, idxP1 + 2).x, 450)
				) {
					// if (name === "uni1104") {
					// 	console.log(name, "idxC", idxC1, "idxP", idxP1);
					// 	console.log(oldContours);
					// }
					const bottomLeftIdx = circularIndex(contour, idxP1);
					const bottomRightIdx = circularIndex(contour, idxP1 + 1);
					const topRightIdx = circularIndex(contour, idxP1 + 2);
					const topLeftIdx = circularIndex(contour, idxP1 - 1);
					const verticalBottomLeft = circularArray(contour, idxP1);
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
								approxEq(contour2[idxP2].y, circularArray(contour2, idxP2 - 1).y) &&
								approxEq(circularArray(contour2, idxP2 + 1).y, circularArray(contour2, idxP2 + 2).y)
							) {
								const horizontalTopLeft = circularArray(contour2, idxP2);
								const horizontalBottomLeft = circularArray(contour2, idxP2 + 1);
								const strokeHeavy = distanceHeavy(horizontalTopLeft, horizontalBottomLeft);
								// const horizontalBottomRight = circularArray(contour2, idxP2 + 2);
								// const horizontalBottomRight = circularArray(contour2, idxP2 + 2).kind === 0 ? circularArray(contour2, idxP2 + 2) :
								const horizontalBottomRight = (circularArray(contour2, idxP2 + 2).kind === 0 && distanceHeavy(circularArray(contour2, idxP2 + 2), horizontalBottomLeft) >= strokeHeavy) ? circularArray(contour2, idxP2 + 2) :
								circularArray(contour2, idxP2 + 3).kind === 0 ? circularArray(contour2, idxP2 + 3) : 
								circularArray(contour2, idxP2 + 4).kind === 0 ? circularArray(contour2, idxP2 + 4) : circularArray(contour2, idxP2 + 5);
								const horizontalTopRight = circularArray(contour2, idxP2 - 1);
								if (
									// and 竖's (vertical's) bottom inside 横's (horizontal's) left end
									// originLight(horizontalTopLeft.x) <= originLight(verticalBottomLeft.x) &&
									isBetween(horizontalBottomLeft.x, verticalBottomLeft.x, horizontalBottomRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalBottomLeft.y, horizontalTopLeft.y)
								) {
									// if (name === "uni1104") {
									// 	console.log(name, "idxC2", idxC2, "idxP2", idxP2);
									// 	console.log(name, "cornerL", abs(originLight(horizontalBottomLeft.x) - originLight(verticalBottomLeft.x)) < 5);
									// 	console.log(name, "cornerR", abs(originLight(horizontalBottomRight.x) - originLight(verticalBottomRight.x)) < 5);
									// }
									let isCorner = (abs(originLight(horizontalBottomLeft.x) - originLight(verticalBottomLeft.x)) < 30) || (abs(originLight(horizontalBottomRight.x) - originLight(verticalBottomRight.x)) < 30);
									let yOffsetL = isCorner ? 0 : 4;
									let yOffsetH = isCorner ? 0 : 20;
									// if (abs(originLight(horizontalBottomLeft.x) - originLight(verticalBottomLeft.x)) < 5 || abs(originLight(horizontalBottomRight.x) - originLight(verticalBottomRight.x)) < 5) {
									// 	yOffsetL = 0;
									// 	yOffsetH = 0;
									// }
									let rightDistance = abs(originLight(verticalBottomRight.x) - originLight(horizontalBottomRight.x));
									let leftDistance = abs(originLight(verticalBottomLeft.x) - originLight(horizontalBottomLeft.x));
									let side = rightDistance < leftDistance ? horizontalBottomRight : horizontalBottomLeft;
									newContour[bottomLeftIdx] = {
										x: verticalBottomLeft.x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalBottomLeft.y) + yOffsetL,
											// originHeavy(horizontalBottomLeft.y) + yOffsetH
										),
										kind: 0,
									};
									// contour[bottomLeftIdx] = newContour[bottomLeftIdx];
									// oldContours[idxC1][bottomLeftIdx] = newContour[bottomLeftIdx];
									newContour[bottomRightIdx] = {
										x: verticalBottomRight.x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalBottomLeft.y) + yOffsetL,
											// originHeavy(horizontalBottomLeft.y) + yOffsetH
										),
										kind: 0,
									};
									// contour[bottomRightIdx] = newContour[bottomRightIdx];
									// oldContours[idxC1][bottomRightIdx] = newContour[bottomRightIdx];
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
						if (extended)
						break;
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}
		
		oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
			// find possible 横s (horizontals)
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			
			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
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
									let isCorner = (abs(originLight(horizontalTopLeft.y) - originLight(verticalTopLeft.y)) < 30) || (abs(originLight(horizontalBottomLeft.y) - originLight(verticalBottomLeft.y)) < 30);
									let xOffsetL = isCorner ? 0 : 4;
									let xOffsetH = isCorner ? 0 : 20;
									newContour[topLeftIdx] = {
										x: makeVariance(
											originLight(verticalTopLeft.x) + xOffsetL,
											originHeavy(verticalTopLeft.x) + xOffsetH
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											originLight(verticalTopLeft.x) + xOffsetL,
											originHeavy(verticalTopLeft.x) + xOffsetH
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
									let isCorner = (abs(originLight(horizontalTopLeft.y) - originLight(verticalTopLeft.y)) < 30) || (abs(originLight(horizontalBottomLeft.y) - originLight(verticalBottomLeft.y)) < 30);
									let xOffsetL = isCorner ? 0 : 4;
									let xOffsetH = isCorner ? 0 : 20;
									newContour[topLeftIdx] = {
										x: makeVariance(
											originLight(verticalBottomLeft.x) + xOffsetL,
											originHeavy(verticalBottomLeft.x) + xOffsetH
										),
										y: horizontalTopLeft.y,
										kind: 0,
									};
									newContour[bottomLeftIdx] = {
										x: makeVariance(
											originLight(verticalBottomLeft.x) + xOffsetL,
											originHeavy(verticalBottomLeft.x) + xOffsetH
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
		
		oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
			// find possible 横s (horizontals)
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			
			const newContour = [...contour];

			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				if (
					// is top end
					canBeTopEnd(contour[idxP1], circularArray(contour, idxP1 + 1)) &&
					approxEq(contour[idxP1].x, circularArray(contour, idxP1 - 1).x, 85) &&
					approxEq(circularArray(contour, idxP1 + 1).x, circularArray(contour, idxP1 + 2).x, 85)
				) {
					const topRightIdx = idxP1;
					const topLeftIdx = circularIndex(contour, idxP1 + 1);
					const bottomLeftIdx = circularIndex(contour, idxP1 + 2);
					const bottomRightIdx = circularIndex(contour, idxP1 - 1);
					const verticalTopRight = contour[idxP1];
					const verticalTopLeft = circularArray(contour, idxP1 + 1);
					const verticalBottomLeft = circularArray(contour, idxP1 + 2);
					const verticalBottomRight = circularArray(contour, idxP1 - 1);

					for (const [idxC2, contour2o] of oldContours.entries()) {
						// find possible 横s (horizontals)
						if (contour2o == contour || contour2o.length < 4)
						continue;
						let contour2 = contour2o.filter((point) => point.kind === 0);
						let extended = false;
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							if (
								// is left end
								canBeLeftEnd(contour2[idxP2], circularArray(contour2, idxP2 + 1)) &&
								approxEq(contour2[idxP2].y, circularArray(contour2, idxP2 - 1).y, 85) &&
								approxEq(circularArray(contour2, idxP2 + 1).y, circularArray(contour2, idxP2 + 2).y, 85)
							) {
								const horizontalTopLeft = contour2[idxP2];
								const horizontalBottomLeft = circularArray(contour2, idxP2 + 1);
								const horizontalBottomRight = circularArray(contour2, idxP2 + 2);
								const strokeHeavy = distanceHeavy(horizontalTopLeft, horizontalBottomLeft);
								// const horizontalTopRight = circularArray(contour2, idxP2 - 1);
								const horizontalTopRight = (circularArray(contour2, idxP2 - 1).kind === 0 && distanceHeavy(circularArray(contour2, idxP2 - 1), horizontalTopLeft) >= strokeHeavy) ? circularArray(contour2, idxP2 - 1) :
								circularArray(contour2, idxP2 - 2).kind === 0 ? circularArray(contour2, idxP2 - 2) : 
								circularArray(contour2, idxP2 - 3).kind === 0 ? circularArray(contour2, idxP2 - 3) : circularArray(contour2, idxP2 - 4);
								if (
									// and 竖's (vertical's) top inside 横's (horizontal's) left end
									// ┌────────
									// ├─⇧─┐
									// ├╌╌╌┤────
									// │   │
									isBetween(horizontalTopLeft.x, verticalBottomRight.x, horizontalTopRight.x) &&
									isBetween(horizontalBottomLeft.y, verticalTopLeft.y, horizontalTopRight.y)
								) {
									let isCorner = (abs(originLight(horizontalTopLeft.x) - originLight(verticalTopLeft.x)) <= 30) || (abs(originLight(horizontalTopRight.x) - originLight(verticalTopRight.x)) < 30);
									// let isCorner = true;

									let hBLXLight = originLight(horizontalBottomLeft.x);
									let hBLYLight = originLight(horizontalBottomLeft.y);
									let hBRXLight = originLight(horizontalBottomRight.x);
									let hBRYLight = originLight(horizontalBottomRight.y);
									let hBLXHeavy = originHeavy(horizontalBottomLeft.x);
									let hBLYHeavy = originHeavy(horizontalBottomLeft.y);
									let hBRXHeavy = originHeavy(horizontalBottomRight.x);
									let hBRYHeavy = originHeavy(horizontalBottomRight.y);
									let horizontalBottomSlopeLight = slope({p1: {x: hBLXLight, y: hBLYLight}, p2: {x: hBRXLight, y: hBRYLight}});
									let horizontalBottomSlopeHeavy = slope({p1: {x: hBLXHeavy, y: hBLYHeavy}, p2: {x: hBRXHeavy, y: hBRYHeavy}});
									let distanceLight = originLight(verticalTopLeft.x) - hBLXLight;
									let distanceHeavy = originHeavy(verticalTopLeft.x) - hBLXHeavy;
									let yOffsetL = isCorner ? 0 : (distanceLight * horizontalBottomSlopeLight) + (horizontalBottomSlopeLight === 0 ? 20 : 8);
									let yOffsetH = isCorner ? 0 : (distanceHeavy * horizontalBottomSlopeHeavy) + 80;
									let rightDistance = abs(originLight(verticalTopRight.x) - originLight(horizontalTopRight.x));
									let leftDistance = abs(originLight(verticalTopLeft.x) - originLight(horizontalTopLeft.x));
									let side = rightDistance < leftDistance ? isCorner ? horizontalTopRight : horizontalBottomLeft : isCorner ? horizontalTopLeft : horizontalBottomLeft;
									newContour[topRightIdx] = {
										// x: verticalTopRight.x,
										x: newContour[topRightIdx].x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalTopRight.y) - yOffsetL,
											// originHeavy(horizontalTopRight.y) - yOffsetH
										),
										kind: 0,
									};
									// contour[topRightIdx] = newContour[topRightIdx];
									// oldContours[idxC1][topRightIdx] = newContour[topRightIdx];
									newContour[topLeftIdx] = {
										// x: verticalTopLeft.x,
										x: newContour[topLeftIdx].x,
										y: makeVariance(
											originLight(side.y) + yOffsetL,
											originHeavy(side.y) + yOffsetH
											// originLight(horizontalTopLeft.y) - yOffsetL,
											// originHeavy(horizontalTopLeft.y) - yOffsetH
										),
										kind: 0,
									};
									// contour[topLeftIdx] = newContour[topLeftIdx];
									// oldContours[idxC1][topLeftIdx] = newContour[topLeftIdx];
									// extended = true;
									// break;
								}
							}
						}
						if (extended)
						break;
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns - 50 || 150
	let bar = new ProgressBar('\u001b[38;5;82mextendShortStroke\u001b[0m [2/5] :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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

	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		// console.log(name);
		if (!extendSkip.includes(name)) checkSingleGlyph(glyph);
		progressTick();
		// count++;
		// if (count % 1000 == 0) console.log("extendShortStroke: ", count, " glyphs processed.");
	}
}

module.exports = {
	extendShortStroke: extendShortStroke,
};
