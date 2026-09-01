(function () {
	"use strict";

	const script = document.currentScript;
	const base = script
		? script.src.slice(0, script.src.lastIndexOf("/"))
		: "./buttplug-mod";

	function load(filename) {
		const el = document.createElement("script");
		el.src = base + "/" + filename;
		el.async = false;
		document.head.appendChild(el);
	}

	load("buttplug.js");
	load("vibration.js");
})();
