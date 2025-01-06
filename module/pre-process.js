"use strict";

const { Ot } = require("ot-builder");
const ProgressBar = require('./node-progress');
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

function circularIndex(length, index) {
	var idx = Math.abs(length + index % length) % length;
	return isNaN(idx) ? index : idx;
}

// function abs(num) {
// 	return num >= 0 ? num : -num;
// }

function horizontalSlope(line) {
	let { p1, p2 } = line;
	return (p2.y - p1.y) / (p2.x - p1.x);
}

function verticalSlope(line) {
	let { p1, p2 } = line;
	return (p2.x - p1.x) / (p2.y - p1.y);
}

function bearing(line) {
	let { p1, p2 } = line;
	return (Math.atan2((p1.x - p2.x), (p1.y - p2.y)) + Math.PI) * 360 / (2 * Math.PI);
}

function turn(b1, b2) {
	let delta = b2 - b1;
	return delta > 180 ? delta - 360 : delta;
}

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

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;

		let oldContours = glyph.geometry.contours;
		
		glyph.geometry.contours = [];
		
		for (const contour of oldContours) {
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
													
								newContour[circularIndex(contour.length, idx - 1)] = {
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
			let redundantPoints = [];
			for (let idx = 0; idx < contour.length; idx++) {
				let pushed = 0;
				let vert = false;
				let p1 = circularArray(contour, idx);
				let p2 = circularArray(contour, idx + 1);
				let p3 = circularArray(contour, idx + 2);
				let p4 = circularArray(contour, idx + 3);
				if (p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0) {
					let sB = horizontalSlope(lineLight(p1, p4));
					let c1B = horizontalSlope(lineLight(p1, p2)) || sB;
					let ccB = horizontalSlope(lineLight(p2, p3));
					let c2B = horizontalSlope(lineLight(p3, p4)) || sB;
					for (let n of [sB, c1B, c2B]) {
						if (n > 1 || n < -1) {
							vert = true;
							sB = verticalSlope(lineLight(p1, p4));
							c1B = verticalSlope(lineLight(p1, p2)) || sB;
							ccB = verticalSlope(lineLight(p2, p3));
							c2B = verticalSlope(lineLight(p3, p4)) || sB;
							break;
						}
					}
					let d1 = Math.abs(sB - c1B);
					let d2 = Math.abs(sB - c2B);
					let d3 = Math.abs(sB - ccB);
					if ((d1 < 0.04 && d2 < 0.06 && d3 < 0.04) || (d1 < 0.08 && d2 < 0.05 && d3 < 0.06)) {
						if (!redundantPoints.includes(idx + 1)) redundantPoints.push(idx + 1);
						if (!redundantPoints.includes(idx + 2)) redundantPoints.push(idx + 2);
						// pushed += 2;
						let p5 = circularArray(contour, idx + 4);
						let p6 = circularArray(contour, idx + 5);
						let p7 = circularArray(contour, idx + 6);
						if (p5.kind === 1 && p6.kind === 2 && p7.kind === 0) {
							let s2B = horizontalSlope(lineLight(p4, p7));
							let c3B = horizontalSlope(lineLight(p4, p5)) || s2B;
							let c4B = horizontalSlope(lineLight(p6, p7)) || s2B;
							if (vert) {
								s2B = verticalSlope(lineLight(p4, p7));
								c3B = verticalSlope(lineLight(p4, p5)) || s2B;
								c4B = verticalSlope(lineLight(p6, p7)) || s2B;
							}
							let d4 = Math.abs(sB - s2B);
							if (d4 < 0.1) {
								if (!redundantPoints.includes(idx + 3)) redundantPoints.push(idx + 3);
								// pushed += 1;
							}
						}
					}
				}
				// idx += pushed;
			}
			if (redundantPoints.length > 0) {
				if (glyph.name === 'uni30ED') {
					console.log('redundantPoints: ' + glyph.name);
					console.log(redundantPoints);
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
	let consoleWidth = process.stdout.columns - 50 || 150
	let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/5]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
		// if (glyph?.geometry?.contours) {
		// 	let data = JSON.stringify(glyph.geometry.contours);
		// 	let filename = `/home/mike/Resource-Han-Rounded/replacements/${name}.json`;
		// 	writeFile(filename, data);
		// }
		// console.log(name);
		if (!references.extendSkip.includes(name)) checkSingleGlyph(glyph);
		progressTick();
		// count++;
		// if (count % 1000 == 0) console.log("preExtension:", count, "glyphs processed.");
	}
}

module.exports = {
	preProcess
};
