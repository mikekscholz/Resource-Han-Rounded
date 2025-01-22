"use strict";

const { Ot } = require("ot-builder");
const ProgressBar = require('./node-progress');
const { base60, bearing, horizontalSlope, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, max, min, pow, round, sqrt, trunc } = Math;
const { writeFile } = require("node:fs");
const path = require("path");
const fsp = require("fs/promises");
// const writeFile = async(filename, data, increment = 0) => {
// 	const name = `/mnt/c/Users/Michael/${path.basename(filename, path.extname(filename))}${"(" + increment + ")" || ""}${path.extname(filename)}`;
// 	// const name = `${path.dirname(filename)}/${path.basename(filename, path.extname(filename))}${ increment ? "(" + increment + ")" : ""}${path.extname(filename)}`;
// 	return await fsp.writeFile(name, data, { encoding: 'utf8', flag: 'wx' }).catch(async ex => {
// 		if (ex.code === "EEXIST") return await writeFile(filename, data, increment += 1)
// 		throw ex
// 	}) || name
// };
const htmlHeader = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Font Inspector</title>
	<style>
		body {
			background-color: #1c1c1c;
		}
		.nav-bar {
			background-color: #2226;
			backdrop-filter: blur(6px);
			width: 100%;
			height: 40px;
			position: fixed;
			top: 0;
			left: 0;
		}
		a {
			width: 28px;
			position: relative;
			display: inline-block;
			background-color: #444;
			color: #FFF;
			padding: 5px 5px;
			margin: 5px 2px;
			border-radius: 3px;
			font-family: nunito;
			text-align: center;
	}
		.wrapper {
			display: flex;
			flex-wrap: wrap;
			gap: 30px 10px;
		}
		.glyph {
			width: min-content;
			height: 300px;
			overflow: hidden;
			margin-bottom: -20px;
			display: flex;
			flex-wrap: wrap;
			background-color: #0b0b0b;
		}

		.glyph svg {
			margin-top: -20px;
		}

		.glyph-label {
			color: #FFFFFF;
			font-family: Nunito;
			width: 100%;
			text-align: center;
			background-color: #555
		}
		.contour-fill {
			fill:   #FFFFFF26;
			fill-rule: nonzero;
			stroke: none;
		}
		.contour-stroke {
			fill: none;
			stroke: #FFF;
			stroke-width: 3px;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		.dotted-rule {
			stroke: #FFF3;
			stroke-dasharray: 10 10;
			stroke-width: 2;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		.control-vector {
			stroke: #FFF;
			stroke-dasharray: 15 5;
			stroke-width: 1;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		.start-point {
			fill: #0cf;
			stroke: #FFF;
			stroke-width: 2;
			r: 8;
		}
		.corner-point {
			fill: rgb(255, 0, 64);
			stroke: #FFF;
			stroke-width: 2;
			r: 8;
		}
		.control-point {
			fill: #9F0;
			stroke: #FFF;
			stroke-width: 2;
			r: 7;
		}
	</style>
</head>
<body>`;
	
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

function inspect(font, references) {
	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);
	const safeBottom = -abs(font.os2.usWinDescent);
	const descender = -abs(font.os2.sTypoDescender);
	const xHeight = font.os2.sxHeight;
	const capsHeight = font.os2.sCapHeight;
	const ascender = font.os2.sTypoAscender;
	const safeTop = font.os2.usWinAscent;
	const viewportHeight = abs(safeBottom - safeTop);

	function originLight(point) {
		return Ot.Var.Ops.originOf(point);
	}
	
	function originHeavy(point) {
		return Ot.Var.Ops.evaluate(point, instanceShsWghtMax);
	}

	function checkSingleGlyph(glyph) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;

		let contours = glyph.geometry.contours;
		let groupLightFill = "";
		let groupLightStroke = "";
		let groupLightHandles = "";
		let groupLightPoints = "";
		let groupHeavyFill = "";
		let groupHeavyStroke = "";
		let groupHeavyHandles = "";
		let groupHeavyPoints = "";
		// let glyphPointsLightX = [];
		// let glyphPointsHeavyX = [];
		let pointsLightX = [];
		let pointsHeavyX = [];
		for (const contour of contours) {
			let pointsLight = [];
			let pointsHeavy = [];
			// let pointsLightY = [];
			// let pointsHeavyY = [];
			let pathLight = "";
			let pathHeavy = "";
			for (let idx = 0; idx < contour.length; idx++) {
				let lX = originLight(contour[idx].x);
				let lY = originLight(contour[idx].y);
				let hX = originHeavy(contour[idx].x);
				let hY = originHeavy(contour[idx].y);
				pointsLight.push({x: lX, y: lY, type: contour[idx].kind});
				pointsHeavy.push({x: hX, y: hY, type: contour[idx].kind});
				pointsLightX.push(lX);
				// pointsLightY.push(lY);
				pointsHeavyX.push(hX);
				// pointsHeavyY.push(hY);
			}

			for (let idx = 0; idx < pointsLight.length; idx++) {
				let l1 = pointsLight[idx];
				let h1 = pointsHeavy[idx];
				if (idx === 0) {
					pathLight += `M ${l1.x}, ${l1.y}`;
					pathHeavy += `M ${h1.x}, ${h1.y}`;
					groupLightPoints += `<circle class="start-point" cx="${l1.x}" cy="${l1.y}" r="5" />`;
					groupHeavyPoints += `<circle class="start-point" cx="${h1.x}" cy="${h1.y}" r="5" />`;
				} else if (idx > 0 && l1.type === 0) {
					pathLight += `L ${l1.x}, ${l1.y}`;
					pathHeavy += `L ${h1.x}, ${h1.y}`;
					if (pointsLight[0].x !== l1.x || pointsLight[0].y !== l1.y) {
						groupLightPoints += `<circle class="corner-point" cx="${l1.x}" cy="${l1.y}" r="5" />`;
						groupHeavyPoints += `<circle class="corner-point" cx="${h1.x}" cy="${h1.y}" r="5" />`;
					}
				} else if (l1.type === 1) {
					let l0 = pointsLight[idx - 1];
					let h0 = pointsHeavy[idx - 1];
					let l2 = pointsLight[idx + 1];
					let h2 = pointsHeavy[idx + 1];
					let l3 = circularArray(pointsLight, idx + 2);
					let h3 = circularArray(pointsHeavy, idx + 2);
					pathLight += `C ${l1.x}, ${l1.y} ${l2.x}, ${l2.y} ${l3.x}, ${l3.y}`;
					pathHeavy += `C ${h1.x}, ${h1.y} ${h2.x}, ${h2.y} ${h3.x}, ${h3.y}`;
					groupLightPoints += `<circle class="control-point" cx="${l1.x}" cy="${l1.y}" r="4" />`;
					groupHeavyPoints += `<circle class="control-point" cx="${h1.x}" cy="${h1.y}" r="4" />`;
					groupLightPoints += `<circle class="control-point" cx="${l2.x}" cy="${l2.y}" r="4" />`;
					groupHeavyPoints += `<circle class="control-point" cx="${h2.x}" cy="${h2.y}" r="4" />`;
					if (pointsLight[0].x !== l3.x || pointsLight[0].y !== l3.y) {
						groupLightPoints += `<circle class="corner-point" cx="${l3.x}" cy="${l3.y}" r="5" />`;
						groupHeavyPoints += `<circle class="corner-point" cx="${h3.x}" cy="${h3.y}" r="5" />`;
					}
					groupLightHandles += `<line class="control-vector" x1="${l0.x}" y1="${l0.y}" x2="${l1.x}" y2="${l1.y}" />`;
					groupHeavyHandles += `<line class="control-vector" x1="${h0.x}" y1="${h0.y}" x2="${h1.x}" y2="${h1.y}" />`;
					groupLightHandles += `<line class="control-vector" x1="${l2.x}" y1="${l2.y}" x2="${l3.x}" y2="${l3.y}" />`;
					groupHeavyHandles += `<line class="control-vector" x1="${h2.x}" y1="${h2.y}" x2="${h3.x}" y2="${h3.y}" />`;
					idx += 2;
				}
			}
			groupLightFill += `${pathLight} z `;
			groupLightStroke += `${pathLight} z `;
			groupHeavyFill += `${pathHeavy} z `;
			groupHeavyStroke += `${pathHeavy} z `;
		}
		let horizontalEndLight = originLight(glyph.horizontal.end);
		let horizontalEndHeavy = originHeavy(glyph.horizontal.end);
		pointsLightX.push(0, horizontalEndLight);
		pointsHeavyX.push(0, horizontalEndHeavy);
		
		let minLightX = min(...pointsLightX) - 20;
		let maxLightX = max(...pointsLightX) + 20;
		// let minLightY = min(pointsLightY);
		// let maxLightY = max(pointsLightY);
		let minHeavyX = min(...pointsHeavyX) - 20;
		let maxHeavyX = max(...pointsHeavyX) + 20;
		// let minHeavyY = min(pointsHeavyY);
		// let maxHeavyY = max(pointsHeavyY);
		let widthLight = abs(minLightX - maxLightX);
		let widthHeavy = abs(minHeavyX - maxHeavyX);
		let viewportWidth = 10 + widthLight + 10 + widthHeavy + 10;
		let svgHeader = `<svg height="100%" viewBox="0 ${safeBottom} ${viewportWidth} ${viewportHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">`;
		svgHeader += `
			<g transform="scale(1, -1) translate(0, -${ascender})">
				<line class="dotted-rule" x1="0" y1="${safeBottom + 2}" x2="${viewportWidth}" y2="${safeBottom + 2}" />
				<line class="dotted-rule" x1="0" y1="${descender}" x2="${viewportWidth}" y2="${descender}" />
				<line class="dotted-rule" x1="0" y1="0" x2="${viewportWidth}" y2="0" />
				<line class="dotted-rule" x1="0" y1="${xHeight}" x2="${viewportWidth}" y2="${xHeight}" />
				<line class="dotted-rule" x1="0" y1="${capsHeight}" x2="${viewportWidth}" y2="${capsHeight}" />
				<line class="dotted-rule" x1="0" y1="${ascender}" x2="${viewportWidth}" y2="${ascender}" />
				<line class="dotted-rule" x1="0" y1="${safeTop - 2}" x2="${viewportWidth}" y2="${safeTop - 2}" />
				<g transform="translate(${abs(minLightX) + 10}, 0)">
					<line stroke="#FFF6" stroke-width="1" x1="0" y1="${safeBottom}" x2="0" y2="${safeTop}" />
					<line stroke="#FFF6" stroke-width="1" x1="${horizontalEndLight}" y1="${safeBottom}" x2="${horizontalEndLight}" y2="${safeTop}" />
					<g><path class="contour-fill" d="${groupLightFill}" /></g>
					<g><path class="contour-stroke" d="${groupLightStroke}" /></g>
					<g>${groupLightHandles}</g>
					<g>${groupLightPoints}</g>
				</g>
				<g transform="translate(${widthLight + abs(minHeavyX) + 20}, 0)">
					<line stroke="#FFF6" stroke-width="1" x1="0" y1="${safeBottom}" x2="0" y2="${safeTop}" />
					<line stroke="#FFF6" stroke-width="1" x1="${horizontalEndHeavy}" y1="${safeBottom}" x2="${horizontalEndHeavy}" y2="${safeTop}" />
					<g><path class="contour-fill" d="${groupHeavyFill}" /></g>
					<g><path class="contour-stroke" d="${groupHeavyStroke}" /></g>
					<g>${groupHeavyHandles}</g>
					<g>${groupHeavyPoints}</g>
				</g>
			</g>
		</svg>`;
		currentHtml += `<div class="glyph">${svgHeader}<span class="glyph-label">${glyph.name}</span></div>`;
	}

	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns - 10 || 150
	let bar = new ProgressBar('\u001b[38;5;82mmakingPreview\u001b[0m [1/5]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
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

	let pages = Math.ceil(len / 1000);
	let currentHtml;
	let count = 0;
	let page = 1;
	function newHtml() {
		let navbar = `<div class="nav-bar">`;
		for (let i = 1; i <= pages; i++) {
			let button = `<a ${i === page ? 'class="current"': ''}href="inspector-${i}.html">${i}</a>`;
			navbar += button;
		}
		navbar += `<a ${page === 1 ? 'class="disabled"': ''}href="inspector-${page - 1}.html">&lt;</a>`;
		navbar += `<a ${page === pages ? 'class="disabled"': ''}href="inspector-${page + 1}.html">&gt;</a>`;
		navbar += `</div>`;
		currentHtml = htmlHeader;
		currentHtml += navbar;
		currentHtml += `<div class="wrapper">`;
	}
	newHtml();
	for (const [gIdx, glyph] of font.glyphs.items.entries()) {
		const name = glyph.name;

		// console.log(name);
		progressTick(name);
		if (glyph?.geometry?.contours) checkSingleGlyph(glyph);
		// count++;
		if (gIdx > 0 && (gIdx % 1000 === 0 || gIdx === len - 1)) {
			currentHtml += `</div>
			</body>
			</html>`;
			let filename = `inspector-${page}.html`;
			writeFile(filename, currentHtml, (err) => {
				if (err) throw err;
  				// console.log('The file has been saved!');
			}); 
			// writeFile(filename, htmlHeader);
			page++
			newHtml();
		};
	}

	// let filename = glyph.name + ".svg";
}

module.exports = {
	inspect
};
