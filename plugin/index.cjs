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
const { prepareLocationImport } = require("./harbour-editor-import.cjs");
const { createUkhoTideProvider } = require("./tide-provider.cjs");
const { createTideResolver } = require("./tide-resolver.cjs");

const STATUS_CONTRACT = "ajrm-marine-location-editor-status-v1";
const STATUS_PATH = "plugins.ajrmMarineLocationEditor";
const TIDE_PATH = "plugins.ajrmMarineLocations.tide";
const MAX_IMPORT_LOCATIONS = 10000;

const packageJson = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);
const bundledWestScotlandSeed = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "defaults", "west-scotland-locations.json"), "utf8"),
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
	let tideDebounce = null;
	let tideResolution = null;
	let latestPosition = null;
	let latestTide = null;
	let options = {};
	const dataDirectory = app.getDataDirPath?.() || path.join(process.cwd(), ".ajrm-location-editor");
	const store = createLocationStore(path.join(dataDirectory, "locations.json"));
	let tideResolver = null;
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
		},
	};
	plugin.getOpenApi = () => openApi;

	plugin.start = (configured = {}) => {
		if (running) return;
		running = true;
		options = {
			tideResolverEnabled: configured.tideResolverEnabled !== false,
			ukhoApiKey: configured.ukhoApiKey || process.env.UKHO_API_KEY || "",
			ukhoSubscriptionTier: configured.ukhoSubscriptionTier || "discovery",
			tideRefreshHours: Number(configured.tideRefreshHours) || 24,
			tideExpiresHours: Number(configured.tideExpiresHours) || 72,
		};
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
		});
		app.ajrmMarineTides = Object.freeze({
			contract: "ajrm-marine-tides-service-v1",
			status: async (request = {}) => resolveTide(request),
			pin: async (portId) => {
				await tideResolver.setPinnedPort(portId);
				return resolveTide({ force: false });
			},
			refresh: async () => resolveTide({ force: true }),
		});
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
		clearTimeout(tideDebounce);
		for (const unsubscribe of unsubscribes.splice(0)) unsubscribe?.();
		await Promise.allSettled([...pendingOperations]);
		delete app.ajrmMarineLocations;
		delete app.ajrmMarineTides;
		updateStatus({ enabled: false });
		publishStatus(null);
		publishTide(null);
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
				res.json(await resolveTide({
					contextLocationId: req.query?.locationId || undefined,
				}));
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		});

		router.post("/tides/pin", write(async (req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				const portId = req.body?.portId || null;
				if (portId && !isResourceId(portId)) throw new Error("Pinned tidal port id must be a UUIDv4.");
				await tideResolver.setPinnedPort(portId);
				res.json(await resolveTide());
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		}));

		router.post("/tides/refresh", write(async (_req, res) => {
			try {
				assertRunning();
				await initializationPromise;
				res.json(await resolveTide({ force: true }));
			} catch (error) {
				res.status(400).json({ error: error.message });
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
				const previous = await store.get(req.params.id);
				const location = normalizeLocation({ ...body, id: req.params.id });
				await assertReferencesExist(location);
				await assertUniqueLocationName(location);
				const saved = await store.set(req.params.id, location, {
					expectedRevision,
					editedBy: requestActor(req),
				});
				await publishHarbourChange(saved, previous);
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
				const previous = await store.get(req.params.id);
				const removed = await store.remove(req.params.id, {
					expectedRevision: req.body?.expectedRevision ?? req.query?.expectedRevision,
					editedBy: requestActor(req),
				});
				if (!removed) return res.status(404).json({ error: "Location was not found." });
				if (previous?.properties.publishAsHarbourRegion) {
					await app.resourcesApi?.deleteResource("regions", req.params.id);
				}
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
				await publishHarbourChange(location, null);
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
				await reconcileHarbourRegions();
				await refreshStatus();
				res.json({
					ok: true,
					imported: count,
					replaced: previous,
					format: prepared.format,
					converted: prepared.converted,
					log: [
						...(prepared.converted ? [`Converted ${prepared.converted} Harbour Editor region(s) to versioned locations.`] : []),
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
				const result = prepared.format === "harbour-editor-v1"
					? await store.mergeHarboursByName(incoming, {
						validate: validateCatalogReferences,
						editedBy: "Harbour Editor merge",
					})
					: await store.merge(incoming, { validate: validateCatalogReferences });
				await reconcileHarbourRegions();
				await refreshStatus();
				res.json({
					ok: result.conflicts.length === 0,
					added: result.added,
					updated: result.updated,
					keptLocal: result.keptLocal,
					conflicts: result.conflicts,
					format: prepared.format,
					converted: prepared.converted,
					matchedByName: result.matchedByName || 0,
					deduplicated: result.deduplicated || 0,
					log: [
						...(prepared.converted ? [`Converted ${prepared.converted} Harbour Editor region(s) to versioned locations.`] : []),
						...(result.matchedByName ? [`Matched ${result.matchedByName} harbour(s) by name.`] : []),
						...(result.deduplicated ? [`Removed ${result.deduplicated} duplicate harbour record(s).`] : []),
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
		for (const [label, reference, allowedTypes] of [
			["Tidal location", location.properties.tideLocationRef, ["tidalStandardPort", "tidalSecondaryPort"]],
			["Tidal region", location.properties.tideRegionRef, ["tidalRegion"]],
			["Parent tidal location", location.properties.tide?.parentLocationRef, ["tidalStandardPort"]],
		]) {
			if (!reference) continue;
			const id = reference.split("/").at(-1);
			const target = locations.get(id);
			if (!target) throw new Error(`${label} reference does not exist in this catalogue.`);
			if (!target.types.some((type) => allowedTypes.includes(type))) {
				throw new Error(`${label} reference points to an incompatible location type.`);
			}
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
		let migrated = [];
		if (app.resourcesApi) {
			const resources = normalizeResources(await app.resourcesApi.listResources("regions", {}));
			const candidates = resources.filter(isHarbourRegion).map(legacyHarbourLocation);
			migrated = await store.addMissing(candidates, {
				editedBy: "Automatic Harbour Editor migration",
			});
		}
		const seeded = await addBundledLocations();
		await reconcileHarbourRegions();
		app.debug?.(
			`[${plugin.id}] Migrated ${migrated.length} Harbour region(s) and added ${seeded.length} bundled West Scotland location(s).`,
		);
		return { migrated: migrated.length, seeded: seeded.length };
	}

	async function addBundledLocations() {
		if (
			bundledWestScotlandSeed?.schema !== "org.ajrm.marine.location-seed/v1" ||
			!Array.isArray(bundledWestScotlandSeed.locations)
		) {
			throw new Error("Bundled West Scotland location seed is invalid.");
		}
		const current = await store.list();
		const bySource = new Map();
		for (const location of current) {
			for (const source of locationSourceKeys(location)) bySource.set(source, location);
		}
		const candidates = [];
		for (const value of bundledWestScotlandSeed.locations) {
			const seed = normalizeLocation(value);
			const sourceMatch = locationSourceKeys(seed).map((key) => bySource.get(key)).find(Boolean);
			if (sourceMatch) {
				await enrichUneditedMigration(sourceMatch, seed);
				continue;
			}
			const nearbyMatch = current.find((location) => locationsDescribeSamePlace(location, seed));
			if (nearbyMatch) {
				await enrichUneditedMigration(nearbyMatch, seed);
				continue;
			}
			candidates.push(seed);
		}
		return store.addMissing(candidates, { editedBy: "Bundled West Scotland open-data seed" });
	}

	function locationSourceKeys(location) {
		const values = [
			location.feature?.properties?.["ajrmMarine:sourceRef"],
			...(location.properties?.provenance?.sources || []).map((source) => source.sourceId),
		];
		return [...new Set(values.filter(Boolean).map((value) => String(value).replace(/^openstreetmap:/i, "")))];
	}

	function locationsDescribeSamePlace(left, right) {
		if (normalizedLocationName(left.name) !== normalizedLocationName(right.name)) return false;
		const sharesType = left.types.some((type) => right.types.includes(type));
		const upgradesMigratedHarbour =
			left.properties.migratedFromSignalKRegion === true &&
			left.types.includes("harbour") &&
			right.types.some((type) => type !== "harbour");
		if (!sharesType && !upgradesMigratedHarbour) return false;
		const a = representativePosition(left);
		const b = representativePosition(right);
		if (!a || !b) return false;
		const latitudeM = (a.latitude - b.latitude) * 111320;
		const longitudeM = (a.longitude - b.longitude) * 111320 * Math.cos((a.latitude + b.latitude) * Math.PI / 360);
		return Math.hypot(latitudeM, longitudeM) <= 500;
	}

	async function enrichUneditedMigration(current, seed) {
		if (!current.properties.migratedFromSignalKRegion || current.revision !== 1) return;
		const seedSpecificTypes = seed.types.filter((type) => type !== "harbour");
		const types = current.types.includes("harbour") && seedSpecificTypes.length
			? [...new Set(current.types.filter((type) => type !== "harbour").concat(seedSpecificTypes))]
			: current.types;
		const provenance = current.properties.provenance || seed.properties.provenance;
		if (types === current.types && current.properties.provenance) return;
		const saved = await store.set(current.id, {
			...current,
			types,
			properties: { ...current.properties, provenance },
		}, {
			expectedRevision: current.revision,
			editedBy: "Bundled open-data classification",
		});
		await publishHarbourChange(saved, current);
	}

	function legacyHarbourLocation(region) {
		const declaredType = String(region.feature?.properties?.["ajrmMarine:type"] || "harbour");
		const type = ["harbour", "anchorage", "mooring", "marina"].includes(declaredType)
			? declaredType
			: "harbour";
		return normalizeLocation({
			id: region.id,
			name: String(region.name || "").replace(/^Harbour:\s*/i, "").trim(),
			description: region.description || "",
			types: [type],
			feature: structuredClone(region.feature),
			properties: {
				publishAsHarbourRegion: true,
				migratedFromSignalKRegion: true,
			},
		});
	}

	function harbourResource(location) {
		return {
			name: `Harbour: ${location.name}`,
			description: location.description || "Harbour profile region managed by AJRM Marine Location Editor.",
			feature: structuredClone(location.feature),
		};
	}

	function harbourResourcesEqual(existing, expected) {
		return (
			existing?.name === expected.name &&
			String(existing?.description || "") === String(expected.description || "") &&
			JSON.stringify(existing?.feature) === JSON.stringify(expected.feature)
		);
	}

	async function publishHarbourChange(location, previous) {
		if (!app.resourcesApi) return;
		if (location.properties.publishAsHarbourRegion) {
			await app.resourcesApi.setResource("regions", location.id, harbourResource(location));
		} else if (previous?.properties.publishAsHarbourRegion) {
			await app.resourcesApi.deleteResource("regions", location.id);
		}
	}

	async function reconcileHarbourRegions() {
		if (!app.resourcesApi) return;
		const locations = await store.list();
		const desired = new Map(
			locations
				.filter((location) => location.properties.publishAsHarbourRegion)
				.map((location) => [location.id, location]),
		);
		const existing = normalizeResources(await app.resourcesApi.listResources("regions", {}))
			.filter(isHarbourRegion);
		const existingById = new Map(existing.map((region) => [region.id, region]));
		for (const location of desired.values()) {
			const expected = harbourResource(location);
			if (!harbourResourcesEqual(existingById.get(location.id), expected)) {
				await app.resourcesApi.setResource("regions", location.id, expected);
			}
		}
		for (const region of existing) {
			if (!desired.has(region.id)) await app.resourcesApi.deleteResource("regions", region.id);
		}
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
			harbourRegionCount: locations.filter(
				(location) => location.properties.publishAsHarbourRegion,
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
		publishTideMetadata();
		if (app.subscriptionmanager?.subscribe) {
			app.subscriptionmanager.subscribe(
				{
					context: "vessels.self",
					subscribe: [{ path: "navigation.position", policy: "instant", format: "delta" }],
				},
				unsubscribes,
				(error) => app.error?.(`[${plugin.id}] tide position subscription error: ${error}`),
				handlePositionDelta,
			);
		}
		tideTimer = setInterval(() => scheduleTideResolution(), 5 * 60 * 1000);
		tideTimer.unref?.();
		scheduleTideResolution(0);
	}

	function normalizePosition(value) {
		const latitude = Number(value?.latitude);
		const longitude = Number(value?.longitude);
		return Number.isFinite(latitude) && Number.isFinite(longitude) &&
			latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
			? { latitude, longitude }
			: null;
	}

	function handlePositionDelta(delta) {
		for (const update of delta?.updates || []) {
			for (const value of update.values || []) {
				if (value.path !== "navigation.position") continue;
				latestPosition = normalizePosition(value.value);
				scheduleTideResolution();
			}
		}
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
		const result = request.force || request.contextLocationId
			? await execute()
			: await (tideResolution || (tideResolution = execute().finally(() => { tideResolution = null; })));
		latestTide = result;
		publishTide(result);
		return result;
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
