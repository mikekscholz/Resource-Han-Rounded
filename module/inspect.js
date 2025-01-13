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

	function originLight(point) {
		return Ot.Var.Ops.originOf(point);
	}
	
	function originHeavy(point) {
		return Ot.Var.Ops.evaluate(point, instanceShsWghtMax);
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

			}
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
