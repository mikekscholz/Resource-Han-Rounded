let count = 15;
for (let i = 0; i < count; i++) {
let tmpl = `oldContour[i + 1][${i}] = {
	x: makeVariance(originLight(oldContour[i + 1][${i}].x), originHeavy(oldContour[i + 1][${i}].x)),
	y: makeVariance(originLight(oldContour[i + 1][${i}].y), originHeavy(oldContour[i + 1][${i}].y)),
	kind: oldContour[i + 1][${i}].kind,
};`;
console.log(tmpl);
}