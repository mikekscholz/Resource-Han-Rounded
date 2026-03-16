let count = 14;
let n = [6,7,9]
// let n = ["lP1","lC1","lC2","lP2"];
// let coords = [
// 	[540, 380],
// 	[599, 424],
// 	[471, 426],
// ]
let coords = [
	[666, 290],
	[780, 356],
	[591, 347],
]
// let coords = [
// 	[132, 221],
// 	[132, 170],
// 	[127, 101],
// 	[95, 89],
// 	[113, 62],
// 	[144, 1],
// ]
// let coords = [
// 	[293, 147],
// 	[293, 107],
// 	[249, 65],
// 	[229, 53],
// 	[265, 17],
// 	[292, -18]
// ]
let c = 12
// for (let j = 0; j < n.length; j++) {
for (let i = 0; i < 11; i++) {
// let tmpl = `oldContour[i + 1][${i}] = {
// 	x: makeVariance(originLight(oldContour[i + 1][${i}].x), originHeavy(oldContour[i + 1][${i}].x)),
// 	y: makeVariance(originLight(oldContour[i + 1][${i}].y), originHeavy(oldContour[i + 1][${i}].y)),
// 	kind: oldContour[i + 1][${i}].kind,
// };`;
// let i = n[j];
// let tmpl = `oldContours[${c}][${i}] = {
// 	x: makeVariance(originLight(oldContours[${c}][${i}].x), ${coords[j][0]}),
// 	y: makeVariance(originLight(oldContours[${c}][${i}].y), ${coords[j][1]}),
// 	kind: oldContours[${c}][${i}].kind,
// };`
// let tmpl = `${i} = {
// 	x: makeVariance(${i}L.x, ${i}H.x),
// 	y: makeVariance(${i}L.y, ${i}H.y),
// 	kind: ${i}.kind,
// };`
let tmpl = `oldContours[idxC2][p${i}I] = Ot.Glyph.Point.create(
	makeVariance(p${i}L[0], p${i}H[0]),
	makeVariance(p${i}L[1], p${i}H[1]),
	oldContours[idxC2][p${i}I].kind
);`
console.log(tmpl);
}