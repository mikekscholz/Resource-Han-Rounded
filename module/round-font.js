"use strict";

const { Ot } = require("ot-builder");
const { roundTo } = require("./util");
const ProgressBar = require('./node-progress');

function circularArray(array, index) {
	var length = array && array.length;
	var idx = Math.abs(length + index % length) % length;
	return array[isNaN(idx) ? index : idx];
}

function roundFont(font, references) {
	let debug = false;
let curGlyph = "";
	//
	// font variation metadata
	//

	const dimWght = font.fvar.axes[0].dim
	// const dimRond = new Ot.Var.Dim('ROND', 0, 100, 100);
	// const dimRondNameId = 256 + 32;
	// font.fvar.axes.push(new Ot.Fvar.Axis(dimRond, Ot.Fvar.AxisFlags.Default, dimRondNameId));
	// font.name.records.push({ platformID: 3, encodingID: 1, languageID: 0x0409, nameID: dimRondNameId, value: "Roundness" });
	// for (const instance of font.fvar.instances) {
		// instance.coordinates.set(dimRond, dimRond.default);
	// }
	// font.avar.segmentMaps.set(dimRond, [[-1, -1], [0, 0], [1, 1]]);

	//
	// masters
	//

	const masterDimWghtMin = { dim: dimWght, min: 0, peak: 0, max: 1 };
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	// const masterDimRondMin = { dim: dimRond, min: -1, peak: -1, max: 0 };
	// const masterDimRondMax = { dim: dimRond, min: -1, peak: 0, max: 0 };

	// const masterWghtMinRondMin = new Ot.Var.Master([masterDimWghtMin, masterDimRondMin]);
	/* masterWghtMinRondMax is origin. */
	// const masterWghtMaxRondMin = new Ot.Var.Master([masterDimWghtMax, masterDimRondMin]);
	// const masterWghtMaxRondMax = new Ot.Var.Master([masterDimWghtMax, masterDimRondMax]);
	const masterWghtMaxRondMax = new Ot.Var.Master([masterDimWghtMax]);

	const masterSet = new Ot.Var.MasterSet();
	// masterSet.getOrPush(masterWghtMinRondMin);
	// masterSet.getOrPush(masterWghtMaxRondMin);
	masterSet.getOrPush(masterWghtMaxRondMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);

	// create Ot.Var.Value from values of 4 vertices of the region.
	function makeVariance(
		// valueWghtMinRondMin, 
		valueWghtMinRondMax,
		// valueWghtMaxRondMin, 
		valueWghtMaxRondMax,
		precision = 1) {
		// valueWghtMinRondMin = roundTo(valueWghtMinRondMin, precision);
		valueWghtMinRondMax = roundTo(valueWghtMinRondMax, precision);
		// valueWghtMaxRondMin = roundTo(valueWghtMaxRondMin, precision);
		valueWghtMaxRondMax = roundTo(valueWghtMaxRondMax, precision);
		const origin = valueWghtMinRondMax
		return valueFactory.create(origin, [
			// [masterWghtMinRondMin, valueWghtMinRondMin - origin],
			// [masterWghtMaxRondMin, valueWghtMaxRondMin - valueWghtMinRondMin - valueWghtMaxRondMax + origin],
			[masterWghtMaxRondMax, valueWghtMaxRondMax - origin]
		]);
	}

	//
	// transform
	//

	const radius = { min: 18, max: 72, inner: 12 };

	// extract values of 2 masters.
	const instanceShsWghtMax = new Map([[dimWght, 1]]);

	function originLight(point) {
		return Ot.Var.Ops.originOf(point);
	}
	
	function originHeavy(point) {
		return Ot.Var.Ops.evaluate(point, instanceShsWghtMax);
	}
	
	function extractPoint(point) {
		const xShsOrigin = Ot.Var.Ops.originOf(point.x);
		const xShsWghtMax = Ot.Var.Ops.evaluate(point.x, instanceShsWghtMax);
		const yShsOrigin = Ot.Var.Ops.originOf(point.y);
		const yShsWghtMax = Ot.Var.Ops.evaluate(point.y, instanceShsWghtMax);
		const kind = point.kind;
		return [xShsOrigin, xShsWghtMax, yShsOrigin, yShsWghtMax, kind];
	}

	// split contour to segments. a segment is a line or a simple curve.
	// type: `line` or `curve`
	// m0, m1: values at masters
	// p1, p2: end point
	// c1, c2: control point
	// t1, t2: tangent vector
	function splitContour(contour) {
		const segments = [];
		if (contour.length < 2) // malformed
			return segments;
		contour = [...contour, contour[0]]; // the last end point may be omitted
		const length = contour.length;
		const advance = index => (index == length - 1 ? 0 : index + 1);
		let point = contour[0];
		let current = { m0: {}, m1: {} };
		let [m0x, m1x, m0y, m1y, kind] = extractPoint(point); // first point is alway on-curve.
		current.m0.p1 = { x: m0x, y: m0y };
		current.m1.p1 = { x: m1x, y: m1y };
		let status = 1; // 0 --- current seg is empty; 1 -- p1 read
		for (let i = 1; i;) {
			point = contour[i];
			[m0x, m1x, m0y, m1y, kind] = extractPoint(point);
			switch (status) {
				case 0: { // current seg is empty, read p1
					current.m0.p1 = { x: m0x, y: m0y };
					current.m1.p1 = { x: m1x, y: m1y };
					status = 1;
					i = advance(i);
					break;
				}
				case 1: { // p1 read
					switch (kind) {
						case Ot.Glyph.PointType.Corner: { // possibly line
							if (
								(m0x !== current.m0.p1.x || m0y !== current.m0.p1.y) &&
								(m1x !== current.m1.p1.x || m1y !== current.m1.p1.y)
							) {
								current.type = "line";
								current.m0.p2 = { x: m0x, y: m0y };
								current.m0.t1 = { x: (current.m0.p2.x - current.m0.p1.x) / 3, y: (current.m0.p2.y - current.m0.p1.y) / 3 };
								current.m0.t2 = current.m0.t1;
								current.m1.p2 = { x: m1x, y: m1y };
								current.m1.t1 = { x: (current.m1.p2.x - current.m1.p1.x) / 3, y: (current.m1.p2.y - current.m1.p1.y) / 3 };
								current.m1.t2 = current.m1.t1;
								segments.push(current);
							}
							break;
						}
						case Ot.Glyph.PointType.Lead: { // possibly curve
							current.m0.c1 = { x: m0x, y: m0y };
							current.m1.c1 = { x: m1x, y: m1y };
							point = contour[++i]; // next control point
							[m0x, m1x, m0y, m1y, kind] = extractPoint(point);
							current.m0.c2 = { x: m0x, y: m0y };
							current.m1.c2 = { x: m1x, y: m1y };
							i = advance(i);
							point = contour[i]; // next end point, may wrap
							[m0x, m1x, m0y, m1y, kind] = extractPoint(point);
							current.m0.p2 = { x: m0x, y: m0y };
							current.m1.p2 = { x: m1x, y: m1y };

							if (
								(current.m0.c1.x == current.m0.p1.x && current.m0.c1.y == current.m0.p1.y) ||
								(current.m1.c1.x == current.m1.p1.x && current.m1.c1.y == current.m1.p1.y) ||
								(current.m0.c2.x == current.m0.p2.x && current.m0.c2.y == current.m0.p2.y) ||
								(current.m1.c2.x == current.m1.p2.x && current.m1.c2.y == current.m1.p2.y)
							) { // decayed cubic curve, treat it as line
								current.type = "line";
								current.m0.t1 = { x: (current.m0.p2.x - current.m0.p1.x) / 3, y: (current.m0.p2.y - current.m0.p1.y) / 3 };
								current.m0.t2 = current.m0.t1;
								current.m1.t1 = { x: (current.m1.p2.x - current.m0.p1.x) / 3, y: (current.m1.p2.y - current.m1.p1.y) / 3 };
								current.m1.t2 = current.m1.t1;
							} else {
								current.type = "curve";
								current.m0.t1 = { x: (current.m0.c1.x - current.m0.p1.x), y: (current.m0.c1.y - current.m0.p1.y) };
								current.m0.t2 = { x: (current.m0.p2.x - current.m0.c2.x), y: (current.m0.p2.y - current.m0.c2.y) };
								current.m1.t1 = { x: (current.m1.c1.x - current.m1.p1.x), y: (current.m1.c1.y - current.m1.p1.y) };
								current.m1.t2 = { x: (current.m1.p2.x - current.m1.c2.x), y: (current.m1.p2.y - current.m1.c2.y) };
							}
							segments.push(current);
							break;
						}
					}
					current = { m0: {}, m1: {} };
					status = 0;
					break;
				}
			}
		}
		return segments;
	}

	function abs(vec) {
		return Math.sqrt(vec.x * vec.x + vec.y * vec.y);
	}

	function normalize(vec) {
		const length = abs(vec);
		return length ? { x: vec.x / length, y: vec.y / length } : { x: 0, y: 0 };
	}

	function distance(point1, point2) {
		return abs({ x: point1.x - point2.x, y: point1.y - point2.y });
	}

	function arg(vec1, vec2) {
		if (abs(vec1) == 0 || abs(vec2) == 0)
			return 0;
		// treat them as complex number, vec2 / vec1
		const real = (vec1.x * vec2.x + vec1.y * vec2.y) / (vec1.x * vec1.x + vec1.y * vec1.y);
		const imag = (vec1.x * vec2.y - vec1.y * vec2.x) / (vec1.x * vec1.x + vec1.y * vec1.y);
		// arg of (vec2 / vec1), in [-π, π];
		return Math.atan2(imag, real);
	}

	function coefficientForm(master, type) {
		if (type == "curve") {
			// point(t) = p1 (1-t)³ + c1 t (1-t)² + c2 t² (1-t) + p2 t³
			//          = a t³ + b t² + c t + d
			const { p1, p2, c1, c2 } = master;
			const a = { x: (p2.x - p1.x) + 3 * (c1.x - c2.x), y: (p2.y - p1.y) + 3 * (c1.y - c2.y) };
			const b = { x: 3 * (p1.x + c2.x) - 6 * c1.x, y: 3 * (p1.y + c2.y) - 6 * c1.y };
			const c = { x: 3 * (c1.x - p1.x), y: 3 * (c1.y - p1.y) };
			const d = p1;
			return [d, c, b, a];
		} else { // line, decayed form
			// point(t) = p1 (1-t) + p2 t
			//          = a t + b
			const { p1, p2 } = master;
			const a = { x: (p2.x - p1.x), y: (p2.y - p1.y) };
			const b = p1;
			return [b, a, { x: 0, y: 0 }, { x: 0, y: 0 }];
		}
	}

	function pointAt(coeff, t) {
		const [d, c, b, a] = coeff;
		return { x: ((a.x * t + b.x) * t + c.x) * t + d.x, y: ((a.y * t + b.y) * t + c.y) * t + d.y };
	}

	function derivativeAt(coeff, t) {
		const [_, c, b, a] = coeff;
		return { x: (3 * a.x * t + 2 * b.x) * t + c.x, y: (3 * a.y * t + 2 * b.y) * t + c.y };
	}

	function findDistanceImpl(coeff, dist, pBase, tBegin, tEnd) {
		const pBegin = pointAt(coeff, tBegin);
		const distBegin = distance(pBase, pBegin);
		const pEnd = pointAt(coeff, tEnd);
		const distEnd = distance(pBase, pEnd);
		const tMed = (tBegin + tEnd) / 2;
		const pMed = pointAt(coeff, tMed);
		const distMed = distance(pBase, pMed);
		if (distMed - dist < 1 && dist - distMed < 1)
			return tMed;
		if ((distBegin - dist) * (distMed - dist) <= 0)
			return findDistanceImpl(coeff, dist, pBase, tBegin, tMed);
		else
			return findDistanceImpl(coeff, dist, pBase, tMed, tEnd);
	}

	function findDistanceFromBegin(coeff, dist) {
		if (dist < 1)
			return 0;
		const pBase = pointAt(coeff, 0);
		const pMed = pointAt(coeff, 0.5);
		const distMed = distance(pBase, pMed);
		const pEnd = pointAt(coeff, 1);
		const distEnd = distance(pBase, pEnd);
		if (distMed - dist < 1 && dist - distMed < 1)
			return 0.5;
		if (distMed > dist)
			return findDistanceImpl(coeff, dist, pBase, 0, 0.5);
		else if (dist >= distEnd)
			return 1;
		else
			return findDistanceImpl(coeff, dist, pBase, 0.5, 1);
	}

	function findDistanceFromEnd(coeff, dist) {
		if (dist < 1)
			return 1;
		const pBase = pointAt(coeff, 1);
		const pBegin = pointAt(coeff, 0);
		const distBegin = distance(pBase, pBegin);
		const pMed = pointAt(coeff, 0.5);
		const distMed = distance(pBase, pMed);
		if (distMed - dist < 1 && dist - distMed < 1)
			return 0.5;
		if (distMed > dist)
			return findDistanceImpl(coeff, dist, pBase, 0.5, 1);
		else if (dist >= distBegin)
			return 0;
		else
			return findDistanceImpl(coeff, dist, pBase, 0, 0.5);
	}

	function calculateRadius(prev, cur, next, name, idxC, spec = false) {
		let swapRadii = false;
		let minRadii = false;
		let customLightRadius = false;
		let customHeavyRadius = false;
		if (spec == "swapRadii" || references.negativeGlyphs.includes(name)) swapRadii = true;
		if (spec == "minRadii") minRadii = true;
		if (name in references.customRadiusList) {
			let radiiArray = references.customRadiusList[name];
			for (let i = 0; i < radiiArray.length; i++) {
				const radii = radiiArray[i];
				if ("idx" in radii && radii?.idx !== idxC) continue;
				customLightRadius = radii.light;
				customHeavyRadius = radii.heavy;
			}
		}
		// estimate radius based on the corner angle
		const m0Arg1 = arg(prev.m0.t2, cur.m0.t1);
		let m0Radius1 = 0;
		if (-0.1 <= m0Arg1 && m0Arg1 <= 0.1) // almost linear
			;
		else if (m0Arg1 < 0) // inner corner
			m0Radius1 = radius.inner;
		else // outer corner, larger radius for larger arg
			m0Radius1 = Math.max((customLightRadius || radius.min) * (1 - Math.cos(m0Arg1)), radius.inner);
		const m0Arg2 = arg(cur.m0.t2, next.m0.t1);
		let m0Radius2 = 0;
		if (-0.1 <= m0Arg2 && m0Arg2 <= 0.1)
			;
		else if (m0Arg2 < 0)
			m0Radius2 = radius.inner;
		else
			m0Radius2 = Math.max((customLightRadius || radius.min) * (1 - Math.cos(m0Arg2)), radius.inner);

		// find $t$ value on curve for estimated radius
		const m0Coeff = coefficientForm(cur.m0, cur.type);
		let m0T1 = findDistanceFromBegin(m0Coeff, m0Radius1);
		let m0T2 = findDistanceFromEnd(m0Coeff, m0Radius2);
		if (m0T1 <= m0T2) // well-formed
			;
		else { // radius too large, follow the ratio
			m0T1 = m0T1 / (m0T1 + (1 - m0T2));
			m0T2 = m0T1;
		}

		// another master
		const m1Arg1 = arg(prev.m1.t2, cur.m1.t1);
		let m1Radius1 = 0;
		if (-0.1 <= m1Arg1 && m1Arg1 <= 0.1)
			;
		else if (m1Arg1 < 0) {
			if (swapRadii) {
				m1Radius1 = radius.max;
			} else if (minRadii) {
				m1Radius1 = radius.min;
			} else {
				m1Radius1 = radius.inner;
			}
		} else {
			if (swapRadii) {
				m1Radius1 = Math.min(radius.max * (1 - Math.cos(m1Arg1)), radius.inner);
			} else if (minRadii) {
				m1Radius1 = Math.max(radius.min * (1 - Math.cos(m1Arg1)), radius.inner);
			} else {
				m1Radius1 = Math.max((customHeavyRadius || radius.max) * (1 - Math.cos(m1Arg1)), radius.inner);
			}
		}
		const m1Arg2 = arg(cur.m1.t2, next.m1.t1);
		let m1Radius2 = 0;
		if (-0.1 <= m1Arg2 && m1Arg2 <= 0.1)
			;
		else if (m1Arg2 < 0)
			if (swapRadii) {
				m1Radius2 = radius.max;
			} else if (minRadii) {
				m1Radius2 = radius.min;
			} else {
				m1Radius2 = radius.inner;
			}
		else {
			if (swapRadii) {
				m1Radius2 = Math.min(radius.max * (1 - Math.cos(m1Arg2)), radius.inner);
			} else if (minRadii) {
				m1Radius2 = Math.max(radius.min * (1 - Math.cos(m1Arg2)), radius.inner);
			} else {
				m1Radius2 = Math.max((customHeavyRadius || radius.max) * (1 - Math.cos(m1Arg2)), radius.inner);
			}
		}

		const m1Coeff = coefficientForm(cur.m1, cur.type);
		let m1T1 = findDistanceFromBegin(m1Coeff, m1Radius1);
		let m1T2 = findDistanceFromEnd(m1Coeff, m1Radius2);
		if (m1T1 <= m1T2)
			;
		else {
			m1T1 = m1T1 / (m1T1 + (1 - m1T2));
			m1T2 = m1T1;
		}

		return [m0T1, m0T2, m1T1, m1T2];
	}

	function subdivideImpl(master, t) {
		// curve division, see https://math.stackexchange.com/questions/877725
		const { p1, c1, c2, p2 } = master;
		const b = { x: (1 - t) * p1.x + t * c1.x, y: (1 - t) * p1.y + t * c1.y };
		const _ = { x: (1 - t) * c1.x + t * c2.x, y: (1 - t) * c1.y + t * c2.y };
		const f = { x: (1 - t) * c2.x + t * p2.x, y: (1 - t) * c2.y + t * p2.y };
		const c = { x: (1 - t) * b.x + t * _.x, y: (1 - t) * b.y + t * _.y };
		const e = { x: (1 - t) * _.x + t * f.x, y: (1 - t) * _.y + t * f.y };
		const d = { x: (1 - t) * c.x + t * e.x, y: (1 - t) * c.y + t * e.y };
		return [{ p1: p1, c1: b, c2: c, p2: d }, { p1: d, c1: e, c2: f, p2: p2 }];
	}

	function subdivide(master, t1, t2) {
		if (t1 >= t2) {
			const t = (t1 + t2) / 2;
			const coeff = coefficientForm(master, "curve");
			const p = pointAt(coeff, t);
			return { p1: p, c1: p, p2: p, c2: p };
		}
		let sub = subdivideImpl(master, t1)[1];
		sub = subdivideImpl(sub, (t2 - t1) / (1 - t1))[0];
		return sub;
	}

	function transformContour(contour, name, idxC) {
		const segments = splitContour(contour);
		debug && console.log(JSON.stringify(segments));
		let spec = false, specSgmt;
		// if (name in invertRadius) {
		// 	const invertedContours = invertRadius[name];
		// 	if (invertedContours.includes(segments.length)) {
		// 		spec = "swapRadii";
		// 	}
		// }
		if (name in references.minRadius) {
			const minContours = references.minRadius[name];
			if (minContours.includes(segments.length)) {
				spec = "minRadii";
			}
		}
		if (name in references.horizontalLeftFalling) {
			let refs = references.horizontalLeftFalling[name];
			for (const ref of refs) {
				let idxLF = ref.leftFalling;
				if (idxLF === idxC) spec = "leftFalling";
			}
		}
		if (name in references.horizontalLeftFalling2) {
			let refs = references.horizontalLeftFalling2[name];
			for (const ref of refs) {
				let idxLF = ref.leftFalling;
				if (idxLF === idxC) spec = "leftFalling";
			}
		}
		if (name in references.horizontalLeftFalling2b) {
			let refs = references.horizontalLeftFalling2b[name];
			for (const ref of refs) {
				let idxLF = ref.leftFalling;
				if (idxLF === idxC) spec = "leftFalling";
			}
		}
		if (name in references.horizontalLeftFalling3) {
			let refs = references.horizontalLeftFalling3[name];
			for (const ref of refs) {
				let idxLF = ref.leftFalling;
				if (idxLF === idxC) spec = "leftFalling";
			}
		}
		if (name in references.horizontalLeftFalling4) {
			let refs = references.horizontalLeftFalling4[name];
			for (const ref of refs) {
				let idxLF = ref.leftFalling;
				if (idxLF === idxC) spec = "leftFalling";
			}
		}
		// if (name in references.horizontalLeftFalling2) {
		// 	let refs = references.horizontalLeftFalling2[name];
		// 	for (const ref of refs) {
		// 		let idxLF = ref.leftFalling;
		// 		if (idxLF === idxC) {
		// 			spec = "leftFalling2";
		// 			specSgmt = ref.leftFallingTopRight;
		// 		}
		// 	}
		// }
		const length = segments.length;
		const result = [];
		if (length < 2) // malformed
			return result;
		const advance = index => (index == length - 1 ? 0 : index + 1);
		let prev = segments[length - 1];
		for (let i = 0; i < length; i++) {
			const cur = segments[i];
			const next = segments[advance(i)];
			const m0Seg = [];
			const m1Seg = [];
			// const shsM0Seg = [];
			// const shsM1Seg = [];
			const kind = [];

			// if ((spec === "leftFalling" && i > length - 4) || (spec === "leftFalling2" && i === specSgmt)) {
			if (spec === "leftFalling" && i > length - 4) {
				m0Seg.push(cur.m0.p1);
				m1Seg.push(cur.m1.p1);
				// shsM0Seg.push(cur.m0.p1);
				// shsM1Seg.push(cur.m1.p1);
				kind.push(Ot.Glyph.PointType.Corner);
				if (cur.type == "curve") {
					m0Seg.push(cur.m0.c1);
					m1Seg.push(cur.m1.c1);
					// shsM0Seg.push(cur.m0.c1);
					// shsM1Seg.push(cur.m1.c1);
					kind.push(Ot.Glyph.PointType.Lead);
				}
				if (cur.type == "curve") {
					m0Seg.push(cur.m0.c2);
					m1Seg.push(cur.m1.c2);
					// shsM0Seg.push(cur.m0.c2);
					// shsM1Seg.push(cur.m1.c2);
					kind.push(Ot.Glyph.PointType.Follow);
				}
				for (let j = 0; j < m0Seg.length; j++) {
					result.push(Ot.Glyph.Point.create(
						makeVariance(m0Seg[j].x, m1Seg[j].x),
						makeVariance(m0Seg[j].y, m1Seg[j].y),
						kind[j]
					));
				}
				prev = cur;
				continue;
			}
			const [m0T1, m0T2, m1T1, m1T2] = calculateRadius(prev, cur, next, name, idxC, spec);
			const m0Coeff = coefficientForm(cur.m0, cur.type);
			const m1Coeff = coefficientForm(cur.m1, cur.type);
			debug && console.log("m0T1", m0T1, "m0T2", m0T2, "m1T1", m1T1, "m1T2", m1T2);
			debug && console.log("m0Coeff", m0Coeff, "m1Coeff", m1Coeff);
			let m0Sub, m1Sub;
			if (cur.type == "curve") {
				m0Sub = subdivide(cur.m0, m0T1, m0T2);
				m1Sub = subdivide(cur.m1, m1T1, m1T2);
			}
			debug && console.log("m0Sub", m0Sub);
			debug && console.log("m1Sub", m1Sub);

			// handle the first end point and control point
			// if (m0T1 == 0 && m1T1 == 0) { // almost linear, keep this end point and control point
			// 	m0Seg.push(cur.m0.p1);
			// 	m1Seg.push(cur.m1.p1);
			// 	// shsM0Seg.push(cur.m0.p1);
			// 	// shsM1Seg.push(cur.m1.p1);
			// 	kind.push(Ot.Glyph.PointType.Corner);
			// 	if (cur.type == "curve") {
			// 		m0Seg.push(cur.m0.c1);
			// 		m1Seg.push(cur.m1.c1);
			// 		// shsM0Seg.push(cur.m0.c1);
			// 		// shsM1Seg.push(cur.m1.c1);
			// 		kind.push(Ot.Glyph.PointType.Lead);
			// 	}
			// } else { // build 2 halves of curve
				const m0NewP1 = pointAt(m0Coeff, m0T1);
				let m0Radius = distance(cur.m0.p1, m0NewP1);
				const m0NewT1Direction = normalize(derivativeAt(m0Coeff, m0T1));
				const m1NewP1 = pointAt(m1Coeff, m1T1);
				let m1Radius = distance(cur.m1.p1, m1NewP1);
				const m1NewT1Direction = normalize(derivativeAt(m1Coeff, m1T1));
				debug && console.log("m0NewP1", m0NewP1);
				debug && console.log("m0Radius", m0Radius);
				debug && console.log("m0NewT1Direction", m0NewT1Direction);
				debug && console.log("m1NewP1", m1NewP1);
				debug && console.log("m1Radius", m1Radius);
				debug && console.log("m1NewT1Direction", m1NewT1Direction);
				m0Seg.push({ // control point
					x: m0NewP1.x - 0.6 * m0NewT1Direction.x * m0Radius,
					y: m0NewP1.y - 0.6 * m0NewT1Direction.y * m0Radius,
				})
				m0Seg.push({ // end point
					x: m0NewP1.x,
					y: m0NewP1.y
				});
				m1Seg.push({ // control point
					x: m1NewP1.x - 0.6 * m1NewT1Direction.x * m1Radius,
					y: m1NewP1.y - 0.6 * m1NewT1Direction.y * m1Radius,
				});
				m1Seg.push({ // end point
					x: m1NewP1.x,
					y: m1NewP1.y
				});
				// shsM0Seg.push(cur.m0.p1);
				// shsM0Seg.push(cur.m0.p1);
				// shsM1Seg.push(cur.m1.p1);
				// shsM1Seg.push(cur.m1.p1);
				kind.push(Ot.Glyph.PointType.Follow);
				kind.push(Ot.Glyph.PointType.Corner);
				if (cur.type == "curve") {
					m0Seg.push(m0Sub.c1);
					m1Seg.push(m1Sub.c1);
					// shsM0Seg.push(cur.m0.c1);
					// shsM1Seg.push(cur.m1.c1);
					kind.push(Ot.Glyph.PointType.Lead);
				}
			// }
			// if ((spec === "leftFalling" && i === length - 4) || (spec === "leftFalling2" && i === specSgmt)) {
			if (spec === "leftFalling" && i === length - 4) {
				if (cur.type == "curve") {
					m0Seg.push(cur.m0.c2);
					m1Seg.push(cur.m1.c2);
					// shsM0Seg.push(cur.m0.c2);
					// shsM1Seg.push(cur.m1.c2);
					kind.push(Ot.Glyph.PointType.Follow);
				}
				// m0Seg.push(cur.m0.p2);
				// m1Seg.push(cur.m1.p2);
				// shsM0Seg.push(cur.m0.p2);
				// shsM1Seg.push(cur.m1.p2);
				// kind.push(Ot.Glyph.PointType.Corner);
				for (let j = 0; j < m0Seg.length; j++) {
					result.push(Ot.Glyph.Point.create(
						makeVariance(m0Seg[j].x, m1Seg[j].x),
						makeVariance(m0Seg[j].y, m1Seg[j].y),
						kind[j]
					));
				}
				prev = cur;
				continue;
			}
			// handle the second control point and end point
			// if (m0T2 == 0 && m1T2 == 0) { // almost linear, keep this end point and control point
			// 	if (cur.type == "curve") {
			// 		m0Seg.push(cur.m0.c2);
			// 		m1Seg.push(cur.m1.c2);
			// 		// shsM0Seg.push(cur.m0.c2);
			// 		// shsM1Seg.push(cur.m1.c2);
			// 		kind.push(Ot.Glyph.PointType.Follow);
			// 	}
			// 	/* p2 will be pushed in next segment */
			// } else { // build 2 halves of curve
				const m0NewP2 = pointAt(m0Coeff, m0T2);
				 m0Radius = distance(cur.m0.p2, m0NewP2);
				const m0NewT2Direction = normalize(derivativeAt(m0Coeff, m0T2));
				const m1NewP2 = pointAt(m1Coeff, m1T2);
				 m1Radius = distance(cur.m1.p2, m1NewP2);
				const m1NewT2Direction = normalize(derivativeAt(m1Coeff, m1T2));
				debug && console.log("m0NewP2", m0NewP2);
				debug && console.log("m0Radius", m0Radius);
				debug && console.log("m0NewT2Direction", m0NewT2Direction);
				debug && console.log("m1NewP2", m1NewP2);
				debug && console.log("m1Radius", m1Radius);
				debug && console.log("m1NewT2Direction", m1NewT2Direction);
				if (cur.type == "curve") {
					m0Seg.push(m0Sub.c2);
					m1Seg.push(m1Sub.c2);
					// shsM0Seg.push(cur.m0.c2);
					// shsM1Seg.push(cur.m1.c2);
					kind.push(Ot.Glyph.PointType.Follow);
				}
				m0Seg.push({ // end point
					x: m0NewP2.x,
					y: m0NewP2.y
				});
				m0Seg.push({ // control point
					x: m0NewP2.x + 0.6 * m0NewT2Direction.x * m0Radius,
					y: m0NewP2.y + 0.6 * m0NewT2Direction.y * m0Radius
				});
				m1Seg.push({ // end point
					x: m1NewP2.x,
					y: m1NewP2.y
				});
				m1Seg.push({ // control point
					x: m1NewP2.x + 0.6 * m1NewT2Direction.x * m1Radius,
					y: m1NewP2.y + 0.6 * m1NewT2Direction.y * m1Radius
				});
				// shsM0Seg.push(cur.m0.p2);
				// shsM0Seg.push(cur.m0.p2);
				// shsM1Seg.push(cur.m1.p2);
				// shsM1Seg.push(cur.m1.p2);
				kind.push(Ot.Glyph.PointType.Corner);
				kind.push(Ot.Glyph.PointType.Lead);
			// }
			for (let j = 0; j < m0Seg.length; j++) {
				result.push(Ot.Glyph.Point.create(
					makeVariance(m0Seg[j].x, m1Seg[j].x),
					makeVariance(m0Seg[j].y, m1Seg[j].y),
					kind[j]
				));
			}
			prev = cur;
		}

		// adjust result, let it begin with end point
		if (result[0].kind != Ot.Glyph.PointType.Corner)
			// if not end point, it must be second control point
			result.push(result.shift());
		return result;
	}
	
	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns || 150
	let bar = new ProgressBar('\u001b[38;5;82mroundingGlyphs\u001b[0m [4/6]    :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	// let bar = new ProgressBar('\u001b[38;5;82mroundingGlyphs\u001b[0m [4/6]    :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete:'\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	
	function progressTick() {
		if (len) {
			var chunk = 1;
			bar.tick(chunk);
			if (bar.curr > 0 && bar.curr < len - 2) { 
				bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m' }, 'force');
			}
			if (bar.curr === len - 1) { 
				bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m' }, 'force');
			}
		}
	}
	// function progressTick(info = "") {
	// 	if (len) {
	// 		var chunk = 1;
	// 		bar.tick(chunk);
	// 		if (bar.curr > 0 && bar.curr < len - 2) { 
	// 			bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', info: info }, 'force');
	// 		}
	// 		if (bar.curr === len - 1) { 
	// 			bar.render({ left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', info: info }, 'force');
	// 		}
	// 	}
	// }
	
	let count = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;
		
		// curGlyph = name;
		// console.log(name);
		if (!glyph.geometry || !glyph.geometry.contours || references.skipGlyphs.includes(name)) {
			// progressTick();
			progressTick(name);
			continue;
		}
		// if (["Obreve"].includes(name)) {
		// 	debug = true;
		// 	console.log(" ");
		// 	console.log(name);
		// } else {
		// 	debug = false;
		// }
		// progressTick();
		progressTick(name);
		const oldContours = glyph.geometry.contours;
		glyph.geometry.contours = [];
		for (const [idxC, contour] of oldContours.entries()) {
			glyph.geometry.contours.push(transformContour(contour, name, idxC));
		}
		// if (name === "uni3240") console.log(glyph.geometry.contours);
		// count++;
		// if (count % 1000 == 0) console.log("roundingGlyphs: ", count, " glyphs processed.");
	}
}

module.exports = {
	roundFont: roundFont,
};
