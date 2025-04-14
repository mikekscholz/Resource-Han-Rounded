"use strict";

const { Ot } = require("ot-builder");
const geometric = require("geometric");
const ProgressBar = require('./node-progress');
const { angle, approximateBezier, base60, bearing, closestPointOnLine, findIntersection, horizontalSlope, isBetween, midpoint, pointOnLine, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc } = Math;

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

function extendLineRight(line, distance) {
	// let slope = slope(line);
	let x1 = line.p1.x;
	let y1 = line.p1.y;
	let x2 = line.p2.x;
	let y2 = line.p2.y;
	let alpha = Math.atan2(y2 - y1, x2 - x1);
	return {
		x: x2 + distance * Math.cos(alpha),
		y: y2 + distance * Math.sin(alpha)
	};
}

// function pointOnLine(points, line, tolerance = 0) {
// 	if (!Array.isArray(points)) points = [points];
// 	const { p1, p2 } = line;
// 	const A = p2.y - p1.y;
// 	const B = p1.x - p2.x;
// 	const C = p2.x * p1.y - p1.x * p2.y;
// 	for (const point of points) {
// 		const { x, y } = point;
// 		const distance = Math.abs(A * x + B * y + C) / Math.sqrt(A * A + B * B);
// 		if (distance > tolerance) return false;
// 	}
// 	return true;
// }

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
	
	function bearingLight(start, end) {
		let p1 = pointLight(start);
		let p2 = pointLight(end);
		return (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
	}

	function bearingHeavy(start, end) {
		let p1 = pointHeavy(start);
		let p2 = pointHeavy(end);
		return (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
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

	function isBetweenPoints(a, x, b) {
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
		
		if (glyph.name === "uni3041") {
			oldContours[0].splice(0, 1);
			oldContours[2].splice(0, 1);
			console.log(oldContours);
		}
		
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
				continue;
			}
			
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
					contour.shift();
				}
			}

			
			// fix all intersects like ㄥ to align rounded ends
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				if (
					circularArray(contour, idxP1).kind === 0 &&
					circularArray(contour, idxP1 - 1).kind === 0 &&
					circularArray(contour, idxP1 - 2).kind === 0 &&
					abs(originLight(circularArray(contour, idxP1).x) - originLight(circularArray(contour, idxP1 - 1).x)) <= 1 &&
					originLight(circularArray(contour, idxP1 - 1).x) < originLight(circularArray(contour, idxP1 - 2).x) &&
					originLight(circularArray(contour, idxP1).y) < originLight(circularArray(contour, idxP1 - 1).y) &&
					originLight(circularArray(contour, idxP1 - 1).y) < originLight(circularArray(contour, idxP1 - 2).y)
				) {
					for (let [idxC2, contour2] of oldContours.entries()) {
						if (idxC2 === idxC1 || contour2.length < 4) continue;
						let matched = false
						for (let idxP2 = 0; idxP2 < contour2.length; idxP2++) {
							if (
								originLight(contour[idxP1].x) === originLight(contour2[idxP2].x) &&
								abs(originLight(contour[idxP1].y) - originLight(contour2[idxP2].y)) <= 1
							) {
								let targetPoint = circularArray(contour2, idxP2 - 2).kind === 0 ? circularArray(contour2, idxP2 - 2) : circularArray(contour2, idxP2 - 3).kind === 0 ? circularArray(contour2, idxP2 - 3) :
								circularArray(contour2, idxP2 - 4).kind === 0 ? circularArray(contour2, idxP2 - 4) : 
								circularArray(contour, idxP1 - 1);
													
								oldContours[idxC1][circularIndex(contour, idxP1 - 1)] = {
									x: targetPoint.x,
									y: targetPoint.y,
									kind: circularArray(contour, idxP1 - 1).kind,
								};
								if (circularArray(contour2, idxP2 + 1).kind === 1) {
									oldContours[idxC2][circularIndex(contour2, idxP2 + 1)] = {
										x: circularArray(contour, idxP1 + 1).x,
										y: circularArray(contour, idxP1 + 1).y,
										kind: circularArray(contour2, idxP2 + 1).kind,
									};
								}
								if (JSON.stringify(contour2[idxP2]) === JSON.stringify(circularArray(contour2, idxP2 - 1))) {
									oldContours[idxC2][circularIndex(contour2, idxP2 - 1)] = {
										x: contour[idxP1].x,
										y: contour[idxP1].y,
										kind: contour2[circularIndex(contour2, idxP2 - 1)].kind,
									};
								}
								oldContours[idxC2][idxP2] = {
									x: contour[idxP1].x,
									y: contour[idxP1].y,
									kind: contour2[idxP2].kind,
								};
								if (name in references.skipRedundantPoints === false) {
									references.skipRedundantPoints[name] = [];
								}
								references.skipRedundantPoints[name].push(idxC1, idxC2);
								matched = true;
								break;
							}
						}
						if (matched) break;
					}
				}
			}
		}
		
		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			const newContour = [...contour];
			
			for (let idxP1 = 0; idxP1 < contour.length; idxP1++) {
				const bottomRightIdx = idxP1;
				const topRightIdx = nextNode(contour, bottomRightIdx);
				const topLeftIdx = nextNode(contour, topRightIdx);
				const bottomLeftIdx = previousNode(contour, bottomRightIdx);

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
								let ref = { "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "1" };
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
												ref = { "horizontal": idxC1, "horizontalBottomRight": idxP1, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "vertical": idxC3, "verticalTopRight": idxP3, "leftFallingType": "1" };
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
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "2" });
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
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "2b" });
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
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingType": "3" });
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
									refs.push({ "horizontal": idxC1, "horizontalBottomRight": idxP1, "horizontalSlope": horizontalBottomSlope, "leftFalling": idxC2, "leftFallingTopRight": idxP2, "leftFallingTopLeft":  circularIndex(contour2, idxP2 + 3), "leftFallingType": "4"});
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
							references.extendIgnoreContourIdx[name].push(idxC1, idxC2);
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
		
		let skipContours = [];
		if (name in references.skipRedundantPoints) {
			skipContours = references.skipRedundantPoints[name];
		}
		
		for (let [idxC1, contour] of oldContours.entries()) {
			if (contour.length < 5 || skipContours.includes(idxC1)) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			if (JSON.stringify(contour[0]) === JSON.stringify(circularArray(contour, - 1))) contour.pop()
			let newContour = [...contour];

		
			let redundantPoints = [];
		
		
			// ANCHOR - cleanup double flare serifs.
			// HOVERIMAGE - [img "preprocess-cleanup-doubleflare.svg"]

			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 5);
				let p7I = circularIndex(newContour, idxP1 + 6);
				let p8I = circularIndex(newContour, idxP1 + 7);
				let p9I = nextNode(newContour, p8I);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let p7 = newContour[p7I];
				let p8 = newContour[p8I];
				let p9 = newContour[p9I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b5L = bearingLight(p5, p6);
				let b6L = bearingLight(p6, p7);
				let b7L = bearingLight(p7, p8);
				let b8L = bearingLight(p8, p9);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				let b5H = bearingHeavy(p5, p6);
				let b6H = bearingHeavy(p6, p7);
				let b7H = bearingHeavy(p7, p8);
				let b8H = bearingHeavy(p8, p9);

				// let kinds = false;
				let kinds = (p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && p5.kind === 0 && p6.kind === 1 && p7.kind === 2 && p8.kind === 0 && (p9.kind === 1 || p9.kind === 0);
				if (
					(
						kinds &&
						distanceLight(p3, p4) > 0 &&
						distanceLight(p5, p6) > 0 &&
						angle(b3L, b4L).isBetween(-89,-75) &&
						angle(b4L, b5L).isBetween(-89,-75) &&
						distanceLight(p1, p4) < 200 &&
						distanceLight(p5, p8) < 200 &&
						turn(b0L, b1L).isBetween(-5, 9) &&
						turn(b8L, b7L).isBetween(-5, 9) &&
						turn(b1L, b3L).isBetween(-5, 30) &&
						turn(b5L, b7L).isBetween(0, 30) &&
						abs(angle(b1L, b7L)) < 8 &&
						angle(b1L, b4L).isBetween(-97,-85) &&
						angle(b4L, b7L).isBetween(-95,-85)
					) || 
					(
						kinds &&
						distanceHeavy(p3, p4) > 0 &&
						distanceHeavy(p5, p6) > 0 &&
						angle(b3H, b4H).isBetween(-89,-75) &&
						angle(b4H, b5H).isBetween(-89,-75) &&
						distanceHeavy(p1, p4) < 300 &&
						distanceHeavy(p5, p8) < 300 &&
						turn(b0H, b1H).isBetween(-5, 9) &&
						turn(b8H, b7H).isBetween(-5, 9) &&
						turn(b1H, b3H).isBetween(-5, 30) &&
						turn(b5H, b7H).isBetween(0, 30) &&
						abs(angle(b1H, b7H)) < 8 &&
						angle(b1H, b4H).isBetween(-98,-85) &&
						angle(b4H, b7H).isBetween(-95,-85)
					)
				) {
					let c1L = findIntersection([pointLight(p0), pointLight(p1), pointLight(p4), pointLight(p5)]);
					let c1H = findIntersection([pointHeavy(p0), pointHeavy(p1), pointHeavy(p4), pointHeavy(p5)]);
					let c2L = findIntersection([pointLight(p9), pointLight(p8), pointLight(p4), pointLight(p5)]);
					let c2H = findIntersection([pointHeavy(p9), pointHeavy(p8), pointHeavy(p4), pointHeavy(p5)]);

					newContour[p4I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					
					newContour[p5I] = {
						x: makeVariance(c2L.x, c2H.x),
						y: makeVariance(c2L.y, c2H.y),
						kind: 0,
					};
					let indices = [p1I, p2I, p3I, p6I, p7I, p8I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}
			
			// ANCHOR - cleanup concave square corners.
			// HOVERIMAGE - [img "preprocess-cleanup-concavesquare.svg"]

			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 5);
				let p7I = circularIndex(newContour, idxP1 + 6);
				let p8I = circularIndex(newContour, idxP1 + 7);
				let p9I = nextNode(newContour, p8I);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let p7 = newContour[p7I];
				let p8 = newContour[p8I];
				let p9 = newContour[p9I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b5L = bearingLight(p5, p6);
				let b6L = bearingLight(p6, p7);
				let b7L = bearingLight(p8, p7);
				let b8L = bearingLight(p9, p8);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				let b5H = bearingHeavy(p5, p6);
				let b6H = bearingHeavy(p6, p7);
				let b7H = bearingHeavy(p8, p7);
				let b8H = bearingHeavy(p9, p8);
				let kinds2 = (p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && p5.kind === 1 && p6.kind === 2 && p7.kind === 0 && (p8.kind === 1 || p8.kind === 0);
				if (
					(
						kinds2 &&
						distanceLight(p3, p4) > 0 &&
						distanceLight(p4, p5) > 0 &&
						distanceLight(p1, p4) < 200 &&
						distanceLight(p4, p7) < 200 &&
						angle(b3L, b4L).isBetween(-91,-75) &&
						abs(turn(b0L, b1L)) < 8 &&
						abs(turn(bearingLight(p7, p8), b6L)) < 8 &&
						angle(b0L, bearingLight(p7, p8)).isBetween(-95,-85)
					) || 
					(
						kinds2 &&
						distanceHeavy(p3, p4) > 0 &&
						distanceHeavy(p4, p5) > 0 &&
						distanceHeavy(p1, p4) < 300 &&
						distanceHeavy(p4, p7) < 300 &&
						angle(b3H, b4H).isBetween(-91,-75) &&
						abs(turn(b0H, b1H)) < 8 &&
						abs(turn(bearingHeavy(p7, p8), b6H)) < 8 &&
						angle(b0H, bearingHeavy(p7, p8)).isBetween(-95,-85)
					)
				) {
					let c1L = findIntersection([pointLight(p0), pointLight(p1), pointLight(p7), pointLight(p8)]);
					let c1H = findIntersection([pointHeavy(p0), pointHeavy(p1), pointHeavy(p7), pointHeavy(p8)]);
					newContour[p4I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					let indices = [p1I, p2I, p3I, p5I, p6I, p7I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}
				
			// ANCHOR - cleanup flare serif segment end.
			// HOVERIMAGE - [img "preprocess-cleanup-flare-end.svg"]

			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let b0L = bearingLight(p0, p1);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				// let kinds3 = false;
				let kinds3 = (p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && (p5.kind === 1 || p5.kind === 0);
				if (
					(
						kinds3 &&
						angle(b3L, b4L).isBetween(-89,-70) &&
						angle(b0L, b4L).isBetween(-95,-85) &&
						pointOnLine([pointLight(p1), pointLight(p2)], lineLight(p0, p4), 2) &&
						pointOnLine(pointLight(p3), lineLight(p0, p4), 6) &&
						distanceLight(p0, p4) < 200
					) && 
					(
						kinds3 &&
						angle(b3H, b4H).isBetween(-89,-70) &&
						angle(b0H, b4H).isBetween(-95,-85) &&
						pointOnLine([pointHeavy(p1), pointHeavy(p2)], lineHeavy(p0, p4), 4) &&
						pointOnLine(pointHeavy(p3), lineHeavy(p0, p4), 8) &&
						distanceHeavy(p0, p4) < 300
					)
				) {
					let c1L = findIntersection([pointLight(p0), pointLight(p1), pointLight(p4), pointLight(p5)]);
					let c1H = findIntersection([pointHeavy(p0), pointHeavy(p1), pointHeavy(p4), pointHeavy(p5)]);
					newContour[p4I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					let indices = [p1I, p2I, p3I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}
			
			// ANCHOR - cleanup flare serif segment start.
			// HOVERIMAGE - [img "preprocess-cleanup-flare-start.svg"]
			
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = previousNode(newContour, idxP1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p6I = circularIndex(newContour, idxP1 + 4);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let p6 = newContour[p6I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b4H = bearingHeavy(p4, p5);
				// let kinds4 = false
				let kinds4 = p0.kind === 0 && p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && (p5.kind === 1 || p5.kind === 0);
				// let kinds4 = (p0.kind === 2 || p0.kind === 0) &&
				if (
					(
						// false &&
						kinds4 &&
						angle(b1L, b2L).isBetween(-89,-70) &&
						angle(b1L, b4L).isBetween(-95,-85) &&
						turn(b2L, b4L).isBetween(0, 30) &&
						pointOnLine(pointLight(p3), lineLight(p2, p6), 12) &&
						pointOnLine([pointLight(p4), pointLight(p5)], lineLight(p2, p6), 12) &&
						distanceLight(p2, p5) < 200 &&
						angle(b0L, b1L).isBetween(-95, -70)
						// angle(b0L, b1L) + angle(b1L, b2L).isBetween(-179,-160)
					) && 
					(
						kinds4 &&
						angle(b1H, b2H).isBetween(-89,-70) &&
						angle(b1H, b4H).isBetween(-95,-85) &&
						turn(b2L, b4L).isBetween(0, 30) &&
						pointOnLine(pointHeavy(p3), lineHeavy(p2, p6), 12) &&
						pointOnLine([pointHeavy(p4), pointHeavy(p5)], lineHeavy(p2, p6), 12) &&
						distanceHeavy(p2, p5) < 300 &&
						angle(b0H, b1H).isBetween(-95, -70)
						// angle(b0H, b1H) + angle(b1H, b2H).isBetween(-179,-160)
					)
				) {
					let c2L = findIntersection([pointLight(p1), pointLight(p2), pointLight(p5), pointLight(p6)]);
					let c2H = findIntersection([pointHeavy(p1), pointHeavy(p2), pointHeavy(p5), pointHeavy(p6)]);
					if (distanceLight(p1, c2L) < 60 && distanceHeavy(p1, c2H) < 200) {
						newContour[p2I] = {
							x: makeVariance(c2L.x, c2H.x),
							y: makeVariance(c2L.y, c2H.y),
							kind: 0,
						};
						let indices = [p3I, p4I, p5I];
						for (const idx of indices) {
							if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
						}
					}
				}
 			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}
			
			// ANCHOR - cleanup degenerate curve control points.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let b1L = bearingLight(p1, p2);
				let b3L = bearingLight(p3, p4);
				let b1H = bearingHeavy(p1, p2);
				let b3H = bearingHeavy(p3, p4);
				let distL = distanceLight(p1, p4);
				let distH = distanceHeavy(p1, p4);
				let toleranceL = distL * 0.022;
				let toleranceH = distH * 0.03;
				if (
					p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && (b1H.isBetween(140, 165) === false || b3H.isBetween(165, 185) === false) &&
					(
						(
							distL < 280 && distH < 280 && (turn(b1L, b3L).isBetween(-5, 5) || turn(b1H, b3H).isBetween(-5, 5)) &&
							pointOnLine([pointLight(p2), pointLight(p3)], lineLight(p1, p4), toleranceL) && 
							pointOnLine([pointHeavy(p2), pointHeavy(p3)], lineHeavy(p1, p4), toleranceH)
						) || (
							pointOnLine([pointLight(p2), pointLight(p3)], lineLight(p1, p4), 2) && 
							pointOnLine([pointHeavy(p2), pointHeavy(p3)], lineHeavy(p1, p4), 3)
						)
						 || (
							(pointOnLine(pointLight(p2), lineLight(p1, p4), 1) || pointOnLine(pointHeavy(p2), lineHeavy(p1, p4), 1)) &&
							(pointOnLine(pointLight(p3), lineLight(p1, p4), 1) || pointOnLine(pointHeavy(p3), lineHeavy(p1, p4), 1))
						)
					)
				) {
					let indices = [p2I, p3I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}
			
			// ANCHOR - cleanup collinear corner points.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				if (
					p1.kind === 0 && p2.kind === 0 && p3.kind === 0 &&
					distanceLight(p1, p2) > 10 && distanceLight(p2, p3) > 10 &&
					distanceHeavy(p1, p2) > 10 && distanceHeavy(p2, p3) > 10 &&
					// pointOnLine(pointLight(p2), lineLight(p1, p3), 7) && 
					// pointOnLine(pointHeavy(p2), lineHeavy(p1, p3), 8)
					turn(b1L, b2L).isBetween(-5, 3.5) &&
					turn(b1H, b2H).isBetween(-7, 5)
				) {
					if (!redundantPoints.includes(p2I)) redundantPoints.push(p2I);
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}

			// ANCHOR - cleanup degenerate curve control points again resulting from corner cleanup.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let kinds = p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0;
				if (
					kinds && 
					pointOnLine([pointLight(p2), pointLight(p3)], lineLight(p1, p4), 1) && 
					pointOnLine([pointHeavy(p2), pointHeavy(p3)], lineHeavy(p1, p4), 2)
				) {
					let indices = [p2I, p3I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}
			
			// ANCHOR - cleanup tapered endcaps.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = circularIndex(newContour, idxP1);
				let p1I = nextNode(newContour, p0I);
				let p2I = nextNode(newContour, p1I);
				let p3I = nextNode(newContour, p2I);
				let p4I = nextNode(newContour, p3I);
				let p5I = nextNode(newContour, p4I);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				// HOVERIMAGE - [img "preprocess-cleanup-tapered-endcap.svg"]
				if (name === "uni3041") {
					console.log("-----------------------------------");
					console.log("contour", idxC1);
					console.log("point0", idxP1);
					console.log("turn01L", turn(b0L, b1L));
					console.log("turn01H", turn(b0H, b1H));
					console.log("angle2L", angle(b1L, b2L));
					console.log("angle2H", angle(b1H, b2H));
					console.log("angle3L", angle(b2L, b3L));
					console.log("angle3H", angle(b2H, b3H));
					console.log("turn34L", turn(b3L, b4L));
					console.log("turn34H", turn(b3H, b4H));
				}
				if (
					// false &&
					p1.kind === 0 && p2.kind === 0 && p3.kind === 0 && p4.kind === 0 &&
					distanceLight(p1, p2).isBetween(5,200) &&
					distanceLight(p3, p4).isBetween(5,200) &&
					distanceHeavy(p1, p2).isBetween(5,200) &&
					distanceHeavy(p3, p4).isBetween(5,200) &&
					approxEq(distanceLight(p2, p3), params.strokeWidth.light, 20) &&
					approxEq(distanceHeavy(p2, p3), params.strokeWidth.heavy, 48) &&
					turn(b0L, b1L).isBetween(-2, 30) &&
					turn(b0H, b1H).isBetween(0, 30) &&
					angle(b1L, b2L).isBetween(-95,-70) &&
					angle(b2L, b3L).isBetween(-95,-70) &&
					angle(b1L, b2L) + angle(b2L, b3L).isBetween(-182, -100) &&
					angle(b1H, b2H).isBetween(-95,-70) &&
					angle(b2H, b3H).isBetween(-95,-70) &&
					angle(b1H, b2H) + angle(b2H, b3H).isBetween(-182, -100) &&
					turn(b3L, b4L).isBetween(0, 30) &&
					turn(b3H, b4H).isBetween(0, 30)
				) {
					let c1L = closestPointOnLine(pointLight(p1), lineLight(p2, p3));
					let c1H = closestPointOnLine(pointHeavy(p1), lineHeavy(p2, p3));
					let c2L = closestPointOnLine(pointLight(p4), lineLight(p2, p3));
					let c2H = closestPointOnLine(pointHeavy(p4), lineHeavy(p2, p3));
					newContour[p2I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					newContour[p3I] = {
						x: makeVariance(c2L.x, c2H.x),
						y: makeVariance(c2L.y, c2H.y),
						kind: 0,
					};
					let indices = [p1I, p4I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}
			
			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
				redundantPoints = [];
			}
			
			// NOTE - cleanup tapered segment end.
			for (let idxP1 = 0; idxP1 < newContour.length; idxP1++) {
				let p0I = circularIndex(newContour, idxP1 - 1);
				let p1I = circularIndex(newContour, idxP1);
				let p2I = circularIndex(newContour, idxP1 + 1);
				let p3I = circularIndex(newContour, idxP1 + 2);
				let p4I = circularIndex(newContour, idxP1 + 3);
				let p5I = circularIndex(newContour, idxP1 + 4);
				let p0 = newContour[p0I];
				let p1 = newContour[p1I];
				let p2 = newContour[p2I];
				let p3 = newContour[p3I];
				let p4 = newContour[p4I];
				let p5 = newContour[p5I];
				let b0L = bearingLight(p0, p1);
				let b1L = bearingLight(p1, p2);
				let b2L = bearingLight(p2, p3);
				let b3L = bearingLight(p3, p4);
				let b4L = bearingLight(p4, p5);
				let b0H = bearingHeavy(p0, p1);
				let b1H = bearingHeavy(p1, p2);
				let b2H = bearingHeavy(p2, p3);
				let b3H = bearingHeavy(p3, p4);
				let b4H = bearingHeavy(p4, p5);
				if (
					(p0.kind === 2 || p0.kind === 0) && p1.kind === 0 && p2.kind === 0 && p3.kind === 0 &&
					distanceLight(p1, p2).isBetween(5,200) &&
					distanceHeavy(p1, p2).isBetween(5,200) &&
					approxEq(distanceLight(p2, p3), params.strokeWidth.light, 20) &&
					approxEq(distanceHeavy(p2, p3), params.strokeWidth.heavy, 48) &&
					turn(b0L, b1L).isBetween(-2, 30) &&
					turn(b0H, b1H).isBetween(-3, 30) &&
					angle(b1L, b2L).isBetween(-89,-75) &&
					angle(b0L, b2L).isBetween(-95,-80) &&
					angle(b1H, b2H).isBetween(-89,-75) &&
					angle(b0H, b2H).isBetween(-95,-80)
				) {
					let c1L = closestPointOnLine(pointLight(p1), lineLight(p2, p3));
					let c1H = closestPointOnLine(pointHeavy(p1), lineHeavy(p2, p3));
					newContour[p2I] = {
						x: makeVariance(c1L.x, c1H.x),
						y: makeVariance(c1L.y, c1H.y),
						kind: 0,
					};
					let indices = [p1I];
					for (const idx of indices) {
						if (!redundantPoints.includes(idx)) redundantPoints.push(idx);
					}
				}
			}
			
			if (redundantPoints.length > 0) {
				redundantPoints.sort((a,b) => b - a);
				for (const i of redundantPoints) {
					newContour.splice(i, 1);
				}
			}
			
			if (newContour[0].kind === 1) {
				newContour.unshift(newContour.pop());
			}
			
			if (newContour[0].kind === 2) {
				newContour.unshift(newContour.pop());
				newContour.unshift(newContour.pop());
			}
			
			if (circularArray(newContour, -1).kind !== 0) newContour = [...newContour, newContour[0]];
			
			// ANCHOR - fix upward right hooks
			if (newContour.length > 12) {
				for (let idxP = 0; idxP < newContour.length; idxP++) {
					let p0 = circularArray(newContour, previousNode(newContour, idxP));
					let p1 = circularArray(newContour, idxP);
					let p2 = circularArray(newContour, idxP + 1);
					let p3 = circularArray(newContour, idxP + 2);
					let p4 = circularArray(newContour, idxP + 3);
					let p5 = circularArray(newContour, idxP + 4);
					let p6 = circularArray(newContour, idxP + 5);
					let p7 = circularArray(newContour, idxP + 6);
					let p8 = circularArray(newContour, idxP + 7);
					let p9 = circularArray(newContour, idxP + 8);
					let p10 = circularArray(newContour, idxP + 9);
					let p11 = circularArray(newContour, idxP + 10);
					if (p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && p5.kind === 1 && p6.kind === 2 && p7.kind === 0 && p8.kind === 1 && p9.kind === 2 && p10.kind === 0) {
						let p0p1Bearing = bearing(lineHeavy(p0, p1));
						let p1p2Bearing = bearing(lineHeavy(p1, p2));
						let p3p4Bearing = bearing(lineHeavy(p3, p4));
						let p4p5Bearing = bearing(lineHeavy(p4, p5));
						let p6p7Bearing = bearing(lineHeavy(p6, p7));
						let p7p8Bearing = bearing(lineHeavy(p7, p8));
						let p10p9Bearing = bearing(lineHeavy(p10, p9));
						let p11p10Bearing = bearing(lineHeavy(p11, p10));
						let corner1Angle = angle(p3p4Bearing, p4p5Bearing);
						let corner2Angle = angle(p6p7Bearing, p7p8Bearing);
						let combinedAngle = corner1Angle + corner2Angle;
						let p1p2Distance = distanceHeavy(p1, p2);
						let p1p4Distance = distanceHeavy(p1, p4);
						let p4p7DistanceL = distanceLight(p4, p7);
						let p4p7DistanceH = distanceHeavy(p4, p7);
						let hookHeight = originHeavy(p7.y) - originHeavy(p10.y);
						let hookWidth = originHeavy(p4.x) - originHeavy(p7.x);
						let strokeWidth = originHeavy(p10.y) - originHeavy(p1.y);
						let p2AngleCorrectionL = turn(bearing(lineLight(p0, p1)), bearing(lineLight(p1, p2)));
						let p2AngleCorrectionH = turn(bearing(lineHeavy(p0, p1)), bearing(lineHeavy(p1, p2)));
						let p3AngleCorrectionL = turn(bearing(lineLight(p8, p7)), bearing(lineLight(p3, p4)));
						let p3AngleCorrectionH = turn(bearing(lineHeavy(p8, p7)), bearing(lineHeavy(p3, p4)));
						let p9AngleCorrectionL = turn(bearing(lineLight(p11, p10)), bearing(lineLight(p10, p9)));
						let p9AngleCorrectionH = turn(bearing(lineHeavy(p11, p10)), bearing(lineHeavy(p10, p9)));
						if (
							hookHeight > 10 &&
							p0p1Bearing.isBetween(85, 132) &&
							p1p2Bearing.isBetween(85, 132) &&
							p10p9Bearing.isBetween(85, 125) &&
							p11p10Bearing.isBetween(62, 125) &&
							p1p2Distance.isBetween(25, 200) &&
							(p3p4Bearing.isBetween(0, 15) || p3p4Bearing.isBetween(358, 360)) &&
							corner1Angle.isBetween(-145, -85) &&
							corner2Angle.isBetween(-75, -23) &&
							combinedAngle.isBetween(-170, -142) &&
							p4p7DistanceH.isBetween(60, 160) &&
							p1p4Distance.isBetween(80, 330)
						) {
							let p0I = previousNode(newContour, idxP);
							let p1I = circularIndex(newContour, idxP);
							let p2I = circularIndex(newContour, idxP + 1);
							let p3I = circularIndex(newContour, idxP + 2);
							let p4I = circularIndex(newContour, idxP + 3);
							let p5I = circularIndex(newContour, idxP + 4);
							let p6I = circularIndex(newContour, idxP + 5);
							let p7I = circularIndex(newContour, idxP + 6);
							let p8I = circularIndex(newContour, idxP + 7);
							let p9I = circularIndex(newContour, idxP + 8);
							let p10I = circularIndex(newContour, idxP + 9);
							let p11I = circularIndex(newContour, idxP + 10);
							let p2rL = geometric.pointRotate(point2GeoJsonLight(p2), p2AngleCorrectionL, point2GeoJsonLight(p1));
							let p2rH = geometric.pointRotate(point2GeoJsonHeavy(p2), p2AngleCorrectionH, point2GeoJsonHeavy(p1));
							let p3rL = geometric.pointRotate(point2GeoJsonLight(p3), p3AngleCorrectionL, point2GeoJsonLight(p4));
							let p3rH = geometric.pointRotate(point2GeoJsonHeavy(p3), p3AngleCorrectionH, point2GeoJsonHeavy(p4));
							let p9rL = geometric.pointRotate(point2GeoJsonLight(p9), p9AngleCorrectionL, point2GeoJsonLight(p10));
							let p9rH = geometric.pointRotate(point2GeoJsonHeavy(p9), p9AngleCorrectionH, point2GeoJsonHeavy(p10));
							newContour[p2I] = {
								x: makeVariance(p2rL[0], p2rH[0]),
								y: makeVariance(p2rL[1], p2rH[1]),
								kind: newContour[p2I].kind,
							};
							newContour[p3I] = {
								x: makeVariance(p3rL[0], p3rH[0]),
								y: makeVariance(p3rL[1], p3rH[1]),
								kind: 2,
							};
							let p7p8midH = midpoint(pointHeavy(p7), pointHeavy(p8));
							let p4L = closestPointOnLine(pointLight(p7), lineLight(newContour[p3I], p4));
							let p4H = closestPointOnLine(p7p8midH, lineHeavy(newContour[p3I], p4));
							let p7L = closestPointOnLine(pointLight(p4), lineLight(p8, p7));
							let p7H = closestPointOnLine(pointHeavy(p4), lineHeavy(p8, p7));
							if (!pointOnLine(p7H, lineHeavy(p7, p8), 0, true)){
								newContour[p4I] = {
									x: makeVariance(p4L.x, p4H.x),
									y: makeVariance(p4L.y, p4H.y),
									kind: 0,
								};
								newContour[p7I] = {
									x: makeVariance(originLight(p7.x), p7p8midH.x),
									y: makeVariance(originLight(p7.y), p7p8midH.y),
									kind: 0,
								};
							} else {
								newContour[p7I] = {
									x: makeVariance(p7L.x, p7H.x),
									y: makeVariance(p7L.y, p7H.y),
									kind: 0,
								};
							}
							let p4p7DistanceNewH = distanceHeavy(newContour[p4I], newContour[p7I]);
							let p4p7OffsetH = p4p7DistanceNewH < p4p7DistanceH ? (p4p7DistanceH * 0.9) - p4p7DistanceNewH : 0;
							if (p4p7OffsetH) {
								let p4p7AngleH = geometric.lineAngle([point2GeoJsonHeavy(newContour[p7I]),point2GeoJsonHeavy(newContour[p4I])]);
								let p4tL = pointLight(newContour[p4I]);
								let p4tH = geometric.pointTranslate(point2GeoJsonHeavy(newContour[p4I]), p4p7AngleH, p4p7OffsetH);
								let p3tL = pointLight(newContour[p3I]);
								let p3tH = geometric.pointTranslate(point2GeoJsonHeavy(newContour[p3I]), p4p7AngleH, p4p7OffsetH);
								newContour[p4I] = {
									x: makeVariance(p4tL.x, p4tH[0]),
									y: makeVariance(p4tL.y, p4tH[1]),
									kind: 0,
								};
								newContour[p3I] = {
									x: makeVariance(p3tL.x, p3tH[0]),
									y: makeVariance(p3tL.y, p3tH[1]),
									kind: 2,
								};
							}
							
							let p5L = extendLineRight(lineLight(newContour[p3I], newContour[p4I]), p4p7DistanceL * 0.6);
							let p5H = extendLineRight(lineHeavy(newContour[p3I], newContour[p4I]), p4p7DistanceH * 0.6);
							let p6L = extendLineRight(lineLight(newContour[p8I], newContour[p7I]), p4p7DistanceL * 0.6);
							let p6H = extendLineRight(lineHeavy(newContour[p8I], newContour[p7I]), p4p7DistanceH * 0.6);
							newContour[p5I] = {
								x: makeVariance(p5L.x, p5H.x),
								y: makeVariance(p5L.y, p5H.y),
								kind: 1,
							};
							newContour[p6I] = {
								x: makeVariance(p6L.x, p6H.x),
								y: makeVariance(p6L.y, p6H.y),
								kind: 2,
							};
							newContour[p9I] = {
								x: makeVariance(p9rL[0], p9rH[0]),
								y: makeVariance(p9rL[1], p9rH[1]),
								kind: newContour[p9I].kind,
							};
							if (p4p7OffsetH) {
								for (let i = 0; i < newContour.length; i++) {
									let pointL = pointLight(newContour[i]);
									let pointH = pointHeavy(newContour[i]);
									newContour[i] = {
										x: makeVariance(pointL.x, pointH.x - p4p7OffsetH),
										y: makeVariance(pointL.y, pointH.y),
										kind: newContour[i].kind,
									};
								}
							}
							// newContour[p0I] = {
							// 	x: makeVariance(originLight(contour[p0I].x), originHeavy(contour[p0I].x)),
							// 	y: makeVariance(originLight(contour[p0I].y), originHeavy(contour[p0I].y)),
							// 	kind: contour[p0I].kind,
							// };
							// newContour[p1I] = {
							// 	x: makeVariance(originLight(contour[p1I].x), originHeavy(contour[p1I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p1I].y), originHeavy(contour[p1I].y)),
							// 	kind: contour[p1I].kind,
							// };
							// newContour[p2I] = {
							// 	x: makeVariance(originLight(contour[p2I].x), originHeavy(contour[p2I].x)),
							// 	y: makeVariance(originLight(contour[p2I].y), originHeavy(contour[p2I].y)),
							// 	kind: contour[p2I].kind,
							// };
							// newContour[p3I] = {
							// 	x: makeVariance(originLight(contour[p3I].x), originHeavy(contour[p4I].x) + (xOffset * 0.2)),
							// 	y: makeVariance(originLight(contour[p3I].y), originHeavy(contour[p3I].y) + yOffset),
							// 	kind: contour[p3I].kind,
							// };
							// newContour[p4I] = {
							// 	x: makeVariance(originLight(contour[p4I].x), originHeavy(contour[p4I].x) + (xOffset * 0.2)),
							// 	y: makeVariance(originLight(contour[p4I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p4I].kind,
							// };
							// newContour[p5I] = {
							// 	x: makeVariance(originLight(contour[p5I].x), originHeavy(contour[p5I].x)),
							// 	y: makeVariance(originLight(contour[p5I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p5I].kind,
							// };
							// newContour[p6I] = {
							// 	x: makeVariance(originLight(contour[p6I].x), originHeavy(contour[p6I].x)),
							// 	y: makeVariance(originLight(contour[p6I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p6I].kind,
							// };
							// newContour[p7I] = {
							// 	x: makeVariance(originLight(contour[p7I].x), originHeavy(contour[p7I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p7I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p7I].kind,
							// };
							// newContour[p8I] = {
							// 	x: makeVariance(originLight(contour[p8I].x), originHeavy(contour[p7I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p8I].y), originHeavy(contour[p8I].y) + (yOffset * 0.4)),
							// 	kind: contour[p8I].kind,
							// };
							// newContour[p9I] = {
							// 	x: makeVariance(originLight(contour[p9I].x), originHeavy(contour[p9I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p9I].y), originHeavy(contour[p9I].y)),
							// 	kind: contour[p9I].kind,
							// };
							// newContour[p10I] = {
							// 	x: makeVariance(originLight(contour[p10I].x), originHeavy(contour[p10I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p10I].y), originHeavy(contour[p10I].y)),
							// 	kind: contour[p10I].kind,
							// };
							// newContour[p11I] = {
							// 	x: makeVariance(originLight(contour[p11I].x), originHeavy(contour[p11I].x)),
							// 	y: makeVariance(originLight(contour[p11I].y), originHeavy(contour[p11I].y)),
							// 	kind: contour[p11I].kind,
							// };
							break;
						}
					}
				}
			}
			
			// ANCHOR - fix downward j hooks
			if (newContour.length > 12) {
				for (let idxP = 0; idxP < newContour.length; idxP++) {
					let p0 = circularArray(newContour, previousNode(newContour, idxP));
					let p1 = circularArray(newContour, idxP);
					let p2 = circularArray(newContour, idxP + 1);
					let p3 = circularArray(newContour, idxP + 2);
					let p4 = circularArray(newContour, idxP + 3);
					let p5 = circularArray(newContour, idxP + 4);
					let p6 = circularArray(newContour, idxP + 5);
					let p7 = circularArray(newContour, idxP + 6);
					let p8 = circularArray(newContour, idxP + 7);
					let p9 = circularArray(newContour, idxP + 8);
					let p10 = circularArray(newContour, idxP + 9);
					let p11 = circularArray(newContour, idxP + 10);
					if (p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0 && p5.kind === 1 && p6.kind === 2 && p7.kind === 0 && p8.kind === 1 && p9.kind === 2 && p10.kind === 0) {
						let p0p1Bearing = bearing(lineHeavy(p0, p1));
						let p1p2Bearing = bearing(lineHeavy(p1, p2));
						let p3p4Bearing = bearing(lineHeavy(p3, p4));
						let p4p5Bearing = bearing(lineHeavy(p4, p5));
						let p6p7Bearing = bearing(lineHeavy(p6, p7));
						let p7p8Bearing = bearing(lineHeavy(p7, p8));
						let p10p9Bearing = bearing(lineHeavy(p10, p9));
						let p11p10Bearing = bearing(lineHeavy(p11, p10));
						let corner1Angle = angle(p3p4Bearing, p4p5Bearing);
						let corner2Angle = angle(p6p7Bearing, p7p8Bearing);
						let combinedAngle = corner1Angle + corner2Angle;
						let p1p2Distance = distanceHeavy(p1, p2);
						let p1p4Distance = distanceHeavy(p1, p4);
						let p4p7DistanceL = distanceLight(p4, p7);
						let p4p7DistanceH = distanceHeavy(p4, p7);
						let hookHeight = originHeavy(p7.y) - originHeavy(p10.y);
						let hookWidth = originHeavy(p4.x) - originHeavy(p7.x);
						let strokeWidth = originHeavy(p10.y) - originHeavy(p1.y);
						let p2AngleCorrectionL = turn(bearing(lineLight(p0, p1)), bearing(lineLight(p1, p2)));
						let p2AngleCorrectionH = turn(bearing(lineHeavy(p0, p1)), bearing(lineHeavy(p1, p2)));
						let p3AngleCorrectionL = turn(bearing(lineLight(p8, p7)), bearing(lineLight(p3, p4)));
						let p3AngleCorrectionH = turn(bearing(lineHeavy(p8, p7)), bearing(lineHeavy(p3, p4)));
						let p9AngleCorrectionL = turn(bearing(lineLight(p11, p10)), bearing(lineLight(p10, p9)));
						let p9AngleCorrectionH = turn(bearing(lineHeavy(p11, p10)), bearing(lineHeavy(p10, p9)));
						if (
							hookHeight > 10 &&
							p0p1Bearing.isBetween(85, 132) &&
							p1p2Bearing.isBetween(85, 132) &&
							p10p9Bearing.isBetween(85, 125) &&
							p11p10Bearing.isBetween(85, 125) &&
							p1p2Distance.isBetween(25, 200) &&
							(p3p4Bearing.isBetween(0, 15) || p3p4Bearing.isBetween(358, 360)) &&
							corner1Angle.isBetween(-145, -85) &&
							corner2Angle.isBetween(-75, -25) &&
							combinedAngle.isBetween(-170, -145) &&
							p4p7DistanceH.isBetween(60, 160) &&
							p1p4Distance.isBetween(80, 330)
						) {
							let p0I = previousNode(newContour, idxP);
							let p1I = circularIndex(newContour, idxP);
							let p2I = circularIndex(newContour, idxP + 1);
							let p3I = circularIndex(newContour, idxP + 2);
							let p4I = circularIndex(newContour, idxP + 3);
							let p5I = circularIndex(newContour, idxP + 4);
							let p6I = circularIndex(newContour, idxP + 5);
							let p7I = circularIndex(newContour, idxP + 6);
							let p8I = circularIndex(newContour, idxP + 7);
							let p9I = circularIndex(newContour, idxP + 8);
							let p10I = circularIndex(newContour, idxP + 9);
							let p11I = circularIndex(newContour, idxP + 10);
							let p2rL = geometric.pointRotate(point2GeoJsonLight(p2), p2AngleCorrectionL, point2GeoJsonLight(p1));
							let p2rH = geometric.pointRotate(point2GeoJsonHeavy(p2), p2AngleCorrectionH, point2GeoJsonHeavy(p1));
							let p3rL = geometric.pointRotate(point2GeoJsonLight(p3), p3AngleCorrectionL, point2GeoJsonLight(p4));
							let p3rH = geometric.pointRotate(point2GeoJsonHeavy(p3), p3AngleCorrectionH, point2GeoJsonHeavy(p4));
							let p9rL = geometric.pointRotate(point2GeoJsonLight(p9), p9AngleCorrectionL, point2GeoJsonLight(p10));
							let p9rH = geometric.pointRotate(point2GeoJsonHeavy(p9), p9AngleCorrectionH, point2GeoJsonHeavy(p10));
							newContour[p2I] = {
								x: makeVariance(p2rL[0], p2rH[0]),
								y: makeVariance(p2rL[1], p2rH[1]),
								kind: newContour[p2I].kind,
							};
							newContour[p3I] = {
								x: makeVariance(p3rL[0], p3rH[0]),
								y: makeVariance(p3rL[1], p3rH[1]),
								kind: 2,
							};
							let p7p8midH = midpoint(pointHeavy(p7), pointHeavy(p8));
							let p4L = closestPointOnLine(pointLight(p7), lineLight(newContour[p3I], p4));
							let p4H = closestPointOnLine(p7p8midH, lineHeavy(newContour[p3I], p4));
							let p7L = closestPointOnLine(pointLight(p4), lineLight(p8, p7));
							let p7H = closestPointOnLine(pointHeavy(p4), lineHeavy(p8, p7));
							if (!pointOnLine(p7H, lineHeavy(p7, p8), 0, true)){
								newContour[p4I] = {
									x: makeVariance(p4L.x, p4H.x),
									y: makeVariance(p4L.y, p4H.y),
									kind: 0,
								};
								newContour[p7I] = {
									x: makeVariance(originLight(p7.x), p7p8midH.x),
									y: makeVariance(originLight(p7.y), p7p8midH.y),
									kind: 0,
								};
							} else {
								newContour[p7I] = {
									x: makeVariance(p7L.x, p7H.x),
									y: makeVariance(p7L.y, p7H.y),
									kind: 0,
								};
							}
							let p4p7DistanceNewH = distanceHeavy(newContour[p4I], newContour[p7I]);
							let p4p7OffsetH = p4p7DistanceNewH < p4p7DistanceH ? (p4p7DistanceH * 0.9) - p4p7DistanceNewH : 0;
							if (p4p7OffsetH) {
								let p4p7AngleH = geometric.lineAngle([point2GeoJsonHeavy(newContour[p7I]),point2GeoJsonHeavy(newContour[p4I])]);
								let p4tL = pointLight(newContour[p4I]);
								let p4tH = geometric.pointTranslate(point2GeoJsonHeavy(newContour[p4I]), p4p7AngleH, p4p7OffsetH);
								let p3tL = pointLight(newContour[p3I]);
								let p3tH = geometric.pointTranslate(point2GeoJsonHeavy(newContour[p3I]), p4p7AngleH, p4p7OffsetH);
								newContour[p4I] = {
									x: makeVariance(p4tL.x, p4tH[0]),
									y: makeVariance(p4tL.y, p4tH[1]),
									kind: 0,
								};
								newContour[p3I] = {
									x: makeVariance(p3tL.x, p3tH[0]),
									y: makeVariance(p3tL.y, p3tH[1]),
									kind: 2,
								};
							}
							
							let p5L = extendLineRight(lineLight(newContour[p3I], newContour[p4I]), p4p7DistanceL * 0.6);
							let p5H = extendLineRight(lineHeavy(newContour[p3I], newContour[p4I]), p4p7DistanceH * 0.6);
							let p6L = extendLineRight(lineLight(newContour[p8I], newContour[p7I]), p4p7DistanceL * 0.6);
							let p6H = extendLineRight(lineHeavy(newContour[p8I], newContour[p7I]), p4p7DistanceH * 0.6);
							newContour[p5I] = {
								x: makeVariance(p5L.x, p5H.x),
								y: makeVariance(p5L.y, p5H.y),
								kind: 1,
							};
							newContour[p6I] = {
								x: makeVariance(p6L.x, p6H.x),
								y: makeVariance(p6L.y, p6H.y),
								kind: 2,
							};
							newContour[p9I] = {
								x: makeVariance(p9rL[0], p9rH[0]),
								y: makeVariance(p9rL[1], p9rH[1]),
								kind: newContour[p9I].kind,
							};
							if (p4p7OffsetH) {
								for (let i = 0; i < newContour.length; i++) {
									let pointL = pointLight(newContour[i]);
									let pointH = pointHeavy(newContour[i]);
									newContour[i] = {
										x: makeVariance(pointL.x, pointH.x - p4p7OffsetH),
										y: makeVariance(pointL.y, pointH.y),
										kind: newContour[i].kind,
									};
								}
							}
							// newContour[p0I] = {
							// 	x: makeVariance(originLight(contour[p0I].x), originHeavy(contour[p0I].x)),
							// 	y: makeVariance(originLight(contour[p0I].y), originHeavy(contour[p0I].y)),
							// 	kind: contour[p0I].kind,
							// };
							// newContour[p1I] = {
							// 	x: makeVariance(originLight(contour[p1I].x), originHeavy(contour[p1I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p1I].y), originHeavy(contour[p1I].y)),
							// 	kind: contour[p1I].kind,
							// };
							// newContour[p2I] = {
							// 	x: makeVariance(originLight(contour[p2I].x), originHeavy(contour[p2I].x)),
							// 	y: makeVariance(originLight(contour[p2I].y), originHeavy(contour[p2I].y)),
							// 	kind: contour[p2I].kind,
							// };
							// newContour[p3I] = {
							// 	x: makeVariance(originLight(contour[p3I].x), originHeavy(contour[p4I].x) + (xOffset * 0.2)),
							// 	y: makeVariance(originLight(contour[p3I].y), originHeavy(contour[p3I].y) + yOffset),
							// 	kind: contour[p3I].kind,
							// };
							// newContour[p4I] = {
							// 	x: makeVariance(originLight(contour[p4I].x), originHeavy(contour[p4I].x) + (xOffset * 0.2)),
							// 	y: makeVariance(originLight(contour[p4I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p4I].kind,
							// };
							// newContour[p5I] = {
							// 	x: makeVariance(originLight(contour[p5I].x), originHeavy(contour[p5I].x)),
							// 	y: makeVariance(originLight(contour[p5I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p5I].kind,
							// };
							// newContour[p6I] = {
							// 	x: makeVariance(originLight(contour[p6I].x), originHeavy(contour[p6I].x)),
							// 	y: makeVariance(originLight(contour[p6I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p6I].kind,
							// };
							// newContour[p7I] = {
							// 	x: makeVariance(originLight(contour[p7I].x), originHeavy(contour[p7I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p7I].y), originHeavy(contour[p7I].y) + yOffset),
							// 	kind: contour[p7I].kind,
							// };
							// newContour[p8I] = {
							// 	x: makeVariance(originLight(contour[p8I].x), originHeavy(contour[p7I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p8I].y), originHeavy(contour[p8I].y) + (yOffset * 0.4)),
							// 	kind: contour[p8I].kind,
							// };
							// newContour[p9I] = {
							// 	x: makeVariance(originLight(contour[p9I].x), originHeavy(contour[p9I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p9I].y), originHeavy(contour[p9I].y)),
							// 	kind: contour[p9I].kind,
							// };
							// newContour[p10I] = {
							// 	x: makeVariance(originLight(contour[p10I].x), originHeavy(contour[p10I].x) - (xOffset * 0.8)),
							// 	y: makeVariance(originLight(contour[p10I].y), originHeavy(contour[p10I].y)),
							// 	kind: contour[p10I].kind,
							// };
							// newContour[p11I] = {
							// 	x: makeVariance(originLight(contour[p11I].x), originHeavy(contour[p11I].x)),
							// 	y: makeVariance(originLight(contour[p11I].y), originHeavy(contour[p11I].y)),
							// 	kind: contour[p11I].kind,
							// };
							break;
						}
					}
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
		// checkSingleGlyph(glyph);
		if (!references.preProcessSkip.includes(name)) checkSingleGlyph(glyph);
		// if (!references.extendSkip.includes(name)) checkSingleGlyph(glyph);
		// count++;
		// if (count % 1000 == 0) console.log("preExtension:", count, "glyphs processed.");
	}
	// delete references.skipRedundantPoints;
}

module.exports = {
	preProcess
};
