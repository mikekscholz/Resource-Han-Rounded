									// if (vStrokeBottomH > hStrokeH * 1) {
									// 	if (pV0.kind === 0 && pV1.kind === 0 && originLight(pV0.x) - originLight(pV1.x) === 0) {
									// 		function decreaseBottomStroke() {
									// 			let strokeDelta = vStrokeBottomH - hStrokeH * 1;
									// 			if (strokeDelta > 1) {
									// 				// let nodes = [pV3I, pV4I, pV5I, pV8I];
									// 				let nodes = [pV1I, pV2I, pV3I, pV4I, pV5I, pV8I];
									// 				if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
									// 					nodes.push(pV9I);
									// 				} 
									// 				for (let iC of nodes) {
									// 					// let iC = circularIndex(contour2, idxP2 + i);
									// 					let pL = pointLight(contour2[iC]);
									// 					let pH = pointHeavy(contour2[iC]);
									// 					contour2[iC] = Ot.Glyph.Point.create(
									// 						makeVariance(pL.x, pH.x),
									// 						makeVariance(pL.y, pH.y - strokeDelta),
									// 						contour2[iC].kind
									// 					);
									// 				}
									// 				pV1 = contour2[pV1I];
									// 				pV2 = contour2[pV2I];
									// 				pV3 = contour2[pV3I];
									// 				pV4 = contour2[pV4I];
									// 				pV5 = contour2[pV5I];
									// 				pV8 = contour2[pV8I];
									// 				pV9 = contour2[pV9I];
									// 				vStrokeBottomH = roundTo(distanceHeavy(pV4, pH3));
									// 				decreaseBottomStroke();
									// 			}
									// 		}
									// 		decreaseBottomStroke();
									// 	}
									// }
									
									
									// let cornerOffsetH = originHeavy(pV1.x) - originHeavy(pH3.x);
									// let pL = pointLight(contour[pH3I]);
									// let pH = pointHeavy(contour[pH3I]);
									// contour[pH3I] = Ot.Glyph.Point.create(
									// 	makeVariance(pL.x, pH.x + cornerOffsetH),
									// 	makeVariance(pL.y, pH.y),
									// 	contour[pH3I].kind
									// );
									// for (let i of [pV3I, pV4I]) {
									// 	let pL = pointLight(contour2[i]);
									// 	let pH = pointHeavy(contour2[i]);
									// 	contour2[i] = Ot.Glyph.Point.create(
									// 		makeVariance(pL.x, pH.x + cornerOffsetH),
									// 		makeVariance(pL.y, pH.y),
									// 		contour2[i].kind
									// 	);
									// }
									// pH3 = contour[pH3I];
									// pV3 = contour2[pV3I];
									// pV4 = contour2[pV4I];
									
																	/*let vStrokeTopH = distanceHeavy(pV0, pVn1);
								let vStrokeBottomL = distanceLight(pV4, pV7);
								let vStrokeBottomH = roundTo(distanceHeavy(pV4, pV7));

								if (vStrokeBottomH > hStrokeH) {
									if (pV0.kind === 0 && pV1.kind === 0 && originLight(pV0.x) - originLight(pV1.x) === 0) {
										function decreaseBottomStroke() {
											let strokeDelta = vStrokeBottomH - hStrokeH;
											if (strokeDelta > 1) {
												let nodes = [pV3I, pV4I, pV5I, pV8I];
												// let nodes = [pV1I, pV2I, pV3I, pV4I, pV5I, pV8I];
												if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
													nodes.push(pV9I);
												} 
												for (let iC of nodes) {
													// let iC = circularIndex(contour2, idxP2 + i);
													let pL = pointLight(contour2[iC]);
													let pH = pointHeavy(contour2[iC]);
													contour2[iC] = Ot.Glyph.Point.create(
														makeVariance(pL.x, pH.x),
														makeVariance(pL.y, pH.y - strokeDelta),
														contour2[iC].kind
													);
												}
												pV1 = contour2[pV1I];
												pV2 = contour2[pV2I];
												pV3 = contour2[pV3I];
												pV4 = contour2[pV4I];
												pV5 = contour2[pV5I];
												pV8 = contour2[pV8I];
												pV9 = contour2[pV9I];
												vStrokeBottomH = roundTo(distanceHeavy(pV4, pV7));
												decreaseBottomStroke();
											}
										}
										decreaseBottomStroke();
									} else {
										let tValMinL = hStrokeL / vStrokeBottomL;
										let tValMinH = hStrokeH / vStrokeBottomH;
										let tValL = 1;
										let tValH = 1;
										let interpolator3L = geometric.lineInterpolate([point2GeoJsonLight(pV7), point2GeoJsonLight(pV3)]);
										let interpolator3H = geometric.lineInterpolate([point2GeoJsonHeavy(pV7), point2GeoJsonHeavy(pV3)]);
										let interpolator4L = geometric.lineInterpolate([point2GeoJsonLight(pV7), point2GeoJsonLight(pV4)]);
										let interpolator4H = geometric.lineInterpolate([point2GeoJsonHeavy(pV7), point2GeoJsonHeavy(pV4)]);
										let pV1L = point2GeoJsonLight(pV1);
										let pV1H = point2GeoJsonHeavy(pV1);
										let pV2L = point2GeoJsonLight(pV2);
										let pV2H = point2GeoJsonHeavy(pV2);
										let pV3L = interpolator3L(tValL);
										let pV3H = interpolator3H(tValH);
										let pV4L = interpolator4L(tValL);
										let pV4H = interpolator4H(tValH);
										let inflectL;
										let inflectH;
										function testL() {
											pV3L = interpolator3L(tValL);
											pV4L = interpolator4L(tValL);
											let curve = new Bezier(pV1L[0],pV1L[1],pV2L[0],pV2L[1],pV3L[0],pV3L[1],pV4L[0],pV4L[1]);
											inflectL = curve.inflections();
										}
										function testH() {
											pV3H = interpolator3H(tValH);
											pV4H = interpolator4H(tValH);
											let curve = new Bezier(pV1H[0],pV1H[1],pV2H[0],pV2H[1],pV3H[0],pV3H[1],pV4H[0],pV4H[1]);
											inflectH = curve.inflections();
										}
										testL();
										while (inflectL.length === 0 && tValL > tValMinL) {
											tValL -= 0.01;
											testL();
										}
										tValL += 0.01;
										testL();
										testH();
										while (inflectH.length === 0 && tValH > tValMinH) {
											tValH -= 0.01;
											testH();
										}
										tValH += 0.01;
										testH();
										contour2[pV4I] = Ot.Glyph.Point.create(
											makeVariance(pV4L[0], pV4H[0]),
											makeVariance(pV4L[1], pV4H[1]),
											0
										);
										contour2[pV3I] = Ot.Glyph.Point.create(
											makeVariance(pV3L[0], pV3H[0]),
											makeVariance(pV3L[1], pV3H[1]),
											2
										);
										pV4 = contour2[pV4I];
										pV3 = contour2[pV3I];
									}*/
								// }
								
																
								
								/* if (length1_4H < length7_4H * 0.6) {
									let distance = (length7_4H * 0.6) - length1_4H;
									let pV0L = point2GeoJsonLight(pV0);
									let pV0H = point2GeoJsonHeavy(pV0);
									let pV1L = point2GeoJsonLight(pV1);
									let pV1H = point2GeoJsonHeavy(pV1);
									let pV2L = point2GeoJsonLight(pV2);
									let pV2H = point2GeoJsonHeavy(pV2);
									let angle2_1H = geometric.lineAngle(line2GeoJsonHeavy(pV2, pV1));
									let nV2H = geometric.pointTranslate(pV2H, angle2_1H, distance);
									let nV1H = geometric.pointTranslate(pV1H, angle2_1H, distance);
									contour2[pV2I] = Ot.Glyph.Point.create(
										makeVariance(pV2L[0], nV2H[0]),
										makeVariance(pV2L[1], nV2H[1]),
										1
									);
									contour2[pV1I] = Ot.Glyph.Point.create(
										makeVariance(pV1L[0], nV1H[0]),
										makeVariance(pV1L[1], nV1H[1]),
										0
									);
									pV2 = contour2[pV2I];
									pV1 = contour2[pV1I];
									if (pV0.kind === 2) {
										let nV0H = geometric.pointTranslate(pV0H, angle2_1H, distance);
										contour2[pV0I] = Ot.Glyph.Point.create(
											makeVariance(pV0L[0], nV0H[0]),
											makeVariance(pV0L[1], nV0H[1]),
											2
										);
										pV0 = contour2[pV0I];
									}
								} */
								
																
								
								/* let pV4pV7DistanceL = distanceLight(pV4, pV7);
								let pV4pV7DistanceH = distanceHeavy(pV4, pV7);
								let pV4pV7AngleL = geometric.lineAngle([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let v4L = point2GeoJsonLight(pV4);
								let v4H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								let v7L = point2GeoJsonLight(pV7);
								let v7H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								contour2[pV4I] = {
									x: makeVariance(v4L[0], v4H[0]),
									y: makeVariance(v4L[1], v4H[1]),
									kind: 0,
								};
								contour2[pV7I] = {
									x: makeVariance(v7L[0], v7H[0]),
									y: makeVariance(v7L[1], v7H[1]),
									kind: 0,
								};
								pV4 = contour2[pV4I];
								pV7 = contour2[pV7I]; */
								
								
								// contour[pH2I] = {
								// 	x: pV4.x,
								// 	y: pV4.y,
								// 	kind: pH2.kind,
								// };

								// if (pH3I === 0) {
								// 	contour.push(contour[0]);
								// }
								// if (JSON.stringify(contour[pH3I]) === JSON.stringify(circularArray(contour, pH3I + 1))) {
								// 	contour[circularIndex(contour, pH3I + 1)] = {
								// 		x: contour[pH3I].x,
								// 		y: contour[pH3I].y,
								// 		kind: contour[circularIndex(contour, pH3I + 1)].kind,
								// 	};
								// }
								
																// if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
								// 	c2StartI = pV9I;
								// 	c2Start = pV9;
								// } 
								/*
								if (name === "uni3110") {
									console.log(contour2);
								}
								//NOTE - store points to delete before modifying array.
								let deleteNodes = [];
								let pVd1I = circularIndex(contour2, pV8I - 2);
								let pVd2I = circularIndex(contour2, pV8I - 1);
								if (contour2[pVd1I].kind === 1 && contour2[pVd2I].kind === 2) {
									deleteNodes.push(JSON.stringify(contour2[pVd1I]));
									deleteNodes.push(JSON.stringify(contour2[pVd2I]));
								}
								deleteNodes.push(JSON.stringify(contour2[pV5I]));
								deleteNodes.push(JSON.stringify(contour2[pV6I]));
								*/
								
								
								// let pVd1 = JSON.stringify(contour2[pVd1I]);
								// let pVd2 = JSON.stringify(contour2[pVd2I]);
								
								/*
								let testPolyL = [contour2GeoJsonLight(contour)];
								let testPolyH = [contour2GeoJsonHeavy(contour)];
								let testStart, testEnd;
								let testOffsetL = 1;
								let testOffsetH = 1;
								let extraCorner = false;
								if (pV9.kind === 0 && distanceHeavy(pV8, pV9) < 5) {
									testStart = pV10;
									testEnd = pV9;
									extraCorner = true;
								} else {
									testStart = pV9;
									testEnd = pV8;
								}
								let sL = point2GeoJsonLight(testStart);
								let eL = point2GeoJsonLight(testEnd);
								let sH = point2GeoJsonHeavy(testStart);
								let eH = point2GeoJsonHeavy(testEnd);
								// let nL = extendLineGeoJson(sL, eL, testOffsetL);
								// let nH = extendLineGeoJson(sH, eH, testOffsetH);
								let nL = [eL[0], eL[1] - testOffsetL];
								let nH = [eH[0], eH[1] - testOffsetH];
								let tL, tH;
								function testL() {
									// nL = extendLineGeoJson(sL, eL, testOffsetL);
									nL = [eL[0], eL[1] - testOffsetL];
									tL = inside(nL, testPolyL);
								}
								function testH() {
									// nH = extendLineGeoJson(sH, eH, testOffsetH);
									nH = [eH[0], eH[1] - testOffsetH];
									tH = inside(nH, testPolyH);
								}
								testL();
								while (tL) {
									testOffsetL++;
									testL();
								}
								testOffsetL--;
								testL();
								testH();
								while (tH) {
									testOffsetH++;
									testH();
								}
								testOffsetH--;
								testH();
								
								let nV8 = Ot.Glyph.Point.create(
									makeVariance(nL[0], nH[0]),
									makeVariance(nL[1], nH[1]),
									0
								);
								
								if (extraCorner) {
									contour2[pV8I] = nV8;
								} else {
									contour2.splice(pV8I, 0, nV8);
								}
								*/
								
								
								/*
								let iHL = intersectLight(pH3, pH4, pH6, pH5);
								let iHH = intersectHeavy(pH3, pH4, pH6, pH5);
								let iVL = intersectLight(pV1, pV2, pV4, pV3);
								let iVH = intersectHeavy(pV1, pV2, pV4, pV3);
								
								let newH = Ot.Glyph.Point.create(
									makeVariance(iHL.x, iHH.x),
									makeVariance(iHL.y, iHH.y),
									0
								);
								let newV = Ot.Glyph.Point.create(
									makeVariance(iVL.x, iVH.x),
									makeVariance(iVL.y, iVH.y),
									0
								);
								contour[pH4I] = newH;
								contour[pH5I] = newH;
								contour2[pV2I] = newV;
								contour2[pV3I] = newV;
								*/
								
								/*
								let pV4pV7DistanceL = distanceLight(pV4, pV7);
								let pV4pV7DistanceH = distanceHeavy(pV4, pV7);
								let pV4pV7AngleL = geometric.lineAngle([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let v4L = geometric.pointTranslate(point2GeoJsonLight(pV4), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.13);
								let v4H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								let v7L = geometric.pointTranslate(point2GeoJsonLight(pV7), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.13);
								let v7H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								contour2[pV4I] = {
									x: makeVariance(v4L[0], v4H[0]),
									y: makeVariance(v4L[1], v4H[1]),
									kind: 0,
								};
								contour2[pV7I] = {
									x: makeVariance(v7L[0], v7H[0]),
									y: makeVariance(v7L[1], v7H[1]),
									kind: 0,
								};
								contour[pH2I] = {
									x: makeVariance(v4L[0], v4H[0]),
									y: makeVariance(v4L[1], v4H[1]),
									kind: 0,
								};
								contour[pH3I] = {
									x: makeVariance(v7L[0], v7H[0]),
									y: makeVariance(v7L[1], v7H[1]),
									kind: 0,
								};
								*/
								
								
								/*
								let pV4pV7DistanceL = distanceLight(pV4, pV7);
								let pV4pV7DistanceH = distanceHeavy(pV4, pV7);
								let pV3pV4AngleL = geometric.lineAngle([point2GeoJsonLight(pV3), point2GeoJsonLight(pV4)]);
								let pV3pV4AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV3), point2GeoJsonHeavy(pV4)]);
								let pH4pH3AngleL = geometric.lineAngle([point2GeoJsonLight(pH4), point2GeoJsonLight(pH3)]);
								let pH4pH3AngleH = geometric.lineAngle([point2GeoJsonHeavy(pH4), point2GeoJsonHeavy(pH3)]);
								let pV4pV7AngleL = geometric.lineAngle([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7AngleH = geometric.lineAngle([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let pV4pV7MidpointL = geometric.lineMidpoint([point2GeoJsonLight(pV4), point2GeoJsonLight(pV7)]);
								let pV4pV7MidpointH = geometric.lineMidpoint([point2GeoJsonHeavy(pV4), point2GeoJsonHeavy(pV7)]);
								let c1L = geometric.pointTranslate(point2GeoJsonLight(pV4), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.2);
								let c1H = geometric.pointTranslate(point2GeoJsonHeavy(pV4), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.2);
								let c4L = geometric.pointTranslate(point2GeoJsonLight(pV7), pV4pV7AngleL - 90, pV4pV7DistanceL * 0.2);
								let c4H = geometric.pointTranslate(point2GeoJsonHeavy(pV7), pV4pV7AngleH - 90, pV4pV7DistanceH * 0.2);
								let mL = geometric.pointTranslate(pV4pV7MidpointL, pV4pV7AngleL - 90, pV4pV7DistanceL * 0.25);
								let mH = geometric.pointTranslate(pV4pV7MidpointH, pV4pV7AngleH - 90, pV4pV7DistanceH * 0.25);
								let e1L = geometric.pointTranslate(mL, pV4pV7AngleL + 180, pV4pV7DistanceL * 0.15);
								let e1H = geometric.pointTranslate(mH, pV4pV7AngleH + 180, pV4pV7DistanceH * 0.15);
								let e2L = geometric.pointTranslate(mL, pV4pV7AngleL, pV4pV7DistanceL * 0.15);
								let e2H = geometric.pointTranslate(mH, pV4pV7AngleH, pV4pV7DistanceH * 0.15);
								let c2L = geometric.pointTranslate(e1L, pV4pV7AngleL + 180, pV4pV7DistanceL * 0.2);
								let c2H = geometric.pointTranslate(e1H, pV4pV7AngleH + 180, pV4pV7DistanceH * 0.2);
								let c3L = geometric.pointTranslate(e2L, pV4pV7AngleL, pV4pV7DistanceL * 0.2);
								let c3H = geometric.pointTranslate(e2H, pV4pV7AngleH, pV4pV7DistanceH * 0.2);
								let ext1 = Ot.Glyph.Point.create(
									makeVariance(c1L[0], c1H[0]),
									makeVariance(c1L[1], c1H[1]),
									1
								);
								let ext2 = Ot.Glyph.Point.create(
									makeVariance(c2L[0], c2H[0]),
									makeVariance(c2L[1], c2H[1]),
									2
								);
								let ext3 = Ot.Glyph.Point.create(
									makeVariance(e1L[0], e1H[0]),
									makeVariance(e1L[1], e1H[1]),
									0
								);
								let ext4 = Ot.Glyph.Point.create(
									makeVariance(e2L[0], e2H[0]),
									makeVariance(e2L[1], e2H[1]),
									0
								);
								let ext5 = Ot.Glyph.Point.create(
									makeVariance(c3L[0], c3H[0]),
									makeVariance(c3L[1], c3H[1]),
									1
								);
								let ext6 = Ot.Glyph.Point.create(
									makeVariance(c4L[0], c4H[0]),
									makeVariance(c4L[1], c4H[1]),
									2
								);
								contour2[pV5I] = ext1;
								contour2[pV6I] = ext6;
								contour2.splice(pV6I, 0, ext2, ext3, ext4, ext5);
								contour.splice(pH2I + 1, 0, ext1, ext2, ext3, ext4, ext5, ext6, pH3);
								*/
								
								
								
								/*
								let bottomCorner = Ot.Glyph.Point.create(
									makeVariance(originLight(pV4.x), originHeavy(pV4.x)),
									makeVariance(originLight(pV7.y), originHeavy(pV7.y)),
									0
								);
								contour2.splice(pV6I, 0, bottomCorner);
								contour.splice(pH2I + 1, 0, bottomCorner);

								let spliceIdx = [];
								for (let i = 0; i < contour2.length; i++) {
									let pStr = JSON.stringify(contour2[i]);
									if (deleteNodes.includes(pStr)) {
										spliceIdx.push(i);
									}
									// if (spliceIdx.length === 4) break;
								}
								if (spliceIdx.length) {
									spliceIdx.sort((a, b) => b - a);
									for (const i of spliceIdx) {
										contour2.splice(i, 1);
									}
								}
								*/
								
								
								// contour.splice(pH5I, 1);
								// if (name in references.skipRedundantPoints === false) {
								// 	references.skipRedundantPoints[name] = [];
								// }
								// references.skipRedundantPoints[name].push(idxC2);
								// if (name in references.extendUpContourIdx === false) {
								// 	references.extendUpContourIdx[name] = [];
								// }
								// if (!references.extendUpContourIdx[name].includes(idxC2)) {
								// 	references.extendUpContourIdx[name].push(idxC2);
								// }
								
											// if (!engHandledContours.includes(idxC1)) {
			// 	glyph.geometry.contours.push(contour);
			// }
				/*	if (name in references.skipRoundingContourSeg === false) {
					references.skipRoundingContourSeg[name] = [];
				}
				let refArray = references.skipRoundingContourSeg[name];
				let objIndex = refArray.findIndex((obj) => obj["contourIdx"] === newIdx);
				if (objIndex === -1) {
					refArray.push({ contourIdx: newIdx, segments: [innerCornerSeg, innerCornerSeg + 1, innerCornerSeg + 2] });
				} else {
					let ref = refArray[objIndex];
					if (!ref.segments.includes(innerCornerSeg)) {
						ref.segments.push(innerCornerSeg);
					}
					if (!ref.segments.includes(innerCornerSeg + 1)) {
						ref.segments.push(innerCornerSeg + 1);
					}
					if (!ref.segments.includes(innerCornerSeg + 2)) {
						ref.segments.push(innerCornerSeg + 2);
					}
				} */
				// if (name in references.skipRedundantPoints === false) {
				// 	references.skipRedundantPoints[name] = [];
				// }
				// references.skipRedundantPoints[name].push(newIdx);
				// if (name in references.extendUpContourIdx === false) {
				// 	references.extendUpContourIdx[name] = [];
				// }
				// if (!references.extendUpContourIdx[name].includes(newIdx)) {
				// 	references.extendUpContourIdx[name].push(newIdx);
				// }
				// if (name in references.extendRightContourIdx === false) {
				// 	references.extendRightContourIdx[name] = [];
				// }
				// if (!references.extendRightContourIdx[name].includes(newIdx)) {
				// 	references.extendRightContourIdx[name].push(newIdx);
				// }