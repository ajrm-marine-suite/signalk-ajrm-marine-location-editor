/**
 * Verifies deterministic tidal-port selection and manual override provenance.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { normalizeLocation } = require("../plugin/location-model.cjs");
const { LOCATION_REF_PREFIX, nearestSecondaryPort, selectTidePort } = require("../plugin/tide-selection.cjs");

function location(name, types, geometry, properties = {}) {
	return normalizeLocation({ id: crypto.randomUUID(), name, types, feature: { type: "Feature", properties: {}, geometry }, properties });
}

function point(longitude, latitude) {
	return { type: "Point", coordinates: [longitude, latitude] };
}

function predictionPort(name, longitude) {
	return location(name, ["tidalStandardPort"], point(longitude, 56), {
		tide: { providerId: "ukhoTidalEvents", stationId: name.toLowerCase(), stationName: name, datum: "Chart Datum" },
	});
}

function secondaryPort(name, longitude) {
	const value = predictionPort(name, longitude);
	value.types = ["tidalSecondaryPort"];
	value.properties.tide = {
		parentLocationRef: `${LOCATION_REF_PREFIX}${crypto.randomUUID()}`,
		secondaryPortCorrections: { contract: "ajrm-secondary-port-corrections-v2" },
	};
	return value;
}

test("selection follows explicit, region-assigned, same-region-nearest and pinned order", () => {
	const assigned = predictionPort("Assigned", -5.4);
	const nearest = predictionPort("Nearest", -5.05);
	const other = predictionPort("Other", -4);
	const region = location("Test tidal region", ["tidalRegion"], {
		type: "Polygon",
		coordinates: [[[-5.5, 55.5], [-4.5, 55.5], [-4.5, 56.5], [-5.5, 56.5], [-5.5, 55.5]]],
	}, { tideLocationRef: `${LOCATION_REF_PREFIX}${assigned.id}` });
	nearest.properties.tideRegionRef = `${LOCATION_REF_PREFIX}${region.id}`;
	other.properties.tideRegionRef = `${LOCATION_REF_PREFIX}${region.id}`;
	const anchorage = location("Anchorage", ["anchorage"], {
		type: "Polygon",
		coordinates: [[[-5.2, 55.9], [-4.9, 55.9], [-4.9, 56.1], [-5.2, 56.1], [-5.2, 55.9]]],
	}, { tideLocationRef: `${LOCATION_REF_PREFIX}${nearest.id}` });
	let result = selectTidePort([assigned, nearest, other, region, anchorage], {
		position: { longitude: -5, latitude: 56 }, contextLocationId: anchorage.id,
	});
	assert.equal(result.port.id, nearest.id);
	assert.equal(result.reason, "explicitTideLocationRef");

	delete anchorage.properties.tideLocationRef;
	result = selectTidePort([assigned, nearest, other, region, anchorage], { position: { longitude: -5, latitude: 56 } });
	assert.equal(result.port.id, assigned.id);
	assert.equal(result.reason, "containingRegionAssignment");

	delete region.properties.tideLocationRef;
	result = selectTidePort([assigned, nearest, other, region, anchorage], { position: { longitude: -5, latitude: 56 } });
	assert.equal(result.port.id, nearest.id);
	assert.equal(result.reason, "nearestPortInTidalRegion");

	result = selectTidePort([assigned, nearest, other, region, anchorage], {
		position: { longitude: -5, latitude: 56 }, pinnedPortId: other.id,
	});
	assert.equal(result.port.id, other.id);
	assert.equal(result.reason, "manualPinnedOverride");
	assert.equal(result.automaticPort.id, nearest.id);
});

test("invalid pins are exposed and never suppress a valid automatic selection", () => {
	const port = predictionPort("Port", -5);
	const context = location("Place", ["anchorage"], point(-5, 56), { tideLocationRef: `${LOCATION_REF_PREFIX}${port.id}` });
	const result = selectTidePort([port, context], { contextLocationId: context.id, pinnedPortId: crypto.randomUUID() });
	assert.equal(result.port.id, port.id);
	assert.equal(result.pinValid, false);
	assert.equal(result.reason, "explicitTideLocationRef");
});

test("nearest secondary recommendation stays inside the containing tidal region", () => {
	const region = location("Region", ["tidalRegion"], {
		type: "Polygon",
		coordinates: [[[-5.5, 55.5], [-4.5, 55.5], [-4.5, 56.5], [-5.5, 56.5], [-5.5, 55.5]]],
	});
	const near = secondaryPort("Near", -5.05);
	const far = secondaryPort("Far", -5.4);
	const outside = secondaryPort("Outside", -4.4);
	const result = nearestSecondaryPort([region, near, far, outside], {
		position: { longitude: -5, latitude: 56 },
	});
	assert.equal(result.port.id, near.id);
	assert.equal(result.tidalRegion.id, region.id);
	assert.equal(result.reason, "nearestSecondaryPortInTidalRegion");
	assert.equal(Number.isFinite(result.distanceM), true);
});
