/**
 * Exercises Location Editor's Signal K lifecycle and authenticated HTTP contract.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const createPlugin = require("../plugin/index.cjs");

function response() {
	return {
		statusCode: 200,
		status(code) { this.statusCode = code; return this; },
		json(body) { this.body = body; return this; },
	};
}

async function fixture(t, options = {}) {
	const directory = options.directory || await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-location-plugin-"));
	if (!options.directory) t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const messages = [];
	const app = {
		getDataDirPath: () => directory,
		setPluginStatus() {},
		setPluginError() {},
		handleMessage(_id, delta) { messages.push(delta); },
		ajrmMarineTidalDatabase: options.tidalService,
	};
	const routes = new Map();
	const router = {};
	for (const method of ["get", "put", "post", "delete"]) {
		router[method] = (route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler);
	}
	const plugin = createPlugin(app);
	plugin.registerWithRouter(router);
	plugin.start({});
	await new Promise((resolve) => setImmediate(resolve));
	async function call(method, route, req = {}) {
		const res = response();
		await routes.get(`${method} ${route}`)({ query: {}, body: {}, params: {}, ...req }, res);
		return res;
	}
	return { app, call, messages, plugin };
}

test("tidal-region routes present and update relationships owned by Tidal Database", async (t) => {
	const saved = [];
	const removed = [];
	const portId = crypto.randomUUID();
	const tidalService = {
		contract:"ajrm-marine-tidal-database-service-v1",
		listPorts:() => [{ locationId:portId,name:"Test standard port",kind:"standard" }],
		listAreas:() => [],
		setArea:async (id,value) => { const area={ locationId:id,...value }; saved.push(area); return area; },
		removeArea:async (id) => { removed.push(id); },
	};
	const { call,plugin } = await fixture(t,{ tidalService });
	const regionId = crypto.randomUUID();
	let result = await call("PUT","/locations/:id",{ params:{ id:regionId },body:{
		expectedRevision:0,name:"Test tidal region",types:["tidalRegion"],
		feature:{ type:"Feature",properties:{},geometry:{ type:"Polygon",coordinates:[[[-5.2,55.8],[-5.1,55.8],[-5.1,55.9],[-5.2,55.8]]] } },properties:{},
	} });
	assert.equal(result.statusCode,200);
	result = await call("GET","/tidal-regions/definitions");
	assert.equal(result.body.ports[0].locationId,portId);
	result = await call("PUT","/tidal-regions/:id",{ params:{ id:regionId },body:{ portLocationId:portId } });
	assert.equal(result.body.ok,true);
	assert.equal(saved[0].name,"Test tidal region");
	assert.equal(saved[0].portLocationId,portId);
	result = await call("DELETE","/tidal-regions/:id",{ params:{ id:regionId } });
	assert.equal(result.body.ok,true);
	assert.deepEqual(removed,[regionId]);
	await plugin.stop();
});

test("a fresh catalogue receives the spatial seed without tidal provider data", async (t) => {
	const { call, plugin } = await fixture(t);
	const result = await call("GET", "/locations", { query: { workspace: "all" } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.locations.length >= 280, true);
	assert.equal(result.body.locations.some((location) => location.properties.tide || location.properties.tidalGate || location.properties.tideLocationRef), false);
	assert.ok(result.body.locations.find((location) => location.name === "Cuan Sound")?.types.includes("tidalGate"));
	await plugin.stop();
});

function body(name = "Test Anchorage") {
	return {
		expectedRevision: 0,
		name,
		types: ["anchorage"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5.2, 55.8] } },
		properties: {},
	};
}

function harbourBody(name = "Versioned Harbour") {
	return {
		expectedRevision: 0,
		name,
		types: ["harbour"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-5.2, 55.8], [-5.19, 55.8], [-5.19, 55.81], [-5.2, 55.8]]] } },
		properties: { automaticProfileArea: true },
	};
}

function gateBody(name, types = ["tidalGate"]) {
	return {
		expectedRevision: 0,
		name,
		types,
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5.2, 55.8] } },
		properties: {},
	};
}

test("lifecycle exposes the spatial service and retracts status on stop", async (t) => {
	const { app, call, messages, plugin } = await fixture(t);
	assert.equal(app.ajrmMarineLocations.contract, "ajrm-marine-locations-service-v1");
	assert.equal(app.ajrmMarineTides, undefined);
	assert.equal(app.ajrmMarineAnchoring.contract, "ajrm-marine-anchoring-service-v1");
	assert.equal(app.ajrmMarineLocationDiagnostics.contract, "ajrm-marine-location-diagnostics-v1");
	assert.equal(globalThis[Symbol.for("mcdonaldajr.ajrmMarineLocations")], app.ajrmMarineLocations);
	assert.equal(globalThis[Symbol.for("mcdonaldajr.ajrmMarineTides")], undefined);
	assert.equal(app.ajrmMarineWeather, undefined);
	assert.equal(app.ajrmMarineAnchoring.status().contract, "ajrm-marine-anchoring-assistance-v1");
	const profileAreaId = crypto.randomUUID();
	await call("PUT", "/locations/:id", {
		params: { id: profileAreaId },
		body: harbourBody("Direct profile area"),
	});
	const profileAreas = await app.ajrmMarineLocations.profileAreas();
	assert.equal(profileAreas.some((location) => location.id === profileAreaId), true);
	const diagnostics = await app.ajrmMarineLocationDiagnostics.snapshot();
	assert.equal(diagnostics.catalogue.count > 0, true);
	assert.equal(diagnostics.catalogue.locations, undefined);
	assert.equal(diagnostics.tides, undefined);
	const expandedDiagnostics = await app.ajrmMarineLocationDiagnostics.snapshot({ includeLocations: true });
	assert.equal(expandedDiagnostics.catalogue.locations.length, diagnostics.catalogue.count);
	await plugin.stop();
	assert.equal(app.ajrmMarineLocations, undefined);
	assert.equal(app.ajrmMarineAnchoring, undefined);
	assert.equal(app.ajrmMarineLocationDiagnostics, undefined);
	assert.equal(globalThis[Symbol.for("mcdonaldajr.ajrmMarineLocations")], undefined);
	assert.equal(messages.at(-1).updates[0].values[0].value, null);
});

test("shared removeType preserves a multi-role Location and returns its exact next revision", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	const created = await call("PUT", "/locations/:id", {
		params: { id },
		body: gateBody("Multi-role gate", ["tidalGate", "tidalSecondaryPort"]),
	});
	assert.equal(created.statusCode, 200);
	const previousGateCount = app.ajrmMarineLocationEditorStatus.typeCounts.tidalGate;
	const result = await app.ajrmMarineLocations.removeType(id, "tidalGate", {
		expectedRevision: 1,
		expectedLastEditId: created.body.location.lastEditId,
		editedBy: "Marine Planning deletion",
	});
	assert.equal(result.action, "type-removed");
	assert.equal(result.locationId, id);
	assert.equal(result.tombstone, null);
	assert.equal(result.location.id, id);
	assert.equal(result.location.revision, 2);
	assert.deepEqual(result.location.types, ["tidalSecondaryPort"]);
	assert.deepEqual(await app.ajrmMarineLocations.get(id), result.location);
	assert.equal(app.ajrmMarineLocationEditorStatus.typeCounts.tidalGate, previousGateCount - 1);
	const history = await call("GET", "/locations/:id/history", { params: { id } });
	assert.equal(history.body.history.at(-1).action, "update");
	assert.equal(history.body.history.at(-1).editedBy, "Marine Planning deletion");
	await plugin.stop();
});

test("shared removeType tombstones a single-role Location and returns the persisted tombstone", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	const created = await call("PUT", "/locations/:id", {
		params: { id },
		body: gateBody("Single-role gate"),
	});
	assert.equal(created.statusCode, 200);
	const previousLocationCount = app.ajrmMarineLocationEditorStatus.locationCount;
	const result = await app.ajrmMarineLocations.removeType(id, "tidalGate", {
		expectedRevision: 1,
		expectedLastEditId: created.body.location.lastEditId,
		editedBy: "Marine Planning deletion",
	});
	assert.equal(result.action, "location-deleted");
	assert.equal(result.locationId, id);
	assert.equal(result.location, null);
	assert.equal(result.tombstone.id, id);
	assert.equal(result.tombstone.revision, 2);
	assert.deepEqual(result.tombstone.types, ["tidalGate"]);
	assert.equal(await app.ajrmMarineLocations.get(id), null);
	assert.equal(app.ajrmMarineLocationEditorStatus.locationCount, previousLocationCount - 1);
	const deleted = await call("GET", "/deleted");
	assert.deepEqual(deleted.body.tombstones.find((entry) => entry.id === id), result.tombstone);
	const history = await call("GET", "/locations/:id/history", { params: { id } });
	assert.equal(history.body.history.at(-1).action, "delete");
	assert.equal(history.body.history.at(-1).editedBy, "Marine Planning deletion");
	await plugin.stop();
});

test("shared removeType rejects stale revisions and invalid mutation identities without changing the Location", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	const created = await call("PUT", "/locations/:id", {
		params: { id },
		body: gateBody("Guarded gate", ["tidalGate", "pointOfInterest"]),
	});
	await assert.rejects(
		app.ajrmMarineLocations.removeType(id, "tidalGate", {
			expectedRevision: 2,
			expectedLastEditId: created.body.location.lastEditId,
		}),
		/changed after it was opened/,
	);
	await assert.rejects(
		app.ajrmMarineLocations.removeType(id, "tidalGate", {
			expectedRevision: 1,
			expectedLastEditId: crypto.randomUUID(),
		}),
		/changed after it was opened/,
	);
	await assert.rejects(
		app.ajrmMarineLocations.removeType(id, "tidalGate", {
			expectedRevision: 0,
			expectedLastEditId: created.body.location.lastEditId,
		}),
		/positive integer/,
	);
	await assert.rejects(
		app.ajrmMarineLocations.removeType("not-a-uuid", "tidalGate", {
			expectedRevision: 1,
			expectedLastEditId: created.body.location.lastEditId,
		}),
		/UUIDv4/,
	);
	await assert.rejects(
		app.ajrmMarineLocations.removeType(id, "not-a-location-type", {
			expectedRevision: 1,
			expectedLastEditId: created.body.location.lastEditId,
		}),
		/Location type must be one of/,
	);
	const unchanged = await app.ajrmMarineLocations.get(id);
	assert.equal(unchanged.revision, 1);
	assert.deepEqual(unchanged.types, ["tidalGate", "pointOfInterest"]);
	await plugin.stop();
});

test("generic Location writes cannot remove a tidalGate join with live Planning constants", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	const created = await call("PUT", "/locations/:id", {
		params: { id },
		body: gateBody("Planning-joined gate", ["tidalGate", "pointOfInterest"]),
	});
	assert.equal(created.statusCode, 200);
	let coordinatedCalls = 0;
	app.ajrmMarinePlanning = {
		coordinateLocationMutation(change) {
			coordinatedCalls += 1;
			return change({
				contract: "ajrm-marine-planning-location-mutation-guard-v1",
				liveGateLocationIds: [id],
			});
		},
	};

	let result = await call("PUT", "/locations/:id", {
		params: { id },
		body: { ...gateBody("Planning-joined gate", ["pointOfInterest"]), expectedRevision: 1 },
	});
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /live Marine Planning constants/);

	result = await call("DELETE", "/locations/:id", {
		params: { id },
		query: { expectedRevision: 1 },
	});
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /live Marine Planning constants/);

	const exported = (await call("GET", "/local/export")).body;
	delete exported.locations[id];
	result = await call("POST", "/local/import", {
		body: { confirm: true, payload: exported },
	});
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /would orphan live Marine Planning constants/);
	assert.ok(coordinatedCalls >= 3);
	const unchanged = await app.ajrmMarineLocations.get(id);
	assert.equal(unchanged.revision, 1);
	assert.deepEqual(unchanged.types, ["tidalGate", "pointOfInterest"]);
	await plugin.stop();
});

test("routes save, version, inspect and restore a location", async (t) => {
	const { call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	let result = await call("PUT", "/locations/:id", { params: { id }, body: body() });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.location.revision, 1);
	const firstEditId = result.body.location.lastEditId;
	result = await call("PUT", "/locations/:id", { params: { id }, body: { ...body("Edited"), expectedRevision: 1 } });
	assert.equal(result.body.location.revision, 2);
	result = await call("GET", "/locations/:id/history", { params: { id } });
	assert.deepEqual(result.body.history.map((entry) => entry.action), ["create", "update"]);
	result = await call("POST", "/locations/:id/restore", { params: { id }, body: { editId: firstEditId, expectedRevision: 2 } });
	assert.equal(result.body.location.name, "Test Anchorage");
	assert.equal(result.body.location.revision, 3);
	await plugin.stop();
});

test("confirmed purge permanently removes deleted location history", async (t) => {
	const { call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	await call("PUT", "/locations/:id", { params: { id }, body: body("Temporary Anchorage") });
	await call("DELETE", "/locations/:id", { params: { id }, query: { expectedRevision: 1 } });
	let result = await call("POST", "/local/purge-deleted", { body: {} });
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /must be confirmed/);
	result = await call("POST", "/local/purge-deleted", { body: { confirm: true } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.purged, 1);
	result = await call("GET", "/deleted");
	assert.equal(result.body.tombstones.length, 0);
	result = await call("GET", "/locations/:id/history", { params: { id } });
	assert.equal(result.statusCode, 404);
	await plugin.stop();
});

test("write routes enforce access and imports require the versioned schema", async (t) => {
	const { call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	let result = await call("PUT", "/locations/:id", { params: { id }, body: body(), skIsAuthenticated: false });
	assert.equal(result.statusCode, 403);
	result = await call("POST", "/local/import", { body: { confirm: true, payload: { locations: [] } } });
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /org\.ajrm\.marine\.locations version 1/);
	await plugin.stop();
});

test("location names are unique across all location types", async (t) => {
	const { call, plugin } = await fixture(t);
	const firstId = crypto.randomUUID();
	const duplicateId = crypto.randomUUID();
	let result = await call("PUT", "/locations/:id", {
		params: { id: firstId },
		body: harbourBody("Unique Harbour"),
	});
	assert.equal(result.statusCode, 200);
	result = await call("PUT", "/locations/:id", {
		params: { id: duplicateId },
		body: { ...harbourBody("  unique   harbour  "), types: ["anchorage"], properties: {} },
	});
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /Location names must be unique/);
	await plugin.stop();
});
