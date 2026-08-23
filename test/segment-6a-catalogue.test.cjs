/** Verifies Segment 6A's source-checked Loch Feochan and Firth of Lorn identities. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const LEGACY_FIRTH_OF_LORN = "73849d2d-5faf-4d15-acb5-c3c29e655a3a";
const expected = [
	{
		id:"98553f02-f25a-4789-9f9a-ee41395e1e8c",
		name:"Loch Feochan",
		coordinates:[-5.49905657,56.35520382],
		sourceId:"osgb4000000074789241",
		warning:/representative point for the named Loch Feochan tidal-water feature, not the shoal entrance\/channel, a surveyed gate line, fairway, route or safe-water position.*roughly 5\.0 kilometres by 2\.6 kilometres.*does not localize the entrance stream observation/,
	},
	{
		id:"c0af534c-269b-40c6-952c-c7b37aaa6a32",
		name:"Firth of Lorn (named-sea representative)",
		coordinates:[-5.64089724,56.37688065],
		sourceId:"osgb4000000074799403",
		warning:/representative point for the broad Firth of Lorn sea feature, not the source fairway, a surveyed gate line, route or safe-water position.*roughly 25\.4 kilometres by 37\.6 kilometres.*does not localize the progressive fairway turns or separate local streams/,
	},
];

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Segment 6A locations use separate OS name points without asserting navigation geometry", () => {
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
	assert.equal(new Set([...expected.map((entry) => entry.id),LEGACY_FIRTH_OF_LORN]).size,3);
	assert.notEqual(expected[1].name,seed.locations.find((entry) => entry.id === LEGACY_FIRTH_OF_LORN).name);
});

test("Segment 6A preserves prior and legacy Firth data apart from the approved Oban name migration", () => {
	const priorLocations = seed.locations.slice(0,304);
	assert.equal(digest(priorLocations),"be155fe779dd609736b2cfd148a61f3bec3cd9e20ad3a8377cbf0f4283683091");
	assert.equal(digest(priorLocations.find((entry) => entry.id === LEGACY_FIRTH_OF_LORN)),"b8cbf2dfc809d6a85f074bfc9dfd201e596960ed57e75aaf26c7d0f8401940d5");
	assert.equal(seed.locations.length,318);
	assert.equal(new Set(seed.locations.map((entry) => entry.id)).size,318);
});
