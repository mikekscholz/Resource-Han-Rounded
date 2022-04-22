"use strict";

const { Ot, Rectify } = require("ot-builder");
const { readOtf, writeOtf } = require("./font-io");

function AxisRectifier() {
	return {
		dim: a => null,
		axis: a => null,
		addedAxes: []
	};
}

function ValueRectifier(instance) {
	const instanceValue = x => Math.round(Ot.Var.Ops.evaluate(x, instance));
	return { coord: instanceValue, cv: instanceValue };
}

function convertToCff1(font) {
	const oldCff = font.cff;
	font.cff = new Ot.Cff.Table(1);
	font.cff.postScriptFontName = "CFF2Font"; // fontTools use `CFF2Font` by default, so do we.
	font.cff.cid = oldCff.cid;
	font.cff.fdArray = oldCff.fdArray;
	font.cff.fdSelect = oldCff.fdSelect;
}

function instanceFont(font, parameters) {
	const dims = {};
	for (const axis of font.fvar.axes) {
		const dim = axis.dim;
		const tag = dim.tag;
		dims[tag] = dim;
	}
	const instance = new Map(parameters.map(([tag, value]) => [dims[tag], value]));
	Rectify.inPlaceRectifyFontCoords(
		ValueRectifier(instance),
		Rectify.IdPointAttachRectifier,
		font
	);
	font.stat = font.fvar = font.avar = null;
	convertToCff1(font);
}

module.exports = {
	instanceFont: instanceFont,
	instanceOtf: function (input, output, parameters) {
		const font = readOtf(input);
		instanceFont(font, parameters);
		writeOtf(font, output);
	},
};
