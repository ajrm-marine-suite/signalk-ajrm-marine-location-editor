/** Verifies the source-checked Segment 3A spatial joins without adding tidal semantics. */

const assert = require("node:assert/strict");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const expected = [
	{
		id:"1957fe61-93dd-4eb2-a27b-e8f7fa958270",
		name:"Sound of Iona",
		coordinates:[-6.38885173,56.31595326],
		sourceId:"osgb4000000074789951",
	},
	{
		id:"6211fb34-5f92-4ea9-887c-201ddb550792",
		name:"Gunna Sound",
		coordinates:[-6.73575454,56.55274988],
		sourceId:"osgb4000000074784701",
	},
];

test("Segment 3A source-checked gates have stable point joins and explicit coordinate uncertainty", () => {
	for (const item of expected) {
		const location = seed.locations.find((entry) => entry.id === item.id);
		assert.equal(location?.name,item.name);
		assert.deepEqual(location.types,["tidalGate"]);
		assert.equal(location.feature.geometry.type,"Point");
		assert.deepEqual(location.feature.geometry.coordinates,item.coordinates);
		assert.equal(location.properties.provenance.reviewStatus,"sourceChecked");
		assert.match(location.properties.provenance.warning,/representative named-(?:channel|sea) point, not a surveyed navigation point or gate line/);
		assert.match(location.properties.provenance.sources[0].provider,/OS Open Names 2026-07/);
		assert.match(location.properties.provenance.sources[0].sourceId,new RegExp(item.sourceId));
		assert.equal(location.properties.tidalGate,undefined);
	}
});
