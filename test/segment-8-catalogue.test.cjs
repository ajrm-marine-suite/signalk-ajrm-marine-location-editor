const assert = require("node:assert/strict");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const expected = new Map([
	["513807ca-dafc-48fd-a81a-76961c645e23", "Sound of Jura (named-sea representative)"],
	["81ce9a21-efb6-4d14-ab26-280c8bfd4035", "West of Islay (Rinns of Islay representative)"],
	["f9c17ddc-8fcc-49bd-8000-422f715d5697", "Sound of Islay (named-sea representative)"],
	["f8a16397-5b14-46be-b769-555b3300af72", "West Loch Tarbert, Jura (named-tidal-water representative)"],
	["7c0e9a0d-4e6f-46e7-ac72-1b355f7a7e5d", "Sound of Gigha (named-sea representative)"],
	["b1b21e35-0cb5-4ab9-b8ac-1bb3795f2e17", "Sanda Sound (Sanda Roads named-channel representative)"],
	["9221ab63-c01f-4461-bf49-b7f566941013", "Mull of Kintyre, close west (lighthouse representative)"],
]);

test("Segment 8 adds seven distinct approximate spatial identities", () => {
	assert.equal(seed.locations.length, 318);
	assert.equal(new Set(seed.locations.map((entry) => entry.id)).size, 318);
	assert.equal(new Set(seed.locations.map((entry) => entry.name.trim().toLowerCase())).size, 318);
	for (const [id, name] of expected) {
		const location = seed.locations.find((entry) => entry.id === id);
		assert.ok(location, name);
		assert.equal(location.name, name);
		assert.deepEqual(location.types, ["tidalGate"]);
		assert.equal(location.properties.provenance.reviewStatus, "sourceChecked");
		assert.match(location.description, /Approximate/);
		assert.match(location.properties.provenance.warning, /not .*?(surveyed|offshore|source's)/i);
		assert.equal(location.properties.tidalGate, undefined);
	}
});

test("Segment 8 retains rather than overwrites legacy candidate identities", () => {
	assert.equal(seed.locations.find((entry) => entry.id === "bc8ddb8f-ba38-4b60-8d31-443dc2a96d1a").name, "Mull of Kintyre");
	assert.equal(seed.locations.find((entry) => entry.id === "f2e31a99-65af-4188-8743-c4ae67e2cf3d").name, "Sound of Islay");
	for (const id of expected.keys()) assert.notEqual(id, "bc8ddb8f-ba38-4b60-8d31-443dc2a96d1a");
});
