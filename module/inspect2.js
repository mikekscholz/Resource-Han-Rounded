"use strict";

const { Ot } = require("ot-builder");
const ProgressBar = require('./node-progress');
const { base60, bearing, horizontalSlope, roundTo, turn, verticalSlope } = require("./util");
const { abs, ceil, floor, max, min, pow, round, sqrt, trunc } = Math;
const { writeFileSync, mkdirSync } = require("node:fs");

const htmlHeader = /*html*/`
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Font Inspector</title>
	<style>
		:root {
			--input-bg: #444;
			--textcolor: #FFF;
			--form-radius: 3px;
			--form-unit-bg-color: #333;
			--glyph-size: 300px;
			--dialog-scale: 1;
			--dialog-toggle-stroke: revert;
			--dialog-toggle-horizontal: revert;
			--dialog-toggle-vertical: revert;
			--dialog-toggle-points: revert;
			--dialog-toggle-handles: revert;
			--dialog-contour-fill: 0.1;
			--contour-fill: 0.1;
			--toggle-stroke: revert;
			--toggle-horizontal: revert;
			--toggle-vertical: revert;
			--toggle-points: revert;
			--toggle-handles: revert;
		}
		body {
			background-color: #1c1c1c;
			font-family: Nunito;
			margin: 0 4px 0 4px;
		}
		.nav-bar {
			background-color: #666;
			height: 40px;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			padding: 0 5px;
			display: flex;
			flex-direction: row;
			justify-content: space-between;
		}
		.nav-bar-pages, .nav-bar-toggles {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 5px;
		}
		a, label {
			width: 32px;
			position: relative;
			display: inline-block;
			background-color: #444;
			color: #FFF;
			padding: 5px 5px;
			border-radius: var(--form-radius);
			font-family: Nunito;
			text-align: center;
			height: 32px;
			text-decoration: none;
			box-sizing: border-box;
		}
		.current {
			font-weight: 700;
			background-color: #222;
			text-decoration: underline;
			text-decoration-thickness: 2px;
			text-underline-offset: 4px;
		}
		.wrapper {
			display: flex;
			flex-wrap: wrap;
			gap: 30px 10px;
			padding-top: 50px;
		}
		.glyph-wrap {
			display: flex;
			flex-direction: column;
			scroll-margin-top: 50px;
		}
		.glyph {
			width: min-content;
			height: var(--glyph-size);
			overflow: hidden;
			margin-bottom: -15px;
			display: flex;
			flex-wrap: wrap;
			background-color: #0b0b0b;
		}

		.glyph svg {
			margin-top: -15px;
		}

		.glyph-label {
			color: #FFFFFF;
			font-family: Nunito;
			font-size: 14px;
			width: 100%;
			text-align: center;
			background-color: #555;
			height: 20px;
		}
		.contour-fill {
			fill:   #FFFFFF;
			fill-rule: nonzero;
			stroke: none;
			opacity: var(--contour-fill);
		}
		.contour-stroke {
			fill: none;
			stroke: #d4d4d4;
			stroke-width: 3px;
			stroke-linecap: round;
			stroke-linejoin: round;
			display: var(--toggle-stroke);
		}
		.dotted-rule {
			stroke: #FFF3;
			stroke-dasharray: 10px 10px;
			stroke-width: 2px;
			stroke-linecap: round;
			stroke-linejoin: round;
			display: var(--toggle-horizontal);
		}
		.vertical-rule {
			display: var(--toggle-vertical);
		}
		.control-vector {
			stroke: #FFF;
			stroke-dasharray: 15px 5px;
			stroke-width: 1px;
			stroke-linecap: round;
			stroke-linejoin: round;
			display: var(--toggle-handles);
		}
		.start-point {
			fill: #00d9ff;
			stroke: #7decff;
			stroke-width: 3px;
			r: 8px;
			paint-order: stroke;
			display: var(--toggle-points);
		}
		.corner-point {
			fill: #ec003b;
			stroke: #ff5f5f;
			stroke-width: 3px;
			r: 8px;
			paint-order: stroke;
			display: var(--toggle-points);
		}
		.control-point {
			fill: #90e900;
			stroke: #cfff82;
			stroke-width: 3px;
			r: 7px;
			paint-order: stroke;
			display: var(--toggle-handles);
		}
		#dialogGlyphContainer .contour-stroke {
			stroke-width: calc(3px / var(--dialog-scale));
			display: var(--dialog-toggle-stroke);
		}
		#dialogGlyphContainer .dotted-rule {
			stroke-dasharray: calc(10px / var(--dialog-scale)) calc(10px / var(--dialog-scale));
			stroke-width: calc(2px / var(--dialog-scale));
			display: var(--dialog-toggle-horizontal);
		}
		#dialogGlyphContainer .vertical-rule {
			stroke-width: calc(2px / var(--dialog-scale));
			display: var(--dialog-toggle-vertical);
		}
		#dialogGlyphContainer .control-vector {
			stroke-dasharray: calc(15px / var(--dialog-scale)) calc(5px / var(--dialog-scale));
			stroke-width: calc(1px / var(--dialog-scale));
			display: var(--dialog-toggle-handles);
		}
		#dialogGlyphContainer .start-point {
			stroke-width: calc(3px / var(--dialog-scale));
			r: calc(5px / var(--dialog-scale));
			display: var(--dialog-toggle-points);
			paint-order: stroke;
		}
		#dialogGlyphContainer .corner-point {
			stroke-width: calc(3px / var(--dialog-scale));
			r: calc(5px / var(--dialog-scale));
			display: var(--dialog-toggle-points);
			paint-order: stroke;
		}
		#dialogGlyphContainer .control-point {
			stroke-width: calc(3px / var(--dialog-scale));
			r: calc(4px / var(--dialog-scale));
			display: var(--dialog-toggle-handles);
			paint-order: stroke;
		}
		#dialogGlyphContainer .contour-fill {
			opacity: var(--dialog-contour-fill);
		}
		[type="checkbox"]:checked,
		[type="checkbox"]:not(:checked),
		[type="radio"]:checked,
		[type="radio"]:not(:checked){
			position: absolute;
			left: -9999px;
			width: 0;
			height: 0;
			visibility: hidden;
		}
		.checkbox:not(:checked) + label {
			filter: saturate(0.6) brightness(0.7);
		}
		.hidden {
			display: none;
		}
		.form-group {
			display: flex;
			flex-grow: 1;
			gap: 0px;
			height: 32px;
			/* align-self: flex-end; */
			border-radius: var(--form-radius);
			box-shadow: 0 0 0 0 transparent;
			transition: box-shadow ease-in-out 0.4s;
		}
		.form-group > button, .form-group > input[type=text], .form-group > input[type=password], .form-group > input[is=hex-input], .form-group > span, .form-group > .nice-select, .form-group > .form-unit {
			z-index: 1;
			border-color: var(--form-outline-color);
			box-shadow: 0 0 0 0 transparent;
			margin: 0;
			transition: border-color ease-in-out 0.4s, border-radius 0s, height 0s, margin 0s, box-shadow 0s;
		}
		.form-group > button:first-child, .form-group > input[type=text]:first-child, .form-group > input[type=password]:first-child, .form-group > input[is=hex-input]:first-child, .form-group > span:first-child, .form-group > .nice-select:first-child, .form-group > .form-unit:first-child {
			border-radius: var(--form-radius) 0 0 var(--form-radius);
			border-right-width: 0;
		}
		.form-group > button:last-child, .form-group > input[type=text]:last-child, .form-group > input[type=password]:last-child, .form-group > input[is=hex-input]:last-child, .form-group > span:last-child, .form-group > .nice-select:last-child, .form-group > .form-unit:last-child {
			border-radius: 0 var(--form-radius) var(--form-radius) 0;
			border-left-width: 0;
		}
		.form-group > button:not(:first-child):not(:last-child), .form-group > input[type=text]:not(:first-child):not(:last-child), .form-group > input[type=password]:not(:first-child):not(:last-child), .form-group > input[is=hex-input]:not(:first-child):not(:last-child), .form-group > span:not(:first-child):not(:last-child), .form-group > .nice-select:not(:first-child):not(:last-child), .form-group > .form-unit:not(:first-child):not(:last-child) {
			border-radius: 0;
			border-left-width: 0;
			border-right-width: 0;
		}
		.form-group > button:disabled, .form-group > input[type=text]:disabled, .form-group > input[type=password]:disabled, .form-group > input[is=hex-input]:disabled, .form-group > span:disabled, .form-group > .nice-select:disabled, .form-group > .form-unit:disabled {
			opacity: 1;
		}
		.form-group:has(input:disabled) {
			opacity: 0.5;
		}
		.form-group > select:first-child + .nice-select:nth-child(2) {
			border-radius: var(--form-radius) 0 0 var(--form-radius);
			border-left-width: 1px;
			border-right-width: 0;
		}
		.form-group .form-unit + input {
			padding-left: 8px;
			padding-right: 8px;
		}
		.form-group:focus-within {
			box-shadow: 0 0 0 3px var(--form-focus-box-shadow);
			z-index: 1;
		}
		.form-group:focus-within > button, .form-group:focus-within > input, .form-group:focus-within > span, .form-group:focus-within > .nice-select {
			border-color: var(--form-focus-outline-color);
		}
		.form-group > button:focus, .form-group > button:focus-visible {
			z-index: 0;
			height: 36px !important;
			margin-bottom: -3px;
			box-shadow: 0 0 0 5px var(--form-focus-box-shadow);
			transition: box-shadow 0s !important;
		}
		.form-group > button:focus:first-child, .form-group > button:focus-visible:first-child {
			border-radius: var(--form-radius) 4px 4px var(--form-radius);
			border-right-width: 0;
		}
		.form-group > button:focus:last-child, .form-group > button:focus-visible:last-child {
			border-radius: 4px var(--form-radius) var(--form-radius) 4px;
			border-left-width: 0;
		}
		.form-group > button:focus:not(:first-child):not(:last-child), .form-group > button:focus-visible:not(:first-child):not(:last-child) {
			border-radius: 4px;
			border-left-width: 0;
			border-right-width: 0;
		}
		.form-group.focus-blue {
			--form-focus-outline-color: #00dfff;
			--form-focus-box-shadow: rgba(0, 223, 255, 0.5);
		}
		.form-group.focus-green {
			--form-focus-outline-color: #00ea00;
			--form-focus-box-shadow: rgba(0, 234, 0, 0.5);
		}
		.form-group.focus-red {
			--form-focus-outline-color: #ea0000;
			--form-focus-box-shadow: rgba(234, 0, 0, 0.5);
		}
		.form-group.focus-yellow {
			--form-focus-outline-color: #ffc107;
			--form-focus-box-shadow: rgba(255, 193, 7, 0.5);
		}
		.form-group.focus-purple {
			--form-focus-outline-color: #a630e0;
			--form-focus-box-shadow: rgba(166, 48, 224, 0.5);
		}
		.form-group.focus-dark {
			--form-focus-outline-color: #1b1b1b;
			--form-focus-box-shadow: rgba(118, 118, 118, 0.5);
		}
		.form-group.focus-light {
			--form-focus-outline-color: #e5e5e5;
			--form-focus-box-shadow: rgba(229, 229, 229, 0.5);
		}
		
		.form-label {
			font-size: 14px;
			padding: 4px 10px 4px 2px;
			font-weight: 500;
			white-space: nowrap;
			position: absolute;
			/* transform: translate(0px, 27px); */
			/* transform-origin: left top; */
			color: var(--formlabel1);
		}
		
		.form-label-inline {
			font-size: 14px;
			font-weight: 500;
			opacity: 1;
			white-space: nowrap;
			/* transform: translate(0px, 27px); */
			/* transform-origin: left top; */
			align-self: flex-end;
			color: var(--formlabel1);
			line-height: 28px;
		}
		.form-label-inline ~ .form-control {
			margin-top: 0;
		}
		.form-label-inline + .form-group,
		.form-label-inline + .form-group .form-control,
		.form-label-inline + .form-group .select-control {
			margin-top: 0;
		}
		
		.form-row {
			width: 100%;
			display: flex;
			margin-bottom: 0px;
			gap: 10px;
		}
		
		.form-row .form-col {
			margin-bottom: 0px;
			width: unset;
			flex-grow: 0;
		}
		.form-unit {
			align-self: flex-end;
			background-color: var(--form-unit-bg-color);
			border: 1px solid var(--form-outline-color);
			box-sizing: border-box;
			color: var(--textcolor);
			display: block;
			font-family: "Nunito";
			font-size: 14px;
			font-weight: 500;
			height: 30px;
			line-height: 28px;
			padding: 0 4px;
			width: auto;
		}
		.form-unit > * {
			pointer-events: none;
		}
		button, a.download-button {
			align-items: center;
			/* align-self: flex-end; */
			background-color: var(--input-bg);
			border: 1px solid var(--form-outline-color);
			border-radius: var(--form-radius);
			box-shadow: 0 0 0 0 transparent;
			box-sizing: border-box;
			color: var(--textcolor);
			display: flex;
			font-family: "Nunito" !important;
			font-size: 14px;
			font-weight: 500;
			height: 32px;
			justify-content: center;
			outline: none;
			padding: 1px 6px;
			width: auto;
			text-decoration: none;
			transition: background-color 0.4s ease-in-out, border-color 0.4s ease-in-out, box-shadow ease-in-out 0.4s;
		}
		button:hover, a.download-button:hover {
			background-color: #111111;
		}
		button:disabled, a.download-button:disabled {
			background-color: #222222;
			opacity: 0.5;
		}
		button:focus, button:focus-visible, button.active, a.download-button:focus, a.download-button:focus-visible, a.download-button.active {
			border-color: var(--form-focus-outline-color);
			box-shadow: 0 0 0 3px var(--form-focus-box-shadow);
		}

		input[type=text], input[type=password], input[is=hex-input], .nice-select {
			align-self: flex-end;
			background-color: var(--input-bg);
			border: 1px solid var(--form-outline-color);
			border-radius: var(--form-radius);
			box-shadow: 0 0 0 0 transparent;
			box-sizing: border-box;
			color: var(--textcolor);
			display: block;
			font-family: "Nunito";
			font-size: 14px;
			font-weight: 500;
			height: 32px;
			line-height: 27px;
			padding: 1px 8px 0px 8px;
			transition: border-color ease-in-out 0.4s, box-shadow ease-in-out 0.4s, background-color 2147483647s 0s, color 2147483647s 0s;
			width: 100%;
		}
		input[type=text]:disabled, input[type=password]:disabled, input[is=hex-input]:disabled, .nice-select:disabled {
			opacity: 0.5;
		}
		input[type=text]:focus, input[type=text]:focus-visible, input[type=password]:focus, input[type=password]:focus-visible, input[is=hex-input]:focus, input[is=hex-input]:focus-visible, .nice-select:focus, .nice-select:focus-visible {
			border-color: var(--form-focus-outline-color);
			box-shadow: 0 0 0 3px var(--form-focus-box-shadow);
		}
		input[type=text]:focus:invalid, input[type=text]:focus-visible:invalid, input[type=password]:focus:invalid, input[type=password]:focus-visible:invalid, input[is=hex-input]:focus:invalid, input[is=hex-input]:focus-visible:invalid, .nice-select:focus:invalid, .nice-select:focus-visible:invalid {
			border-color: var(--red-500);
			box-shadow: 0 0 0 3px var(--red-500-60);
		}
		.form-control:focus {
			border-color: var(--form-focus-outline-color);
			outline: 0;
		}
		.form-col {
			display: flex;
			height: 58px;
			/* width: 250px; */
			/* flex-direction: column; */
			flex-shrink: 0;
			/* flex-wrap: wrap; */
			width: 100%;
			margin: 0px;
			gap: 0px;
		}

		.form-col.button-group {
			height: unset;
			/* width: 100%; */
			align-items: flex-end;
			justify-content: flex-end;
			/* flex-shrink: 1; */
			flex-wrap: nowrap;
			gap: 10px;
		}
		/* Flexbox */
		/* ================================================================ */
		.flex {
			display: flex !important;
		}

		.inline-flex {
			display: inline-flex;
		}

		/* Flex direction */
		.flex-row {
			flex-direction: row;
		} /* Default */
		.flex-row-reverse {
			flex-direction: row-reverse;
		}

		.flex-col {
			flex-direction: column;
		}

		.flex-col-reverse {
			flex-direction: column-reverse;
		}

		/* Flex wrap */
		.flex-nowrap {
			flex-wrap: nowrap;
		} /* Default */
		.flex-wrap {
			flex-wrap: wrap;
		}

		.flex-wrap-reverse {
			flex-wrap: wrap-reverse;
		}

		/* Flex grow */
		.grow-0 {
			flex-grow: 0 !important;
		} /* Default */
		.grow-1 {
			flex-grow: 1 !important;
		}

		.grow-2 {
			flex-grow: 2 !important;
		}

		.grow-3 {
			flex-grow: 3 !important;
		}

		.grow-4 {
			flex-grow: 4 !important;
		}

		/* Flex shrink */
		.shrink-0 {
			flex-shrink: 0 !important;
		}

		.shrink {
			flex-shrink: 1 !important;
		} /* Default */
		/* Flex basis */
		.fb--a {
			flex-basis: auto;
		} /* Default */
		.fb--0 {
			flex-basis: 0;
		}

		.flex-1 {
			flex: 1 !important;
		}
		dialog::backdrop {
			background-color: #12121290;
			backdrop-filter: blur(4px);
		}
		.dialog-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			height: 40px;
			padding: 0 0 0 10px;
			color: #ffffff;
			background-color: #666;
			overflow: hidden;
		}
		
		.dialog-header p {
			font-size: 16px;
			font-weight: 500;
			width: 250px;
		}
		#dialogGlyphContainer {
			max-height: 100%;
			display: flex;
			justify-content: center;
			overflow: hidden;
		}
		#dialogGlyphContainer svg {
			max-height: calc(90vh - 36px);
			width: 100%;
		}
		dialog#glyphDialog {
			background-color: #101010;
			height: 90vh;
			padding: 0;
			width: auto;
			border: 0;
			box-shadow: 0 0 20px 10px #fff3;
			border-radius: 15px;
			overflow: hidden;
		}
		
		.dialog-toggles {
			display: flex;
			gap: 5px;
			padding: 1px 0 1px 0;
			height: 40px;
			align-items: center;
			overflow: hidden;
		}

		.dialog-toggles label {
			/* border-radius: 0; */
		}

		.dialog-toggles button {
			font-weight: 700;
			width: 40px;
		}
		.close-button {
			width: 40px;
			height: 40px;
			font-size: 25px;
			font-weight: bold;
			background-color: #898989;
			cursor: pointer;
			border: none;
			border-radius: 0;
		}
		.spacer {
			width: 10px;
		}
		.close-button:hover {
			color: #ffffff;
			font-weight: bold;
			background-color: #FF0030;
		}
		
		.disabled {
			background-color: #222;
			opacity: 0.5;
			pointer-events: none;
		}
	</style>
	<script>
		function cssVariableSet(variable, value) {
			let root = document.querySelector(':root');
			root.style.setProperty(variable, value);
		}

		const Bool = (string) => string === 'false' || string === 'undefined' || string === 'null' || string === '0' ? false : !!string;

		let urlSearch = document.location.search;
		if (urlSearch) {
			let params = new URLSearchParams(urlSearch);
			let hr = Bool(params.get('hr'));
			if (!hr) {
				cssVariableSet('--toggle-horizontal', 'none');
			} else {
				cssVariableSet('--toggle-horizontal', 'revert');
			}
						
			let vr = Bool(params.get('vr'));
			if (!vr) {
				cssVariableSet('--toggle-vertical', 'none');
			} else {
				cssVariableSet('--toggle-vertical', 'revert');
			}
			
			let points = Bool(params.get('p'));
			if (!points) {
				cssVariableSet('--toggle-points', 'none');
			} else {
				cssVariableSet('--toggle-points', 'revert');
			}
			
			let handles = Bool(params.get('h'));
			if (!handles) {
				cssVariableSet('--toggle-handles', 'none');
			} else {
				cssVariableSet('--toggle-handles', 'revert');
			}
			
			let strokes = Bool(params.get('s'));
			if (!strokes) {
				cssVariableSet('--toggle-stroke', 'none');
			} else {
				cssVariableSet('--toggle-stroke', 'revert');
			}
			
			let fills = params.get('f');
			if (fills) {
				let setting = fills / 100;
				cssVariableSet('--contour-fill', setting);
			}
			
			let zoom = params.get('zoom');
			if (zoom) {
				cssVariableSet('--glyph-size', zoom + 'px');
			}
			window.addEventListener("click", function(e) {
				let href = e.target.getAttribute("href");
				if(href) {
					let horizontalRules = (checkboxHorizontal?.checked ?? params.get('hr')) ?? true;
					let verticalRules = (checkboxVertical?.checked ?? params.get('vr')) ?? true;
					let points = (checkboxPoints?.checked ?? params.get('p')) ?? true;
					let handles = (checkboxHandles?.checked ?? params.get('h')) ?? true;
					let stroke = (checkboxStroke?.checked ?? params.get('s')) ?? true;
					let fill = (inputFill?.value ?? params.get('f')) ?? 10;
					let zoom = (zoomSize?.value ?? params.get('zoom')) ?? 300;
					let newUrlParams = '?hr=' + horizontalRules + '&vr=' + verticalRules + '&p=' + points + '&h=' + handles + '&s=' + stroke + '&f=' + fill + '&zoom=' + zoom;
					location.href = href + newUrlParams;
					e.preventDefault();
				}
			});
		}
	</script>
</head>
<body>
<dialog class="modal" id="glyphDialog">
<div class="dialog-header">
	<p id="dialogTitle">Modal Dialog</p>
	<div class="dialog-toggles">
		<button id="dialogGlyphPrev">&lt;</button>
		<button id="dialogGlyphNext">&gt;</button>
		<div class="spacer"></div>
		<input class="checkbox" type="checkbox" name="toggleDialogVerticalRules" id="toggleDialogVerticalRules" checked/>
		<label class="for-checkbox" for="toggleDialogVerticalRules">
			<svg height="100%" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
			<line stroke="#FFF" stroke-width="8" x1="4" y1="4" x2="4" y2="252" stroke-linecap="round"/>
			<line stroke="#FFF" stroke-width="8" x1="252" y1="4" x2="252" y2="252" stroke-linecap="round"/>
				<path d="m110 55.3h36l53.6 143.2h-34.4l-11-32h-52.4l-11 32h-34.4zm34.2 82.8-10.4-30-4.8-17.6h-2l-4.8 17.6-10.4 30z" fill="#fff"/>
			</svg>
		</label>
		<input class="checkbox" type="checkbox" name="toggleDialogHorizontalRules" id="toggleDialogHorizontalRules" checked/>
		<label class="for-checkbox" for="toggleDialogHorizontalRules">
			<svg height="100%" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
			<line stroke="#FFF" stroke-width="8" x1="4" y1="4" x2="252" y2="4" stroke-linecap="round"/>
			<line stroke="#FFF" stroke-width="8" x1="4" y1="60" x2="252" y2="60" stroke-linecap="round"/>
			<line stroke="#FFF" stroke-width="8" x1="4" y1="100" x2="252" y2="100" stroke-linecap="round"/>
			<line stroke="#FFF" stroke-width="8" x1="4" y1="196" x2="252" y2="196" stroke-linecap="round"/>
			<line stroke="#FFF" stroke-width="8" x1="4" y1="252" x2="252" y2="252" stroke-linecap="round"/>
			<path d="m110 55.3h36l53.6 143.2h-34.4l-11-32h-52.4l-11 32h-34.4zm34.2 82.8-10.4-30-4.8-17.6h-2l-4.8 17.6-10.4 30z" fill="#fff"/>
			</svg>
		</label>
		<input class="checkbox" type="checkbox" name="toggleDialogPoints" id="toggleDialogPoints" checked/>
		<label class="for-checkbox" for="toggleDialogPoints">
			<svg version="1.1" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
			<path d="m5 96L160 96L160 251" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="10"/>
			<circle cx="160" cy="96" r="48" fill="#c70032" stroke="#ff004c" stroke-width="10"/>
		</svg>
		</label>
		<input class="checkbox" type="checkbox" name="toggleDialogHandles" id="toggleDialogHandles" checked/>
		<label class="for-checkbox" for="toggleDialogHandles">
		<svg version="1.1" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
			<path d="m5 251L192 64" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="10" stroke-dasharray="30px 30px"/>
			<circle cx="192" cy="64" r="48" fill="#85d800" stroke="#9dff00" stroke-width="10"/>
		</svg>
		</label>
		<input class="checkbox" type="checkbox" name="toggleDialogStroke" id="toggleDialogStroke" checked/>
		<label class="for-checkbox" for="toggleDialogStroke">
			<svg height="100%" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
				<rect x="29" y="29" width="198" height="198" rx="24" fill="none" stroke="#fff" stroke-width="8"/>
			</svg>
		</label>
		<span style="color: var(--textcolor)">Fill</span>
		<div class="form-group shrink grow-0 stepper">
			<input class="form-control virtual-keyboard number-keyboard w-unset mt-0" id="dialogfillOpacity" type="text" data-decimals="0" data-step="10" data-min="0" data-max="100" value="10" size="2" autocomplete="off" spellcheck="false" />
			<button class="minus"><svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" height="10px" fill="#FFFFFF"><path d="m50 206h412c28 0 50 22 50 50s-22 50-50 50h-412c-28 0-50-22-50-50s22-50 50-50z"/></svg></button>
			<button class="plus"><svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" height="10px" fill="#FFFFFF"><path d="m256 0c-28 0-50 22-50 50v156h-156c-28 0-50 22-50 50s22 50 50 50h156v156c0 28 22 50 50 50s50-22 50-50v-156h156c28 0 50-22 50-50s-22-50-50-50h-156v-156c0-28-22-50-50-50z"/></svg></button>
		</div>
	</div>
	<button class="close-modal close-button" id="closeGlyphDialog" autofocus>&times;</button>
</div>
<div id="dialogGlyphContainer" data-zoom-on-wheel="max-scale: 20; zoom-amount: 0.002;" data-pan-on-drag></div>
</dialog>`;

// based on measurement of SHS
const params = {
	strokeWidth: { light: 29, heavy: 162 },
};

function circularArray(array, index) {
	var length = array && array.length;
	var idx = Math.abs(length + index % length) % length;
	return array[isNaN(idx) ? index : idx];
}

function circularIndex(array, index) {
	var length = array && array.length;
	var idx = abs(length + index % length) % length;
	return isNaN(idx) ? index : idx;
}

function inspect(font, references, subfamily) {
	const dimWght = font.fvar.axes[0].dim;
	const instanceShsWghtMax = new Map([[dimWght, 1]]);
	const masterDimWghtMax = { dim: dimWght, min: 0, peak: 1, max: 1 };
	const masterWghtMax = new Ot.Var.Master([masterDimWghtMax]);
	const masterSet = new Ot.Var.MasterSet();
	masterSet.getOrPush(masterWghtMax);
	const valueFactory = new Ot.Var.ValueFactory(masterSet);
	const safeBottom = -abs(font.os2.usWinDescent);
	const descender = -abs(font.os2.sTypoDescender);
	const xHeight = font.os2.sxHeight;
	const capsHeight = font.os2.sCapHeight;
	const ascender = font.os2.sTypoAscender;
	const safeTop = font.os2.usWinAscent;
	const viewportHeight = abs(safeBottom - safeTop);

	function originLight(point) {
		return Ot.Var.Ops.originOf(point);
	}

	function originHeavy(point) {
		return Ot.Var.Ops.evaluate(point, instanceShsWghtMax);
	}

	function checkSingleGlyph(glyph, idxG) {
		if (!glyph.geometry || !glyph.geometry.contours)
			return;

		let contours = glyph.geometry.contours;
		let groupLightFill = "";
		let groupLightStroke = "";
		let groupLightHandles = "";
		let groupLightPoints = "";
		let lightStart = "";
		let groupHeavyFill = "";
		let groupHeavyStroke = "";
		let groupHeavyHandles = "";
		let groupHeavyPoints = "";
		let heavyStart = "";
		// let glyphPointsLightX = [];
		// let glyphPointsHeavyX = [];
		let pointsLightX = [];
		let pointsHeavyX = [];
		for (const [idxC, contour] of contours.entries()) {
			let pointsLight = [];
			let pointsHeavy = [];
			// let pointsLightY = [];
			// let pointsHeavyY = [];
			let pathLight = "";
			let pathHeavy = "";
			for (let idxP = 0; idxP < contour.length; idxP++) {
				let lX = originLight(contour[idxP].x);
				let lY = safeTop - originLight(contour[idxP].y);
				let hX = originHeavy(contour[idxP].x);
				let hY = safeTop - originHeavy(contour[idxP].y);
				pointsLight.push({ x: lX, y: lY, type: contour[idxP].kind });
				pointsHeavy.push({ x: hX, y: hY, type: contour[idxP].kind });
				pointsLightX.push(lX);
				// pointsLightY.push(lY);
				pointsHeavyX.push(hX);
				// pointsHeavyY.push(hY);
			}

			for (let idxP = 0; idxP < pointsLight.length; idxP++) {
				let l1 = pointsLight[idxP];
				let h1 = pointsHeavy[idxP];
				if (idxP === 0) {
					pathLight += `M ${l1.x}, ${l1.y}`;
					pathHeavy += `M ${h1.x}, ${h1.y}`;
					lightStart += /*svg*/ `
						<circle class="start-point" cx="${l1.x}" cy="${l1.y}" r="5">
							<title>contour${idxC} node${idxP}\n${l1.x}, ${safeTop - l1.y}</title>
						</circle>`;
					heavyStart += /*svg*/ `
						<circle class="start-point" cx="${h1.x}" cy="${h1.y}" r="5">
							<title>contour${idxC} node${idxP}\n${h1.x}, ${safeTop - h1.y}</title>
						</circle>`;
				} else if (idxP > 0 && l1.type === 0) {
					pathLight += `L ${l1.x}, ${l1.y}`;
					pathHeavy += `L ${h1.x}, ${h1.y}`;
					if (pointsLight[0].x !== l1.x || pointsLight[0].y !== l1.y) {
						groupLightPoints += /*svg*/ `
							<circle class="corner-point" cx="${l1.x}" cy="${l1.y}" r="5">
								<title>contour${idxC} node${idxP}\n${l1.x}, ${safeTop - l1.y}</title>
							</circle>`;
						groupHeavyPoints += /*svg*/ `
							<circle class="corner-point" cx="${h1.x}" cy="${h1.y}" r="5">
								<title>contour${idxC} node${idxP}\n${h1.x}, ${safeTop - h1.y}</title>
							</circle>`;
					}
				} else if (l1.type === 1) {
					let l0 = pointsLight[idxP - 1];
					let h0 = pointsHeavy[idxP - 1];
					let l2 = pointsLight[idxP + 1];
					let h2 = pointsHeavy[idxP + 1];
					let l3 = circularArray(pointsLight, idxP + 2);
					let h3 = circularArray(pointsHeavy, idxP + 2);
					pathLight += `C ${l1.x}, ${l1.y} ${l2.x}, ${l2.y} ${l3.x}, ${l3.y}`;
					pathHeavy += `C ${h1.x}, ${h1.y} ${h2.x}, ${h2.y} ${h3.x}, ${h3.y}`;
					groupLightPoints += /*svg*/ `
						<circle class="control-point" cx="${l1.x}" cy="${l1.y}" r="4">
							<title>contour${idxC} node${idxP}\n${l1.x}, ${safeTop - l1.y}</title>
						</circle>`;
					groupHeavyPoints += /*svg*/ `
						<circle class="control-point" cx="${h1.x}" cy="${h1.y}" r="4">
							<title>contour${idxC} node${idxP}\n${h1.x}, ${safeTop - h1.y}</title>
						</circle>`;
					groupLightPoints += /*svg*/ `
						<circle class="control-point" cx="${l2.x}" cy="${l2.y}" r="4">
							<title>contour${idxC} node${idxP + 1}\n${l2.x}, ${safeTop - l2.y}</title>
						</circle>`;
					groupHeavyPoints += /*svg*/ `
						<circle class="control-point" cx="${h2.x}" cy="${h2.y}" r="4">
							<title>contour${idxC} node${idxP + 1}\n${h2.x}, ${safeTop - h2.y}</title>
						</circle>`;
					if (pointsLight[0].x !== l3.x || pointsLight[0].y !== l3.y) {
						groupLightPoints += /*svg*/ `
							<circle class="corner-point" cx="${l3.x}" cy="${l3.y}" r="5">
								<title>contour${idxC} node${idxP + 2}\n${l3.x}, ${safeTop - l3.y}</title>
							</circle>`;
						groupHeavyPoints += /*svg*/ `
							<circle class="corner-point" cx="${h3.x}" cy="${h3.y}" r="5">
								<title>contour${idxC} node${idxP + 2}\n${h3.x}, ${safeTop - h3.y}</title>
							</circle>`;
					}
					groupLightHandles += /*svg*/ `<line class="control-vector" x1="${l0.x}" y1="${l0.y}" x2="${l1.x}" y2="${l1.y}" />`;
					groupHeavyHandles += /*svg*/ `<line class="control-vector" x1="${h0.x}" y1="${h0.y}" x2="${h1.x}" y2="${h1.y}" />`;
					groupLightHandles += /*svg*/ `<line class="control-vector" x1="${l2.x}" y1="${l2.y}" x2="${l3.x}" y2="${l3.y}" />`;
					groupHeavyHandles += /*svg*/ `<line class="control-vector" x1="${h2.x}" y1="${h2.y}" x2="${h3.x}" y2="${h3.y}" />`;
					idxP += 2;
				}
			}
			groupLightFill += `${pathLight} z `;
			groupLightStroke += `${pathLight} z `;
			groupHeavyFill += `${pathHeavy} z `;
			groupHeavyStroke += `${pathHeavy} z `;
		}
		let horizontalEndLight = originLight(glyph.horizontal.end);
		let horizontalEndHeavy = originHeavy(glyph.horizontal.end) || horizontalEndLight;
		pointsLightX.push(0, horizontalEndLight);
		pointsHeavyX.push(0, horizontalEndHeavy);

		let minLightX = min(...pointsLightX) - 20;
		let maxLightX = max(...pointsLightX) + 20;
		// let minLightY = min(pointsLightY);
		// let maxLightY = max(pointsLightY);
		let minHeavyX = min(...pointsHeavyX) - 20;
		let maxHeavyX = max(...pointsHeavyX) + 20;
		// let minHeavyY = min(pointsHeavyY);
		// let maxHeavyY = max(pointsHeavyY);
		let widthLight = abs(minLightX - maxLightX);
		let widthHeavy = abs(minHeavyX - maxHeavyX);
		let viewportWidth = 10 + widthLight + 10 + widthHeavy + 10;
		let svgHeader = /*svg*/ `
		<svg height="100%" viewBox="0 0 ${viewportWidth} ${viewportHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" data-glyph-idx="${idxG}" data-glyph-name="${glyph.name}">
			<g>
				<line class="dotted-rule" x1="0" y1="${safeTop - (safeBottom + 4)}" x2="${viewportWidth}" y2="${safeTop - (safeBottom + 4)}" />
				<line class="dotted-rule" x1="0" y1="${safeTop - descender}" x2="${viewportWidth}" y2="${safeTop - descender}" />
				<line class="dotted-rule" x1="0" y1="${safeTop}" x2="${viewportWidth}" y2="${safeTop}" />
				<line class="dotted-rule" x1="0" y1="${safeTop - xHeight}" x2="${viewportWidth}" y2="${safeTop - xHeight}" />
				<line class="dotted-rule" x1="0" y1="${safeTop - capsHeight}" x2="${viewportWidth}" y2="${safeTop - capsHeight}" />
				<line class="dotted-rule" x1="0" y1="${safeTop - ascender}" x2="${viewportWidth}" y2="${safeTop - ascender}" />
				<line class="dotted-rule" x1="0" y1="2" x2="${viewportWidth}" y2="2" />
				<g transform="translate(${abs(minLightX) + 10}, 0)">
					<line class="vertical-rule" stroke="#FFF6" stroke-width="1" x1="0" y1="${safeTop - safeBottom}" x2="0" y2="${safeTop - safeTop}" />
					<line class="vertical-rule" stroke="#FFF6" stroke-width="1" x1="${horizontalEndLight}" y1="${safeTop - safeBottom}" x2="${horizontalEndLight}" y2="${safeTop - safeTop}" />
					<g><path class="contour-fill" d="${groupLightFill}" /></g>
					<g><path class="contour-stroke" d="${groupLightStroke}" /></g>
					<g>${groupLightHandles}</g>
					<g>${groupLightPoints}${lightStart}</g>
				</g>
				<g transform="translate(${widthLight + abs(minHeavyX) + 20}, 0)">
					<line class="vertical-rule" stroke="#FFF6" stroke-width="1" x1="0" y1="${safeTop - safeBottom}" x2="0" y2="${safeTop - safeTop}" />
					<line class="vertical-rule" stroke="#FFF6" stroke-width="1" x1="${horizontalEndHeavy}" y1="${safeTop - safeBottom}" x2="${horizontalEndHeavy}" y2="${safeTop - safeTop}" />
					<g><path class="contour-fill" d="${groupHeavyFill}" /></g>
					<g><path class="contour-stroke" d="${groupHeavyStroke}" /></g>
					<g>${groupHeavyHandles}</g>
					<g>${groupHeavyPoints}${heavyStart}</g>
				</g>
			</g>
		</svg>`;
		currentHtml += /*html*/ `<div class="glyph-wrap" id="${glyph.name}"><div class="glyph">${svgHeader}</div><span class="glyph-label">${glyph.name}</span></div>`;
	}

	let len = font.glyphs.items.length;
	let consoleWidth = process.stdout.columns - 10 || 150
	let bar = new ProgressBar('\u001b[38;5;82mmakingPreview\u001b[0m [6/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining', { complete: '\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });
	// let bar = new ProgressBar('\u001b[38;5;82mmakingPreview\u001b[0m [6/6]     :spinner :left:bar:right :percent \u001b[38;5;199m:eta\u001b[0m remaining :info', { complete: '\u001b[38;5;51m\u001b[0m', incomplete: '\u001b[38;5;51m\u001b[0m', left: '\u001b[38;5;51m\u001b[0m', right: '\u001b[38;5;51m\u001b[0m', width: consoleWidth, total: len });

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

	let pages = Math.ceil(len / 500);
	let currentHtml;
	let count = 0;
	let page = 1;
	function getPageList(totalPages, page, maxLength) {
		if (maxLength < 5) throw "maxLength must be at least 5";
	
		function range(start, end) {
			return Array.from(Array(end - start + 1), (_, i) => i + start);
		}
	
		var sideWidth = maxLength < 20 ? 1 : 2;
		var leftWidth = (maxLength - sideWidth * 2 - 3) >> 1;
		var rightWidth = (maxLength - sideWidth * 2 - 2) >> 1;
		if (totalPages <= maxLength) {
			// no breaks in list
			return range(1, totalPages);
		}
		if (page <= maxLength - sideWidth - 1 - rightWidth) {
			// no break on left of page
			return range(1, maxLength - sideWidth - 1)
				.concat(0, range(totalPages - sideWidth + 1, totalPages));
		}
		if (page >= totalPages - sideWidth - 1 - rightWidth) {
			// no break on right of page
			return range(1, sideWidth)
				.concat(0, range(totalPages - sideWidth - 1 - rightWidth - leftWidth, totalPages));
		}
		// Breaks on both sides
		return range(1, sideWidth)
			.concat(0, range(page - leftWidth, page + rightWidth),
				0, range(totalPages - sideWidth + 1, totalPages));
	}
	function newHtml() {
		let pagination = getPageList(pages, page, 12);
		let navbar = `
		<div class="nav-bar">
			<div class="nav-bar-pages">
			<a ${page === 1 ? 'class="disabled"' : ''}href="page-${page - 1}.html">&lt;</a>`;
		for (let i of pagination) {
			if (i === 0) {
				navbar += '...';
			} else {
			navbar += `<a ${i === page ? 'class="current"' : ''}href="page-${i}.html">${i}</a>`;
			}
		}
		navbar += /*html*/`
					<a ${page === pages ? 'class="disabled"' : ''}href="page-${page + 1}.html">&gt;</a>
				</div>
				<div class="nav-bar-toggles">
					<span style="color: var(--textcolor)">Zoom</span>
					<div class="form-group shrink grow-0 stepper">
						<input class="form-control virtual-keyboard number-keyboard w-unset mt-0" id="zoomSize" type="text" data-decimals="0" data-step="5" data-min="0" value="300" size="2" autocomplete="off" spellcheck="false" />
						<button class="minus"><svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" height="10px" fill="#FFFFFF"><path d="m50 206h412c28 0 50 22 50 50s-22 50-50 50h-412c-28 0-50-22-50-50s22-50 50-50z"/></svg></button>
						<button class="plus"><svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" height="10px" fill="#FFFFFF"><path d="m256 0c-28 0-50 22-50 50v156h-156c-28 0-50 22-50 50s22 50 50 50h156v156c0 28 22 50 50 50s50-22 50-50v-156h156c28 0 50-22 50-50s-22-50-50-50h-156v-156c0-28-22-50-50-50z"/></svg></button>
					</div>
					<input class="checkbox" type="checkbox" name="toggleVerticalRules" id="toggleVerticalRules" checked/>
					<label class="for-checkbox" for="toggleVerticalRules">
						<svg height="100%" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
						<line stroke="#FFF" stroke-width="8" x1="4" y1="4" x2="4" y2="252" stroke-linecap="round"/>
						<line stroke="#FFF" stroke-width="8" x1="252" y1="4" x2="252" y2="252" stroke-linecap="round"/>
							<path d="m110 55.3h36l53.6 143.2h-34.4l-11-32h-52.4l-11 32h-34.4zm34.2 82.8-10.4-30-4.8-17.6h-2l-4.8 17.6-10.4 30z" fill="#fff"/>
						</svg>
					</label>
					<input class="checkbox" type="checkbox" name="toggleHorizontalRules" id="toggleHorizontalRules" checked/>
					<label class="for-checkbox" for="toggleHorizontalRules">
						<svg height="100%" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
						<line stroke="#FFF" stroke-width="8" x1="4" y1="4" x2="252" y2="4" stroke-linecap="round"/>
						<line stroke="#FFF" stroke-width="8" x1="4" y1="60" x2="252" y2="60" stroke-linecap="round"/>
						<line stroke="#FFF" stroke-width="8" x1="4" y1="100" x2="252" y2="100" stroke-linecap="round"/>
						<line stroke="#FFF" stroke-width="8" x1="4" y1="196" x2="252" y2="196" stroke-linecap="round"/>
						<line stroke="#FFF" stroke-width="8" x1="4" y1="252" x2="252" y2="252" stroke-linecap="round"/>
						<path d="m110 55.3h36l53.6 143.2h-34.4l-11-32h-52.4l-11 32h-34.4zm34.2 82.8-10.4-30-4.8-17.6h-2l-4.8 17.6-10.4 30z" fill="#fff"/>
						</svg>
					</label>
					<input class="checkbox" type="checkbox" name="togglePoints" id="togglePoints" checked/>
					<label class="for-checkbox" for="togglePoints">
					<svg version="1.1" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
						<path d="m5 96L160 96L160 251" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="10"/>
						<circle cx="160" cy="96" r="48" fill="#ec003b" stroke="#ff5f5f" stroke-width="10"/>
					</svg>
					</label>
					<input class="checkbox" type="checkbox" name="toggleHandles" id="toggleHandles" checked/>
					<label class="for-checkbox" for="toggleHandles">
					<svg version="1.1" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
						<path d="m5 251L192 64" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="10" stroke-dasharray="30px 30px"/>
						<circle cx="192" cy="64" r="48" fill="#90e900" stroke="#cfff82" stroke-width="10"/>
					</svg>
					</label>
					<input class="checkbox" type="checkbox" name="toggleStroke" id="toggleStroke" checked/>
					<label class="for-checkbox" for="toggleStroke">
						<svg height="100%" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
							<rect x="29" y="29" width="198" height="198" rx="24" fill="none" stroke="#fff" stroke-width="8"/>
						</svg>
					</label>
					<span style="color: var(--textcolor)">Fill</span>
					<div class="form-group shrink grow-0 stepper">
						<input class="form-control virtual-keyboard number-keyboard w-unset mt-0" id="fillOpacity" type="text" data-decimals="0" data-step="10" data-min="0" data-max="100" value="10" size="2" autocomplete="off" spellcheck="false" />
						<button class="minus"><svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" height="10px" fill="#FFFFFF"><path d="m50 206h412c28 0 50 22 50 50s-22 50-50 50h-412c-28 0-50-22-50-50s22-50 50-50z"/></svg></button>
						<button class="plus"><svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" height="10px" fill="#FFFFFF"><path d="m256 0c-28 0-50 22-50 50v156h-156c-28 0-50 22-50 50s22 50 50 50h156v156c0 28 22 50 50 50s50-22 50-50v-156h156c28 0 50-22 50-50s-22-50-50-50h-156v-156c0-28-22-50-50-50z"/></svg></button>
					</div>
				</div>
			</div>
		`;
		currentHtml = htmlHeader;
		currentHtml += navbar;
		currentHtml += `<div class="wrapper">`;
	}
	newHtml();
	let idxG = 0;
	for (const glyph of font.glyphs.items) {
		const name = glyph.name;

		// console.log(name);
		// if (debug) {
			progressTick(name);
		// } else {
		// 	progressTick();
		// }
		if (glyph?.geometry?.contours) checkSingleGlyph(glyph, idxG);
		count++;
		if (idxG > 0 && (idxG % 500 === 0 || count === len - 1)) {
			currentHtml += /*html*/`
			</div>
			${'<script>var svgPanZoomContainer=function(e){"use strict";const t=(e,t)=>{const n=new DOMMatrix(t.style.transform);return[n.a,e.scrollLeft-n.e,e.scrollTop-n.f]},n=(e,t,n,o,i)=>{const l=Math.round(Math.max(o,0)),r=Math.round(Math.max(i,0));t.setAttribute("transform",t.style.transform=`matrix(${n},0,0,${n},${l-o},${r-i})`),t.style.margin=0,e.scrollLeft=l,e.scrollTop=r,e.scrollLeft!==l&&(t.style.marginRight=`${l}px`,e.scrollLeft=l),e.scrollTop!==r&&(t.style.marginBottom=`${r}px`,e.scrollTop=r)},o=e=>{const t={};if(e)for(const n of e.split(";")){const e=n.indexOf(":");t[n.slice(0,e).trim().replace(/[a-zA-Z0-9_]-[a-z]/g,(e=>e[0]+e[2].toUpperCase()))]=n.slice(e+1).trim()}return t},i=(e,t)=>{const n=e?.closest(`[${t}]`);return n instanceof HTMLElement?[n,o(n.getAttribute(t))]:[]},l=(e,o,i)=>{const l=e.firstElementChild,[r,a,s]=t(e,l);n(e,l,r,a+o,s+i)},r=e=>t(e,e.firstElementChild)[0],a=(e,o,i={})=>{const l=((e,t,n)=>e<t?t:e>n?n:e)(o,i.minScale||1,i.maxScale||10),r=i.origin,a=e.firstElementChild,[s,c,m]=t(e,a);if(l===s)return;const d=l/s-1,u=a.getBoundingClientRect(),f=(r&&r.clientX||0)-u.left,v=(r&&r.clientY||0)-u.top;n(e,a,l,c+d*f,m+d*v)},s=(e,t,n)=>a(e,r(e)*t,n);var c;return c={button:"left"},addEventListener("mousedown",(e=>{if(0!==e.button&&2!==e.button)return;const[t,n]=i(e.target,"data-pan-on-drag");if(!t||!n||!((e,t,n)=>(!t.modifier||e.getModifierState(t.modifier))&&e.button===("right"===(t.button||n.button)?2:0))(e,n,c))return;e.preventDefault();let o=e.clientX*window.devicePixelRatio,r=e.clientY*window.devicePixelRatio;const a=e=>{l(t,o-e.clientX*window.devicePixelRatio,r-e.clientY*window.devicePixelRatio),o=e.clientX*window.devicePixelRatio,r=e.clientY*window.devicePixelRatio,e.preventDefault()},s=e=>e.preventDefault(),m=()=>{removeEventListener("mouseup",m),removeEventListener("mousemove",a),setTimeout((()=>removeEventListener("contextmenu",s)))};addEventListener("mouseup",m),addEventListener("mousemove",a),addEventListener("contextmenu",s)})),((e,t,n={})=>{n.noEmitStyle||((document.head||document.body||document.documentElement).appendChild(document.createElement("style")).textContent=`[${e}]{overflow:scroll}[${e}]>:first-child{width:100%;height:100%;vertical-align:middle;transform-origin:0 0}`),addEventListener("wheel",(n=>{const[o,l]=i(n.target,e);if(o instanceof HTMLElement){const e=+l.zoomAmount||t.zoomAmount;s(o,(1+e)**-n.deltaY,{origin:n,minScale:+l.minScale||t.minScale,maxScale:+l.maxScale||t.maxScale}),n.preventDefault()}}),{passive:!1}),addEventListener("resize",(()=>{const t=document.querySelectorAll(`[${e}]`);for(let n=0;n<t.length;n++){const i=t[n];if(i instanceof HTMLElement){const t=o(i.getAttribute(e));s(i,1,t)}}}))})("data-zoom-on-wheel",{minScale:1,maxScale:10,zoomAmount:.002}),e.getScale=r,e.pan=l,e.resetScale=e=>{const t=e.firstElementChild;t.style.margin=e.scrollLeft=e.scrollTop=0,t.removeAttribute("transform"),t.style.transform=""},e.setScale=a,e.zoom=s,Object.defineProperty(e,"__esModule",{value:!0}),e}({});</script>'}
			<script>
				const { pan, zoom, getScale, setScale, resetScale } = svgPanZoomContainer;
			</script>
			<script>
				function cssVariableGet(variable) {
					let root = document.querySelector(':root');
					let rootStyles = getComputedStyle(root);
					let value = rootStyles.getPropertyValue(variable);
					return value;
				}

				// Create a function for setting a variable value
				//function cssVariableSet(variable, value) {
				//	let root = document.querySelector(':root');
				//	root.style.setProperty(variable, value);
				//}
				
				//const Bool = (string) => string === 'false' || string === 'undefined' || string === 'null' || string === '0' ? false : !!string;
				
				let checkboxHorizontal = document.getElementById('toggleHorizontalRules');
				let checkboxVertical = document.getElementById('toggleVerticalRules');
				let checkboxPoints = document.getElementById('togglePoints');
				let checkboxHandles = document.getElementById('toggleHandles');
				let checkboxStroke = document.getElementById('toggleStroke');
				let inputFill = document.getElementById('fillOpacity');
				let zoomSize = document.getElementById('zoomSize');
				// let dottedRules = document.querySelectorAll('.wrapper .dotted-rule');
				// let verticalRules = document.querySelectorAll('.wrapper .vertical-rule');
				// let cornerPoints = document.querySelectorAll('.wrapper .start-point, .wrapper .corner-point');
				// let controlPoints = document.querySelectorAll('.wrapper .control-vector, .wrapper .control-point');
				// let contourStrokes = document.querySelectorAll('.wrapper .contour-stroke');
				// let contourFills = document.querySelectorAll('.wrapper .contour-fill');
				
				// function setParams() {
				// 	let horizontalRules = checkboxHorizontal.checked;
				// 	let verticalRules = checkboxVertical.checked;
				// 	let points = checkboxPoints.checked;
				// 	let stroke = checkboxStroke.checked;
				// 	let fill = checkboxFill.checked;
				// 	let params = '?hr=' + horizontalRules + '&vr=' + verticalRules + '&p=' + points + '&s=' + stroke + '&f' + fill;
				// 	let path = window.location.origin + window.location.pathname + params;
				// }
				
				checkboxHorizontal.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--toggle-horizontal', 'none');
					} else {
						cssVariableSet('--toggle-horizontal', 'revert');
					}
				});
				checkboxVertical.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--toggle-vertical', 'none');
					} else {
						cssVariableSet('--toggle-vertical', 'revert');
					}
				});
				checkboxPoints.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--toggle-points', 'none');
					} else {
						cssVariableSet('--toggle-points', 'revert');
					}
				});
				checkboxHandles.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--toggle-handles', 'none');
					} else {
						cssVariableSet('--toggle-handles', 'revert');
					}
				});
				checkboxStroke.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--toggle-stroke', 'none');
					} else {
						cssVariableSet('--toggle-stroke', 'revert');
					}
				});

				let checkboxDialogHorizontal = document.getElementById('toggleDialogHorizontalRules');
				let checkboxDialogVertical = document.getElementById('toggleDialogVerticalRules');
				let checkboxDialogPoints = document.getElementById('toggleDialogPoints');
				let checkboxDialogHandles = document.getElementById('toggleDialogHandles');
				let checkboxDialogStroke = document.getElementById('toggleDialogStroke');
				let inputDialogFill = document.getElementById('dialogfillOpacity');
				checkboxDialogHorizontal.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--dialog-toggle-horizontal', 'none');
					} else {
						cssVariableSet('--dialog-toggle-horizontal', 'revert');
					}
				});
				checkboxDialogVertical.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--dialog-toggle-vertical', 'none');
					} else {
						cssVariableSet('--dialog-toggle-vertical', 'revert');
					}
				});
				checkboxDialogPoints.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--dialog-toggle-points', 'none');
					} else {
						cssVariableSet('--dialog-toggle-points', 'revert');
					}
				});
				checkboxDialogHandles.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--dialog-toggle-handles', 'none');
					} else {
						cssVariableSet('--dialog-toggle-handles', 'revert');
					}
				});
				checkboxDialogStroke.addEventListener('change', function () {
					let setting = this.checked;
					if (!setting) {
						cssVariableSet('--dialog-toggle-stroke', 'none');
					} else {
						cssVariableSet('--dialog-toggle-stroke', 'revert');
					}
				});
				
				function inputDialogFillHandler() {
					let setting = this.value / 100;
					if (setting) {
						cssVariableSet('--dialog-contour-fill', setting);
					}
				}
				
				inputDialogFill.addEventListener('change', inputDialogFillHandler);
				inputDialogFill.addEventListener('input', inputDialogFillHandler);
				
				function inputFillHandler() {
					let setting = this.value / 100;
					if (setting) {
						cssVariableSet('--contour-fill', setting);
					}
				}
				
				inputFill.addEventListener('change', inputFillHandler);
				inputFill.addEventListener('input', inputFillHandler);
				
				function zoomSizeHandler() {
					let setting = this.value;
					if (setting) {
						cssVariableSet('--glyph-size', setting + 'px');
					}
				}
				
				zoomSize.addEventListener('change', zoomSizeHandler);
				zoomSize.addEventListener('input', zoomSizeHandler);
				
				// window.addEventListener("click", function(e) {
				// 	var href = e.target.getAttribute("href");
				// 	if(href) {
				// 		let urlSearch = document.location.search;
				// 		let params = new URLSearchParams(urlSearch);
				// 		let horizontalRules = (checkboxHorizontal?.checked ?? params.get('hr')) ?? true;
				// 		let verticalRules = (checkboxVertical?.checked ?? params.get('vr')) ?? true;
				// 		let points = (checkboxPoints?.checked ?? params.get('p')) ?? true;
				// 		let handles = (checkboxHandles?.checked ?? params.get('h')) ?? true;
				// 		let stroke = (checkboxStroke?.checked ?? params.get('s')) ?? true;
				// 		let fill = (inputFill?.value ?? params.get('f')) ?? 10;
				// 		let zoom = (zoomSize?.value ?? params.get('zoom')) ?? 300;
				// 		let params = '?hr=' + horizontalRules + '&vr=' + verticalRules + '&p=' + points + '&h=' + handles + '&s=' + stroke + '&f=' + fill + '&zoom=' + zoom;
				// 		location.href = href + params;
				// 		e.preventDefault();
				// 	}
				// });
				
				window.addEventListener("DOMContentLoaded", (event) => {
					let urlSearch = document.location.search;
					if (urlSearch) {
						let params = new URLSearchParams(urlSearch);
						checkboxHorizontal.checked = Bool(params.get('hr'));
						checkboxHorizontal.dispatchEvent(new Event('change'));
						checkboxVertical.checked = Bool(params.get('vr'));
						checkboxVertical.dispatchEvent(new Event('change'));
						checkboxPoints.checked = Bool(params.get('p'));
						checkboxPoints.dispatchEvent(new Event('change'));
						checkboxHandles.checked = Bool(params.get('h'));
						checkboxHandles.dispatchEvent(new Event('change'));
						checkboxStroke.checked = Bool(params.get('s'));
						checkboxStroke.dispatchEvent(new Event('change'));
						inputFill.value = params.get('f');
						inputFill.dispatchEvent(new Event('change'));
						zoomSize.value = params.get('zoom');
						zoomSize.dispatchEvent(new Event('change'));
					}
				});
				
				var intervalIdStepper, timeoutIdStepper;

				function stepperPlus(input) {
					let decimals = Number(input.dataset.decimals);
					let step = Number(input.dataset.step);
					let count = Number(input.value) + step;
					if (typeof input.dataset.max === 'number') { count = count > input.dataset.max ? input.dataset.max : count; }
					input.value = count.toFixed(decimals);
					input.dispatchEvent(new Event('change'));
					return false;
				}

				function stepperMinus(input) {
					let decimals = Number(input.dataset.decimals);
					let step = Number(input.dataset.step);
					let count = Number(input.value) - step;
					if (typeof input.dataset.min === 'number') { count = count < input.dataset.min ? input.dataset.min : count; }
					input.value = count.toFixed(decimals);
					input.dispatchEvent(new Event('change'));
					return false;
				}
				function stepperUpHandler(event) {
					event.preventDefault();
					switch (event.type) {
						case 'pointerdown': {
							let input = this.parentElement.querySelector('input');
							stepperPlus(input);
							timeoutIdStepper = setTimeout(function () {
								intervalIdStepper = setInterval(stepperPlus, 100, input);
							}, 500);
							break;
						}
						case 'pointerleave':
						case 'pointercancel': {
							clearInterval(intervalIdStepper);
							clearTimeout(timeoutIdStepper);
							break;
						}
						case 'pointerup': {
							clearInterval(intervalIdStepper);
							clearTimeout(timeoutIdStepper);
							break;
						}
					}

				}

				function stepperDownHandler(event) {
					event.preventDefault();
					switch (event.type) {
						case 'pointerdown': {
							let input = this.parentElement.querySelector('input');
							stepperMinus(input);
							timeoutIdStepper = setTimeout(function () {
								intervalIdStepper = setInterval(stepperMinus, 100, input);
							}, 500);
							break;
						}
						case 'pointerleave':
						case 'pointercancel': {
							clearInterval(intervalIdStepper);
							clearTimeout(timeoutIdStepper);
							break;
						}
						case 'pointerup': {
							clearInterval(intervalIdStepper);
							clearTimeout(timeoutIdStepper);
							break;
						}
					}

				}

				document.querySelectorAll('.minus').forEach(function (el) {
					el.addEventListener('pointerdown', stepperDownHandler);
					el.addEventListener('pointerup', stepperDownHandler);
					el.addEventListener('pointerleave', stepperDownHandler);
					el.addEventListener('click', stepperDownHandler);
				});

				document.querySelectorAll('.plus').forEach(function (el) {
					el.addEventListener('pointerdown', stepperUpHandler);
					el.addEventListener('pointerup', stepperUpHandler);
					el.addEventListener('pointerleave', stepperUpHandler);
					el.addEventListener('click', stepperUpHandler);
				});
				

				
				let glyphDialog = document.getElementById('glyphDialog');
				let dialogGlyphContainer = document.getElementById('dialogGlyphContainer');
				let dialogTitle = document.getElementById('dialogTitle');
				let dialogGlyphPrev = document.getElementById('dialogGlyphPrev');
				let dialogGlyphNext = document.getElementById('dialogGlyphNext');
				// let closeGlyphDialog = document.getElementById('closeGlyphDialog');
				let currentScale = 1;
				// dialogGlyphContainer.addEventListener("wheel", () => {
				// 	let scale = getScale(dialogGlyphContainer);
				// 		if (currentScale !== scale) {
				// 			currentScale = scale;
				// 			cssVariableSet('--dialog-scale', scale);
				// 		}
				// });
				
				const observer = new MutationObserver(function (mutations) {
					mutations.forEach(function (mutation) {
						let scale = getScale(dialogGlyphContainer);
						if (currentScale !== scale) {
							currentScale = scale;
							cssVariableSet('--dialog-scale', scale);
						}
					});
				});
				
				document.getElementById('closeGlyphDialog').addEventListener("click", () => {
					observer.disconnect();
					glyphDialog.close();
				});
				
				let dialogCurrentGlyph;
				function setDialogGlyph(node) {
					dialogGlyphContainer.replaceChildren();
					cssVariableSet('--dialog-scale', 1);
					let clone = node.cloneNode(true);
					dialogCurrentGlyph = parseInt(clone.dataset.glyphIdx);
					dialogTitle.textContent = clone.dataset.glyphName;
					let viewBox = clone.getAttribute("viewBox");
					let viewBoxSplit = viewBox.split(' ');
					let width = parseFloat(viewBoxSplit[2]);
					let height = parseFloat(viewBoxSplit[3]);
					clone.id = 'popupGlyphSvg';
					dialogGlyphContainer.appendChild(clone);
					observer.observe(dialogGlyphContainer.firstElementChild, {
						attributes: true,
						attributeFilter: ['transform'],
					});
					glyphDialog.showModal();
					node.parentElement.parentElement.scrollIntoView();
				}
				document.querySelectorAll('.glyph svg').forEach((el) => { 
					el.addEventListener("click", function(e) {
						setDialogGlyph(this);
					}); 
				});
				
				dialogGlyphPrev.addEventListener("click", function(e) {
					e.preventDefault();
					let selector = '[data-glyph-idx="' + (dialogCurrentGlyph - 1) + '"]';
					let prev = document.querySelector(selector)
					if (prev) setDialogGlyph(prev);
				}); 
				dialogGlyphNext.addEventListener("click", function(e) {
					e.preventDefault();
					let selector = '[data-glyph-idx="' + (dialogCurrentGlyph + 1) + '"]';
					let next = document.querySelector(selector)
					if (next) setDialogGlyph(next);
				}); 


				
			</script>
			</body>
			</html>
			`;
			let outputDir = `/mnt/c/Users/Michael/ResourceHanRounded/Inspect-${subfamily}`;
			mkdirSync(outputDir, { recursive: true });
			let filename = `${outputDir}/page-${page}.html`;
			writeFileSync(filename, currentHtml, { flush: true });
			// writeFile(filename, htmlHeader);
			page++
			newHtml();
		};
		if (glyph?.geometry?.contours) idxG++;
	}

	// let filename = glyph.name + ".svg";
}

module.exports = {
	inspect
};
