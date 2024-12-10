"use strict";

const { readOtf, writeOtf } = require("../module/font-io");
const { correctGlyphs } = require("../module/corrections");
const { roundFont } = require("../module/round-font");
const { extendShortStroke } = require("../module/extend-short-stroke2");
const { buildVFMetaData } = require("../module/build-meta-data");
const { filename } = require("../configure");
const { preExtension } = require("../module/pre-extension");
const { postProcess } = require("../module/post-process");

const param = JSON.parse(process.argv[2]);
const references = {
	horizontalLeftFalling: {},
	horizontalLeftFalling2: {},
	horizontalLeftFalling3: {},
}
const font = readOtf(filename.shs(param.subfamily));
preExtension(font);
extendShortStroke(font, references);
correctGlyphs(font, references);
// console.log(JSON.stringify(references));
roundFont(font, references);
// postProcess(font, references);
buildVFMetaData(font, param);
writeOtf(font, filename.cff2Vf(param.subfamily), false);
