					for (let idx = startIdx + 1; idx < endIdx - 1; idx++) {
						let p1 = circularArray(contour, idx);
						let p2 = circularArray(contour, idx + 1);
						let p3 = circularArray(contour, idx + 2);
						let p4 = circularArray(contour, idx + 3);
						if (p1.kind === 0 && p2.kind === 1 && p3.kind === 2 && p4.kind === 0) {
							let sB = horizontalSlope(lineLight(p1, p4));
							let c1B = horizontalSlope(lineLight(p1, p2)) || sB;
							let ccB = horizontalSlope(lineLight(p2, p3));
							let c2B = horizontalSlope(lineLight(p3, p4)) || sB;
							for (let n of [sB, c1B, c2B]) {
								if (n > 1 || n < -1) {
									sB = verticalSlope(lineLight(p1, p4));
									c1B = verticalSlope(lineLight(p1, p2)) || sB;
									ccB = verticalSlope(lineLight(p2, p3));
									c2B = verticalSlope(lineLight(p3, p4)) || sB;
									break;
								}
							}
							let d1 = Math.abs(sB - c1B);
							let d2 = Math.abs(sB - c2B);
							let d3 = Math.abs(sB - ccB);
							if ((d1 < 0.04 && d2 < 0.06 && d3 < 0.04) || (d1 < 0.08 && d2 < 0.05 && d3 < 0.06)) {
								if (!redundantPoints.includes(idx + 1)) redundantPoints.push(idx + 1);
								if (!redundantPoints.includes(idx + 2)) redundantPoints.push(idx + 2);
								// pushed += 2;
								let p5 = circularArray(contour, idx + 4);
								let p6 = circularArray(contour, idx + 5);
								let p7 = circularArray(contour, idx + 6);
								if (p5.kind === 1 && p6.kind === 2 && p7.kind === 0) {
									let s2B = horizontalSlope(lineLight(p4, p7));
									let c3B = horizontalSlope(lineLight(p4, p5)) || s2B;
									let c4B = horizontalSlope(lineLight(p6, p7)) || s2B;
									if (vert) {
										s2B = verticalSlope(lineLight(p4, p7));
										c3B = verticalSlope(lineLight(p4, p5)) || s2B;
										c4B = verticalSlope(lineLight(p6, p7)) || s2B;
									}
									let d4 = Math.abs(sB - s2B);
									if (d4 < 0.1) {
										if (!redundantPoints.includes(idx + 3)) redundantPoints.push(idx + 3);
										// pushed += 1;
									}
								}
							}
						}
						// idx += pushed;