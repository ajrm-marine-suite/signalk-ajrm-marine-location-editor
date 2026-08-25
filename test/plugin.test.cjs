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
const { createLocationStore } = require("../plugin/location-store.cjs");

const OBAN_PORT_ID = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const OBAN_AREA_ID = "f297596a-4959-47ff-b665-18ac2cb74924";

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
	const registrations = [];
	function scopedRouter(level = null) {
		const scoped = {};
		for (const method of ["get", "put", "post", "delete"]) {
			scoped[method] = (route, handler) => {
				registrations.push({ method: method.toUpperCase(), route, level });
				routes.set(`${method.toUpperCase()} ${route}`, handler);
			};
		}
		return scoped;
	}
	const router = scopedRouter();
	if (options.accessRouter) router.access = (level) => scopedRouter(level);
	const plugin = createPlugin(app);
	plugin.registerWithRouter(router);
	plugin.start({});
	await new Promise((resolve) => setImmediate(resolve));
	async function call(method, route, req = {}) {
		const res = response();
		await routes.get(`${method} ${route}`)({ query: {}, body: {}, params: {}, ...req }, res);
		return res;
	}
	return { app, call, messages, plugin, registrations, routes };
}

test("tidal-region routes present and update relationships owned by Tidal Database", async (t) => {
	const saved = [];
	const removed = [];
	const portId = crypto.randomUUID();
	const tidalService = {
		contract:"ajrm-marine-tidal-database-service-v2",
		contractVersion:2,
		listPorts:async () => [{ locationId:portId,name:"Test standard port",nameSource:"location",kind:"standard" }],
		listAreas:async () => [],
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
	assert.equal(saved[0].name,undefined);
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
	assert.equal(result.body.locations.find((location) => location.id === OBAN_PORT_ID)?.name, "Oban port");
	assert.equal(result.body.locations.find((location) => location.id === OBAN_AREA_ID)?.name, "Oban port tidal area");
	await plugin.stop();
});

test("startup renames only the exact prior bundled Oban names without changing their Location ids", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-location-oban-rename-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const store = createLocationStore(path.join(directory, "locations.json"));
	await store.set(OBAN_PORT_ID, {
		name: "Oban tidal prediction port",
		types: ["tidalStandardPort"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5.474, 56.412] } },
		properties: {},
	}, { expectedRevision: 0, editedBy: "Prior bundled seed" });
	await store.set(OBAN_AREA_ID, {
		name: "Oban tidal prediction port tidal area",
		types: ["tidalRegion"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-5.6, 56.3], [-5.3, 56.3], [-5.3, 56.5], [-5.6, 56.3]]] } },
		properties: {},
	}, { expectedRevision: 0, editedBy: "Prior bundled seed" });

	const { call, plugin } = await fixture(t, { directory });
	const result = await call("GET", "/locations", { query: { workspace: "all" } });
	const port = result.body.locations.find((location) => location.id === OBAN_PORT_ID);
	const area = result.body.locations.find((location) => location.id === OBAN_AREA_ID);
	assert.equal(port.name, "Oban port");
	assert.equal(area.name, "Oban port tidal area");
	assert.equal(port.revision, 2);
	assert.equal(area.revision, 2);
	assert.equal((await store.history(OBAN_PORT_ID)).at(-1).editedBy, "Bundled Oban location-name migration");
	await plugin.stop();
});

test("startup preserves customised names on the bundled Oban Location ids", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-location-oban-custom-name-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const store = createLocationStore(path.join(directory, "locations.json"));
	await store.set(OBAN_PORT_ID, {
		name: "My Oban standard port",
		types: ["tidalStandardPort"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5.474, 56.412] } },
		properties: {},
	}, { expectedRevision: 0, editedBy: "User" });
	await store.set(OBAN_AREA_ID, {
		name: "My Oban tidal area",
		types: ["tidalRegion"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-5.6, 56.3], [-5.3, 56.3], [-5.3, 56.5], [-5.6, 56.3]]] } },
		properties: {},
	}, { expectedRevision: 0, editedBy: "User" });

	const { call, plugin } = await fixture(t, { directory });
	const result = await call("GET", "/locations", { query: { workspace: "all" } });
	const port = result.body.locations.find((location) => location.id === OBAN_PORT_ID);
	const area = result.body.locations.find((location) => location.id === OBAN_AREA_ID);
	assert.equal(port.name, "My Oban standard port");
	assert.equal(area.name, "My Oban tidal area");
	assert.equal(port.revision, 1);
	assert.equal(area.revision, 1);
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

function marinaBody(name = "Versioned Marina") {
	const value = harbourBody(name);
	value.types = ["marina"];
	return value;
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
	const marinaProfileAreaId = crypto.randomUUID();
	await call("PUT", "/locations/:id", {
		params: { id: profileAreaId },
		body: harbourBody("Direct profile area"),
	});
	await call("PUT", "/locations/:id", {
		params: { id: marinaProfileAreaId },
		body: marinaBody("Direct marina profile area"),
	});
	const profileAreas = await app.ajrmMarineLocations.profileAreas();
	assert.equal(profileAreas.some((location) => location.id === profileAreaId), true);
	assert.equal(profileAreas.some((location) => location.id === marinaProfileAreaId), true);
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

test("OpenAPI covers every registered HTTP method and path", async (t) => {
	const { plugin, routes } = await fixture(t);
	const openApi = plugin.getOpenApi();
	const registered = [...routes.keys()].map((entry) => entry.replace(/:([^/]+)/g, "{$1}")).sort();
	const documented = Object.entries(openApi.paths).flatMap(([route, methods]) => (
		Object.keys(methods).filter((method) => ["get", "put", "post", "delete"].includes(method)).map((method) => `${method.toUpperCase()} ${route}`)
	)).sort();
	assert.deepEqual(documented, registered);
	assert.equal(openApi.info.version, "0.7.5");
	assert.equal(openApi["x-ajrm-tidal-database-service"].contract, "ajrm-marine-tidal-database-service-v2");
	assert.deepEqual(openApi["x-ajrm-planning-location-mutation-guard"].fields, [
		"liveGateLocationIds", "liveReferencePortLocationIds",
	]);
	assert.equal(openApi.components.securitySchemes.signalk.scheme, "bearer");
	const mutations = Object.entries(openApi.paths).flatMap(([route, methods]) => (
		Object.entries(methods)
			.filter(([method]) => ["post", "put", "patch", "delete"].includes(method))
			.map(([method, operation]) => ({ method, route, operation }))
	));
	assert.equal(mutations.length, 10);
	for (const { method, route, operation } of mutations) {
		assert.deepEqual(operation.security, [{ signalk: [] }], `${method.toUpperCase()} ${route} security`);
		assert.equal(operation["x-signalk-access"], "readwrite", `${method.toUpperCase()} ${route} access`);
		assert.ok(operation.responses?.["403"], `${method.toUpperCase()} ${route} 403 response`);
	}
	const references = [];
	(function collectReferences(value) {
		if (Array.isArray(value)) return value.forEach(collectReferences);
		if (!value || typeof value !== "object") return;
		if (typeof value.$ref === "string") references.push(value.$ref);
		for (const child of Object.values(value)) collectReferences(child);
	})(openApi);
	for (const reference of references) {
		assert.match(reference, /^#\//);
		const target = reference.slice(2).split("/").reduce((value, key) => (
			value?.[key.replace(/~1/g, "/").replace(/~0/g, "~")]
		), openApi);
		assert.notEqual(target, undefined, `missing OpenAPI reference ${reference}`);
	}
});

test("Location Editor registers reads and mutations through Signal K access routers", async (t) => {
	const { plugin, registrations } = await fixture(t, { accessRouter: true });
	assert.equal(registrations.length, 19);
	for (const registration of registrations) {
		assert.equal(
			registration.level,
			registration.method === "GET" ? "readonly" : "readwrite",
			`${registration.method} ${registration.route}`,
		);
	}
	await plugin.stop();
});

test("Location Editor router registration falls back when access routers are unavailable", async (t) => {
	const { plugin, registrations } = await fixture(t);
	assert.equal(registrations.length, 19);
	assert.ok(registrations.every((entry) => entry.level === null));
	await plugin.stop();
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

test("all Location mutation surfaces preserve live Planning reference ports", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	const created = await call("PUT", "/locations/:id", {
		params: { id },
		body: gateBody("Planning reference port", ["tidalStandardPort", "pointOfInterest"]),
	});
	assert.equal(created.statusCode, 200);
	let coordinatedCalls = 0;
	app.ajrmMarinePlanning = {
		coordinateLocationMutation(change) {
			coordinatedCalls += 1;
			return change({
				contract: "ajrm-marine-planning-location-mutation-guard-v1",
				contractVersion: 1,
				liveGateLocationIds: [],
				liveReferencePortLocationIds: [id],
			});
		},
	};

	let result = await call("PUT", "/locations/:id", {
		params: { id },
		body: { ...gateBody("Planning reference port", ["pointOfInterest"]), expectedRevision: 1 },
	});
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /reference port for live Marine Planning constants/);

	result = await call("DELETE", "/locations/:id", { params: { id }, query: { expectedRevision: 1 } });
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /reference port for live Marine Planning constants/);

	const exported = (await call("GET", "/local/export")).body;
	delete exported.locations[id];
	result = await call("POST", "/local/import", { body: { confirm: true, payload: exported } });
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /would remove reference port/);

	const merge = (await call("GET", "/local/export")).body;
	merge.locations[id] = {
		...merge.locations[id],
		types: ["pointOfInterest"],
		revision: 2,
		lastEditId: crypto.randomUUID(),
		updatedAt: "2099-01-01T00:00:00.000Z",
	};
	result = await call("POST", "/local/merge", { body: { confirm: true, payload: merge } });
	assert.equal(result.statusCode, 400);
	assert.match(result.body.error, /would remove reference port/);

	await assert.rejects(app.ajrmMarineLocations.removeType(id, "tidalStandardPort", {
		expectedRevision: 1,
		expectedLastEditId: created.body.location.lastEditId,
	}), /reference port for live Marine Planning constants/);
	assert.equal(coordinatedCalls >= 5, true);
	assert.deepEqual((await app.ajrmMarineLocations.get(id)).types, ["tidalStandardPort", "pointOfInterest"]);
	await plugin.stop();
});

test("legacy Planning guard-v1 fails closed before removing a tidalStandardPort", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	const created = await call("PUT", "/locations/:id", {
		params: { id },
		body: gateBody("Legacy guarded standard port", ["tidalStandardPort", "pointOfInterest"]),
	});
	app.ajrmMarinePlanning = {
		coordinateLocationMutation: (change) => change({
			contract: "ajrm-marine-planning-location-mutation-guard-v1",
			liveGateLocationIds: [],
		}),
	};
	await assert.rejects(app.ajrmMarineLocations.removeType(id, "tidalStandardPort", {
		expectedRevision: 1,
		expectedLastEditId: created.body.location.lastEditId,
	}), /legacy mutation guard cannot prove/);
	app.ajrmMarinePlanning.coordinateLocationMutation = (change) => change({
		contract: "ajrm-marine-planning-location-mutation-guard-v1",
		contractVersion: 1,
		liveGateLocationIds: [],
		liveReferencePortLocationIds: null,
	});
	await assert.rejects(app.ajrmMarineLocations.removeType(id, "tidalStandardPort", {
		expectedRevision: 1,
		expectedLastEditId: created.body.location.lastEditId,
	}), /unsupported Location mutation guard/);
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
	result = await call("PUT", "/locations/:id", {
		params: { id },
		body: body(),
		skIsAuthenticated: true,
		skPrincipal: { permissions: "readonly" },
	});
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
