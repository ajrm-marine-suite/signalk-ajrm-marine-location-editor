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
	assert.equal(res.body.locations.length, 1);
	assert.equal(res.body.locations[0].id, id);
	assert.equal(res.body.locations[0].name, "Test Bay");
	assert.deepEqual(res.body.locations[0].types, ["marina"]);
	assert.equal(res.body.locations[0].properties.publishAsHarbourRegion, true);
	assert.equal(regions[id].name, "Harbour: Test Bay");
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
	await plugin.stop();
	assert.equal(app.ajrmMarineLocations, undefined);
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
