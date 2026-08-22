/** Verifies Segment 5A's distinct Corran and Loch Leven spatial identities. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const expected = [
	{
		id:"55187907-2b6d-4c9b-9073-3848e2679a07",
		name:"Corran Narrows",
		coordinates:[-5.24089661,56.719579],
		sourceId:"osgb4000000074786431",
		warning:/representative named-channel point, not a surveyed gate line, fairway or safe-water position/,
	},
	{
		id:"47683dc5-1b7e-477c-95fb-4e7a54244995",
		name:"Loch Leven Narrows (Caolas Mhic Phadruig)",
		coordinates:[-5.18642537,56.68946917],
		sourceId:"osgb4000000074784648",
		warning:/source extent contains the officially documented Ballachulish Bridge position.*not a surveyed gate line, bridge-clearance point, fairway or safe-water position/,
	},
];

test("Segment 5A locations use separate named-channel points without asserting navigation geometry", () => {
	for (const item of expected) {
		const matches = seed.locations.filter((entry) => entry.id === item.id);
		assert.equal(matches.length,1);
		const [location] = matches;
		assert.equal(location.name,item.name);
		assert.deepEqual(location.types,["tidalGate"]);
		assert.equal(location.feature.geometry.type,"Point");
		assert.deepEqual(location.feature.geometry.coordinates,item.coordinates);
		assert.equal(location.properties.provenance.reviewStatus,"sourceChecked");
		assert.match(location.properties.provenance.warning,item.warning);
		assert.ok(location.properties.provenance.sources.some((source) => source.sourceId.includes(item.sourceId)));
		assert.equal(location.properties.tidalGate,undefined);
		assert.equal(location.properties.aliases,undefined);
	}
	assert.notEqual(expected[0].id,expected[1].id);
});

test("Segment 5A appends identities without altering the existing spatial catalogue", () => {
	const priorLocations = seed.locations.slice(0,300);
	const digest = crypto.createHash("sha256").update(JSON.stringify(priorLocations)).digest("hex");
	assert.equal(digest,"1ba52bf1105d11eeaafad353d40dfcfecdf2990178ea0d264b1aec9ebf545333");
	assert.equal(seed.locations.length,318);
	assert.equal(new Set(seed.locations.map((entry) => entry.id)).size,318);
});
