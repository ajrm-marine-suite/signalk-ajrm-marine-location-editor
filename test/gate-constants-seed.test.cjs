/** Verifies the one-time Planning-to-Location Editor tidal-gate migration. */

const assert = require("node:assert/strict");
const test = require("node:test");
const west = require("../defaults/west-scotland-locations.json");
const secondary = require("../defaults/secondary-port-locations.json");
const gateSeed = require("../defaults/tidal-gate-locations.json");
const { mergeSecondaryPortSeed } = require("../plugin/secondary-port-seed.cjs");
const { GATE_CONTRACT, mergeGateConstantsSeed } = require("../plugin/gate-constants-seed.cjs");

test("migrates every legacy gate constant into a positioned Location record", () => {
	const merged = mergeGateConstantsSeed(mergeSecondaryPortSeed(west, secondary), gateSeed);
	const gates = merged.locations.filter((location) => location.properties?.tidalGate?.contract === GATE_CONTRACT);
	assert.equal(gates.length, Object.keys(gateSeed.constants).length);
	for (const location of gates) {
		assert.equal(location.feature.geometry.type, "Point");
		assert.equal(location.properties.tidalGate.standardPortRef, `/resources/locations/${gateSeed.standardPortId}`);
	}
});

test("bundles Stornoway and Ullapool as selectable UKHO standard ports", () => {
	const ports = new Map(west.locations.filter((location) => location.types.includes("tidalStandardPort"))
		.map((location) => [location.properties.tide.stationName, location.properties.tide]));
	assert.equal(ports.get("Stornoway").stationId, "0308");
	assert.deepEqual(ports.get("Stornoway").referenceLevels, { mhws: 4.8, mhwn: 3.7, mlwn: 2, mlws: 0.7 });
	assert.equal(ports.get("Ullapool").stationId, "0334");
	assert.deepEqual(ports.get("Ullapool").referenceLevels, { mhws: 5.2, mhwn: 3.9, mlwn: 2.1, mlws: 0.7 });
});
