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

test("workspace display choices contain only types from the selected workspace", async () => {
	const { displayTypesForWorkspace } = await import("../public/location-browser.mjs");
	const definitions = {
		anchorage: ["Anchorage", "places"],
		tidalGate: ["Tidal gate", "tides"],
		hazard: ["Hazard", "hazards"],
	};
	assert.deepEqual([...displayTypesForWorkspace(definitions, "places")], ["anchorage"]);
	assert.deepEqual([...displayTypesForWorkspace(definitions, "tides")], ["tidalGate"]);
	assert.deepEqual([...displayTypesForWorkspace(definitions, "all")], ["anchorage", "tidalGate", "hazard"]);
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

test("broad tidal planning regions do not mask contained chart locations", async () => {
	const { chartLocationInteractive } = await import("../public/location-browser.mjs");
	assert.equal(chartLocationInteractive({ types: ["tidalRegion"] }), false);
	assert.equal(chartLocationInteractive({ types: ["tidalSecondaryPort"] }), true);
	assert.equal(chartLocationInteractive({ types: ["hazard"] }), true);
});

test("close chart scales retain the most specific visible tidal region", async () => {
	const { declutterTidalRegions } = await import("../public/location-browser.mjs");
	const locations = [
		{ id:"west",types:["tidalRegion"] },
		{ id:"oban",types:["tidalRegion"] },
		{ id:"cuan",types:["tidalRegion"] },
		{ id:"gate",types:["tidalGate"] },
	];
	const areas = [
		{ locationId:"west",parentAreaLocationId:null },
		{ locationId:"oban",parentAreaLocationId:"west" },
		{ locationId:"cuan",parentAreaLocationId:"oban" },
	];
	assert.deepEqual(declutterTidalRegions(locations,areas,{ zoom:9 }).map(({ id }) => id),["west","oban","cuan","gate"]);
	assert.deepEqual(declutterTidalRegions(locations,areas,{ zoom:12 }).map(({ id }) => id),["cuan","gate"]);
	assert.deepEqual(declutterTidalRegions(locations,areas,{ zoom:12,selectedId:"oban" }).map(({ id }) => id),["oban","cuan","gate"]);
});
