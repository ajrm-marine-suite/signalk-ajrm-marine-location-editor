/** Verifies Segment 6B's distinct source-checked Cuan and Grey Dogs identities. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const LEGACY_CUAN = "0b9ecfef-3260-4f1e-a41f-5f2fdf7dfbec";
const LEGACY_GREY_DOGS = "6bb68eda-0423-46e9-9f9a-2c309ee7cf0b";
const expected = [
	{
		id:"5270b58c-5b74-4a30-92ea-e8de3050f024",
		name:"Cuan Sound (named-channel representative)",
		coordinates:[-5.63148652,56.26765562],
		sourceId:"osgb4000000074798949",
		warning:/naming and locating point for the Cuan Sound Channel feature, not the narrows.*source extent is roughly 0\.95 kilometres by 1\.17 kilometres.*cannot localize the western-part rate statement/,
	},
	{
		id:"a3df95d7-a216-476b-a10f-1d8909810c47",
		name:"Grey Dogs / Bealach a' Choin Ghlais (named-channel representative)",
		coordinates:[-5.69277502,56.20067008],
		sourceId:"osgb4000000074786354",
		warning:/naming and locating point for the Bealach a' Choin Ghlais Channel feature, not its narrowest part.*exact turn, slack or rate locus.*source extent is roughly 0\.61 kilometres by 0\.67 kilometres/,
	},
];

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Segment 6B locations use distinct OS channel name points without navigation claims", () => {
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
		const source = location.properties.provenance.sources.find((entry) => entry.sourceId.includes(item.sourceId));
		assert.ok(source);
		assert.equal(source.license,"Open Government Licence 3.0 (OS OpenData)");
		if (item.id === "a3df95d7-a216-476b-a10f-1d8909810c47") {
			assert.equal(location.description.includes("Little Corryvreckan"),false);
			const nameSource = location.properties.provenance.sources.find((entry) => entry.provider === "NatureScot");
			assert.ok(nameSource);
			assert.match(nameSource.sourceId,/Bealach a' Choin Ghlais \/ Grey Dogs name corroboration only/);
		}
		assert.equal(location.properties.tidalGate,undefined);
		assert.equal(location.properties.aliases,undefined);
	}
	assert.equal(new Set([...expected.map((entry) => entry.id),LEGACY_CUAN,LEGACY_GREY_DOGS]).size,4);
});

test("Segment 6B appends identities without altering any prior Cuan or Grey Dogs byte", () => {
	const priorLocations = seed.locations.slice(0,306);
	assert.equal(digest(priorLocations),"9499bf7d266b33726cec35fd61541f6cae0fa070a61be6cf79b0b07f7ddf7fd7");
	assert.equal(digest(priorLocations.find((entry) => entry.id === LEGACY_CUAN)),"28bfbf59be6faecd8fc8472917e59086e9283428c9b19964c877a044bee2588d");
	assert.equal(digest(priorLocations.find((entry) => entry.id === LEGACY_GREY_DOGS)),"61c09c853f83b789094e3413c270bdaf51b1089653404623553acbf5e86ff214");
	assert.equal(seed.locations.length,309);
	assert.equal(new Set(seed.locations.map((entry) => entry.id)).size,309);
	assert.equal(new Set(seed.locations.map((entry) => entry.name.trim().toLowerCase())).size,309);
});
