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

async function fixture(t) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-location-plugin-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const messages = [];
	const regions = {};
	const app = {
		getDataDirPath: () => directory,
		setPluginStatus() {},
		setPluginError() {},
		handleMessage(_id, delta) { messages.push(delta); },
		regions,
		resourcesApi: {
			async listResources() { return regions; },
			async setResource(_type, id, value) { regions[id] = { ...structuredClone(value), id }; },
			async deleteResource(_type, id) { delete regions[id]; },
		},
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

test("existing Harbour regions migrate into the versioned catalogue and remain published", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-location-migration-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const id = crypto.randomUUID();
	const regions = {
		[id]: {
			id,
			name: "Harbour: Test Bay",
			description: "Existing profile region",
			feature: { type: "Feature", properties: { "ajrmMarine:type": "marina" }, geometry: { type: "Polygon", coordinates: [[[-5.2, 55.8], [-5.19, 55.8], [-5.19, 55.81], [-5.2, 55.8]]] } },
		},
	};
	const app = {
		getDataDirPath: () => directory, setPluginStatus() {}, handleMessage() {},
		resourcesApi: {
			async listResources() { return regions; },
			async setResource(_type, resourceId, value) { regions[resourceId] = { ...structuredClone(value), id: resourceId }; },
			async deleteResource(_type, resourceId) { delete regions[resourceId]; },
		},
	};
	const routes = new Map();
	const router = {};
	for (const method of ["get", "put", "post", "delete"]) router[method] = (route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler);
	const plugin = createPlugin(app);
	plugin.registerWithRouter(router);
	plugin.start({});
	await new Promise((resolve) => setTimeout(resolve, 20));
	const res = response();
	await routes.get("GET /locations")({ query: { workspace: "all" } }, res);
	assert.ok(res.body.locations.length > 1);
	const migrated = res.body.locations.find((location) => location.id === id);
	assert.equal(migrated.name, "Test Bay");
	assert.deepEqual(migrated.types, ["marina"]);
	assert.equal(migrated.properties.publishAsHarbourRegion, true);
	assert.equal(regions[id].name, "Harbour: Test Bay");
	await plugin.stop();
});

test("a fresh catalogue receives the sourced West Scotland seed without publishing point profile regions", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const result = await call("GET", "/locations", { query: { workspace: "all" } });
	const corryvreckan = result.body.locations.find((location) => location.name === "Gulf of Corryvreckan");
	const stornoway = result.body.locations.find((location) => location.name === "Stornoway tide gauge");
	assert.ok(corryvreckan?.types.includes("tidalGate"));
	assert.equal(corryvreckan.properties.provenance.reviewStatus, "sourceChecked");
	assert.ok(stornoway?.types.includes("tidalObservationStation"));
	assert.equal(Object.keys(app.regions).length, 0);
	await plugin.stop();
});

test("an unedited migrated harbour is upgraded by a same-name nearby marina seed", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-location-marina-upgrade-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const id = crypto.randomUUID();
	const regions = {
		[id]: {
			id,
			name: "Harbour: Ardfern Yacht Centre",
			feature: {
				type: "Feature",
				properties: {},
				geometry: { type: "Polygon", coordinates: [[[-5.54, 56.18], [-5.53, 56.18], [-5.53, 56.19], [-5.54, 56.18]]] },
			},
		},
	};
	const app = {
		getDataDirPath: () => directory, setPluginStatus() {}, handleMessage() {},
		resourcesApi: {
			async listResources() { return regions; },
			async setResource(_type, resourceId, value) { regions[resourceId] = { ...structuredClone(value), id: resourceId }; },
			async deleteResource(_type, resourceId) { delete regions[resourceId]; },
		},
	};
	const routes = new Map();
	const router = {};
	for (const method of ["get", "put", "post", "delete"]) router[method] = (route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler);
	const plugin = createPlugin(app);
	plugin.registerWithRouter(router);
	plugin.start({});
	await new Promise((resolve) => setTimeout(resolve, 30));
	const res = response();
	await routes.get("GET /locations/:id")({ params: { id } }, res);
	assert.deepEqual(res.body.types, ["marina"]);
	assert.equal(res.body.revision, 2);
	assert.equal(res.body.properties.provenance.reviewStatus, "sourceChecked");
	assert.equal(regions[id].name, "Harbour: Ardfern Yacht Centre");
	const list = response();
	await routes.get("GET /locations")({ query: { workspace: "all" } }, list);
	assert.equal(list.body.locations.filter((location) => location.name === "Ardfern Yacht Centre").length, 1);
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
		properties: { publishAsHarbourRegion: true },
	};
}

test("lifecycle exposes the spatial service and retracts status on stop", async (t) => {
	const { app, messages, plugin } = await fixture(t);
	assert.equal(app.ajrmMarineLocations.contract, "ajrm-marine-locations-service-v1");
	assert.equal(app.ajrmMarineTides.contract, "ajrm-marine-tides-service-v1");
	const tide = await app.ajrmMarineTides.status();
	assert.equal(tide.contract, "ajrm-marine-tide-resolver-v1");
	assert.equal(tide.valid, false);
	await plugin.stop();
	assert.equal(app.ajrmMarineLocations, undefined);
	assert.equal(app.ajrmMarineTides, undefined);
	assert.equal(messages.at(-1).updates[0].values[0].value, null);
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

test("versioned harbour save, delete and undo keep the compatible Signal K region synchronized", async (t) => {
	const { app, call, plugin } = await fixture(t);
	const id = crypto.randomUUID();
	let result = await call("PUT", "/locations/:id", { params: { id }, body: harbourBody() });
	const createEditId = result.body.location.lastEditId;
	assert.equal(app.regions[id].name, "Harbour: Versioned Harbour");
	assert.deepEqual(app.regions[id].feature.geometry, harbourBody().feature.geometry);
	result = await call("DELETE", "/locations/:id", { params: { id }, query: { expectedRevision: 1 } });
	assert.equal(result.statusCode, 200);
	assert.equal(app.regions[id], undefined);
	result = await call("POST", "/locations/:id/restore", { params: { id }, body: { editId: createEditId, expectedRevision: 2 } });
	assert.equal(result.body.location.revision, 3);
	assert.equal(app.regions[id].name, "Harbour: Versioned Harbour");
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

test("Harbour Editor exports merge or replace with explicit catalogue semantics", async (t) => {
	const { call, plugin } = await fixture(t);
	const initial = await call("GET", "/locations", { query: { workspace: "all" } });
	const initialCount = initial.body.locations.length;
	const id = crypto.randomUUID();
	const payload = {
		ok: true,
		version: 1,
		exportedAt: "2026-08-13T14:48:56.354Z",
		regions: [{
			id,
			name: "Harbour: Imported Marina",
			timestamp: "2026-08-04T12:51:42.720Z",
			feature: {
				type: "Feature",
				properties: { "aisPlus:type": "marina" },
				geometry: { type: "Polygon", coordinates: [[[-5.2, 55.8], [-5.19, 55.8], [-5.19, 55.81], [-5.2, 55.8]]] },
			},
		}],
	};
	let result = await call("POST", "/local/merge", { body: { confirm: true, payload } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.format, "harbour-editor-v1");
	assert.equal(result.body.converted, 1);
	result = await call("GET", "/locations", { query: { workspace: "all" } });
	assert.equal(result.body.locations.length, initialCount + 1);
	assert.deepEqual(result.body.locations.find((location) => location.id === id).types, ["marina"]);

	result = await call("POST", "/local/import", { body: { confirm: true, payload } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.format, "harbour-editor-v1");
	result = await call("GET", "/locations", { query: { workspace: "all" } });
	assert.deepEqual(result.body.locations.map((location) => location.id), [id]);
	result = await call("GET", "/deleted", {});
	assert.equal(result.body.tombstones.length, initialCount);
	await plugin.stop();
});

test("Harbour Editor merge replaces a later exact-name harbour without duplicating it", async (t) => {
	const { call, plugin } = await fixture(t);
	const firstId = crypto.randomUUID();
	let result = await call("PUT", "/locations/:id", { params: { id: firstId }, body: harbourBody("Timestamp Harbour") });
	assert.equal(result.statusCode, 200);
	const importedId = crypto.randomUUID();
	const payload = {
		version: 1,
		exportedAt: "2099-08-14T00:00:01Z",
		regions: [{
			id: importedId,
			name: "Harbour: Timestamp Harbour",
			timestamp: "2099-08-14T00:00:00Z",
			feature: {
				type: "Feature",
				properties: { "aisPlus:type": "marina" },
				geometry: { type: "Polygon", coordinates: [[[-4.9, 55.8], [-4.89, 55.8], [-4.89, 55.81], [-4.9, 55.8]]] },
			},
		}],
	};
	result = await call("POST", "/local/merge", { body: { confirm: true, payload } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.matchedByName, 1);
	assert.equal(result.body.deduplicated, 0);
	result = await call("GET", "/locations", { query: { workspace: "all" } });
	const matches = result.body.locations.filter((location) => location.name === "Timestamp Harbour");
	assert.equal(matches.length, 1);
	assert.deepEqual(matches[0].types, ["marina"]);
	assert.equal(matches[0].feature.geometry.coordinates[0][0][0], -4.9);
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
