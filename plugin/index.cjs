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
const { nearestSecondaryPort } = require("./tide-selection.cjs");
const { createLocationStore } = require("./location-store.cjs");
const { prepareLocationImport } = require("./location-import.cjs");
const { createUkhoTideProvider } = require("./tide-provider.cjs");
const { createTideResolver } = require("./tide-resolver.cjs");
const { createAnchoringAssistant } = require("./anchoring-assistance.cjs");
const { createWeatherService } = require("./weather-service.cjs");
const { isSupersededBundledCorrection, mergeSecondaryPortSeed } = require("./secondary-port-seed.cjs");
const { mergeGateConstantsSeed } = require("./gate-constants-seed.cjs");

const STATUS_CONTRACT = "ajrm-marine-location-editor-status-v1";
const SERVICE_REGISTRIES = Object.freeze({
	ajrmMarineLocations: Symbol.for("mcdonaldajr.ajrmMarineLocations"),
	ajrmMarineTides: Symbol.for("mcdonaldajr.ajrmMarineTides"),
	ajrmMarineWeather: Symbol.for("mcdonaldajr.ajrmMarineWeather"),
	ajrmMarineAnchoring: Symbol.for("mcdonaldajr.ajrmMarineAnchoring"),
	ajrmMarineLocationDiagnostics: Symbol.for("mcdonaldajr.ajrmMarineLocationDiagnostics"),
});
const STATUS_PATH = "plugins.ajrmMarineLocationEditor";
const TIDE_PATH = "plugins.ajrmMarineLocations.tide";
const ANCHORING_PATH = "plugins.ajrmMarineLocations.anchoring";
const WEATHER_PATH = "plugins.ajrmMarineLocations.weather";
const MAX_IMPORT_LOCATIONS = 10000;

const packageJson = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);
const bundledWestScotlandSeed = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "defaults", "west-scotland-locations.json"), "utf8"),
);
const bundledSecondaryPortSeeds = [
	"secondary-port-locations.json",
	"secondary-port-locations-ullapool.json",
	"secondary-port-locations-stornoway.json",
].map((filename) => JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "defaults", filename), "utf8"),
));
const bundledGateSeed = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "defaults", "tidal-gate-locations.json"), "utf8"),
);
const bundledAdmiraltyPortSeed = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "defaults", "admiralty-api-ports.json"), "utf8"),
);
const bundledTidalAreaSeed = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "defaults", "tidal-port-areas.json"), "utf8"),
);
const baseBundledLocationSeed = mergeGateConstantsSeed(
	bundledSecondaryPortSeeds.reduce(mergeSecondaryPortSeed, bundledWestScotlandSeed),
	bundledGateSeed,
);
const bundledLocationSeed = {
	...baseBundledLocationSeed,
	locations: [
		...baseBundledLocationSeed.locations,
		...bundledAdmiraltyPortSeed.locations,
		...bundledTidalAreaSeed.locations,
	],
};

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
	let tideTimer = null;
	let anchoringTimer = null;
	let tideDebounce = null;
	let tideResolution = null;
	let anchoringEvaluation = Promise.resolve();
	let latestPosition = null;
	let latestSog = null;
	let latestTide = null;
	let latestWeather = null;
	let options = {};
	const dataDirectory = app.getDataDirPath?.() || path.join(process.cwd(), ".ajrm-location-editor");
	const store = createLocationStore(path.join(dataDirectory, "locations.json"));
	let tideResolver = null;
	let anchoringAssistant = null;
	let weatherService = null;
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
			weatherServiceEnabled: { type: "boolean", title: "Enable shared weather service", default: true },
			weatherRefreshHours: { type: "number", title: "Refresh weather forecasts after (hours)", default: 1, minimum: 0.25, maximum: 24 },
			weatherExpiresHours: { type: "number", title: "Reject weather forecasts older than (hours)", default: 24, minimum: 1, maximum: 168 },
			tideResolverEnabled: { type: "boolean", title: "Enable shared tide resolver", default: true },
			ukhoApiKey: { type: "string", title: "UKHO Tidal API subscription key", format: "password" },
			ukhoSubscriptionTier: {
				type: "string",
				title: "UKHO subscription tier (controls whether caching is licensed)",
				enum: ["discovery", "foundation", "premium"],
				default: "discovery",
			},
			tideRefreshHours: { type: "number", title: "Refresh tidal events after (hours)", default: 24, minimum: 1, maximum: 168 },
			tideExpiresHours: { type: "number", title: "Reject tidal data older than (hours)", default: 72, minimum: 2, maximum: 720 },
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
			weatherServiceEnabled: configured.weatherServiceEnabled !== false,
			weatherRefreshHours: Number(configured.weatherRefreshHours) || 1,
			weatherExpiresHours: Number(configured.weatherExpiresHours) || 24,
			tideResolverEnabled: configured.tideResolverEnabled !== false,
			ukhoApiKey: configured.ukhoApiKey || process.env.UKHO_API_KEY || "",
			ukhoSubscriptionTier: configured.ukhoSubscriptionTier || "discovery",
			tideRefreshHours: Number(configured.tideRefreshHours) || 24,
			tideExpiresHours: Number(configured.tideExpiresHours) || 72,
			anchoringAssistanceEnabled: configured.anchoringAssistanceEnabled !== false,
			anchoringStationarySpeedKn: Number.isFinite(configuredStationarySpeedKn) && configuredStationarySpeedKn >= 0
				? configuredStationarySpeedKn : 0.3,
			anchoringStationaryMinutes: Number(configured.anchoringStationaryMinutes) || 5,
			anchoringPointRadiusM: Number(configured.anchoringPointRadiusM) || 250,
			trustedLocationAutomation: configured.trustedLocationAutomation === true,
		};
		weatherService = createWeatherService({
			cacheDirectory: path.join(dataDirectory, "weather"),
			staleAfterHours: options.weatherRefreshHours,
			expiresAfterHours: Math.max(options.weatherRefreshHours, options.weatherExpiresHours),
		});
		const tideProvider = createUkhoTideProvider({
			apiKey: options.ukhoApiKey,
			subscriptionTier: options.ukhoSubscriptionTier,
			refreshHours: options.tideRefreshHours,
			cacheDirectory: path.join(dataDirectory, "tides"),
		});
		tideResolver = createTideResolver({
			stateFile: path.join(dataDirectory, "tide-selection.json"),
			listLocations: () => store.list(),
			provider: tideProvider,
			staleAfterHours: options.tideRefreshHours,
			expiresAfterHours: Math.max(options.tideRefreshHours, options.tideExpiresHours),
		});
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
		app.ajrmMarineTides = Object.freeze({
			contract: "ajrm-marine-tides-service-v1",
			configured: Boolean(options.ukhoApiKey),
			status: async (request = {}) => { await initializationPromise; return resolveTide(request); },
			recommendSecondary: async (request = {}) => {
				await initializationPromise;
				return nearestSecondaryPort(await store.list(), request);
			},
			pin: async (portId) => {
				await initializationPromise;
				await tideResolver.setPinnedPort(portId);
				return resolveTide({ force: false });
			},
			refresh: async (request = {}) => { await initializationPromise; return resolveTide({ ...request, force: true }); },
		});
		app.ajrmMarineWeather = Object.freeze({
			contract: "ajrm-marine-weather-service-v1",
			status: async (request = {}) => { await initializationPromise; return resolveWeather(request); },
			refresh: async (request = {}) => { await initializationPromise; return resolveWeather({ ...request, force: true }); },
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
				const persistentTideCapturePermitted = ["foundation", "premium"]
					.includes(String(options.ukhoSubscriptionTier || "").toLowerCase());
				const tide = latestTide ? structuredClone(latestTide) : null;
				return {
					contract: "ajrm-marine-location-diagnostics-v1",
					contractVersion: 1,
					capturedAt: new Date().toISOString(),
					catalogue: {
						count: locations.length,
						typeCounts: typeCounts(locations),
						locations: request.includeLocations === true ? structuredClone(locations) : undefined,
					},
					tides: {
						configured: Boolean(options.ukhoApiKey),
						subscriptionTier: options.ukhoSubscriptionTier,
						persistentCapturePermitted: persistentTideCapturePermitted,
						latest: tide,
					},
					weather: {
						enabled: options.weatherServiceEnabled,
						latest: latestWeather ? structuredClone(latestWeather) : null,
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
			await tideResolver.initialize();
			startTideMonitoring();
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
		clearInterval(tideTimer);
		clearInterval(anchoringTimer);
		clearTimeout(tideDebounce);
		for (const unsubscribe of unsubscribes.splice(0)) unsubscribe?.();
		await Promise.allSettled([...pendingOperations]);
		for (const [name, registry] of Object.entries(SERVICE_REGISTRIES)) {
			if (globalThis[registry] === app[name]) delete globalThis[registry];
			delete app[name];
		}
		updateStatus({ enabled: false });
		publishStatus(null);
		publishTide(null);
		publishWeather(null);
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

		router.get("/tides/status", async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(await resolveTide(tideRequest(req)));
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.get("/weather/status", async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(await resolveWeather(weatherRequest(req)));
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.post("/weather/refresh", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(await resolveWeather({ ...weatherRequest(req), force: true }));
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.post("/tides/pin", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				const portId = req.body?.portId || null;
				if (portId && !isResourceId(portId)) throw new Error("Pinned tidal port id must be a UUIDv4.");
				await tideResolver.setPinnedPort(portId);
				res.json(await resolveTide(tideRequest(req)));
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.post("/tides/refresh", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(await resolveTide({ ...tideRequest(req), force: true }));
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

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
		const locations = catalogLocations || new Map((await store.list()).map((entry) => [entry.id, entry]));
		locations.set(location.id, location);
		for (const [label, reference, allowedTypes] of [
			["Tidal-region prediction port", location.properties.tideLocationRef, ["tidalStandardPort", "tidalSecondaryPort"]],
			["Tidal region", location.properties.tideRegionRef, ["tidalRegion"]],
			["Parent standard port", location.properties.tide?.parentLocationRef, ["tidalStandardPort"]],
			["Tidal-gate standard port", location.properties.tidalGate?.standardPortRef, ["tidalStandardPort"]],
		]) {
			if (!reference) continue;
			const id = reference.split("/").at(-1);
			const target = locations.get(id);
			if (!target) throw new Error(`${label} reference does not exist in this catalogue.`);
			if (!target.types.some((type) => allowedTypes.includes(type))) {
				throw new Error(`${label} reference points to an incompatible location type.`);
			}
		}
		const visited = new Set([location.id]);
		let reference = location.properties.tide?.parentLocationRef;
		while (reference) {
			const parentId = reference.split("/").at(-1);
			if (visited.has(parentId)) throw new Error("Secondary-port parent references must not contain a cycle.");
			visited.add(parentId);
			if (visited.size > 12) throw new Error("Secondary-port parent chain is too deep.");
			reference = locations.get(parentId)?.properties?.tide?.parentLocationRef;
		}
		const visitedRegions = new Set([location.id]);
		reference = location.types.includes("tidalRegion") ? location.properties.tideRegionRef : null;
		while (reference) {
			const parentId = reference.split("/").at(-1);
			if (visitedRegions.has(parentId)) throw new Error("Tidal-region parent references must not contain a cycle.");
			visitedRegions.add(parentId);
			if (visitedRegions.size > 12) throw new Error("Tidal-region hierarchy is too deep.");
			reference = locations.get(parentId)?.properties?.tideRegionRef;
		}
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
		const bySource = new Map();
		for (const location of current) {
			for (const source of locationSourceKeys(location)) bySource.set(source, location);
		}
		const candidates = [];
		const bundledIdToCatalogId = new Map();
		for (const value of bundledLocationSeed.locations) {
			const seed = normalizeLocation(value);
			const assignedPortId = String(seed.properties?.tideLocationRef || "").split("/").at(-1);
			const mappedPortId = bundledIdToCatalogId.get(assignedPortId);
			if (mappedPortId && mappedPortId !== assignedPortId) {
				seed.properties.tideLocationRef = `/resources/locations/${mappedPortId}`;
			}
			const sourceMatch = byId.get(seed.id) ||
				locationSourceKeys(seed).map((key) => bySource.get(key)).find(Boolean) ||
				byName.get(normalizedLocationName(seed.name));
			if (sourceMatch) {
				bundledIdToCatalogId.set(seed.id, sourceMatch.id);
				if (await enrichBundledSecondaryPort(sourceMatch, seed)) continue;
				if (await enrichBundledGateConstants(sourceMatch, seed)) continue;
				await enrichUneditedBundledTideReferenceLevels(sourceMatch, seed);
				continue;
			}
			const nearbyMatch = current.find((location) => locationsDescribeSamePlace(location, seed));
			if (nearbyMatch) {
				bundledIdToCatalogId.set(seed.id, nearbyMatch.id);
				if (await enrichBundledSecondaryPort(nearbyMatch, seed)) continue;
				if (await enrichBundledGateConstants(nearbyMatch, seed)) continue;
				await enrichUneditedBundledTideReferenceLevels(nearbyMatch, seed);
				continue;
			}
			bundledIdToCatalogId.set(seed.id, seed.id);
			candidates.push(seed);
		}
		return store.addMissing(candidates, { editedBy: "Bundled West Scotland open-data seed" });
	}

	async function enrichBundledSecondaryPort(current, seed) {
		const corrections = seed.properties?.tide?.secondaryPortCorrections;
		const sourceData = seed.properties?.tide?.secondaryPortSourceData;
		if (!corrections && !sourceData) return false;
		const currentCorrections = current.properties?.tide?.secondaryPortCorrections;
		const currentSourceData = current.properties?.tide?.secondaryPortSourceData;
		const replacesProvisionalLochMelfort =
			corrections?.legacyId === "loch-melfort" &&
			currentCorrections?.legacyId === "loch-melfort" &&
			String(currentCorrections.notes || "").startsWith("HW approximately Oban -0045");
		const replacesSupersededBundledCorrection =
			isSupersededBundledCorrection(currentCorrections, corrections);
		const replacesMisappliedBundledCorrection = Boolean(
			currentCorrections && sourceData?.legacyId &&
			currentCorrections.legacyId !== sourceData.legacyId &&
			bundledLocationSeed.locations.some((location) =>
				normalizedLocationName(location.name) !== normalizedLocationName(seed.name) &&
				JSON.stringify(location.properties?.tide?.secondaryPortCorrections) === JSON.stringify(currentCorrections),
			),
		);
		const currentCoordinates = current.feature?.geometry?.coordinates;
		const replacesProvisionalGeometry = replacesProvisionalLochMelfort &&
			current.feature?.geometry?.type === "Point" &&
			Number(currentCoordinates?.[0]) === -5.588 && Number(currentCoordinates?.[1]) === 56.246;
		if (
			currentCorrections && !replacesProvisionalLochMelfort &&
			!replacesSupersededBundledCorrection && !replacesMisappliedBundledCorrection
		) return false;
		if (
			!corrections && !replacesMisappliedBundledCorrection &&
			JSON.stringify(currentSourceData) === JSON.stringify(sourceData)
		) return false;
		const provenanceSources = [...(current.properties?.provenance?.sources || [])];
		for (const source of seed.properties?.provenance?.sources || []) {
			if (!provenanceSources.some((value) => value.sourceId === source.sourceId && value.url === source.url)) provenanceSources.push(source);
		}
		const tide = { ...current.properties?.tide, ...seed.properties.tide };
		if (replacesMisappliedBundledCorrection && !corrections) delete tide.secondaryPortCorrections;
		if (corrections) delete tide.secondaryPortSourceData;
		await store.set(current.id, {
			...current,
			feature: replacesProvisionalGeometry ? structuredClone(seed.feature) : current.feature,
			types: [...new Set([...current.types, "tidalSecondaryPort"])],
			properties: {
				...current.properties,
				tide,
				tidalGate: current.properties?.tidalGate || structuredClone(seed.properties?.tidalGate),
				provenance: {
					...seed.properties.provenance,
					...current.properties?.provenance,
					sources: provenanceSources,
				},
			},
		}, {
			expectedRevision: current.revision,
			editedBy: "Bundled secondary-port migration",
		});
		return true;
	}

	async function enrichBundledGateConstants(current, seed) {
		const constants = seed.properties?.tidalGate;
		if (!constants || current.properties?.tidalGate) return false;
		await store.set(current.id, {
			...current,
			types: [...new Set([...current.types, "tidalGate"])],
			properties: { ...current.properties, tidalGate: structuredClone(constants) },
		}, {
			expectedRevision: current.revision,
			editedBy: "Bundled tidal-gate constants migration",
		});
		return true;
	}

	async function enrichUneditedBundledTideReferenceLevels(current, seed) {
		const levels = seed.properties?.tide?.referenceLevels;
		if (!levels || current.properties?.tide?.referenceLevels || current.revision !== 1) return;
		await store.set(current.id, {
			...current,
			properties: {
				...current.properties,
				tide: { ...current.properties?.tide, referenceLevels: structuredClone(levels) },
			},
		}, {
			expectedRevision: current.revision,
			editedBy: "Bundled tidal reference-level upgrade",
		});
	}

	function locationSourceKeys(location) {
		const values = [
			location.feature?.properties?.["ajrmMarine:sourceRef"],
			...(location.properties?.provenance?.sources || [])
				.map((source) => source.sourceId)
				.filter((sourceId) => String(sourceId || "").startsWith("marine-planning-secondary:")),
		];
		return [...new Set(values.filter(Boolean).map((value) => String(value).replace(/^openstreetmap:/i, "")))];
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

	async function assertNotReferenced(id) {
		const suffix = `/resources/locations/${id}`;
		const references = (await store.list()).filter((location) =>
			location.properties.tideLocationRef === suffix ||
			location.properties.tideRegionRef === suffix ||
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
			profileAreaCount: locations.filter(
				(location) => location.properties.automaticProfileArea,
			).length,
			typeCounts: typeCounts(locations),
			tideResolver: latestTide ? {
				enabled: options.tideResolverEnabled,
				valid: latestTide.valid,
				selectedPort: latestTide.selectedPort,
				selectionReason: latestTide.selection?.reason,
				freshness: latestTide.freshness,
				error: latestTide.error,
			} : { enabled: options.tideResolverEnabled, valid: false },
			anchoringAssistance: anchoringAssistant?.status?.() || {
				enabled: options.anchoringAssistanceEnabled,
				state: "unavailable",
			},
			weatherService: latestWeather ? {
				enabled: options.weatherServiceEnabled,
				valid: latestWeather.valid,
				contextLocation: latestWeather.contextLocation,
				freshness: latestWeather.freshness,
				error: latestWeather.error,
			} : { enabled: options.weatherServiceEnabled, valid: false },
			error: "",
			updatedAt: new Date().toISOString(),
		};
	}

	async function refreshStatus() {
		if (!running) return lastStatus;
		const result = updateStatus(await buildStatus());
		scheduleTideResolution();
		return result;
	}

	function startTideMonitoring() {
		latestPosition = normalizePosition(app.getSelfPath?.("navigation.position"));
		latestSog = normalizeSpeed(app.getSelfPath?.("navigation.speedOverGround"));
		publishTideMetadata();
		publishWeatherMetadata();
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
				(error) => app.error?.(`[${plugin.id}] tide position subscription error: ${error}`),
				handlePositionDelta,
			);
		}
		tideTimer = setInterval(() => scheduleTideResolution(), 5 * 60 * 1000);
		tideTimer.unref?.();
		anchoringTimer = setInterval(() => scheduleAnchoringEvaluation(), 30 * 1000);
		anchoringTimer.unref?.();
		scheduleTideResolution(0);
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
					scheduleTideResolution();
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

	function scheduleTideResolution(delay = 750) {
		if (!running || !options.tideResolverEnabled || !tideResolver) return;
		clearTimeout(tideDebounce);
		tideDebounce = setTimeout(() => {
			trackOperation(resolveTide()).catch((error) => app.error?.(`[${plugin.id}] tide resolver error: ${error.message}`));
		}, delay);
		tideDebounce.unref?.();
	}

	async function resolveTide(request = {}) {
		if (!options.tideResolverEnabled) {
			return {
				contract: "ajrm-marine-tide-resolver-v1",
				contractVersion: 1,
				valid: false,
				error: "Shared tide resolver is disabled.",
			};
		}
		const execute = async () => tideResolver.resolve({
			...request,
			position: request.position || latestPosition,
		});
		const result = request.force || request.contextLocationId || request.position || request.includeEvents
			? await execute()
			: await (tideResolution || (tideResolution = execute().finally(() => { tideResolution = null; })));
		latestTide = result;
		publishTide(withoutLargeSeries(result));
		return result;
	}

	function weatherRequest(req) {
		const values = req.method === "POST" ? req.body || {} : req.query || {};
		const latitude = Number(values.latitude);
		const longitude = Number(values.longitude);
		return {
			contextLocationId: values.locationId || values.contextLocationId || undefined,
			position: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined,
			weatherDays: values.weatherDays,
			marineDays: values.marineDays,
		};
	}

	function tideRequest(req) {
		const values = { ...(req.query || {}), ...(req.body || {}) };
		const hasPosition = values.latitude != null && values.latitude !== "" &&
			values.longitude != null && values.longitude !== "";
		return {
			contextLocationId: values.locationId || values.contextLocationId || undefined,
			portId: values.portId || undefined,
			position: hasPosition
				? normalizePosition({ latitude: values.latitude, longitude: values.longitude }) || undefined
				: undefined,
			includeEvents: values.includeEvents === true || values.includeEvents === "true",
		};
	}

	async function resolveWeather(request = {}) {
		if (!options.weatherServiceEnabled) {
			return { contract: "ajrm-marine-weather-service-v1", contractVersion: 1, valid: false, error: "Shared weather service is disabled." };
		}
		let contextLocation = null;
		if (request.contextLocationId) {
			contextLocation = await store.get(String(request.contextLocationId).split("/").at(-1));
			if (!contextLocation) throw new Error("Weather context location was not found.");
		}
		const result = await weatherService.resolve({
			...request,
			contextLocation,
			position: request.position || representativePosition(contextLocation) || latestPosition,
		});
		latestWeather = result;
		publishWeather(withoutLargeSeries(result));
		return result;
	}

	function withoutLargeSeries(value) {
		if (!value || typeof value !== "object") return value;
		const { hourly, events, ...compact } = value;
		return compact;
	}

	function publishTideMetadata() {
		app.handleMessage?.(plugin.id, {
			updates: [{
				meta: [{
					path: TIDE_PATH,
					value: { description: "Selected tidal port, provenance, freshness, extremes and derived current height." },
				}],
			}],
		});
	}

	function publishAnchoringMetadata() {
		app.handleMessage?.(plugin.id, {
			updates: [{ meta: [{ path: ANCHORING_PATH, value: {
				description: "Stationary-at-location evidence, Anchored-profile suggestion and skipper/automation action provenance.",
			} }] }],
		});
	}

	function publishWeatherMetadata() {
		app.handleMessage?.(plugin.id, {
			updates: [{ meta: [{ path: WEATHER_PATH, value: {
				description: "Cached marine weather forecast with position, provenance and freshness. Speeds and angles use Signal K SI units.",
			} }] }],
		});
	}

	function publishTide(value) {
		const valid = value?.valid === true;
		app.handleMessage?.(plugin.id, {
			context: "vessels.self",
			updates: [{
				source: { label: plugin.id },
				timestamp: new Date().toISOString(),
				values: [
					{ path: TIDE_PATH, value },
					{ path: "environment.tide.heightNow", value: valid ? value.heightNowM : null },
					{ path: "environment.tide.heightHigh", value: valid ? value.nextHighWater?.heightM ?? null : null },
					{ path: "environment.tide.timeHigh", value: valid ? value.nextHighWater?.at ?? null : null },
					{ path: "environment.tide.heightLow", value: valid ? value.nextLowWater?.heightM ?? null : null },
					{ path: "environment.tide.timeLow", value: valid ? value.nextLowWater?.at ?? null : null },
				],
			}],
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

	function publishWeather(value) {
		app.handleMessage?.(plugin.id, {
			context: "vessels.self",
			updates: [{
				source: { label: plugin.id },
				timestamp: new Date().toISOString(),
				values: [{ path: WEATHER_PATH, value }],
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
