"use strict";

const { Ot } = require("ot-builder");
const ProgressBar = require('./node-progress');
const { base60, bearing, horizontalSlope, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc } = Math;

const path = require("path");
const fsp = require("fs/promises");
const writeFile = async(filename, data, increment = 0) => {
	// const name = `/mnt/c/Users/Michael/${path.basename(filename, path.extname(filename))}${"(" + increment + ")" || ""}${path.extname(filename)}`;
	const name = `${path.dirname(filename)}/${path.basename(filename, path.extname(filename))}${ increment ? "(" + increment + ")" : ""}${path.extname(filename)}`;
	return await fsp.writeFile(name, data, { encoding: 'utf8', flag: 'wx' }).catch(async ex => {
		if (ex.code === "EEXIST") return await writeFile(filename, data, increment += 1)
		throw ex
	}) || name
};

// based on measurement of SHS
const params = {
	strokeWidth: { light: 35, heavy: 175 },
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

function angle(line) {
	let { p1, p2 } = line;
	let deg = (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
	if (p2.x < p1.x && p2.y > p1.y) return deg - 360;
	if (p2.x < p1.x && p2.y < p1.y) return deg - 180;
	if (deg === 360) return 180;
	return deg;
}

// function abs(num) {
// 	return num >= 0 ? num : -num;
// }

function preProcess(font, references) {
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
	
	function lineLight(p1, p2) {
		return {p1: {x: originLight(p1.x), y: originLight(p1.y)},p2: {x: originLight(p2.x), y: originLight(p2.y)}};
	}
	
	function lineHeavy(p1, p2) {
		return {p1: {x: originHeavy(p1.x), y: originHeavy(p1.y)},p2: {x: originHeavy(p2.x), y: originHeavy(p2.y)}};
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
	
	function canBeRightEnd(bottomRight, topRight) {
		return bottomRight.kind == 0 && topRight.kind == 0 &&
			approxEq(bottomRight.x, topRight.x, 50, 85) &&
			approxEq(distanceLight(topRight, bottomRight), params.strokeWidth.light, 30) &&
			// approxEq(originLight(topRight.y) - originLight(bottomRight.y), params.strokeWidth.light, 20,) &&
			// distanceHeavy(topRight, bottomRight) <= params.strokeWidth.heavy;
			distanceHeavy(topRight, bottomRight) <= params.strokeWidth.heavy;
	}
	
	function canBeTopEnd(topRight, topLeft) {
		// console.log(originLight(topRight.x) - originLight(topLeft.x));
		return topRight.kind == 0 && topLeft.kind == 0 &&
			approxEq(topRight.y, topLeft.y, 20) &&
			approxEq(originLight(topRight.x) - originLight(topLeft.x), params.strokeWidth.light, 20,) &&
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
	
	//            2              
	//            ●              
	//      3  .     .           
	//      ●            .       
	// 4 .   5               .  1
	// ●  .  ●                  ●
	//                         0 
	//                         ● 
	// function canBeLeftFalling2b(topRight, farRight, topPeak, slopeLeft, farLeft, topLeft, leftC1, leftC2, bottomLeft, bottomRight, rightC1, rightC2) {
	function canBeLeftFalling2b(topRight, farRight, topPeak, slopeLeft, farLeft, topLeft) {
		return topRight.kind == 0 && farRight.kind == 0 && topPeak.kind == 0 && slopeLeft.kind == 0 && farLeft.kind == 0 && topLeft.kind == 0 &&
		// leftC1.kind == 1 && leftC2.kind == 2 && bottomLeft.kind == 0 && bottomRight.kind == 0 && rightC1.kind == 1 && rightC2.kind == 2 &&
		originLight(topRight.x) < originLight(farRight.x) &&
		originLight(farRight.x) > originLight(topPeak.x) &&
		originLight(topPeak.x) > originLight(slopeLeft.x) &&
		originLight(slopeLeft.x) > originLight(farLeft.x) &&
		originLight(farLeft.x) < originLight(topLeft.x) &&
		originLight(topRight.y) < originLight(farRight.y) &&
		originLight(farRight.y) < originLight(topPeak.y) &&
		originLight(topPeak.y) > originLight(slopeLeft.y) &&
		originLight(slopeLeft.y) > originLight(farLeft.y) 
		// &&
		// abs(originLight(farLeft.y) - originLight(topLeft.y)) <= 4 
		// &&
		// originLight(topRight.y) > originLight(bottomRight.y) &&
		// originLight(topRight.x) > originLight(bottomRight.x) &&
		// originLight(topLeft.y) > originLight(bottomLeft.y) &&
		// originLight(topLeft.x) > originLight(bottomLeft.x);
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
	// function canBeLeftFalling4(rightC2, farRight, topPeak, topLeft, flatLeft, leftC1) {
	// 	return rightC2.kind == 2 && farRight.kind == 0 && topPeak.kind == 0 && topLeft.kind == 0 && flatLeft.kind == 0 && leftC1.kind == 1 &&
	// 	originLight(rightC2.x) < originLight(farRight.x) &&
	// 	originLight(rightC2.y) < originLight(farRight.y) &&
	// 	originLight(farRight.x) > originLight(topPeak.x) &&
	// 	originLight(farRight.y) < originLight(topPeak.y) &&
	// 	originLight(topPeak.x) > originLight(topLeft.x) &&
	// 	originLight(topPeak.y) > originLight(topLeft.y) &&
	// 	originLight(topLeft.x) > originLight(flatLeft.x) &&
	// 	abs(originLight(topLeft.y) - originLight(flatLeft.y)) < 3 &&
	// 	originLight(flatLeft.x) > originLight(leftC1.x) &&
	// 	originLight(flatLeft.y) > originLight(leftC1.y)
	// }
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
	function approxEq(a, b, threshold = 5, thresholdHeavy = false) {
		if (typeof a == 'number' && typeof b == 'number')
			return abs(a - b) <= threshold;
		return abs(originLight(a) - originLight(b)) <= threshold &&
			abs(originHeavy(a) - originHeavy(b)) <= (thresholdHeavy || threshold);
	}

	function isBetween(a, x, b) {
		return (originLight(a) - 2) <= originLight(x) &&
			originLight(x) <= (originLight(b) + 2) &&
			(originHeavy(a) - 2) <= originHeavy(x) &&
			originHeavy(x) <= (originHeavy(b) + 2);
	}

	function makeVariance(valueDefault, valueWghtMax) {
		return valueFactory.create(valueDefault, [[masterWghtMax, valueWghtMax - valueDefault]]);
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

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;
		
		const name = glyph.name;
		
		let oldContours = glyph.geometry.contours;
		
		if (glyph.name === ".gid1938") {
			oldContours.push(oldContours.shift());
			oldContours.push(oldContours.shift());
		}
		
		if (glyph.name === "uni8F4F") {
			oldContours.splice(9,1);
		}
		
		glyph.geometry.contours = [];
		
		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}
			
			// if (
			// 	originLight(contour[0].x) !== originLight(circularArray(contour, -1).x) &&
			// 	originLight(contour[0].y) !== originLight(circularArray(contour, -1).y) &&
			// 	originHeavy(contour[0].x) !== originHeavy(circularArray(contour, -1).x) &&
			// 	originHeavy(contour[0].y) !== originHeavy(circularArray(contour, -1).y)
			// ) {
			// 	console.log(name);
			// 	contour = [...contour, contour[0]]; // the last end point may be omitted
			// }
			
			// if (name === "uni4B67") console.log(contour);

			// fix all 人's starting on midpoint of horizontal line and start on corner
			if (contour.length === 22) {
				const tlefty = originLight(contour[1].y);
				const tcentery = originLight(contour[0].y);
				const trighty = originLight(contour[21].y);
				const tleftx = originLight(contour[1].x);
				const tcenterx = originLight(contour[0].x);
				const trightx = originLight(contour[21].x);
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
			
			// fix all intersects like ㄥ to align rounded ends
			for (let idx = 0; idx < contour.length; idx++) {
				if (
					circularArray(contour, idx).kind === 0 &&
					circularArray(contour, idx - 1).kind === 0 &&
					circularArray(contour, idx - 2).kind === 0 &&
					abs(originLight(circularArray(contour, idx).x) - originLight(circularArray(contour, idx - 1).x)) <= 1 &&
					originLight(circularArray(contour, idx - 1).x) < originLight(circularArray(contour, idx - 2).x) &&
					originLight(circularArray(contour, idx).y) < originLight(circularArray(contour, idx - 1).y) &&
					originLight(circularArray(contour, idx - 1).y) < originLight(circularArray(contour, idx - 2).y)
				) {
					for (const contour2 of oldContours) {
						if (contour2 == contour || contour2.length < 4) continue;
						let matched = false
						for (let idx2 = 0; idx2 < contour2.length; idx2++) {
							if (
								originLight(contour[idx].x) === originLight(contour2[idx2].x) &&
								abs(originLight(contour[idx].y) - originLight(contour2[idx2].y)) <= 1
							) {
								let targetPoint = circularArray(contour2, idx2 - 2).kind === 0 ? circularArray(contour2, idx2 - 2) : circularArray(contour2, idx2 - 3).kind === 0 ? circularArray(contour2, idx2 - 3) :
								circularArray(contour2, idx2 - 4).kind === 0 ? circularArray(contour2, idx2 - 4) : 
								circularArray(contour, idx - 1);
													
								newContour[circularIndex(contour, idx - 1)] = {
									x: targetPoint.x,
									y: targetPoint.y,
									kind: targetPoint.kind,
								};
								matched = true;
								break;
							}
						}
						if (matched) break;
					}
				}
			}
			
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const bottomRightIdx = idxP1;
				const topRightIdx = nextNode(contour, bottomRightIdx);
				const topLeftIdx = nextNode(contour, topRightIdx);
				const bottomLeftIdx = previousNode(contour, bottomRightIdx);
				// const topLeftIdx = nextNodeIdx(contour, topRightIdx);
				// const bottomLeftIdx = previousNodeIdx(contour, bottomRightIdx);

				const horizontalAngle = angle(lineLight(circularArray(contour, bottomLeftIdx), circularArray(contour, bottomRightIdx)));
				const horizontalTopSlope = horizontalSlope(lineLight(circularArray(contour, topLeftIdx), circularArray(contour, topRightIdx)));
				const horizontalBottomSlope = horizontalSlope(lineLight(circularArray(contour, bottomLeftIdx), circularArray(contour, bottomRightIdx)));
				if (
					// is right end
					canBeRightEnd(circularArray(contour, bottomRightIdx), circularArray(contour, topRightIdx)) &&
					approxEq(horizontalTopSlope, horizontalBottomSlope, 0.8) &&
					originLight(circularArray(contour, bottomRightIdx).x) > originLight(circularArray(contour, bottomLeftIdx).x)
					//  &&
					// horizontalBottomSlope < 0.5
					// approxEq(horizontalTopRight.y, horizontalTopLeft.y, 34, 37)
					// approxEq(distanceLight(horizontalBottomRight, horizontalTopRight), params.strokeWidth.light, 10) &&
					// approxEq(distanceLight(horizontalTopLeft, horizontalBottomLeft), params.strokeWidth.light, 10) &&
				) {
					const horizontalBottomRight = contour[bottomRightIdx];
					const horizontalTopRight = circularArray(contour, topRightIdx);
					const horizontalTopLeft = circularArray(contour, topLeftIdx);
					const horizontalBottomLeft = circularArray(contour, bottomLeftIdx);
					const horizontalStrokeLight = originLight(horizontalTopRight.y) - originLight(horizontalBottomRight.y);
					const horizontalStrokeHeavy = originHeavy(horizontalTopRight.y) - originHeavy(horizontalBottomRight.y);
					for (const [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1) continue;
						let extended = false;
						let matched = false;
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							// find 横's (horizontal's) right end inside ㇇'s (horizontal + left-falling)
							if (
								contour2.length > 10 &&
								canBeLeftFalling(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 2).y)) <=1 &&
								originLight(horizontalTopRight.x) > originLight(circularArray(contour2, idxP2 + 3).x) &&
								originLight(horizontalBottomRight.y) > originLight(circularArray(contour2, idxP2 - 2).y) &&
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
												if (name in references.skipRedundantPoints === false) {
													references.skipRedundantPoints[name] = [];
												}
												references.skipRedundantPoints[name].push(idxC3);
												if (name in references.extendIgnoreContourIdx === false) {
													references.extendIgnoreContourIdx[name] = [];
												}
												references.extendIgnoreContourIdx[name].push(idxC3);
												vertMatched = true;
												break;
											}
										}
									}
									if (vertMatched) break;
								}
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push(ref);
									matched = true;
									extended = true;
								}

								// break;
							}

							if (
								contour2.length > 10 &&
								canBeLeftFalling2(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1))  &&
								originLight(horizontalTopRight.y) < originLight(circularArray(contour2, idxP2 + 2).y) &&
								originLight(horizontalTopRight.x) > originLight(circularArray(contour2, idxP2 + 3).x) &&
								originLight(contour2[idxP2].x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling2 === false) {
									references.horizontalLeftFalling2[name] = [];
								}
								let refs = references.horizontalLeftFalling2[name];
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2 });
									matched = true;
									extended = true;
								}
								
								// break;
							}
							let lfI0 = idxP2;
							let lfI1 = nextNode(contour2, lfI0)
							let lfI2 = nextNode(contour2, lfI1)
							let lfI3 = nextNode(contour2, lfI2)
							let lfI4 = nextNode(contour2, lfI3)
							let lfI5 = nextNode(contour2, lfI4)
							let lfI6 = nextNode(contour2, lfI5)
							if (
								contour2.length > 10 &&
								canBeLeftFalling2b(contour2[idxP2], circularArray(contour2, lfI1), circularArray(contour2, lfI2), circularArray(contour2, lfI3), circularArray(contour2, lfI4), circularArray(contour2, lfI5)) &&
								// canBeLeftFalling2b(contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4), circularArray(contour2, idxP2 + 5), circularArray(contour2, idxP2 + 6), circularArray(contour2, idxP2 + 7), circularArray(contour2, idxP2 + 8), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1)) &&
								originLight(horizontalTopRight.y) < originLight(circularArray(contour2, lfI2).y) &&
								originLight(horizontalTopRight.x) > originLight(circularArray(contour2, lfI4).x) &&
								originLight(contour2[idxP2].x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling2b === false) {
									references.horizontalLeftFalling2b[name] = [];
								}
								let refs = references.horizontalLeftFalling2b[name];
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2 });
									matched = true;
									extended = true;
								}
								// extended = true;
								// break;
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
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2 });
									matched = true;
									extended = true;
								}
								// extended = true;
								// break;
							}
							if (
								contour2.length > 10 &&
								canBeLeftFalling4(circularArray(contour2, idxP2 - 4), circularArray(contour2, idxP2 - 3), circularArray(contour2, idxP2 - 2), circularArray(contour2, idxP2 - 1), contour2[idxP2], circularArray(contour2, idxP2 + 1), circularArray(contour2, idxP2 + 2), circularArray(contour2, idxP2 + 3), circularArray(contour2, idxP2 + 4)) &&
								abs(originLight(horizontalTopRight.y) - originLight(circularArray(contour2, idxP2 + 3).y)) <= 15 &&
								abs(originLight(horizontalTopRight.x) - originLight(circularArray(contour2, idxP2 + 3).x)) <= 30 &&
								originLight(circularArray(contour2, idxP2).x) > originLight(horizontalTopRight.x)
							) {
								if (name in references.horizontalLeftFalling4 === false) {
									references.horizontalLeftFalling4[name] = [];
								}
								let refs = references.horizontalLeftFalling4[name];
								let objIndex = refs.findIndex((obj) => obj["leftFalling"] === idxC2);
								if (objIndex === -1) {
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingTopLeft":  circularIndex(contour2, idxP2 + 3)});
									matched = true;
									extended = true;
								}
								// extended = true;
								// break;
							}
						}
						if (matched) {
							if (name in references.extendIgnoreContourIdx === false) {
								references.extendIgnoreContourIdx[name] = [];
							}
							references.extendIgnoreContourIdx[name].push(idxC2);
							if (name in references.skipRedundantPoints === false) {
								references.skipRedundantPoints[name] = [];
							}
							references.skipRedundantPoints[name].push(idxC1, idxC2);
							if (!references.leftFallingCorrections.includes(name)) references.leftFallingCorrections.push(name);
						}
						// if (extended) continue;
					}
				}
			}
			glyph.geometry.contours.push(newContour);
		}
			
		oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (const [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			const newContour = [...contour];
			if (name in references.skipRedundantPoints) {
				const skipContours = references.skipRedundantPoints[name];
				if (skipContours.includes(idxC1)) {
					glyph.geometry.contours.push(contour);
					continue;
				}
			}
			let corners = [];
			let redundantPoints = [];
			let maxSlope = 0.09;
			for (let i = 0; i < contour.length; i++) {
				let curr = contour[i];
				if (curr.kind !== 0) continue;
				let prev = contour[previousNode(contour, i, false)];
				let next = contour[nextNode(contour, i, false)];
				let bear1 = bearing(lineLight(prev, curr));
				let bear2 = bearing(lineLight(curr, next));
				let rotation = abs(turn(bear1, bear2));
				if (rotation >= 25 && rotation <= 150 && !corners.includes(i)) corners.push(i);
			}
			for (let kIdx = 0; kIdx < corners.length; kIdx++) {
				let vert = false;
				let prevIdx = circularArray(corners, kIdx - 1);
				let startIdx = corners[kIdx];
				let endIdx = circularArray(corners, kIdx + 1);
				let prevPoint = circularArray(contour, prevIdx);
				let startPoint = circularArray(contour, startIdx);
				let endPoint = circularArray(contour, endIdx);
				let mainSlope = horizontalSlope(lineLight(startPoint, endPoint));
				let parentBearing = bearing(lineLight(startPoint, endPoint));
				let parentLength = distanceLight(startPoint, endPoint);
				if (abs(mainSlope) > 1) {
					mainSlope = verticalSlope(lineLight(startPoint, endPoint));
					vert = true;
				}
				let innerPoints = (endIdx - startIdx) - 1;
				if (innerPoints > 2 && innerPoints < 10) {
					for (let idx = startIdx; idx < endIdx - 1; idx++) {
						let p1Idx = circularIndex(contour, idx);
						let p2Idx = circularIndex(contour, idx + 1);
						let p3Idx = circularIndex(contour, idx + 2);
						let p4Idx = circularIndex(contour, idx + 3);
						let p1 = contour[p1Idx];
						let p2 = contour[p2Idx];
						let p3 = contour[p3Idx];
						let p4 = contour[p4Idx];
						let segmentLength = distanceLight(p1, p4);
						let segmentBearing = bearing(lineLight(p1, p4));
						let control1Bearing = bearing(lineLight(p1, p2));
						let control2Bearing = bearing(lineLight(p3, p4));
						let controlVectorBearing = bearing(lineLight(p2, p3));
						let segD = abs(turn(parentBearing, segmentBearing));
						let c1D = abs(turn(parentBearing, control1Bearing));
						let c2D = abs(turn(parentBearing, control2Bearing));
						let cVD = abs(turn(parentBearing, controlVectorBearing));
						if (p2.kind === 1 && p3.kind === 2 && p4.kind === 0) {
							if (segD < 11 && (c1D < 11 || distanceLight(p1, p2) === 0) && (c2D < 11 || distanceLight(p3, p4) === 0) && cVD < 11 && segmentLength < (parentLength / 4)) {
								if (!redundantPoints.includes(p1Idx) && p1Idx !== 0 && p1Idx < contour.length - 1 && p1Idx > startIdx) redundantPoints.push(p1Idx);
								if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length - 1) redundantPoints.push(p2Idx);
								if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length - 1) redundantPoints.push(p3Idx);
								if (!redundantPoints.includes(p4Idx) && p4Idx !== 0 && p4Idx < contour.length - 1 && p4Idx < endIdx) redundantPoints.push(p4Idx);
							}
							if (segD < 3 && (c1D < 3 || distanceLight(p1, p2) === 0) && (c2D < 3 || distanceLight(p3, p4) === 0) && cVD < 3) {
								if (!redundantPoints.includes(p1Idx) && p1Idx !== 0 && p1Idx < contour.length - 1 && p1Idx > startIdx) redundantPoints.push(p1Idx);
								if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length - 1) redundantPoints.push(p2Idx);
								if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length - 1) redundantPoints.push(p3Idx);
								if (!redundantPoints.includes(p4Idx) && p4Idx !== 0 && p4Idx < contour.length - 1 && p4Idx < endIdx) redundantPoints.push(p4Idx);
							}
							if (segD < 8 && (c1D < 2 || distanceLight(p1, p2) === 0) && (c2D < 12 || distanceLight(p3, p4) === 0) && cVD < 4 && segmentLength < (parentLength / 3)) {
								if (!redundantPoints.includes(p1Idx) && p1Idx !== 0 && p1Idx < contour.length - 1 && p1Idx > startIdx) redundantPoints.push(p1Idx);
								if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length - 1) redundantPoints.push(p2Idx);
								if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length - 1) redundantPoints.push(p3Idx);
								if (!redundantPoints.includes(p4Idx) && p4Idx !== 0 && p4Idx < contour.length - 1 && p4Idx < endIdx) redundantPoints.push(p4Idx);
							}
							if (segD < 20 && (c1D < 4 || distanceLight(p1, p2) === 0) && ((c2D < 20 && c2D > 10) || distanceLight(p3, p4) === 0) && cVD < 15 && p4Idx === endIdx && innerPoints > 5) {
								if (!redundantPoints.includes(p1Idx) && p1Idx !== 0 && p1Idx < contour.length - 1 && p1Idx > startIdx) redundantPoints.push(p1Idx);
								if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length - 1) redundantPoints.push(p2Idx);
								if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length - 1) redundantPoints.push(p3Idx);
							}
							if (distanceHeavy(p1, p4) < 100 && (c1D < 30 || distanceLight(p1, p2) === 0) && (c2D < 20 || distanceLight(p3, p4) === 0) && cVD < 15 && p1Idx === startIdx && innerPoints > 5) {
								if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length - 1) redundantPoints.push(p2Idx);
								if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length - 1) redundantPoints.push(p3Idx);
								if (!redundantPoints.includes(p4Idx) && p4Idx !== 0 && p4Idx < contour.length - 1 && p4Idx < endIdx) redundantPoints.push(p4Idx);
							}
							if (segD < 8 && (c1D < 14 || distanceLight(p1, p2) === 0) && (c2D < 2 || distanceLight(p3, p4) === 0) && cVD < 4 && segmentLength < (parentLength / 3)) {
								if (!redundantPoints.includes(p1Idx) && p1Idx !== 0 && p1Idx < contour.length - 1 && p1Idx > startIdx) redundantPoints.push(p1Idx);
								if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length - 1) redundantPoints.push(p2Idx);
								if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length - 1) redundantPoints.push(p3Idx);
								if (!redundantPoints.includes(p4Idx) && p4Idx !== 0 && p4Idx < contour.length - 1 && p4Idx < endIdx) redundantPoints.push(p4Idx);
							}
						}
						
					}
				}
				if (innerPoints === 2) {
					let c1Idx = circularIndex(contour, startIdx + 1);
					let c2Idx = circularIndex(contour, startIdx + 2);
					let c1 = contour[c1Idx];
					let c2 = contour[c2Idx];
					let s1 = (vert ? verticalSlope(lineLight(startPoint, c1)) : horizontalSlope(lineLight(startPoint, c1))) || mainSlope;
					let s2 = (vert ? verticalSlope(lineLight(startPoint, c2)) : horizontalSlope(lineLight(startPoint, c2))) || mainSlope;
					let s3 = (vert ? verticalSlope(lineLight(c1, c2)) : horizontalSlope(lineLight(c1, c2))) || mainSlope;
					let d1 = abs(mainSlope - s1);
					let d2 = abs(mainSlope - s2);
					let d3 = abs(mainSlope - s3);
					if (c1.kind === 1 && c2.kind === 2 && d1 < 0.02 && d2 < 0.02 && d3 < 0.02) {
						if (!redundantPoints.includes(c1Idx) && c1Idx !== 0 && c1Idx < contour.length - 1) redundantPoints.push(c1Idx);
						if (!redundantPoints.includes(c2Idx) && c2Idx !== 0 && c2Idx < contour.length - 1) redundantPoints.push(c2Idx);
					}
				}
			}
			// for (let i = 0; i < contour.length; i++) {
			// 	let curr = contour[i];
			// 	if (curr.kind !== 0) continue;
			// 	let prev = contour[previousNode(contour, i, false)];
			// 	let next = contour[nextNode(contour, i, false)];
			// 	let bear1 = bearing(lineLight(prev, curr));
			// 	let bear2 = bearing(lineLight(curr, next));
			// 	let rotation = abs(turn(bear1, bear2));
			// 	if (rotation >= 25 && rotation <= 150 && !corners.includes(i)) corners.push(i);
			// }
			if (redundantPoints.length > 0) {
				redundantPoints.reverse();
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
			}
			glyph.geometry.contours.push(newContour);
		}
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	// let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/5]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
		// if (name === "A") {
		// 	console.log(JSON.stringify(glyph));
		// }
		// if (glyph?.geometry?.contours) {
		// 	let data = JSON.stringify(glyph.geometry.contours);
		// 	let filename = `/home/mike/Resource-Han-Rounded/replacements/${name}.json`;
		// 	writeFile(filename, data);
		// }
		// console.log(name);
		progressTick(name);
		if (!references.extendSkip.includes(name)) checkSingleGlyph(glyph);
		// count++;
		// if (count % 1000 == 0) console.log("preExtension:", count, "glyphs processed.");
	}
	delete references.skipRedundantPoints;
}

module.exports = {
	preProcess
};
