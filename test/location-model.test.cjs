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

test("rejects unknown types and unclosed areas", () => {
	assert.throws(() => location({ types: ["imaginary"] }), /Unknown location type/);
	assert.throws(() => location({
		feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-5, 55], [-5.1, 55], [-5.1, 55.1], [-5, 55.1]]] } },
	}), /must be closed/);
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

test("validates optional tidal reference levels", () => {
	const port = location({
		types: ["tidalStandardPort"],
		properties: { tide: { referenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 } } },
	});
	assert.equal(port.properties.tide.referenceLevels.mlwn, 1.8);
	assert.throws(() => location({
		types: ["tidalStandardPort"], properties: { tide: { referenceLevels: { mhws: 101 } } },
	}), /MHWS reference level must be a number between -100 and 100/);
});

test("validates complete secondary-port correction tables", () => {
	const corrections = {
		contract: "ajrm-secondary-port-corrections-v2",
		standardPortName: "Oban",
		highWaterTimeOffsets: [{ referenceTimeMinutes: 60, offsetMinutes: 20 }],
		lowWaterTimeOffsets: [{ referenceTimeMinutes: 90, offsetMinutes: 20 }],
		heightDifferencesM: { mhws: 0.5, mhwn: 0.6, mlwn: 0.1, mlws: 0.2 },
	};
	const parentLocationRef = `/resources/locations/${crypto.randomUUID()}`;
	const secondary = location({ types: ["tidalSecondaryPort"], properties: { tide: { parentLocationRef, secondaryPortCorrections: corrections } } });
	assert.equal(secondary.properties.tide.secondaryPortCorrections.contract, "ajrm-secondary-port-corrections-v4");
	assert.equal(secondary.properties.tide.secondaryPortCorrections.parentReferenceLevels, undefined);
	assert.equal(secondary.properties.tide.secondaryPortCorrections.timeOffsetPeriodMinutes, 720);
	assert.equal(secondary.properties.tide.secondaryPortCorrections.heightDifferencesM.mhws, 0.5);
	assert.throws(() => location({
		types: ["tidalSecondaryPort"],
		properties: { tide: { parentLocationRef, secondaryPortCorrections: { ...corrections, highWaterTimeOffsets: [{ referenceTimeMinutes: 60, offsetMinutes: 2000 }] } } },
	}), /HW time correction point 1 offset must be a number between -1440 and 1440/);
});

test("secondary ports use one explicit entered-data or Admiralty API source", () => {
	const api = location({
		types: ["tidalSecondaryPort"],
		properties: { tide: {
			predictionSource: "ukhoTidalEvents",
			providerId: "ukhoTidalEvents",
			stationId: "0381",
			stationName: "Port Ellen",
		} },
	});
	assert.equal(api.properties.tide.predictionSource, "ukhoTidalEvents");
	assert.throws(() => location({
		types: ["tidalSecondaryPort"],
		properties: { tide: { predictionSource: "ukhoTidalEvents", providerId: "ukhoTidalEvents" } },
	}), /station identifier/);
	assert.throws(() => location({
		types: ["tidalSecondaryPort"],
		properties: { tide: {
			predictionSource: "enteredCorrections",
			providerId: "ukhoTidalEvents",
			stationId: "0381",
			parentLocationRef: `/resources/locations/${crypto.randomUUID()}`,
			secondaryPortCorrections: {
				contract: "ajrm-secondary-port-corrections-v4", timeOffsetPeriodMinutes: 720,
				highWaterTimeOffsets: [{ referenceTimeMinutes: 0, offsetMinutes: 0 }],
				lowWaterTimeOffsets: [{ referenceTimeMinutes: 0, offsetMinutes: 0 }],
				heightDifferencesM: { mhws: 0, mhwn: 0, mlwn: 0, mlws: 0 },
			},
		} },
	}), /must not also select an API station/);
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
