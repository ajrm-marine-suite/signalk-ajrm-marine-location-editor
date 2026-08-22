/** Verifies Segment 3B spatial joins and the deliberately withheld Tiree locus. */

const assert = require("node:assert/strict");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const expected = [
	{
		id:"b4ff0772-bcba-4392-90e0-2f6d955a46f3",
		name:"Northwest Mull (Caliach Point)",
		coordinates:[-6.32013312,56.60340058],
		sourceIds:["osgb4000000074750402","osgb4000000074750153"],
		warning:/named headland point on land, not a surveyed fairway, safe-water position or gate line/,
	},
	{
		id:"511edf0a-5ecc-419c-8f81-9a4553e559bf",
		name:"Loch Sunart",
		coordinates:[-6.00738658,56.67836957],
		sourceIds:["osgb4000000074799406"],
		warning:/named tidal-water point, not a surveyed fairway, entrance, narrows or gate line/,
	},
];

test("Segment 3B source-checked gates have stable representative joins and explicit spatial limits", () => {
	for (const item of expected) {
		const location = seed.locations.find((entry) => entry.id === item.id);
		assert.equal(location?.name,item.name);
		assert.deepEqual(location.types,["tidalGate"]);
		assert.equal(location.feature.geometry.type,"Point");
		assert.deepEqual(location.feature.geometry.coordinates,item.coordinates);
		assert.equal(location.properties.provenance.reviewStatus,"sourceChecked");
		assert.match(location.properties.provenance.warning,item.warning);
		for (const sourceId of item.sourceIds) assert.ok(location.properties.provenance.sources.some((source) => source.sourceId.includes(sourceId)));
		assert.equal(location.properties.tidalGate,undefined);
	}
});

test("South-end Tiree remains withheld because the source supplies no defensible gate position", () => {
	assert.equal(seed.locations.some((entry) => /south end of tiree/i.test(entry.name)),false);
});
