"use strict";

const { Ot } = require("ot-builder");
const ProgressBar = require('./node-progress');
const { base60, bearing, horizontalSlope, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, pow, round, sqrt, trunc } = Math;

const path = require("path");
const fsp = require("fs/promises");
const { writeFileSync, mkdirSync } = require("node:fs");
const writeFile = async(filename, data, increment = 0) => {
	// const name = `/mnt/c/Users/Michael/${path.basename(filename, path.extname(filename))}${"(" + increment + ")" || ""}${path.extname(filename)}`;
	const name = `${path.dirname(filename)}/${path.basename(filename, path.extname(filename))}${ increment ? "(" + increment + ")" : ""}${path.extname(filename)}`;
	return await fsp.writeFile(name, data, { encoding: 'utf8', flag: 'wx' }).catch(async ex => {
		if (ex.code === "EEXIST") return await writeFile(filename, data, increment += 1)
		throw ex
	}) || name
};

let glyphsJson = {
	
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

function convert(font, references) {
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
		return { x: originLight(p?.x) ?? p.x, y: originLight(p?.y) ?? p.x };
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
	
	function quadToCubic(p0, p1, p2) {
		return [
		  { x: p0.x, y: p0.y },
		  { x: p0.x + (2/3) * (p1.x - p0.x), y: p0.y + (2/3) * (p1.y - p0.y) },
		  { x: p2.x + (2/3) * (p1.x - p2.x), y: p2.y + (2/3) * (p1.y - p2.y) },
		  { x: p2.x, y: p2.y }
		];
	  }
	  
	  function midpoint(p1, p2) {
		return {
			x: (p1.x + p2.x) / 2,
			y: (p1.y + p2.y) / 2,
		};
	}
	
	Object.defineProperty(Array.prototype, "reverseContour", {
		value: function() {
			this.reverse();
			for (let i = 0; i < this.length; i++) {
				let kind = this[i].kind;
				switch (kind) {
					case 2:
						this[i].kind = 1;
						break;
					case 1:
						this[i].kind = 2;
						break;
					default:
						this[i].kind = 0;
						break;
				}
			}
			return this;
		}
	});

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours) {
			// console.log(JSON.stringify(glyph.geometry.items, null, "  "));
			return;
			
		}
		
		const name = glyph.name;
		
		let oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		// if (["numbersign","registered"].includes(name)) oldContours.reverseContour();
		
		for (let [idxC1, contour] of oldContours.entries()) {
			for (let idxP1 = contour.length - 1; idxP1 >= 0; idxP1--) {
				if (contour[idxP1].kind === 3) {
					if (circularArray(contour, idxP1 - 1).kind === 3) {
						let p1L = pointLight(contour[idxP1 - 1]);
						let p1H = pointHeavy(contour[idxP1 - 1]);
						let p2L = pointLight(contour[idxP1]);
						let p2H = pointHeavy(contour[idxP1]);
						let mL = midpoint(p1L, p2L);
						let mH = midpoint(p1H, p2H);
						let mid = {
							x: makeVariance(mL.x, mH.x),
							y: makeVariance(mL.y, mH.y),
							kind: 0,
						};
						contour.splice(idxP1, 0, mid);
						// idxP1--
					}
				}
			}
			// console.log(contour);
			const newContour = [...contour, contour[0]];
			for (let idxP1 = contour.length - 1; idxP1 >= 0; idxP1--) {
				if (contour[idxP1].kind === 3) {
					let p1L = pointLight(circularArray(contour, idxP1 - 1));
					let p1H = pointHeavy(circularArray(contour, idxP1 - 1));
					let q1L = pointLight(contour[idxP1]);
					let q1H = pointHeavy(contour[idxP1]);
					let p2L = pointLight(circularArray(contour, idxP1 + 1));
					let p2H = pointHeavy(circularArray(contour, idxP1 + 1));
					
					let cubicL = quadToCubic(p1L, q1L, p2L);
					let cubicH = quadToCubic(p1H, q1H, p2H);
					
					let c1 = {
						x: makeVariance(cubicL[1].x, cubicH[1].x),
						y: makeVariance(cubicL[1].y, cubicH[1].y),
						kind: 1,
					};
					let c2 = {
						x: makeVariance(cubicL[2].x, cubicH[2].x),
						y: makeVariance(cubicL[2].y, cubicH[2].y),
						kind: 2,
					};
					
					newContour.splice(idxP1, 1, c1, c2);
				}
			}
			for (let idxP1 = newContour.length - 1; idxP1 >= 0; idxP1--) {
				if (newContour[idxP1].kind === 0) {
					let pL = pointLight(newContour[idxP1]);
					let pH = pointHeavy(newContour[idxP1]);
					
					newContour[idxP1] = {
						x: makeVariance(pL.x, pH.x),
						y: makeVariance(pL.y, pH.y),
						kind: 0,
					};
				}
			}
			newContour.reverseContour();
			// if (name === "D") console.log(JSON.stringify(newContour, null, "  "));
			// if (["numbersign","registered"].includes(name)) {
				
			// }
			if (name === "D") console.log(newContour);
			glyph.geometry.contours.push(newContour);
		}
		
		
		let contoursArray = [];
		for (let contour of glyph.geometry.contours) {
			let pointsArray = [];
			for (let point of contour) {
				let light = pointLight(point);
				let heavy = pointHeavy(point);
				let lx = parseFloat(originLight(light.x).toFixed(2));
				let hx = parseFloat(originLight(heavy.x).toFixed(2));
				let ly = parseFloat(originLight(light.y).toFixed(2));
				let hy = parseFloat(originLight(heavy.y).toFixed(2));
				pointsArray.push({ x: [lx, hx], y: [ly, hy], kind: point.kind});
			}
			contoursArray.push(pointsArray);
		}
		
		let hStartLight = originLight(glyph.horizontal.start);
		let hStartHeavy = originHeavy(glyph.horizontal.start) || hStartLight;
		let hEndLight = originLight(glyph.horizontal.end);
		let hEndHeavy = originHeavy(glyph.horizontal.end) || hEndLight;
		let glyphData = {
			horizontal: { start: [hStartLight, hStartHeavy], end: [hEndLight, hEndHeavy]},
			contours: contoursArray
		}
		
		glyphsJson[name] = glyphData;
		
		
		
		
		// let glyphCopy = JSON.parse(JSON.stringify(glyph));
		// let mastersLength = glyphCopy.horizontal.end.masterSet.masterList.length;
		// if (mastersLength > 1) {
			// let deleteCount = mastersLength - 1;
			// glyphCopy.horizontal.end.masterSet.masterList.splice(1, deleteCount);
			// let deltaValues = Object.values(glyphCopy.horizontal.end.deltaValues);
			// glyphCopy.horizontal.end.deltaValues = {"0": deltaValues[deleteCount]};
		// }
		// let glyphString = JSON.stringify(glyphCopy, null, "\t");
		// glyphString = glyphString.replaceAll('"min": 200', '"min": 250');
		// glyphString = glyphString.replaceAll('"default": 200', '"default": 250');
		// glyphString = glyphString.replaceAll('"max": 1000', '"max": 900');
		// glyphString = glyphString.replaceAll('"peak": 0.5', '"peak": 1');
		// glyphsJson[name] = JSON.parse(glyphString);
		// let jsonname = `/home/mike/Resource-Han-Rounded/Nunito/${name}.json`;
		// let jsonData = JSON.stringify(glyph, null, "\t");
		// writeFileSync(jsonname, glyphString, { flush: true });
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	// let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/5]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
	let names = "";
	let namesArray = [];
	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		// if (name === "A") {
			// console.log(font);
			// console.log(JSON.stringify(font));
		// }
		names += `${name}`;
		namesArray.push(name);
		// if (glyph?.geometry?.contours) {
		// 	let data = JSON.stringify(glyph.geometry.contours);
		// 	let filename = `/home/mike/Resource-Han-Rounded/replacements/${name}.json`;
		// 	writeFile(filename, data);
		// }
		// console.log(name);
		progressTick(name);
		// if (!references.extendSkip.includes(name)) 
		checkSingleGlyph(glyph);
		// count++;
		// if (count % 1000 == 0) console.log("preExtension:", count, "glyphs processed.");
	}
	// let filename = `/mnt/c/Users/Michael/ResourceHanRounded/Nunito_character_names.txt`;
	// writeFile(filename, names);
	// writeFileSync(filename, names, { flush: true });

	// let arrayname = `/mnt/c/Users/Michael/ResourceHanRounded/Nunito/nunitoGlyphNames.json`;
	// let arrayData = JSON.stringify(namesArray);
	// writeFileSync(arrayname, arrayData, { flush: true });
	
	let nunitoJson = `/home/mike/Resource-Han-Rounded/module/nunito.json`;
	let nunitoData = JSON.stringify(glyphsJson, null, "\t");
	writeFileSync(nunitoJson, nunitoData, { flush: true });
	// delete references.skipRedundantPoints;
}

module.exports = {
	convert
};
