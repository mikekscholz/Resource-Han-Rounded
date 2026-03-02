								// ----------------------------------------------------------------------------------------------
								
								// let testPoint1L = point2GeoJsonLight(pV3);
								// let testPoint1H = point2GeoJsonHeavy(pV3);
								// let testPoint2L = point2GeoJsonLight(pH4);
								// let testPoint2H = point2GeoJsonHeavy(pH4);
								// let testLineL = [point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)];
								// let testLineH = [point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)];
								// let angleL = geometric.lineAngle(testLineL);
								// let angleH = geometric.lineAngle(testLineH);
								// let testOffsetL = 1;
								// let testOffsetH = 1;
								// let maxOffsetL = distanceLight(pV4, pV7) * 0.5;
								// let maxOffsetH = distanceHeavy(pV4, pV7) * 0.5;
								// let testL = geometric.pointRightofLine(testPoint1L, testLineL) && geometric.pointRightofLine(testPoint2L, testLineL);
								// let testH = geometric.pointRightofLine(testPoint1H, testLineH) && geometric.pointRightofLine(testPoint2H, testLineH);
								// function checkL() {
								// 	let newL = geometric.lineTranslate(testLineL, angleL + 90, testOffsetL);
								// 	testL = geometric.pointRightofLine(testPoint1L, newL) && geometric.pointRightofLine(testPoint2L, newL) && testOffsetL < maxOffsetL;
								// }
								// function checkH() {
								// 	let newH = geometric.lineTranslate(testLineH, angleH + 90, testOffsetH);
								// 	testH = geometric.pointRightofLine(testPoint1H, newH) && geometric.pointRightofLine(testPoint2H, newH) && testOffsetH < maxOffsetH;
								// }
								// while (testL) {
								// 	checkL();
								// 	if (testL) testOffsetL++
								// }
								// while (testH) {
								// 	checkH();
								// 	if (testH) testOffsetH++
								// }
								
								// let pV4L = geometric.pointTranslate(point2GeoJsonLight(pV4), angleL + 90, testOffsetL - 3);
								// let pV4H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), angleH + 90, testOffsetH - 7);
								// let pV7L = geometric.pointTranslate(point2GeoJsonLight(pV7), angleL + 90, testOffsetL - 3);
								// let pV7H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), angleH + 90, testOffsetH - 7);
								// oldContours[idxC2][pV4I] = {
								// 	x: makeVariance(pV4L[0], pV4H[0]),
								// 	y: makeVariance(pV4L[1], pV4H[1]),
								// 	kind: 0,
								// };
								// oldContours[idxC1][pH3I] = {
								// 	x: makeVariance(pV7L[0], pV7H[0]),
								// 	y: makeVariance(pV7L[1], pV7H[1]),
								// 	kind: 0,
								// };
								// pV4 = oldContours[idxC2][pV4I];
								// pH3 = oldContours[idxC1][pH3I];
								
								
								// --------------------------------------------------------------------------------------------------

								// // let q3q2AngleL = geometric.lineAngle([point2GeoJsonLight(q3),point2GeoJsonLight(q2)]);
								// // let q3q2AngleH = geometric.lineAngle([point2GeoJsonHeavy(q3),point2GeoJsonHeavy(q2)]);
								// // let pV5L = geometric.pointTranslate(point2GeoJsonLight(pV4), pV3pV4AngleL, pV4pV7DistanceL);
								// // let pV5H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV3pV4AngleH, pV4pV7DistanceH);
								// let pV5L = geometric.pointTranslate(pV4pV7MidpointL, pV4pV7AngleL + 90, pV4pV7DistanceL * 0.6);
								// let pV5H = geometric.pointTranslate(pV4pV7MidpointH, pV4pV7AngleH + 90, pV4pV7DistanceH * 0.6);
								//---------------------------------------------------------------------------------------------------
								// let pV5L = geometric.pointTranslate(point2GeoJsonLight(pV4), pV3pV4AngleL, pV4pV7DistanceL * 0.5);
								// let pV5H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV3pV4AngleH, pV4pV7DistanceH * 0.5);
								// let pV6L = geometric.pointTranslate(point2GeoJsonLight(pV7), pV3pV4AngleL, pV4pV7DistanceL * 0.5);
								// let pV6H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), pV3pV4AngleH, pV4pV7DistanceH * 0.5);
								// let ext1 = Ot.Glyph.Point.create(
								// 	makeVariance(pV5L[0], pV5H[0]),
								// 	makeVariance(pV5L[1], pV5H[1]),
								// 	1
								// );
								// let ext2 = Ot.Glyph.Point.create(
								// 	makeVariance(pV6L[0], pV6H[0]),
								// 	makeVariance(pV6L[1], pV6H[1]),
								// 	2
								// );
								// oldContours[idxC2][pV5I] = ext1;
								// oldContours[idxC2][pV6I] = ext2;
								// oldContours[idxC1].splice(pH3I, 0, ext1, ext2, pH3);
								//---------------------------------------------------------------------------------------------------
								
								
								// let newCorner = Ot.Glyph.Point.create(
									// 	makeVariance(pV5L[0], pV5H[0]),
									// 	makeVariance(pV5L[1], pV5H[1]),
									// 	0
									// );
									
									// oldContours[idxC2].splice(pV5I, 0, newCorner);
									// oldContours[idxC1].splice(pH2I + 1, 0, newCorner);
									
									// let pV5L = extendLineRight(lineLight(pV3, pV4), pV4pV7DistanceL * 0.25);
									// let pV5H = extendLineRight(lineHeavy(pV3, pV4), pV4pV7DistanceH * 0.5);
									// let pV6L = extendLineRight(lineLight(pV8, pV7), pV4pV7DistanceL * 0.25);
									// let pV6H = extendLineRight(lineHeavy(pV8, pV7), pV4pV7DistanceH * 0.5);
									// oldContours[idxC2][pV5I] = {
									// 	x: makeVariance(pV5L.x, pV5H.x),
									// 	y: makeVariance(pV5L.y, pV5H.y),
									// 	kind: 0,
									// };
									// oldContours[idxC2][pV6I] = {
									// 	x: makeVariance(pV6L.x, pV6H.x),
									// 	y: makeVariance(pV6L.y, pV6H.y),
									// 	kind: 0,
									// };