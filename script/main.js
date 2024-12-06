"use strict";

const { readOtf, writeOtf } = require("../module/font-io");
const { correctGlyphs } = require("../module/corrections");
const { roundFont } = require("../module/round-font");
const { extendShortStroke } = require("../module/extend-short-stroke2");
const { buildVFMetaData } = require("../module/build-meta-data");
const { filename } = require("../configure");
const { preExtension } = require("../module/pre-extension");

const param = JSON.parse(process.argv[2]);
const references = {
	horizontalLeftFalling: {}
}
const font = readOtf(filename.shs(param.subfamily));
preExtension(font);
extendShortStroke(font, references);
correctGlyphs(font);
// roundFont(font);
buildVFMetaData(font, param);
// console.log(JSON.stringify(references, null, '\t'));
writeOtf(font, filename.cff2Vf(param.subfamily), false);
