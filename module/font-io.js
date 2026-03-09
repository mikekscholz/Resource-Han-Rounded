"use strict";

const fs = require("fs");
const fsp = require("fs/promises")
const path = require("path");
const { FontIo, Ot } = require("ot-builder");

async function writeFile(filename, data, increment = 0) {
	let outputDir = `/mnt/c/Users/Michael/ResourceHanRounded`;
	fs.mkdirSync(outputDir, { recursive: true });
	const name = `/mnt/c/Users/Michael/ResourceHanRounded/${path.basename(filename, path.extname(filename))}${ increment ? "(" + increment + ")" : ""}${path.extname(filename)}`;
	// const name = `${path.dirname(filename)}/${path.basename(filename, path.extname(filename))}${ increment ? "(" + increment + ")" : ""}${path.extname(filename)}`;
	return await fsp.writeFile(name, data, { encoding: 'utf8', flag: 'wx' }).catch(async ex => {
		if (ex.code === "EEXIST") return await writeFile(filename, data, increment += 1)
		throw ex
	}) || name
}

function readOtf(filename) {
	const otfBuf = fs.readFileSync(filename);
	const sfnt = FontIo.readSfntOtf(otfBuf);
	const font = FontIo.readFont(sfnt, Ot.ListGlyphStoreFactory);
	return font;
}

async function writeOtf(font, filename, optimise = true) {
	const sfnt = FontIo.writeFont(font);
	const otfBuf = FontIo.writeSfntOtf(sfnt, { cff: { doLocalOptimization: optimise, doGlobalOptimization: optimise } });
	const file = await writeFile(filename, otfBuf);
	console.log(file);
	// fs.writeFileSync(filename, otfBuf);
}

module.exports = {
	writeFile, readOtf, writeOtf
};
