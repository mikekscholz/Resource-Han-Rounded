"use strict";
const path = require("node:path");
const fsp = require("node:fs/promises");
const { readOtf, writeOtf } = require("../module/font-io");
const { correctGlyphs } = require("../module/corrections");
const { roundFont } = require("../module/round-font");
const { extendShortStroke } = require("../module/extend-short-stroke2");
const { buildVFMetaData } = require("../module/build-meta-data");
const { filename } = require("../configure");
const { preProcess } = require("../module/pre-process");
const { postProcess } = require("../module/post-process");
const { specialInstructions } = require("../module/special-instructions");
const writeFile = async(filename, data, increment = 0) => {
	// const name = `/mnt/c/Users/Michael/${path.basename(filename, path.extname(filename))}${"(" + increment + ")" || ""}${path.extname(filename)}`;
	const name = `${path.dirname(filename)}/${path.basename(filename, path.extname(filename))}${ increment ? "(" + increment + ")" : ""}${path.extname(filename)}`;
	return await fsp.writeFile(name, data, { encoding: 'utf8', flag: 'wx' }).catch(async ex => {
		if (ex.code === "EEXIST") return await writeFile(filename, data, increment += 1)
		throw ex
	}) || name
};
const param = JSON.parse(process.argv[2]);
const references = {
	horizontalLeftFalling: {},
	horizontalLeftFalling2: {},
	horizontalLeftFalling2b: {},
	horizontalLeftFalling3: {},
	horizontalLeftFalling4: {},
}
for (const [key, value] of Object.entries(specialInstructions)) {
	references[key] = value;
  }
const font = readOtf(filename.shs(param.subfamily));
preProcess(font, references);
extendShortStroke(font, references);
correctGlyphs(font, references);
// console.log(JSON.stringify(references));
roundFont(font, references);
postProcess(font, references);
console.log('\u001b[38;5;82mCompiling OpenType font file.\u001b[0m This may take several minutes.');
buildVFMetaData(font, param);
writeOtf(font, filename.cff2Vf(param.subfamily), false);

const string = JSON.stringify(references, null, "\t");
const filename2 = `/mnt/c/Users/Michael/${param.subfamily}-references.json`;
writeFile(filename2, string);