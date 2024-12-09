let count = 9;
for (let i = 0; i < count; i++) {
// let tmpl = `oldContour[i + 1][${i}] = {
// 	x: makeVariance(originLight(oldContour[i + 1][${i}].x), originHeavy(oldContour[i + 1][${i}].x)),
// 	y: makeVariance(originLight(oldContour[i + 1][${i}].y), originHeavy(oldContour[i + 1][${i}].y)),
// 	kind: oldContour[i + 1][${i}].kind,
// };`;
let tmpl = `oldContours[idxC1][h${i}I] = {
x: makeVariance(originLight(h${i}.x) + hXL, originHeavy(h${i}.x) + hXH),
y: makeVariance(originLight(h${i}.y), originHeavy(h${i}.y)),
kind: h${i}.kind,
};`
console.log(tmpl);
}