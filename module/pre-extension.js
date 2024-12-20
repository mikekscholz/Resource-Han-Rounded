"use strict";

const { Ot } = require("ot-builder");
const { extendSkip } = require("./exceptions");
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

function abs(num) {
	return num >= 0 ? num : -num;
}

function preExtension(font) {
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
								// originLight(circularArray(contour, idx - 1).x) !== originLight(circularArray(contour2, idx2 - 1).x) ||
								// originLight(circularArray(contour, idx - 1).y) !== originLight(circularArray(contour2, idx2 - 1).y)
							) {
								// console.log(glyph.name, idx, idx2);
								let targetPoint = circularArray(contour2, idx2 - 2).kind === 0 ? circularArray(contour2, idx2 - 2) :
													circularArray(contour2, idx2 - 3).kind === 0 ? circularArray(contour2, idx2 - 3) :
														circularArray(contour2, idx2 - 4).kind === 0 ? circularArray(contour2, idx2 - 4) : circularArray(contour, idx - 1);
													
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
			glyph.geometry.contours.push(newContour);
		}
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns - 50 || 150
	let bar = new ProgressBar('\u001b[38;5;82mpreProcessing\u001b[0m [1/5]     :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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
		if (!extendSkip.includes(name)) checkSingleGlyph(glyph);
		progressTick();
		// count++;
		// if (count % 1000 == 0) console.log("preExtension:", count, "glyphs processed.");
	}
}

module.exports = {
	preExtension
};
