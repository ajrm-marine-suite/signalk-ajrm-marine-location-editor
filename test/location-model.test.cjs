/**
 * Verifies the public marine-location contract, workspace filtering and spatial lookup.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const {
	CATALOG_SCHEMA,
	locationMatchesWorkspace,
	nearestLocations,
	normalizeCatalog,
	normalizeLocation,
} = require("../plugin/location-model.cjs");

function location(overrides = {}) {
	return normalizeLocation({
		id: crypto.randomUUID(),
		name: "Test Anchorage",
		types: ["anchorage"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5.2, 55.8] } },
		properties: {},
		...overrides,
	});
}

test("normalizes typed GeoJSON locations and assigns the contract schema", () => {
	const value = location();
	assert.equal(value.properties.schema, "org.ajrm.marine.location/v1");
	assert.equal(locationMatchesWorkspace(value, "places"), true);
	assert.equal(locationMatchesWorkspace(value, "tides"), false);
});

test("weather forecast locations belong to their own workspace", () => {
	const value = location({
		name: "Cuan Sound weather forecast",
		types: ["weatherForecastLocation"],
	});
	assert.equal(locationMatchesWorkspace(value, "weather"), true);
	assert.equal(locationMatchesWorkspace(value, "places"), false);
	assert.throws(() => location({
		name: "Area forecast",
		types: ["weatherForecastLocation"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-5, 55], [-5.1, 55], [-5.1, 55.1], [-5, 55]]] } },
	}), /must use a point/);
});

test("rejects unknown types and unclosed areas", () => {
	assert.throws(() => location({ types: ["imaginary"] }), /Unknown location type/);
	assert.throws(() => location({
		feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-5, 55], [-5.1, 55], [-5.1, 55.1], [-5, 55.1]]] } },
	}), /must be closed/);
});

test("requires exactly one tidal-port classification while preserving other multi-role Locations", () => {
	assert.throws(() => location({
		types: ["tidalStandardPort", "tidalSecondaryPort"],
	}), /must not have both tidalStandardPort and tidalSecondaryPort/);
	assert.deepEqual(location({
		types: ["tidalStandardPort", "pointOfInterest"],
	}).types, ["tidalStandardPort", "pointOfInterest"]);
	assert.deepEqual(location({
		types: ["tidalGate", "tidalSecondaryPort"],
	}).types, ["tidalGate", "tidalSecondaryPort"]);
	assert.deepEqual(location({
		types: ["anchorage", "pointOfInterest"],
	}).types, ["anchorage", "pointOfInterest"]);
});

test("validates source provenance and tidal observation stations", () => {
	const sourced = location({
		types: ["tidalObservationStation"],
		properties: {
			provenance: {
				reviewStatus: "sourceChecked",
				sources: [{ provider: "Example", url: "https://example.test/station", retrievedAt: "2026-08-12T00:00:00Z" }],
			},
		},
	});
	assert.deepEqual(sourced.types, ["tidalObservationStation"]);
	assert.throws(() => location({
		properties: { provenance: { reviewStatus: "guessed", sources: [{ provider: "Example", url: "https://example.test" }] } },
	}), /review status/);
});

test("preserves extension properties without interpreting their service contract", () => {
	const value = location({ properties: { externalService: { contract: "example-v1", value: 101 } } });
	assert.deepEqual(value.properties.externalService, { contract: "example-v1", value: 101 });
});

test("catalogues retain version metadata and create initial immutable history", () => {
	const value = location();
	const catalog = normalizeCatalog({ schema: CATALOG_SCHEMA, schemaVersion: 1, locations: [value] });
	assert.equal(catalog.locations[value.id].revision, 1);
	assert.equal(catalog.history[value.id].length, 1);
	assert.equal(catalog.history[value.id][0].snapshot.name, value.name);
});

test("nearest lookup filters by type and reports distance", () => {
	const near = location();
	const far = location({ name: "Far Port", types: ["tidalStandardPort"], feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-4, 57] } } });
	const results = nearestLocations([far, near], { latitude: 55.8, longitude: -5.2 }, { types: ["anchorage"] });
	assert.equal(results.length, 1);
	assert.equal(results[0].id, near.id);
	assert.equal(results[0].distanceM, 0);
});
