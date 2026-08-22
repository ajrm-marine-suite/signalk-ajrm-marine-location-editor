/** Verifies Segment 4's two distinct Sound of Mull spatial joins. */

const assert = require("node:assert/strict");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const expected = [
	{
		id:"c37604e9-f6e7-442f-91c3-c3135fc2e215",
		name:"Sound of Mull, southeast entrance (Rubha an Ridire)",
		coordinates:[-5.68474902,56.49803411],
		sourceId:"osgb4000000074750735",
		warning:/named headland point on land, not the entrance line or a surveyed fairway, safe-water position or gate line/,
	},
	{
		id:"74846a1d-67f1-4176-b74b-b7956df2386e",
		name:"Sound of Mull, 3 miles southeast of Calve Island",
		coordinates:[-6.04017366,56.61863262],
		sourceId:"osgb4000000074780350",
		warning:/representative point on Calve Island \(land\), not the source position 3 miles southeast/,
	},
];

test("Segment 4 locations use separate named-landmark anchors without inventing offshore waypoints", () => {
	for (const item of expected) {
		const location = seed.locations.find((entry) => entry.id === item.id);
		assert.equal(location?.name,item.name);
		assert.deepEqual(location.types,["tidalGate"]);
		assert.equal(location.feature.geometry.type,"Point");
		assert.deepEqual(location.feature.geometry.coordinates,item.coordinates);
		assert.equal(location.properties.provenance.reviewStatus,"sourceChecked");
		assert.match(location.properties.provenance.warning,item.warning);
		assert.ok(location.properties.provenance.sources.some((source) => source.sourceId.includes(item.sourceId)));
		assert.equal(location.properties.tidalGate,undefined);
	}
});

test("Segment 4 does not repurpose the conflicting legacy Duart or generic Sound of Mull identities", () => {
	const duart = seed.locations.find((entry) => entry.id === "dd71c30b-b105-4d2f-a61e-3d6b9695e863");
	const generic = seed.locations.find((entry) => entry.id === "2f25fd92-fbd0-4942-a883-17084a7b2eb2");
	assert.equal(duart?.name,"Duart Point");
	assert.deepEqual(duart.feature.geometry.coordinates,[-5.64667,56.44167]);
	assert.equal(generic?.name,"Sound of Mull");
	assert.deepEqual(generic.feature.geometry.coordinates,[-5.7074,56.47074]);
	assert.notEqual(expected[0].id,duart.id);
	assert.notEqual(expected[1].id,generic.id);
});
