/** Verifies Segment 7B's distinct Sound of Luing and Dorus Mòr identities. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const LEGACY_LUING = "79d09bf4-933b-4834-a835-177c9a53400c";
const LEGACY_DORUS = "9d4cf5a6-7fd3-49e7-b486-d9ac16b6ff67";
const NATIVE_LUING = "53ae1e7e-ec00-40f7-ab23-784644740f0b";
const NATIVE_DORUS = "83192cc1-65da-4abc-b4ae-51c6c4ab54ad";
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Segment 7B adds only defensible OS named-water representatives", () => {
	const expected = [
		{
			id:NATIVE_LUING,
			digest:"f08718b168aba5f282a1a866725ef7e0f37cfdfe0f944a35088bcfda5c591647",
			name:"Sound of Luing (named-sea representative)",
			coordinates:[-5.66924669,56.22179984],
			sourceId:/osgb4000000074799327.*hydrography\/Sea.*BNG 172619,709308.*source extent 170980,704511 to 174219,714013/,
			warning:/broad Sound of Luing Sea feature.*roughly 3\.24 kilometres by 9\.50 kilometres.*Ardluing, Fladda, Rubha Fiola or Rubha na Lic/,
			description:/no surveyed gate line.*exact stream observation.*eddy or tidal-race locus/,
		},
		{
			id:NATIVE_DORUS,
			digest:"e901cf591cc654d6c825b591750701502f1c982204912bb7b506c7cb77f4de01",
			name:"Dorus Mòr (named-channel representative)",
			coordinates:[-5.60992799,56.12718962],
			sourceId:/osgb4000000074785740.*hydrography\/Channel.*BNG 175743,698591.*source extent 175071,698066 to 176334,699116/,
			warning:/Dorus Mòr Channel feature.*roughly 1\.26 kilometres by 1\.05 kilometres.*separately described streams and hazards/,
			description:/no surveyed gate line.*exact stream, turn, slack, rate, eddy, race or overfall locus/,
		},
	];
	for (const item of expected) {
		const matches = seed.locations.filter((entry) => entry.id === item.id);
		assert.equal(matches.length,1,item.name);
		const [location] = matches;
		assert.equal(digest(location),item.digest);
		assert.equal(location.name,item.name);
		assert.deepEqual(location.types,["tidalGate"]);
		assert.equal(location.feature.geometry.type,"Point");
		assert.deepEqual(location.feature.geometry.coordinates,item.coordinates);
		assert.equal(location.properties.provenance.reviewStatus,"sourceChecked");
		assert.match(location.description,item.description);
		assert.match(location.properties.provenance.warning,item.warning);
		const source = location.properties.provenance.sources.find((entry) => item.sourceId.test(entry.sourceId));
		assert.ok(source,item.name);
		assert.equal(source.license,"Open Government Licence 3.0 (OS OpenData)");
		assert.equal(location.properties.aliases,undefined);
		assert.equal(location.properties.tidalGate,undefined);
	}
});

test("Segment 7B preserves legacy candidates and prior data apart from the approved Oban name migration", () => {
	const priorLocations = seed.locations.slice(0,309);
	assert.equal(digest(priorLocations),"96483696b71d7f9d730e48adf839e3c8f01616190fd9fa7455a791fde5e3df9d");
	const legacyLuing = priorLocations.find((entry) => entry.id === LEGACY_LUING);
	const legacyDorus = priorLocations.find((entry) => entry.id === LEGACY_DORUS);
	assert.equal(digest(legacyLuing),"ecc634f6af7b604518085cb4787232eb45a093ce5e4d3c8dd8b2f4f643f5ef5c");
	assert.equal(digest(legacyDorus),"a37aea819736b05d77f603297707845394e578545d309cc29410c3b49e10beda");
	assert.equal(legacyLuing.name,"Sound of Luing");
	assert.equal(legacyDorus.name,"Dorus Mòr");
	assert.deepEqual(legacyLuing.feature.geometry.coordinates,[-5.6753028,56.2154272]);
	assert.deepEqual(legacyDorus.feature.geometry.coordinates,[-5.6078,56.12694]);
	assert.equal(legacyLuing.properties.aliases,undefined);
	assert.equal(legacyDorus.properties.aliases,undefined);
	assert.equal(new Set([LEGACY_LUING,NATIVE_LUING,LEGACY_DORUS,NATIVE_DORUS]).size,4);
	assert.equal(seed.locations.filter((entry) => /Sound of Luing/i.test(entry.name)).length,2);
	assert.equal(seed.locations.filter((entry) => /Dorus Mòr/i.test(entry.name)).length,2);
	assert.equal(seed.locations.length,318);
	assert.equal(new Set(seed.locations.map((entry) => entry.id)).size,318);
	assert.equal(new Set(seed.locations.map((entry) => entry.name.trim().toLowerCase())).size,318);
});
