let count = 14;
let n = [6,9,10,13]
for (let j = 0; j < n.length; j++) {
// let tmpl = `oldContour[i + 1][${i}] = {
// 	x: makeVariance(originLight(oldContour[i + 1][${i}].x), originHeavy(oldContour[i + 1][${i}].x)),
// 	y: makeVariance(originLight(oldContour[i + 1][${i}].y), originHeavy(oldContour[i + 1][${i}].y)),
// 	kind: oldContour[i + 1][${i}].kind,
// };`;
let i = n[j];
let tmpl = `newContour[${i}] = {
	x: makeVariance(originLight(contour[${i}].x), originHeavy(contour[${i}].x)),
	y: makeVariance(originLight(contour[${i}].y), originHeavy(contour[${i}].y)),
	kind: contour[${i}].kind,
};`
console.log(tmpl);
}