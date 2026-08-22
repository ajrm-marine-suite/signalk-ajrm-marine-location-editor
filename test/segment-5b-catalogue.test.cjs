/** Verifies Segment 5B's distinct Caolas nan Con and Lynn of Morvern identities. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const LOCH_LEVEN_NARROWS = "47683dc5-1b7e-477c-95fb-4e7a54244995";
const expected = [
	{
		id:"fbd3ab30-6bf6-4e70-bf91-f7141d9586fc",
		name:"Caolas nan Con",
		coordinates:[-5.04740364,56.70546277],
		sourceId:"osgb4000000074786201",
		warning:/representative named-channel point, not a surveyed gate line, fairway or safe-water position.*roughly 0\.5 kilometre by 0\.5 kilometre source extent.*cannot identify an exact timing observation or passage waypoint/,
	},
	{
		id:"dd2f8629-e052-42ac-84b3-07e49390c7b1",
		name:"Lynn of Morvern",
		coordinates:[-5.57166124,56.51808317],
		sourceId:"osgb4000000074348786",
		warning:/representative point for the broad Lynn of Morvern sea feature, not the entrance line between Lismore and Morvern, a surveyed gate, fairway, route or safe-water position.*roughly 18\.3 kilometres by 14\.5 kilometres.*does not localize the separately described streams/,
	},
];

test("Segment 5B locations use separate OS name points without asserting navigation geometry", () => {
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
	assert.equal(new Set([...expected.map((entry) => entry.id),LOCH_LEVEN_NARROWS]).size,3);
});

test("Segment 5B appends identities without altering any prior Location byte", () => {
	const priorLocations = seed.locations.slice(0,302);
	const digest = crypto.createHash("sha256").update(JSON.stringify(priorLocations)).digest("hex");
	assert.equal(digest,"1a84f6a5d959075e6e40acfa7335b9c1c6132cf8d271eeec9a9b395056b6b60b");
	assert.equal(seed.locations.length,309);
	assert.equal(new Set(seed.locations.map((entry) => entry.id)).size,309);
});
