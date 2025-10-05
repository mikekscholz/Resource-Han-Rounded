const { readOtf, writeOtf } = require("./module/font-io");
const { Ot } = require("ot-builder");
const path = require("node:path");
const fsp = require("node:fs/promises");
const writeFile = async(filename, data, increment = 0) => {
	// const name = `/mnt/c/Users/Michael/${path.basename(filename, path.extname(filename))}${"(" + increment + ")" || ""}${path.extname(filename)}`;
	const name = `${path.dirname(filename)}/${path.basename(filename, path.extname(filename))}${ increment ? "(" + increment + ")" : ""}${path.extname(filename)}`;
	return await fsp.writeFile(name, data, { encoding: 'utf8', flag: 'wx' }).catch(async ex => {
		if (ex.code === "EEXIST") return await writeFile(filename, data, increment += 1)
		throw ex
	}) || name
};

const font = readOtf("./src/ResourceHanRoundedRPLC-VF.otf");

function ripFont(font) {
	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: -1, peak: -1, max: 0 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);
	
	function ripGlyph(glyph) {
		const name = glyph.name;
		const contours = glyph.geometry.contours;
		const string = JSON.stringify(contours);
		const filename = `${__dirname}/replacements/${name}.json`;
		writeFile(filename, string);
		// console.log(contours);
		
		// if (glyph?.geometry?.contours) {
		// 	let data = []
		// 	for (const contour of glyph.geometry.contours) {
		// 		console.log(Ot.Var.Ops.evaluate(contour[0].x, instanceShsWghtMax));
		// 		data.push(contour);
		// 	}
		// 	string = JSON.stringify(data);
		// 	let filename = `/home/mike/Resource-Han-Rounded/replacements/${glyph.name}.json`;
		// 	writeFile(filename, string);
		// }
	}
	
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		if (name === ".notdef") continue;
		ripGlyph(glyph);
		// console.log(name);
	}
}

ripFont(font);
