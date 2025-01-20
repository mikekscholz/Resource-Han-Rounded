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
	strokeWidth: { light: 29, heavy: 162 },
};

function circularArray(array, index) {
	var length = array && array.length;
	var idx = Math.abs(length + index % length) % length;
	return array[isNaN(idx) ? index : idx];
}

function circularIndex(array, index) {
	var length = array && array.length;
	var idx = abs(length + index % length) % length;
	return isNaN(idx) ? index : idx;
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
	// const os2 = new Ot.Os2.Table(4);
	// const os2 = new font.;
	// console.log(font.os2.usWinDescent);
	// console.log(font.os2.sTypoDescender);
	// console.log(font.os2.sxHeight);
	// console.log(font.os2.sCapHeight);
	// console.log(font.os2.sTypoAscender);
	// console.log(font.os2.usWinAscent);

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

	function approxEq(a, b, threshold = 5) {
		if (typeof a == 'number' && typeof b == 'number')
			return Math.abs(a - b) <= threshold;
		return Math.abs(originLight(a) - originLight(b)) <= threshold &&
			Math.abs(originHeavy(a) - originHeavy(b)) <= threshold;
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
		
		glyph.geometry.contours = [];
		
		for (const [idxC, contour] of oldContours.entries()) {
			if (contour.length < 4) {
				glyph.geometry.contours.push(contour);
				continue;
			}

			const newContour = [...contour];

			for (let idx = 0; idx < contour.length; idx++) {
				if (
					circularArray(contour, idx).kind === 0 &&
					circularArray(contour, idx - 1).kind === 0 &&
					circularArray(contour, idx - 2).kind === 0 &&
					Math.abs(originLight(circularArray(contour, idx).x) - originLight(circularArray(contour, idx - 1).x)) <= 1 &&
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
								Math.abs(originLight(contour[idx].y) - originLight(contour2[idx2].y)) <= 1
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
			if (name in references.skipRedundantPoints) {
				const skipContours = references.skipRedundantPoints[name];
				if (skipContours.includes(idxC)) {
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
				let prev = contour[previousNode(contour, i, true)];
				let next = contour[nextNode(contour, i, true)];
				let bear1 = bearing(lineLight(prev, curr));
				let bear2 = bearing(lineLight(curr, next));
				let rotation = Math.abs(turn(bear1, bear2));
				if (rotation >= 20 && rotation <= 150 && !corners.includes(i)) corners.push(i);
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
				if (abs(mainSlope) > 1) {
					mainSlope = verticalSlope(lineLight(startPoint, endPoint));
					vert = true;
				}
				let innerPoints = (endIdx - startIdx) - 1;
				if (innerPoints > 3 && innerPoints < 10) {
					for (let idx = startIdx; idx < endIdx - 1; idx++) {
						let p1Idx = circularIndex(contour, idx);
						let p2Idx = circularIndex(contour, idx + 1);
						let p3Idx = circularIndex(contour, idx + 2);
						let p4Idx = circularIndex(contour, idx + 3);
						let p1 = contour[p1Idx];
						let p2 = contour[p2Idx];
						let p3 = contour[p3Idx];
						let p4 = contour[p4Idx];
						let segmentBearing = bearing(lineLight(p1, p4));
						let control1Bearing = bearing(lineLight(p1, p2));
						let control2Bearing = bearing(lineLight(p3, p4));
						let controlVectorBearing = bearing(lineLight(p2, p3));
						let segD = abs(turn(parentBearing, segmentBearing));
						let c1D = abs(turn(parentBearing, control1Bearing));
						let c2D = abs(turn(parentBearing, control2Bearing));
						let cVD = abs(turn(parentBearing, controlVectorBearing));
						
						
						
						// let s1a = (vert ? verticalSlope(lineLight(startPoint, p1)) : horizontalSlope(lineLight(startPoint, p1))) || mainSlope;
						// let s1b = (vert ? verticalSlope(lineLight(p1, endPoint)) : horizontalSlope(lineLight(p1, endPoint))) || mainSlope;
						// let s2a = (vert ? verticalSlope(lineLight(startPoint, p2)) : horizontalSlope(lineLight(startPoint, p2))) || mainSlope;
						// let s2b = (vert ? verticalSlope(lineLight(p2, endPoint)) : horizontalSlope(lineLight(p2, endPoint))) || mainSlope;
						// let s3a = (vert ? verticalSlope(lineLight(startPoint, p3)) : horizontalSlope(lineLight(startPoint, p3))) || mainSlope;
						// let s3b = (vert ? verticalSlope(lineLight(p3, endPoint)) : horizontalSlope(lineLight(p3, endPoint))) || mainSlope;
						// let s4a = (vert ? verticalSlope(lineLight(startPoint, p4)) : horizontalSlope(lineLight(startPoint, p4))) || mainSlope;
						// let s4b = (vert ? verticalSlope(lineLight(p4, endPoint)) : horizontalSlope(lineLight(p4, endPoint))) || mainSlope;
						// let d1a = Math.abs(mainSlope - s1a);
						// let d1b = Math.abs(mainSlope - s1b);
						// let d2a = Math.abs(mainSlope - s2a);
						// let d2b = Math.abs(mainSlope - s2b);
						// let d3a = Math.abs(mainSlope - s3a);
						// let d3b = Math.abs(mainSlope - s3b);
						// let d4a = Math.abs(mainSlope - s4a);
						// let d4b = Math.abs(mainSlope - s4b);
						if (p2.kind === 1 && p3.kind === 2 && p4.kind === 0) {
							// let sC = vert ? verticalSlope(lineLight(p1, p2)) : horizontalSlope(lineLight(p1, p2));
							// let dC = Math.abs(mainSlope - sC);
							// if ((d1a < maxSlope / 0.6 || d1b < maxSlope / 2) && (d2a < maxSlope / 1.5 || d2b < maxSlope) && dC < 0.2 && (d3a < maxSlope / 2 || d3b < maxSlope / 2 || distanceLight(p2, p3) === 0)) {
							if (segD < 11 && (c1D < 11 || distanceLight(p1, p2) === 0) && (c2D < 11 || distanceLight(p3, p4) === 0) && cVD < 11) {
							// if ((d1a < maxSlope || d1b < maxSlope) && (d2a < maxSlope || d2b < maxSlope) && dC < 0.2 && (d3a < maxSlope || d3b < maxSlope)) {
								if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length) redundantPoints.push(p2Idx);
								if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length) redundantPoints.push(p3Idx);
								if (!redundantPoints.includes(p4Idx) && p4Idx !== 0 && p4Idx < contour.length && p4Idx < endIdx) redundantPoints.push(p4Idx);
							}
						// } else if (p1.kind === 0 && p2.kind === 1 && p3.kind === 2) {
						// 	let sC = vert ? verticalSlope(lineLight(p2, p3)) : horizontalSlope(lineLight(p2, p3));
						// 	let dC = Math.abs(mainSlope - sC);
						// 	if ((d1a < maxSlope / 2 || d1b < maxSlope / 2) && (d2a < maxSlope || d2b < maxSlope / 2 || distanceLight(p1, p2) === 0) && dC < 0.2 && (d3a < maxSlope / 2 || d3b < maxSlope / 0.8)) {
						// 	// if ((d1a < maxSlope || d1b < maxSlope) && (d2a < maxSlope || d2b < maxSlope) && dC < 0.2 && (d3a < maxSlope || d3b < maxSlope)) {
						// 		if (!redundantPoints.includes(p1Idx) && p1Idx !== 0 && p1Idx < contour.length) redundantPoints.push(p1Idx);
						// 		if (!redundantPoints.includes(p2Idx) && p2Idx !== 0 && p2Idx < contour.length) redundantPoints.push(p2Idx);
						// 		if (!redundantPoints.includes(p3Idx) && p3Idx !== 0 && p3Idx < contour.length && p3Idx < endIdx) redundantPoints.push(p3Idx);
						// 	}
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
					let d1 = Math.abs(mainSlope - s1);
					let d2 = Math.abs(mainSlope - s2);
					let d3 = Math.abs(mainSlope - s3);
					if (c1.kind === 1 && c2.kind === 2 && d1 < 0.04 && d2 < 0.04 && d3 < 0.04) {
						if (!redundantPoints.includes(c1Idx) && c1Idx !== 0 && c1Idx < contour.length) redundantPoints.push(c1Idx);
						if (!redundantPoints.includes(c2Idx) && c2Idx !== 0 && c2Idx < contour.length) redundantPoints.push(c2Idx);
					}
				}
			}

			if (redundantPoints.length > 0) {
				if (glyph.name === 'braceleft') {
					console.log('\n');
					console.log(glyph.name);
					console.log('corners ' + corners)
					console.log('redundantPoints: ' + redundantPoints);
				}
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

	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		if (name === "uni20DD") {
			console.log(JSON.stringify(glyph));
		}
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
}

module.exports = {
	preProcess
};
