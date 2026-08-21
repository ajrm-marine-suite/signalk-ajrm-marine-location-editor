/**
 * Defines and validates the versioned AJRM marine-location contract and its spatial helpers.
 */

const crypto = require("node:crypto");
const {
	CONTRACT_V4: SECONDARY_PORT_CORRECTION_CONTRACT,
	migrateSecondaryPortCorrections,
} = require("./secondary-port-corrections.cjs");

const CATALOG_SCHEMA = "org.ajrm.marine.locations";
const CATALOG_SCHEMA_VERSION = 1;
const LOCATION_SCHEMA = "org.ajrm.marine.location/v1";
const RESOURCE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LOCATION_TYPES = Object.freeze([
	"harbour",
	"anchorage",
	"mooring",
	"marina",
	"tidalStandardPort",
	"tidalSecondaryPort",
	"tidalObservationStation",
	"tidalRegion",
	"tidalGate",
	"hazard",
	"avoidanceArea",
	"noAnchoringArea",
	"waitingArea",
	"preferredChannel",
	"pointOfInterest",
]);

const WORKSPACES = Object.freeze({
	places: ["harbour", "anchorage", "mooring", "marina", "pointOfInterest"],
	tides: ["tidalStandardPort", "tidalSecondaryPort", "tidalObservationStation", "tidalRegion", "tidalGate"],
	hazards: ["hazard", "avoidanceArea", "noAnchoringArea", "waitingArea", "preferredChannel"],
	all: LOCATION_TYPES,
});

const HAZARD_SEVERITIES = Object.freeze([
	"advisory",
	"caution",
	"danger",
	"prohibited",
]);

const HAZARD_APPLICATIONS = Object.freeze([
	"display",
	"routePlanning",
	"proximityWarning",
	"anchorPlanning",
]);

const PROVENANCE_REVIEW_STATUSES = Object.freeze([
	"imported",
	"sourceChecked",
	"onboardVerified",
]);

const SECONDARY_PORT_PREDICTION_SOURCES = Object.freeze([
	"enteredCorrections",
	"ukhoTidalEvents",
]);

function isResourceId(value) {
	return RESOURCE_ID_PATTERN.test(String(value || ""));
}

function assertText(value, label, { required = false, max = 1000 } = {}) {
	if (value == null || value === "") {
		if (required) throw new Error(`${label} is required.`);
		return;
	}
	if (typeof value !== "string" || value.trim().length > max) {
		throw new Error(`${label} must be text no longer than ${max} characters.`);
	}
}

function assertReference(value, label) {
	if (!value) return;
	if (typeof value !== "string" || !/\/resources\/(?:locations|regions)\/[0-9a-f-]+$/i.test(value)) {
		throw new Error(`${label} must reference a locations or regions resource.`);
	}
	const id = value.split("/").at(-1);
	if (!isResourceId(id)) throw new Error(`${label} does not contain a valid UUID.`);
}

function validatePosition(position, label) {
	if (!Array.isArray(position) || position.length < 2) {
		throw new Error(`${label} must contain longitude and latitude.`);
	}
	const longitude = Number(position[0]);
	const latitude = Number(position[1]);
	if (
		!Number.isFinite(longitude) ||
		!Number.isFinite(latitude) ||
		longitude < -180 ||
		longitude > 180 ||
		latitude < -90 ||
		latitude > 90
	) {
		throw new Error(`${label} contains an invalid longitude/latitude.`);
	}
}

function validateRing(ring, label) {
	if (!Array.isArray(ring) || ring.length < 4) {
		throw new Error(`${label} needs at least three points and a closing point.`);
	}
	ring.forEach((position, index) => validatePosition(position, `${label} point ${index + 1}`));
	const first = ring[0];
	const last = ring.at(-1);
	if (Number(first[0]) !== Number(last[0]) || Number(first[1]) !== Number(last[1])) {
		throw new Error(`${label} must be closed.`);
	}
}

function validateGeometry(geometry) {
	if (!geometry || typeof geometry !== "object") {
		throw new Error("Location geometry is required.");
	}
	if (geometry.type === "Point") {
		validatePosition(geometry.coordinates, "Point geometry");
		return;
	}
	if (geometry.type === "Polygon") {
		if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
			throw new Error("Polygon geometry has no rings.");
		}
		if (geometry.coordinates.length !== 1) {
			throw new Error("Location polygons currently support one outer ring and no holes.");
		}
		geometry.coordinates.forEach((ring, index) => validateRing(ring, `Polygon ring ${index + 1}`));
		return;
	}
	throw new Error("Location geometry must be Point or Polygon.");
}

function validateNumber(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
	if (value == null || value === "") return;
	if (!Number.isFinite(Number(value)) || Number(value) < minimum || Number(value) > maximum) {
		const range = Number.isFinite(minimum) && Number.isFinite(maximum)
			? ` between ${minimum} and ${maximum}`
			: Number.isFinite(minimum) ? ` at least ${minimum}` : Number.isFinite(maximum) ? ` at most ${maximum}` : "";
		throw new Error(`${label} must be a number${range}.`);
	}
}

function validateLocation(location) {
	if (!location || typeof location !== "object" || Array.isArray(location)) {
		throw new Error("Invalid location entry.");
	}
	if (!isResourceId(location.id)) throw new Error("Location id must be a UUIDv4.");
	assertText(location.name, "Location name", { required: true, max: 200 });
	assertText(location.description, "Description", { max: 4000 });
	if (!Array.isArray(location.types) || location.types.length === 0) {
		throw new Error("Select at least one location type.");
	}
	if (new Set(location.types).size !== location.types.length) {
		throw new Error("Location types must not contain duplicates.");
	}
	for (const type of location.types) {
		if (!LOCATION_TYPES.includes(type)) throw new Error(`Unknown location type: ${type}.`);
	}
	if (location.feature?.type !== "Feature") throw new Error("Location feature must be GeoJSON Feature.");
	validateGeometry(location.feature.geometry);
	if (location.types.includes("tidalRegion") && location.feature.geometry.type !== "Polygon") {
		throw new Error("A tidal region must use an area, not a point.");
	}
	const properties = location.properties;
	if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
		throw new Error("Location properties are required.");
	}
	if (properties.schema !== LOCATION_SCHEMA) {
		throw new Error(`Location properties.schema must be ${LOCATION_SCHEMA}.`);
	}
	if (properties.automaticProfileArea != null && typeof properties.automaticProfileArea !== "boolean") {
		throw new Error("automaticProfileArea must be true or false.");
	}
	if (properties.automaticProfileArea && location.feature.geometry.type !== "Polygon") {
		throw new Error("Automatic Harbour profile regions must use an area, not a point.");
	}
	if (
		properties.automaticProfileArea &&
		!location.types.some((type) => ["harbour", "anchorage", "mooring", "marina"].includes(type))
	) {
		throw new Error("Only a harbour, anchorage, mooring or marina can switch to the Harbour profile.");
	}
	assertReference(properties.tideLocationRef, "Tide location reference");
	assertReference(properties.tideRegionRef, "Tidal region reference");
	if (properties.tideLocationRef && !location.types.includes("tidalRegion")) {
		throw new Error("Only a tidal region can assign a prediction port.");
	}
	if (properties.tideLocationRef?.endsWith(`/${location.id}`)) {
		throw new Error("A location cannot use itself as its tidal location.");
	}
	if (properties.tideRegionRef?.endsWith(`/${location.id}`)) {
		throw new Error("A location cannot assign itself as its tidal region.");
	}
	if (properties.tide != null) {
		if (typeof properties.tide !== "object" || Array.isArray(properties.tide)) {
			throw new Error("Tide details must be an object.");
		}
		assertText(properties.tide.provider, "Tide provider", { max: 100 });
		assertText(properties.tide.providerId, "Tide provider identifier", { max: 100 });
		assertText(properties.tide.stationId, "Tide station id", { max: 200 });
		assertText(properties.tide.stationName, "Tide station name", { max: 200 });
		if (
			properties.tide.predictionSource != null &&
			!SECONDARY_PORT_PREDICTION_SOURCES.includes(properties.tide.predictionSource)
		) {
			throw new Error("Secondary-port prediction source is invalid.");
		}
		assertReference(properties.tide.parentLocationRef, "Parent tidal location reference");
		assertText(properties.tide.datum, "Tide datum", { max: 100 });
		if (properties.tide.referenceLevels != null) {
			if (typeof properties.tide.referenceLevels !== "object" || Array.isArray(properties.tide.referenceLevels)) {
				throw new Error("Tide reference levels must be an object.");
			}
			for (const [key, label] of [["mhws", "MHWS"], ["mhwn", "MHWN"], ["mlwn", "MLWN"], ["mlws", "MLWS"]]) {
				validateNumber(properties.tide.referenceLevels[key], `${label} reference level`, { minimum: -100, maximum: 100 });
			}
		}
		if (properties.tide.secondaryPortCorrections != null) {
			const corrections = properties.tide.secondaryPortCorrections;
			if (typeof corrections !== "object" || Array.isArray(corrections)) {
				throw new Error("Secondary-port corrections must be an object.");
			}
			if (corrections.contract !== SECONDARY_PORT_CORRECTION_CONTRACT) {
				throw new Error("Secondary-port corrections use an unsupported contract.");
			}
			if (![720, 1440].includes(Number(corrections.timeOffsetPeriodMinutes))) {
				throw new Error("Secondary-port correction period must be 720 or 1440 minutes.");
			}
			const periodMinutes = Number(corrections.timeOffsetPeriodMinutes);
			for (const [groupKey, label] of [
				["highWaterTimeOffsets", "HW time correction"],
				["lowWaterTimeOffsets", "LW time correction"],
			]) {
				const group = corrections[groupKey];
				if (!Array.isArray(group) || group.length < 1 || group.length > 12) {
					throw new Error(`${label} needs between 1 and 12 explicit reference-time points.`);
				}
				const times = new Set();
				for (const [index, point] of group.entries()) {
					if (!point || typeof point !== "object" || Array.isArray(point)) throw new Error(`${label} point ${index + 1} is invalid.`);
					validateNumber(point.referenceTimeMinutes, `${label} point ${index + 1} reference time`, { minimum: 0, maximum: 1439 });
					validateNumber(point.offsetMinutes, `${label} point ${index + 1} offset`, { minimum: -1440, maximum: 1440 });
					if (!Number.isInteger(Number(point.referenceTimeMinutes))) throw new Error(`${label} reference times must use whole minutes.`);
					const cycleTime = Number(point.referenceTimeMinutes) % periodMinutes;
					if (times.has(cycleTime)) throw new Error(`${label} reference times must be unique within their correction cycle.`);
					times.add(cycleTime);
				}
			}
			for (const [groupKey, label, keys, minimum, maximum] of [
				["heightDifferencesM", "Height correction", ["mhws", "mhwn", "mlwn", "mlws"], -20, 20],
			]) {
				const group = corrections[groupKey];
				if (!group || typeof group !== "object" || Array.isArray(group)) throw new Error(`${label} values are required.`);
				for (const key of keys) {
					if (group[key] == null || group[key] === "") throw new Error(`${label} ${key} is required; use zero where there is no correction.`);
					validateNumber(group[key], `${label} ${key}`, { minimum, maximum });
				}
			}
			assertText(corrections.notes, "Secondary-port correction notes", { max: 4000 });
			assertText(corrections.legacyId, "Secondary-port legacy id", { max: 100 });
			assertText(corrections.standardPortName, "Secondary-port standard port name", { max: 200 });
			assertText(corrections.migratedFromContract, "Migrated correction contract", { max: 100 });
		}
	}
	if (location.types.includes("tidalSecondaryPort")) {
		const tide = properties.tide || {};
		if (!SECONDARY_PORT_PREDICTION_SOURCES.includes(tide.predictionSource)) {
			throw new Error("A secondary port needs an explicit prediction source.");
		}
		if (tide.predictionSource === "enteredCorrections") {
			if (!tide.secondaryPortCorrections && tide.secondaryPortSourceData?.status !== "incomplete") {
				throw new Error("Entered secondary-port data are required.");
			}
			if (!tide.parentLocationRef && !tide.secondaryPortCorrections?.standardPortName) {
				throw new Error("A secondary port using entered data needs a parent standard port.");
			}
			if (tide.providerId || tide.stationId) {
				throw new Error("An entered-data secondary port must not also select an API station.");
			}
		}
		if (tide.predictionSource === "ukhoTidalEvents") {
			if (tide.providerId !== "ukhoTidalEvents" || !tide.stationId) {
				throw new Error("An Admiralty API secondary port needs a UKHO station identifier.");
			}
			if (tide.secondaryPortCorrections || tide.parentLocationRef) {
				throw new Error("An Admiralty API secondary port must not also contain entered corrections.");
			}
		}
	}
	if (properties.tidalGate != null) {
		const gate = properties.tidalGate;
		if (!location.types.includes("tidalGate") || typeof gate !== "object" || Array.isArray(gate)) {
			throw new Error("Tidal-gate constants require the tidalGate location type.");
		}
		if (gate.contract !== "ajrm-tidal-gate-constants-v1") throw new Error("Tidal-gate constants use an unsupported contract.");
		assertReference(gate.standardPortRef, "Tidal-gate standard-port reference");
		assertText(gate.floodSet, "Flood set", { max: 20 });
		assertText(gate.ebbSet, "Ebb set", { max: 20 });
		assertText(gate.source, "Tidal-gate source", { max: 4000 });
		for (const [key, label] of [["springPeakFlowKnots", "Spring peak flow"], ["neapPeakFlowKnots", "Neap peak flow"]]) {
			if (gate[key] != null) validateNumber(gate[key], label, { minimum: 0, maximum: 30 });
		}
		for (const key of ["floodSpringAfter", "floodNeapAfter", "floodSpringSlack", "floodNeapSlack", "ebbSpringAfter", "ebbNeapAfter", "ebbSpringSlack", "ebbNeapSlack"]) {
			assertText(gate[key], key, { max: 20 });
			if (gate[key] && !/^-?\d{1,3}:\d{2}:\d{2}$/.test(gate[key])) throw new Error(`${key} must use h:mm:ss.`);
		}
	}
	if (properties.anchorage != null) {
		if (typeof properties.anchorage !== "object" || Array.isArray(properties.anchorage)) {
			throw new Error("Anchorage details must be an object.");
		}
		assertText(properties.anchorage.seabed, "Seabed", { max: 100 });
		assertText(properties.anchorage.notes, "Anchorage notes", { max: 4000 });
		validateNumber(properties.anchorage.chartedDepthM, "Charted depth", { minimum: 0 });
		validateNumber(properties.anchorage.detectionRadiusM, "Anchoring detection radius", { minimum: 10 });
		if (properties.anchorage.trustedAutomation != null && typeof properties.anchorage.trustedAutomation !== "boolean") {
			throw new Error("Trusted anchoring automation must be true or false.");
		}
	}
	if (properties.hazard != null) {
		if (typeof properties.hazard !== "object" || Array.isArray(properties.hazard)) {
			throw new Error("Hazard details must be an object.");
		}
		if (
			properties.hazard.severity &&
			!HAZARD_SEVERITIES.includes(properties.hazard.severity)
		) {
			throw new Error("Hazard severity is invalid.");
		}
		assertText(properties.hazard.reason, "Hazard reason", { max: 2000 });
		validateNumber(properties.hazard.clearanceM, "Hazard clearance", { minimum: 0 });
		if (properties.hazard.appliesTo != null) {
			if (!Array.isArray(properties.hazard.appliesTo)) {
				throw new Error("Hazard appliesTo must be an array.");
			}
			for (const use of properties.hazard.appliesTo) {
				if (!HAZARD_APPLICATIONS.includes(use)) {
					throw new Error(`Unknown hazard application: ${use}.`);
				}
			}
		}
	}
	if (properties.provenance != null) {
		if (typeof properties.provenance !== "object" || Array.isArray(properties.provenance)) {
			throw new Error("Provenance must be an object.");
		}
		if (
			properties.provenance.reviewStatus &&
			!PROVENANCE_REVIEW_STATUSES.includes(properties.provenance.reviewStatus)
		) {
			throw new Error("Provenance review status is invalid.");
		}
		assertText(properties.provenance.warning, "Provenance warning", { max: 2000 });
		if (!Array.isArray(properties.provenance.sources) || properties.provenance.sources.length === 0) {
			throw new Error("Provenance needs at least one source.");
		}
		for (const [index, source] of properties.provenance.sources.entries()) {
			if (!source || typeof source !== "object" || Array.isArray(source)) {
				throw new Error(`Provenance source ${index + 1} must be an object.`);
			}
			assertText(source.provider, `Provenance source ${index + 1} provider`, { required: true, max: 200 });
			assertText(source.sourceId, `Provenance source ${index + 1} id`, { max: 300 });
			assertText(source.license, `Provenance source ${index + 1} licence`, { max: 100 });
			assertText(source.url, `Provenance source ${index + 1} URL`, { required: true, max: 2000 });
			try {
				const url = new URL(source.url);
				if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported protocol");
			} catch {
				throw new Error(`Provenance source ${index + 1} URL must be HTTP or HTTPS.`);
			}
			if (
				source.retrievedAt != null &&
				(typeof source.retrievedAt !== "string" || Number.isNaN(Date.parse(source.retrievedAt)))
			) {
				throw new Error(`Provenance source ${index + 1} retrieval time must be an ISO timestamp.`);
			}
		}
	}
	if (location.revision != null && (!Number.isInteger(location.revision) || location.revision < 1)) {
		throw new Error("Location revision must be a positive integer.");
	}
	for (const [label, value] of [
		["createdAt", location.createdAt],
		["updatedAt", location.updatedAt],
	]) {
		if (value != null && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) {
			throw new Error(`Location ${label} must be an ISO timestamp.`);
		}
	}
	if (location.lastEditId != null && !isResourceId(location.lastEditId)) {
		throw new Error("Location lastEditId must be a UUIDv4.");
	}
	return location;
}

function normalizeLocation(input, { preserveId = true } = {}) {
	const location = structuredClone(input || {});
	location.id = preserveId && isResourceId(location.id) ? location.id : crypto.randomUUID();
	location.name = String(location.name || "").trim();
	location.description = String(location.description || "").trim();
	location.types = [...new Set((Array.isArray(location.types) ? location.types : []).map(String))];
	location.feature = location.feature || {
		type: "Feature",
		geometry: location.geometry,
		properties: {},
	};
	location.feature.properties = location.feature.properties || {};
	location.properties = {
		...(location.properties || {}),
		schema: LOCATION_SCHEMA,
	};
	// Migrate old, structurally unambiguous secondary records onto the explicit
	// source contract. Runtime selection never guesses between mechanisms.
	if (location.types.includes("tidalSecondaryPort") && location.properties.tide) {
		const tide = location.properties.tide;
		if (!tide.predictionSource && (tide.secondaryPortCorrections || tide.secondaryPortSourceData)) tide.predictionSource = "enteredCorrections";
		if (!tide.predictionSource && tide.providerId === "ukhoTidalEvents" && tide.stationId) tide.predictionSource = "ukhoTidalEvents";
	}
	// Upgrade the former Signal K-region publication flag into the Locations
	// contract. Consumers use this explicit property directly; no region is
	// created and no name-prefix compatibility is involved.
	if (location.properties.tide?.secondaryPortCorrections) {
		location.properties.tide.secondaryPortCorrections = migrateSecondaryPortCorrections(
			location.properties.tide.secondaryPortCorrections,
		);
	}
	validateLocation(location);
	return location;
}

function emptyCatalog() {
	return {
		schema: CATALOG_SCHEMA,
		schemaVersion: CATALOG_SCHEMA_VERSION,
		catalogId: crypto.randomUUID(),
		updatedAt: new Date().toISOString(),
		locations: {},
		tombstones: {},
		history: {},
		purgedIds: [],
	};
}

function normalizeHistoryEntry(entry, locationId) {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
		throw new Error(`Location ${locationId} has an invalid history entry.`);
	}
	if (!isResourceId(entry.editId)) throw new Error(`Location ${locationId} history editId must be a UUIDv4.`);
	if (!Number.isInteger(entry.revision) || entry.revision < 1) {
		throw new Error(`Location ${locationId} history revision must be positive.`);
	}
	if (typeof entry.editedAt !== "string" || Number.isNaN(Date.parse(entry.editedAt))) {
		throw new Error(`Location ${locationId} history editedAt must be an ISO timestamp.`);
	}
	if (!["create", "update", "delete", "restore", "merge"].includes(entry.action)) {
		throw new Error(`Location ${locationId} history action is invalid.`);
	}
	if (entry.snapshot != null) {
		const snapshot = normalizeLocation(entry.snapshot);
		if (snapshot.id !== locationId) {
			throw new Error(`Location ${locationId} history contains a snapshot for another location.`);
		}
	}
	return structuredClone(entry);
}

function normalizeTombstone(tombstone, id) {
	if (!tombstone || typeof tombstone !== "object" || Array.isArray(tombstone)) {
		throw new Error(`Location ${id} has an invalid deletion tombstone.`);
	}
	const value = { ...structuredClone(tombstone), id };
	if (!isResourceId(value.id) || !isResourceId(value.lastEditId)) {
		throw new Error(`Location ${id} deletion metadata contains an invalid UUID.`);
	}
	if (!Number.isInteger(value.revision) || value.revision < 1) {
		throw new Error(`Location ${id} deletion revision must be positive.`);
	}
	if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) {
		throw new Error(`Location ${id} deletion updatedAt must be an ISO timestamp.`);
	}
	return value;
}

function normalizeCatalog(payload, { preserveIds = true } = {}) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error("Location file must contain a JSON object.");
	}
	if (payload.schema && payload.schema !== CATALOG_SCHEMA) {
		throw new Error(`Unsupported catalogue schema: ${payload.schema}.`);
	}
	if (payload.schemaVersion != null && Number(payload.schemaVersion) !== CATALOG_SCHEMA_VERSION) {
		throw new Error(`Unsupported catalogue schema version: ${payload.schemaVersion}.`);
	}
	const source = payload.locations ?? payload;
	const values = Array.isArray(source)
		? source
		: Object.entries(source).map(([id, value]) => ({ ...(value || {}), id: value?.id || id }));
	const locations = {};
	const catalogTimestamp =
		typeof payload.updatedAt === "string" && !Number.isNaN(Date.parse(payload.updatedAt))
			? payload.updatedAt
			: new Date().toISOString();
	for (const value of values) {
		const provisional = structuredClone(value || {});
		provisional.revision = Number.isInteger(provisional.revision) && provisional.revision > 0
			? provisional.revision
			: 1;
		provisional.createdAt = provisional.createdAt || provisional.updatedAt || catalogTimestamp;
		provisional.updatedAt = provisional.updatedAt || provisional.createdAt;
		provisional.lastEditId = isResourceId(provisional.lastEditId)
			? provisional.lastEditId
			: crypto.randomUUID();
		const location = normalizeLocation(provisional, { preserveId: preserveIds });
		if (locations[location.id]) throw new Error(`Duplicate location id: ${location.id}.`);
		locations[location.id] = location;
	}
	const result = {
		...emptyCatalog(),
		catalogId: isResourceId(payload.catalogId) ? payload.catalogId : crypto.randomUUID(),
		updatedAt: catalogTimestamp,
		locations,
		tombstones: {},
		history: {},
		purgedIds: [...new Set(payload.purgedIds || [])],
	};
	if (!result.purgedIds.every(isResourceId)) {
		throw new Error("Catalogue purgedIds must contain only UUIDv4 location ids.");
	}
	for (const [id, tombstone] of Object.entries(payload.tombstones || {})) {
		if (locations[id]) throw new Error(`Location ${id} is both active and deleted.`);
		result.tombstones[id] = normalizeTombstone(tombstone, id);
	}
	for (const [id, entries] of Object.entries(payload.history || {})) {
		if (!isResourceId(id) || !Array.isArray(entries)) {
			throw new Error(`Location ${id} has invalid history.`);
		}
		const normalized = entries.map((entry) => normalizeHistoryEntry(entry, id));
		if (new Set(normalized.map((entry) => entry.editId)).size !== normalized.length) {
			throw new Error(`Location ${id} history contains duplicate edit ids.`);
		}
		result.history[id] = normalized.sort((a, b) => a.revision - b.revision || a.editedAt.localeCompare(b.editedAt));
	}
	for (const id of result.purgedIds) {
		if (result.locations[id] || result.tombstones[id] || result.history[id]) {
			throw new Error(`Purged location ${id} still has catalogue data.`);
		}
	}
	for (const location of Object.values(result.locations)) {
		if (!result.history[location.id]?.length) {
			result.history[location.id] = [{
				editId: location.lastEditId,
				revision: location.revision,
				editedAt: location.updatedAt,
				editedBy: "imported",
				action: "create",
				sourceCatalogId: result.catalogId,
				snapshot: structuredClone(location),
			}];
		}
	}
	return result;
}

function locationMatchesWorkspace(location, workspace = "all") {
	const allowed = WORKSPACES[workspace] || WORKSPACES.all;
	return location.types.some((type) => allowed.includes(type));
}

function representativePosition(location) {
	const geometry = location?.feature?.geometry;
	if (geometry?.type === "Point") {
		return { longitude: Number(geometry.coordinates[0]), latitude: Number(geometry.coordinates[1]) };
	}
	const rings = geometry?.type === "Polygon" ? geometry.coordinates : [];
	const positions = rings.flat().filter((position) => Array.isArray(position) && position.length >= 2);
	if (!positions.length) return null;
	return {
		longitude: positions.reduce((sum, position) => sum + Number(position[0]), 0) / positions.length,
		latitude: positions.reduce((sum, position) => sum + Number(position[1]), 0) / positions.length,
	};
}

function distanceMetres(a, b) {
	const radius = 6371008.8;
	const radians = (degrees) => (degrees * Math.PI) / 180;
	const deltaLat = radians(b.latitude - a.latitude);
	const deltaLon = radians(b.longitude - a.longitude);
	const lat1 = radians(a.latitude);
	const lat2 = radians(b.latitude);
	const value =
		Math.sin(deltaLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
	return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function nearestLocations(locations, position, options = {}) {
	validatePosition([position?.longitude, position?.latitude], "Query position");
	const requestedTypes = Array.isArray(options.types) ? options.types : [];
	const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
	const maximum = Number.isFinite(Number(options.maxDistanceM))
		? Math.max(0, Number(options.maxDistanceM))
		: Infinity;
	return locations
		.filter((location) =>
			requestedTypes.length === 0 || location.types.some((type) => requestedTypes.includes(type)),
		)
		.map((location) => {
			const locationPosition = representativePosition(location);
			return locationPosition
				? { ...location, distanceM: distanceMetres(position, locationPosition) }
				: null;
		})
		.filter((location) => location && location.distanceM <= maximum)
		.sort((a, b) => a.distanceM - b.distanceM)
		.slice(0, limit);
}

module.exports = {
	CATALOG_SCHEMA,
	CATALOG_SCHEMA_VERSION,
	HAZARD_APPLICATIONS,
	HAZARD_SEVERITIES,
	LOCATION_SCHEMA,
	LOCATION_TYPES,
	SECONDARY_PORT_PREDICTION_SOURCES,
	WORKSPACES,
	emptyCatalog,
	isResourceId,
	locationMatchesWorkspace,
	nearestLocations,
	normalizeCatalog,
	normalizeLocation,
	representativePosition,
	validateLocation,
};
