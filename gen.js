let count = 14;
let n = [11,12,13,14]
// let n = ["lP1","lC1","lC2","lP2"];
for (let j = 0; j < n.length; j++) {
// let tmpl = `oldContour[i + 1][${i}] = {
// 	x: makeVariance(originLight(oldContour[i + 1][${i}].x), originHeavy(oldContour[i + 1][${i}].x)),
// 	y: makeVariance(originLight(oldContour[i + 1][${i}].y), originHeavy(oldContour[i + 1][${i}].y)),
// 	kind: oldContour[i + 1][${i}].kind,
// };`;
let i = n[j];
let tmpl = `newContour[${i}] = {
	x: makeVariance(originLight(contour[${i}].x), ),
	y: makeVariance(originLight(contour[${i}].y), ),
	kind: contour[${i}].kind,
};`
// let tmpl = `${i} = {
// 	x: makeVariance(${i}L.x, ${i}H.x),
// 	y: makeVariance(${i}L.y, ${i}H.y),
// 	kind: ${i}.kind,
// };`
console.log(tmpl);
}