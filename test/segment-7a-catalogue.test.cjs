/** Verifies Segment 7A's distinct Corryvreckan named-sea identity. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const seed = require("../defaults/spatial-locations.json");

const LEGACY_CORRYVRECKAN = "c21dcbcc-41bf-4ad0-9db9-7697c92c7bcb";
const NATIVE_CORRYVRECKAN = "2bb1ebac-58eb-41d1-8b78-ef6e4494baf4";
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Segment 7A adds only a broad OS named-sea representative", () => {
	const matches = seed.locations.filter((entry) => entry.id === NATIVE_CORRYVRECKAN);
	assert.equal(matches.length,1);
	const [location] = matches;
	assert.equal(location.name,"Gulf of Corryvreckan (named-sea representative)");
	assert.deepEqual(location.types,["tidalGate"]);
	assert.equal(location.feature.geometry.type,"Point");
	assert.deepEqual(location.feature.geometry.coordinates,[-5.72536661,56.14941904]);
	assert.equal(location.properties.provenance.reviewStatus,"sourceChecked");
	assert.match(location.description,/named Gulf of Corryvreckan sea feature.*no surveyed gate line.*exact stream observation.*overfall or whirlpool locus/);
	assert.match(location.properties.provenance.warning,/broad Gulf of Corryvreckan Sea feature.*roughly 4\.02 kilometres by 2\.76 kilometres/);
	const source = location.properties.provenance.sources.find((entry) => entry.sourceId.includes("osgb4000000074789965"));
	assert.ok(source);
	assert.match(source.sourceId,/hydrography\/Sea; BNG 168706,701445.*source extent 166772,700072 to 170789,702833/);
	assert.doesNotMatch(source.sourceId,/hydrography\/Channel/);
	assert.equal(source.license,"Open Government Licence 3.0 (OS OpenData)");
	assert.equal(location.properties.aliases,undefined);
	assert.equal(location.properties.tidalGate,undefined);
});

test("Segment 7A preserves the complete prior catalogue and legacy Corryvreckan object", () => {
	const priorLocations = seed.locations.slice(0,308);
	assert.equal(digest(priorLocations),"6f8ebe0f8b29a74d142d470782d12e40913d5fdeb374ddc2b7bf1ea05035c89b");
	const legacy = priorLocations.find((entry) => entry.id === LEGACY_CORRYVRECKAN);
	assert.equal(digest(legacy),"0b65b199ca424eaed587bbabaa76eb44f7d8db9e67843234261df7f888ebaff3");
	assert.equal(legacy.name,"Gulf of Corryvreckan");
	assert.deepEqual(legacy.feature.geometry.coordinates,[-5.7206268,56.1545973]);
	assert.equal(legacy.properties.aliases,undefined);
	assert.equal(new Set([LEGACY_CORRYVRECKAN,NATIVE_CORRYVRECKAN]).size,2);
	assert.equal(seed.locations.filter((entry) => /Gulf of Corryvreckan/i.test(entry.name)).length,2);
	assert.equal(seed.locations.length,309);
	assert.equal(new Set(seed.locations.map((entry) => entry.id)).size,309);
	assert.equal(new Set(seed.locations.map((entry) => entry.name.trim().toLowerCase())).size,309);
});
