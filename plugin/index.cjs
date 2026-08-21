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
	representativePosition,
} = require("./location-model.cjs");
const { createLocationStore } = require("./location-store.cjs");
const { prepareLocationImport } = require("./location-import.cjs");
const { createAnchoringAssistant } = require("./anchoring-assistance.cjs");

const STATUS_CONTRACT = "ajrm-marine-location-editor-status-v1";
const SERVICE_REGISTRIES = Object.freeze({
	ajrmMarineLocations: Symbol.for("mcdonaldajr.ajrmMarineLocations"),
	ajrmMarineAnchoring: Symbol.for("mcdonaldajr.ajrmMarineAnchoring"),
	ajrmMarineLocationDiagnostics: Symbol.for("mcdonaldajr.ajrmMarineLocationDiagnostics"),
});
const TIDAL_DATABASE_REGISTRY = Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase");
const STATUS_PATH = "plugins.ajrmMarineLocationEditor";
const ANCHORING_PATH = "plugins.ajrmMarineLocations.anchoring";
const MAX_IMPORT_LOCATIONS = 10000;

const packageJson = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);
const bundledLocationSeed = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "defaults", "spatial-locations.json"), "utf8"),
);

function normalizedLocationName(value) {
	return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
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
	let initializationPromise = Promise.resolve();
	const pendingOperations = new Set();
	let unsubscribes = [];
	let anchoringTimer = null;
	let anchoringEvaluation = Promise.resolve();
	let latestPosition = null;
	let latestSog = null;
	let options = {};
	const dataDirectory = app.getDataDirPath?.() || path.join(process.cwd(), ".ajrm-location-editor");
	const store = createLocationStore(path.join(dataDirectory, "locations.json"));
	let anchoringAssistant = null;
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
	plugin.schema = {
		type: "object",
		properties: {
			anchoringAssistanceEnabled: { type: "boolean", title: "Suggest Anchored when stationary at an anchorage or mooring", default: true },
			anchoringStationarySpeedKn: { type: "number", title: "Maximum stationary speed (knots)", default: 0.3, minimum: 0, maximum: 3 },
			anchoringStationaryMinutes: { type: "number", title: "Stationary time before suggesting (minutes)", default: 5, minimum: 1, maximum: 60 },
			anchoringPointRadiusM: { type: "number", title: "Default radius around point anchorages (metres)", default: 250, minimum: 10, maximum: 2000 },
			trustedLocationAutomation: { type: "boolean", title: "Automatically select Anchored at individually trusted locations", default: false },
		},
	};
	plugin.getOpenApi = () => openApi;

	plugin.start = (configured = {}) => {
		if (running) return;
		running = true;
		const configuredStationarySpeedKn = Number(configured.anchoringStationarySpeedKn);
		options = {
			anchoringAssistanceEnabled: configured.anchoringAssistanceEnabled !== false,
			anchoringStationarySpeedKn: Number.isFinite(configuredStationarySpeedKn) && configuredStationarySpeedKn >= 0
				? configuredStationarySpeedKn : 0.3,
			anchoringStationaryMinutes: Number(configured.anchoringStationaryMinutes) || 5,
			anchoringPointRadiusM: Number(configured.anchoringPointRadiusM) || 250,
			trustedLocationAutomation: configured.trustedLocationAutomation === true,
		};
		anchoringAssistant = createAnchoringAssistant({
			listLocations: () => store.list(),
			getTrafficApi: () => app.ajrmMarineTrafficApi || globalThis[Symbol.for("ajrmMarineTrafficApi")] || null,
			publish: publishAnchoring,
			options: {
				enabled: options.anchoringAssistanceEnabled,
				stationarySpeedMps: options.anchoringStationarySpeedKn * 0.514444,
				stationarySeconds: options.anchoringStationaryMinutes * 60,
				pointRadiusM: options.anchoringPointRadiusM,
				trustedLocationAutomation: options.trustedLocationAutomation,
			},
		});
		app.ajrmMarineLocations = Object.freeze({
			contract: "ajrm-marine-locations-service-v1",
			list: async (options = {}) => {
				await initializationPromise;
				const locations = await store.list();
				return options.workspace
					? locations.filter((location) => locationMatchesWorkspace(location, options.workspace))
					: locations;
			},
			get: async (id) => { await initializationPromise; return store.get(id); },
			nearest: async (position, options) => {
				await initializationPromise;
				return nearestLocations(await store.list(), position, options);
			},
			profileAreas: async () => {
				await initializationPromise;
				return (await store.list()).filter((location) =>
					location.properties?.automaticProfileArea === true &&
					location.feature?.geometry?.type === "Polygon",
				);
			},
		});
		app.ajrmMarineAnchoring = Object.freeze({
			contract: "ajrm-marine-anchoring-service-v1",
			status: () => anchoringAssistant.status(),
			confirm: (suggestionId) => anchoringAssistant.confirm(suggestionId),
			dismiss: (suggestionId) => anchoringAssistant.dismiss(suggestionId),
		});
		app.ajrmMarineLocationDiagnostics = Object.freeze({
			contract: "ajrm-marine-location-diagnostics-v1",
			snapshot: async (request = {}) => {
				await initializationPromise;
				const locations = await store.list();
				return {
					contract: "ajrm-marine-location-diagnostics-v1",
					contractVersion: 1,
					capturedAt: new Date().toISOString(),
					catalogue: {
						count: locations.length,
						typeCounts: typeCounts(locations),
						locations: request.includeLocations === true ? structuredClone(locations) : undefined,
					},
					anchoring: anchoringAssistant?.status?.() || null,
				};
			},
		});
		for (const [name, registry] of Object.entries(SERVICE_REGISTRIES)) {
			globalThis[registry] = app[name];
		}
		app.setPluginStatus(`Started v${packageJson.version}`);
		initializationPromise = trackOperation(initializeCatalogue().then(async (result) => {
			startEnvironmentalMonitoring();
			await refreshStatus();
			return result;
		}));
		initializationPromise.catch((error) => {
			updateStatus({ error: error.message });
			app.setPluginError?.(error.message);
		});
	};

	plugin.stop = async () => {
		running = false;
		clearInterval(anchoringTimer);
		for (const unsubscribe of unsubscribes.splice(0)) unsubscribe?.();
		await Promise.allSettled([...pendingOperations]);
		for (const [name, registry] of Object.entries(SERVICE_REGISTRIES)) {
			if (globalThis[registry] === app[name]) delete globalThis[registry];
			delete app[name];
		}
		updateStatus({ enabled: false });
		publishStatus(null);
		publishAnchoring(null);
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

		router.get("/anchoring/status", async (_req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(anchoringAssistant.status());
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.post("/anchoring/confirm", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(await anchoringAssistant.confirm(String(req.body?.suggestionId || "")));
			} catch (error) {
				res.status(409).json({ error: error.message });
			}
		}));

		router.post("/anchoring/dismiss", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(anchoringAssistant.dismiss(String(req.body?.suggestionId || "")));
			} catch (error) {
				res.status(409).json({ error: error.message });
			}
		}));

		router.get("/locations", async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
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

		router.get("/tidal-regions/definitions", async (_req, res) => {
			try {
				const service = requireTidalDatabase();
				res.json({
					contract: "ajrm-marine-location-tidal-region-editor-v1",
					ports: service.listPorts(),
					areas: service.listAreas(),
				});
			} catch (error) {
				res.status(503).json({ error: error.message });
			}
		});

		router.put("/tidal-regions/:id", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				if (!isResourceId(req.params.id)) throw new Error("Tidal region id must be a UUIDv4.");
				const location = await store.get(req.params.id);
				if (!location?.types.includes("tidalRegion")) throw new Error("The selected Location is not classified as a tidal region.");
				const area = await requireTidalDatabase().setArea(req.params.id, {
					name: location.name,
					portLocationId: req.body?.portLocationId,
					parentAreaLocationId: req.body?.parentAreaLocationId || null,
				});
				res.json({ ok:true,area });
			} catch (error) {
				res.status(400).json({ error:error.message });
			}
		}));

		router.delete("/tidal-regions/:id", write(async (req, res) => {
			try {
				assertRunning();
				await requireTidalDatabase().removeArea(req.params.id);
				res.json({ ok:true });
			} catch (error) {
				res.status(400).json({ error:error.message });
			}
		}));

		router.get("/locations/:id", async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
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
				await initializationPromise;
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
				await initializationPromise;
				if (!isResourceId(req.params.id)) throw new Error("Location id must be a UUIDv4.");
				const { expectedRevision, ...body } = req.body || {};
				const location = normalizeLocation({ ...body, id: req.params.id });
				await assertReferencesExist(location);
				await assertUniqueLocationName(location);
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
				await initializationPromise;
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
				await initializationPromise;
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
				await initializationPromise;
				if (!isResourceId(req.params.id)) throw new Error("Location id must be a UUIDv4.");
				if (!isResourceId(req.body?.editId)) throw new Error("Select a valid history revision to restore.");
				const location = await store.restore(req.params.id, req.body.editId, {
					expectedRevision: req.body.expectedRevision,
					editedBy: requestActor(req),
					validate: async (restored, catalog) => {
						const locations = new Map(Object.entries(catalog.locations));
						await assertReferencesExist(restored, locations);
						await assertUniqueLocationName(restored, locations);
					},
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
				await initializationPromise;
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

		router.get("/local/export", async (_req, res) => {
			try {
				const catalog = await store.read();
				res.json({ ...catalog, exportedAt: new Date().toISOString(), count: Object.keys(catalog.locations).length });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.post("/local/purge-deleted", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				if (!req.body?.confirm) throw new Error("Purging deleted locations must be confirmed.");
				const purged = await store.purgeDeleted();
				await refreshStatus();
				res.json({ ok: true, purged });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.post("/local/import", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				if (!req.body?.confirm) throw new Error("Import must be confirmed.");
				const prepared = prepareLocationImport(req.body.payload);
				const incoming = prepared.catalog;
				const count = Object.keys(incoming.locations).length;
				if (count > MAX_IMPORT_LOCATIONS) {
					throw new Error(`Import contains more than ${MAX_IMPORT_LOCATIONS} locations.`);
				}
				await validateCatalogReferences(incoming);
				const previous = (await store.list()).length;
				await store.replace(incoming, { tombstoneMissing: true, editedBy: "Catalogue replacement" });
				await refreshStatus();
				res.json({
					ok: true,
					imported: count,
					replaced: previous,
					format: prepared.format,
					log: [
						`Imported ${count} location(s).`,
						`Replaced ${previous} previous location(s).`,
					],
				});
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.post("/local/merge", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				if (!req.body?.confirm) throw new Error("Merge must be confirmed.");
				const prepared = prepareLocationImport(req.body.payload);
				const incoming = prepared.catalog;
				if (Object.keys(incoming.locations).length > MAX_IMPORT_LOCATIONS) {
					throw new Error(`Merge contains more than ${MAX_IMPORT_LOCATIONS} locations.`);
				}
				const result = await store.merge(incoming, { validate: validateCatalogReferences });
				await refreshStatus();
				res.json({
					ok: result.conflicts.length === 0,
					added: result.added,
					updated: result.updated,
					keptLocal: result.keptLocal,
					conflicts: result.conflicts,
					format: prepared.format,
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
		// Location Editor validates the spatial record itself. Cross-service
		// prediction relationships belong to Tidal Database and are not interpreted here.
		void location;
		void catalogLocations;
	}

	function requireTidalDatabase() {
		const service = app.ajrmMarineTidalDatabase || globalThis[TIDAL_DATABASE_REGISTRY];
		if (
			service?.contract !== "ajrm-marine-tidal-database-service-v1" ||
			!["listPorts", "listAreas", "setArea", "removeArea"].every((method) => typeof service[method] === "function")
		) {
			throw new Error("AJRM Marine Tidal Database is unavailable or does not support tidal-region editing.");
		}
		return service;
	}

	async function assertUniqueLocationName(location, catalogLocations = null) {
		const locations = catalogLocations || new Map((await store.list()).map((entry) => [entry.id, entry]));
		const nameKey = normalizedLocationName(location.name);
		const duplicate = [...locations.values()].find((entry) =>
			entry.id !== location.id &&
			normalizedLocationName(entry.name) === nameKey,
		);
		if (duplicate) {
			throw new Error(`A location named "${duplicate.name}" already exists. Location names must be unique.`);
		}
	}

	async function initializeCatalogue() {
		const seeded = await addBundledLocations();
		app.debug?.(`[${plugin.id}] Added ${seeded.length} bundled location(s).`);
		return { seeded: seeded.length };
	}

	async function addBundledLocations() {
		if (
			bundledLocationSeed?.schema !== "org.ajrm.marine.location-seed/v1" ||
			!Array.isArray(bundledLocationSeed.locations)
		) {
			throw new Error("Bundled West Scotland location seed is invalid.");
		}
		const current = await store.list();
		const byId = new Map(current.map((location) => [location.id, location]));
		const byName = new Map(current.map((location) => [normalizedLocationName(location.name), location]));
		const candidates = [];
		for (const value of bundledLocationSeed.locations) {
			const seed = normalizeLocation(value);
			const sourceMatch = byId.get(seed.id) || byName.get(normalizedLocationName(seed.name));
			if (sourceMatch) {
				continue;
			}
			const nearbyMatch = current.find((location) => locationsDescribeSamePlace(location, seed));
			if (nearbyMatch) continue;
			candidates.push(seed);
		}
		return store.seedMissing(candidates, { editedBy: "Bundled West Scotland open-data seed" });
	}

	function locationsDescribeSamePlace(left, right) {
		if (normalizedLocationName(left.name) !== normalizedLocationName(right.name)) return false;
		const sharesType = left.types.some((type) => right.types.includes(type));
		if (!sharesType) return false;
		const a = representativePosition(left);
		const b = representativePosition(right);
		if (!a || !b) return false;
		const latitudeM = (a.latitude - b.latitude) * 111320;
		const longitudeM = (a.longitude - b.longitude) * 111320 * Math.cos((a.latitude + b.latitude) * Math.PI / 360);
		return Math.hypot(latitudeM, longitudeM) <= 500;
	}

	async function validateCatalogReferences(catalog) {
		const locations = new Map(Object.entries(catalog.locations));
		for (const location of locations.values()) {
			await assertReferencesExist(location, locations);
			await assertUniqueLocationName(location, locations);
		}
	}

	async function assertNotReferenced() {}

	async function buildStatus() {
		const locations = await store.list();
		return {
			...lastStatus,
			enabled: running,
			locationCount: locations.length,
			profileAreaCount: locations.filter(
				(location) => location.properties.automaticProfileArea,
			).length,
			typeCounts: typeCounts(locations),
			anchoringAssistance: anchoringAssistant?.status?.() || {
				enabled: options.anchoringAssistanceEnabled,
				state: "unavailable",
			},
			error: "",
			updatedAt: new Date().toISOString(),
		};
	}

	async function refreshStatus() {
		if (!running) return lastStatus;
		return updateStatus(await buildStatus());
	}

	function startEnvironmentalMonitoring() {
		latestPosition = normalizePosition(app.getSelfPath?.("navigation.position"));
		latestSog = normalizeSpeed(app.getSelfPath?.("navigation.speedOverGround"));
		publishAnchoringMetadata();
		if (app.subscriptionmanager?.subscribe) {
			app.subscriptionmanager.subscribe(
				{
					context: "vessels.self",
					subscribe: [
						{ path: "navigation.position", policy: "instant", format: "delta" },
						{ path: "navigation.speedOverGround", policy: "instant", format: "delta" },
					],
				},
				unsubscribes,
				(error) => app.error?.(`[${plugin.id}] vessel-position subscription error: ${error}`),
				handlePositionDelta,
			);
		}
		anchoringTimer = setInterval(() => scheduleAnchoringEvaluation(), 30 * 1000);
		anchoringTimer.unref?.();
		scheduleAnchoringEvaluation();
	}

	function normalizePosition(value) {
		const latitude = Number(value?.latitude);
		const longitude = Number(value?.longitude);
		return Number.isFinite(latitude) && Number.isFinite(longitude) &&
			latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
			? { latitude, longitude }
			: null;
	}

	function normalizeSpeed(value) {
		const speed = Number(value);
		return Number.isFinite(speed) && speed >= 0 ? speed : null;
	}

	function handlePositionDelta(delta) {
		for (const update of delta?.updates || []) {
			for (const value of update.values || []) {
				if (value.path === "navigation.position") {
					latestPosition = normalizePosition(value.value);
				}
				if (value.path === "navigation.speedOverGround") {
					latestSog = normalizeSpeed(value.value);
				}
			}
			scheduleAnchoringEvaluation(update.timestamp);
		}
	}

	function scheduleAnchoringEvaluation(at) {
		if (!running || !anchoringAssistant) return;
		const observation = { position: latestPosition, sog: latestSog, at };
		anchoringEvaluation = anchoringEvaluation
			.then(() => anchoringAssistant.observe(observation))
			.catch((error) => app.error?.(`[${plugin.id}] anchoring assistance error: ${error.message}`));
		trackOperation(anchoringEvaluation);
	}

	function publishAnchoringMetadata() {
		app.handleMessage?.(plugin.id, {
			updates: [{ meta: [{ path: ANCHORING_PATH, value: {
				description: "Stationary-at-location evidence, Anchored-profile suggestion and skipper/automation action provenance.",
			} }] }],
		});
	}

	function publishAnchoring(value) {
		app.handleMessage?.(plugin.id, {
			context: "vessels.self",
			updates: [{
				source: { label: plugin.id },
				timestamp: new Date().toISOString(),
				values: [{ path: ANCHORING_PATH, value }],
			}],
		});
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
