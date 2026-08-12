/**
 * Verifies catalogue search, workspace/type filtering and deterministic grouping.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

test("browser filters workspace, type, search and map scope independently", async () => {
	const { filterLocations } = await import("../public/location-browser.mjs");
	const locations = [
		{ id: "a", name: "North Bay", description: "Sheltered mud", types: ["anchorage"] },
		{ id: "b", name: "South Gate", description: "Strong stream", types: ["tidalGate"] },
		{ id: "c", name: "North Rock", description: "Dries", types: ["hazard"] },
	];
	const common = {
		typeWorkspaces: { anchorage: "places", tidalGate: "tides", hazard: "hazards" },
		typeLabels: { anchorage: "Anchorage", tidalGate: "Tidal gate", hazard: "Hazard" },
	};
	assert.deepEqual(filterLocations(locations, { ...common, workspace: "places" }).map(({ id }) => id), ["a"]);
	assert.deepEqual(filterLocations(locations, { ...common, terms: ["north"] }).map(({ id }) => id), ["a", "c"]);
	assert.deepEqual(filterLocations(locations, { ...common, activeTypes: new Set(["hazard"]) }).map(({ id }) => id), ["c"]);
	assert.deepEqual(filterLocations(locations, { ...common, intersects: ({ id }) => id === "b" }).map(({ id }) => id), ["b"]);
});

test("browser groups a multi-classified location once under its primary type", async () => {
	const { groupLocations } = await import("../public/location-browser.mjs");
	const groups = groupLocations([
		{ id: "a", types: ["anchorage", "pointOfInterest"] },
		{ id: "b", types: ["anchorage"] },
	], new Set(["anchorage", "pointOfInterest"]));
	assert.equal(groups.get("anchorage").length, 2);
	assert.equal([...groups.values()].flat().length, 2);
});
