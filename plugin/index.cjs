/**
 * Signal K entry point for Location Editor; owns its catalogue, API, status and spatial lookup service.
 */

const fs = require("node:fs");
const path = require("node:path");
const openApi = require("./openApi.json");
const {
	CATALOG_SCHEMA,
	CATALOG_SCHEMA_VERSION,
	LOCATION_TYPES,
	WORKSPACES,
	isResourceId,
	locationMatchesWorkspace,
	nearestLocations,
	normalizeCatalog,
	normalizeLocation,
} = require("./location-model.cjs");
const { createLocationStore } = require("./location-store.cjs");

const STATUS_CONTRACT = "ajrm-marine-location-editor-status-v1";
const STATUS_PATH = "plugins.ajrmMarineLocationEditor";
const MAX_IMPORT_LOCATIONS = 10000;

const packageJson = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

function normalizeResources(value) {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.map((resource, index) => ({
			...resource,
			id: resource.id ?? resource.identifier ?? String(index),
		}));
	}
	return Object.entries(value).map(([id, resource]) => ({
		...(resource || {}),
		id: resource?.id ?? resource?.identifier ?? id,
	}));
}

function isHarbourRegion(region) {
	return String(region?.name || "").toLowerCase().startsWith("harbour:");
}

function typeCounts(locations) {
	const result = Object.fromEntries(LOCATION_TYPES.map((type) => [type, 0]));
	for (const location of locations) {
		for (const type of location.types) result[type] += 1;
	}
	return result;
}

function parseTypes(value) {
	if (!value) return [];
	return [...new Set(String(value).split(",").map((entry) => entry.trim()).filter(Boolean))];
}

module.exports = function ajrmMarineLocationEditor(app) {
	const plugin = {};
	let running = false;
	const pendingOperations = new Set();
	const dataDirectory = app.getDataDirPath?.() || path.join(process.cwd(), ".ajrm-location-editor");
	const store = createLocationStore(path.join(dataDirectory, "locations.json"));
	let lastStatus = {
		contract: STATUS_CONTRACT,
		contractVersion: 1,
		plugin: "signalk-ajrm-marine-location-editor",
		version: packageJson.version,
		enabled: false,
		locationCount: null,
		typeCounts: {},
		error: "",
		updatedAt: new Date().toISOString(),
	};

	plugin.id = "signalk-ajrm-marine-location-editor";
	plugin.name = "AJRM Marine Location Editor";
	plugin.description =
		"Manage marine places, tidal locations, hazards and avoidance areas";
	plugin.schema = { type: "object", properties: {} };
	plugin.getOpenApi = () => openApi;

	plugin.start = () => {
		if (running) return;
		running = true;
		app.ajrmMarineLocations = Object.freeze({
			contract: "ajrm-marine-locations-service-v1",
			list: async (options = {}) => {
				const locations = await store.list();
				return options.workspace
					? locations.filter((location) => locationMatchesWorkspace(location, options.workspace))
					: locations;
			},
			get: (id) => store.get(id),
			nearest: async (position, options) => nearestLocations(await store.list(), position, options),
		});
		app.setPluginStatus(`Started v${packageJson.version}`);
		trackOperation(refreshStatus()).catch((error) => {
			updateStatus({ error: error.message });
			app.setPluginError?.(error.message);
		});
	};

	plugin.stop = async () => {
		running = false;
		await Promise.allSettled([...pendingOperations]);
		delete app.ajrmMarineLocations;
		updateStatus({ enabled: false });
		publishStatus(null);
		delete app.ajrmMarineLocationEditorStatus;
		app.setPluginStatus?.("Stopped");
	};

	plugin.registerWithRouter = (router) => {
		const write = requireWriteAccess;

		router.get("/status", async (_req, res) => {
			try {
				res.json(await buildStatus());
			} catch (error) {
				res.status(500).json({ ...lastStatus, error: error.message });
			}
		});

		router.get("/locations", async (req, res) => {
			try {
				assertRunning();
				const workspace = String(req.query?.workspace || "all");
				if (!WORKSPACES[workspace]) throw new Error(`Unknown workspace: ${workspace}.`);
				const locations = (await store.list())
					.filter((location) => locationMatchesWorkspace(location, workspace))
					.sort((a, b) => a.name.localeCompare(b.name));
				res.json({ schema: CATALOG_SCHEMA, schemaVersion: CATALOG_SCHEMA_VERSION, locations });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.get("/locations/:id", async (req, res) => {
			try {
				assertRunning();
				if (!isResourceId(req.params.id)) throw new Error("Location id must be a UUIDv4.");
				const location = await store.get(req.params.id);
				if (!location) return res.status(404).json({ error: "Location was not found." });
				return res.json(location);
			} catch (error) {
				return res.status(400).json({ error: error.message });
			}
		});

		router.get("/deleted", async (_req, res) => {
			try {
				assertRunning();
				const catalog = await store.read();
				const tombstones = Object.values(catalog.tombstones)
					.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
				res.json({ schema: CATALOG_SCHEMA, schemaVersion: CATALOG_SCHEMA_VERSION, tombstones });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.put("/locations/:id", write(async (req, res) => {
			try {
				assertRunning();
				if (!isResourceId(req.params.id)) throw new Error("Location id must be a UUIDv4.");
				const { expectedRevision, ...body } = req.body || {};
				const location = normalizeLocation({ ...body, id: req.params.id });
				await assertReferencesExist(location);
				const saved = await store.set(req.params.id, location, {
					expectedRevision,
					editedBy: requestActor(req),
				});
				await refreshStatus();
				res.json({ ok: true, id: req.params.id, location: saved });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.delete("/locations/:id", write(async (req, res) => {
			try {
				assertRunning();
				if (!isResourceId(req.params.id)) throw new Error("Location id must be a UUIDv4.");
				await assertNotReferenced(req.params.id);
				const removed = await store.remove(req.params.id, {
					expectedRevision: req.body?.expectedRevision ?? req.query?.expectedRevision,
					editedBy: requestActor(req),
				});
				if (!removed) return res.status(404).json({ error: "Location was not found." });
				await refreshStatus();
				return res.json({ ok: true });
			} catch (error) {
				return res.status(400).json({ error: error.message });
			}
		}));

		router.get("/locations/:id/history", async (req, res) => {
			try {
				assertRunning();
				if (!isResourceId(req.params.id)) throw new Error("Location id must be a UUIDv4.");
				const history = await store.history(req.params.id);
				if (!history.length) return res.status(404).json({ error: "Location history was not found." });
				return res.json({ id: req.params.id, history });
			} catch (error) {
				return res.status(400).json({ error: error.message });
			}
		});

			router.post("/locations/:id/restore", write(async (req, res) => {
			try {
				assertRunning();
				if (!isResourceId(req.params.id)) throw new Error("Location id must be a UUIDv4.");
				if (!isResourceId(req.body?.editId)) throw new Error("Select a valid history revision to restore.");
				const location = await store.restore(req.params.id, req.body.editId, {
					expectedRevision: req.body.expectedRevision,
					editedBy: requestActor(req),
					validate: (restored, catalog) =>
						assertReferencesExist(restored, new Map(Object.entries(catalog.locations))),
				});
				await refreshStatus();
				res.json({ ok: true, location });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.get("/nearest", async (req, res) => {
			try {
				assertRunning();
				const position = {
					latitude: Number(req.query?.latitude),
					longitude: Number(req.query?.longitude),
				};
				const locations = nearestLocations(await store.list(), position, {
					types: parseTypes(req.query?.types),
					limit: req.query?.limit,
					maxDistanceM: req.query?.maxDistanceM,
				});
				res.json({ position, locations });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.get("/harbour-regions", async (_req, res) => {
			try {
				const resources = app.resourcesApi
					? await app.resourcesApi.listResources("regions", {})
					: {};
				const regions = normalizeResources(resources)
					.filter(isHarbourRegion)
					.map(({ id, name, description }) => ({ id, name, description }))
					.sort((a, b) => a.name.localeCompare(b.name));
				res.json({ regions });
			} catch (error) {
				res.status(500).json({ error: error.message });
			}
		});

		router.get("/local/export", async (_req, res) => {
			try {
				const catalog = await store.read();
				res.json({ ...catalog, exportedAt: new Date().toISOString(), count: Object.keys(catalog.locations).length });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.post("/local/import", write(async (req, res) => {
			try {
				assertRunning();
				if (!req.body?.confirm) throw new Error("Import must be confirmed.");
				assertVersionedPayload(req.body.payload);
				const incoming = normalizeCatalog(req.body.payload);
				const count = Object.keys(incoming.locations).length;
				if (count > MAX_IMPORT_LOCATIONS) {
					throw new Error(`Import contains more than ${MAX_IMPORT_LOCATIONS} locations.`);
				}
				await validateCatalogReferences(incoming);
				const previous = (await store.list()).length;
				await store.replace(incoming);
				await refreshStatus();
				res.json({ ok: true, imported: count, replaced: previous, log: [`Imported ${count} location(s).`, `Replaced ${previous} previous location(s).`] });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.post("/local/merge", write(async (req, res) => {
			try {
				assertRunning();
				if (!req.body?.confirm) throw new Error("Merge must be confirmed.");
				assertVersionedPayload(req.body.payload);
				const incoming = normalizeCatalog(req.body.payload);
				if (Object.keys(incoming.locations).length > MAX_IMPORT_LOCATIONS) {
					throw new Error(`Merge contains more than ${MAX_IMPORT_LOCATIONS} locations.`);
				}
				const result = await store.merge(incoming, {
					validate: validateCatalogReferences,
				});
				await refreshStatus();
				res.json({
					ok: result.conflicts.length === 0,
					added: result.added,
					updated: result.updated,
					keptLocal: result.keptLocal,
					conflicts: result.conflicts,
					log: [
						`Added ${result.added} new location(s).`,
						`Accepted ${result.updated} newer imported edit(s).`,
						`Kept ${result.keptLocal} newer or identical local edit(s).`,
						result.conflicts.length ? `${result.conflicts.length} equal-time conflict(s) kept local and require review.` : "No unresolved conflicts.",
					],
				});
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));
	};

	async function assertReferencesExist(location, catalogLocations = null) {
		const locations = catalogLocations || new Map((await store.list()).map((entry) => [entry.id, entry]));
		for (const [label, reference] of [
			["Tidal location", location.properties.tideLocationRef],
			["Parent tidal location", location.properties.tide?.parentLocationRef],
		]) {
			if (!reference) continue;
			const id = reference.split("/").at(-1);
			if (!locations.has(id)) throw new Error(`${label} reference does not exist in this catalogue.`);
		}
		if (location.properties.regionRef && app.resourcesApi) {
			const id = location.properties.regionRef.split("/").at(-1);
			const regions = new Map(normalizeResources(await app.resourcesApi.listResources("regions", {})).map((region) => [region.id, region]));
			if (!regions.has(id)) throw new Error("Region reference does not exist on this Signal K server.");
		}
	}

	function assertVersionedPayload(payload) {
		if (
			payload?.schema !== CATALOG_SCHEMA ||
			Number(payload?.schemaVersion) !== CATALOG_SCHEMA_VERSION
		) {
			throw new Error(
				`Select a ${CATALOG_SCHEMA} version ${CATALOG_SCHEMA_VERSION} catalogue.`,
			);
		}
	}

	async function validateCatalogReferences(catalog) {
		const locations = new Map(Object.entries(catalog.locations));
		for (const location of locations.values()) await assertReferencesExist(location, locations);
	}

	async function assertNotReferenced(id) {
		const suffix = `/resources/locations/${id}`;
		const references = (await store.list()).filter((location) =>
			location.properties.tideLocationRef === suffix ||
			location.properties.tide?.parentLocationRef === suffix,
		);
		if (references.length) {
			throw new Error(`Location is referenced by: ${references.map((location) => location.name).join(", ")}.`);
		}
	}

	async function buildStatus() {
		const locations = await store.list();
		return {
			...lastStatus,
			enabled: running,
			locationCount: locations.length,
			typeCounts: typeCounts(locations),
			error: "",
			updatedAt: new Date().toISOString(),
		};
	}

	async function refreshStatus() {
		if (!running) return lastStatus;
		return updateStatus(await buildStatus());
	}

	function updateStatus(fields = {}) {
		lastStatus = { ...lastStatus, ...fields, enabled: running && fields.enabled !== false, updatedAt: new Date().toISOString() };
		if (running) {
			app.ajrmMarineLocationEditorStatus = lastStatus;
			publishStatus(lastStatus);
		}
		return lastStatus;
	}

	function publishStatus(value) {
		app.handleMessage?.(plugin.id, {
			context: "vessels.self",
			updates: [{
				source: { label: plugin.id },
				timestamp: new Date().toISOString(),
				values: [{ path: STATUS_PATH, value }],
			}],
		});
	}

	function assertRunning() {
		if (!running) throw new Error("Location Editor is not running.");
	}

	function trackOperation(operation) {
		const promise = Promise.resolve(operation);
		pendingOperations.add(promise);
		promise.finally(() => pendingOperations.delete(promise));
		return promise;
	}

	function requireWriteAccess(handler) {
		return function writeAccessHandler(req, res) {
			const permission = req.skPrincipal?.permissions;
			if (
				permission === "admin" ||
				permission === "readwrite" ||
				(permission === undefined && req.skIsAuthenticated !== false)
			) {
				return trackOperation(handler(req, res));
			}
			res.status(403).json({
				error: "Location Editor changes require Signal K read/write or admin access.",
			});
			return undefined;
		};
	}

	function requestActor(req) {
		return String(
			req.skPrincipal?.username ||
			req.skPrincipal?.id ||
			req.user?.username ||
			"local Signal K user",
		).slice(0, 200);
	}

	return plugin;
};
