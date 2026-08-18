/**
 * Selects a prediction-capable tidal port from versioned locations without
 * fetching data; manual pins override but do not conceal the automatic choice.
 */

const { nearestLocations, representativePosition } = require("./location-model.cjs");

const LOCATION_REF_PREFIX = "/resources/locations/";
const PREDICTION_PORT_TYPES = new Set(["tidalStandardPort", "tidalSecondaryPort"]);

function referenceId(reference) {
	const value = String(reference || "");
	return value.startsWith(LOCATION_REF_PREFIX) ? value.slice(LOCATION_REF_PREFIX.length) : "";
}

function isPredictionPort(location) {
	const tide = location?.properties?.tide;
	const correctedSecondary = location?.types?.includes("tidalSecondaryPort") &&
		["ajrm-secondary-port-corrections-v2", "ajrm-secondary-port-corrections-v3", "ajrm-secondary-port-corrections-v4"].includes(tide?.secondaryPortCorrections?.contract) &&
		Boolean(tide.parentLocationRef);
	return Boolean(
		location?.types?.some((type) => PREDICTION_PORT_TYPES.has(type)) &&
		((tide?.providerId && tide?.stationId) || correctedSecondary),
	);
}

function pointInRing(position, ring) {
	let inside = false;
	for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
		const [x1, y1] = ring[index];
		const [x2, y2] = ring[previous];
		const crosses = (y1 > position.latitude) !== (y2 > position.latitude) &&
			position.longitude < ((x2 - x1) * (position.latitude - y1)) / (y2 - y1) + x1;
		if (crosses) inside = !inside;
	}
	return inside;
}

function containsPosition(location, position) {
	const geometry = location?.feature?.geometry;
	return geometry?.type === "Polygon" && pointInRing(position, geometry.coordinates[0]);
}

function containingLocations(locations, position) {
	if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) return [];
	return locations.filter((location) => containsPosition(location, position));
}

function polygonArea(location) {
	const ring = location?.feature?.geometry?.coordinates?.[0] || [];
	let twiceArea = 0;
	for (let index = 0; index < ring.length - 1; index += 1) {
		twiceArea += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
	}
	return Math.abs(twiceArea) / 2;
}

function tidalRegionDepth(region, byId, visited = new Set()) {
	if (!region?.id || visited.has(region.id)) return 0;
	const parent = byId.get(referenceId(region.properties?.tideRegionRef));
	if (!parent?.types?.includes("tidalRegion")) return 0;
	return 1 + tidalRegionDepth(parent, byId, new Set(visited).add(region.id));
}

/** Most deeply nested region wins; geometry area resolves unlinked overlaps. */
function containingTidalRegions(locations, position) {
	const byId = new Map(locations.map((location) => [location.id, location]));
	return containingLocations(locations, position)
		.filter((location) => location.types.includes("tidalRegion"))
		.sort((left, right) =>
			tidalRegionDepth(right, byId) - tidalRegionDepth(left, byId) ||
			polygonArea(left) - polygonArea(right));
}

function portsForRegion(locations, tidalRegion, typePredicate = isPredictionPort) {
	const regionReference = `${LOCATION_REF_PREFIX}${tidalRegion.id}`;
	return locations.filter((location) => {
		if (!typePredicate(location)) return false;
		if (location.properties?.tideRegionRef === regionReference) return true;
		if (location.properties?.tideRegionRef) return false;
		const locationPosition = representativePosition(location);
		return Boolean(locationPosition && containsPosition(tidalRegion, locationPosition));
	});
}

/**
 * Finds the closest usable secondary port in the vessel's containing tidal
 * region. Explicit region links win; unlinked legacy records are accepted
 * when their own geometry lies in that same region.
 */
function nearestSecondaryPort(locations, { position } = {}) {
	const regions = containingTidalRegions(locations, position);
	if (!regions.length) return { port: null, tidalRegion: null, reason: "outsideTidalRegion" };
	for (const tidalRegion of regions) {
		const eligible = portsForRegion(locations, tidalRegion, (location) =>
			location.types?.includes("tidalSecondaryPort") && isPredictionPort(location));
		const port = nearestLocations(eligible, position, { limit: 1 })[0] || null;
		if (!port) continue;
		return {
			port,
			tidalRegion,
			reason: "nearestSecondaryPortInTidalRegion",
			distanceM: port.distanceM ?? null,
		};
	}
	return {
		port: null,
		tidalRegion: regions[0],
		reason: "noSecondaryPortInTidalRegion",
		distanceM: null,
	};
}

function candidateFromReference(reference, byId) {
	const location = byId.get(referenceId(reference));
	return isPredictionPort(location) ? location : null;
}

function automaticSelection(locations, { position, contextLocationId } = {}) {
	const byId = new Map(locations.map((location) => [location.id, location]));
	const context = byId.get(contextLocationId) || null;

	const tidalRegions = containingTidalRegions(locations, position);
	for (const tidalRegion of tidalRegions) {
		const assigned = candidateFromReference(tidalRegion.properties?.tideLocationRef, byId);
		if (assigned) {
			return { port: assigned, reason: "containingRegionAssignment", contextLocation: context || null, tidalRegion };
		}
		const eligible = portsForRegion(locations, tidalRegion);
		const nearest = position ? nearestLocations(eligible, position, { limit: 1 })[0] : null;
		if (nearest) {
			return { port: nearest, reason: "nearestPortInTidalRegion", contextLocation: context || null, tidalRegion };
		}
	}

	return { port: null, reason: "none", contextLocation: context || null, tidalRegion: tidalRegions[0] || null };
}

function selectTidePort(locations, options = {}) {
	const automatic = automaticSelection(locations, options);
	const requested = options.portId
		? locations.find((location) => location.id === options.portId && isPredictionPort(location))
		: null;
	const pinned = options.pinnedPortId
		? locations.find((location) => location.id === options.pinnedPortId && isPredictionPort(location))
		: null;
	return {
		port: requested || pinned || automatic.port,
		reason: requested ? "explicitRequestedPort" : pinned ? "manualPinnedOverride" : automatic.reason,
		requestedPortId: options.portId || null,
		requestValid: !options.portId || Boolean(requested),
		pinned: Boolean(pinned),
		requestedPinnedPortId: options.pinnedPortId || null,
		pinValid: !options.pinnedPortId || Boolean(pinned),
		automaticPort: automatic.port,
		automaticReason: automatic.reason,
		contextLocation: automatic.contextLocation,
		tidalRegion: automatic.tidalRegion,
	};
}

module.exports = {
	LOCATION_REF_PREFIX,
	containingTidalRegions,
	containsPosition,
	isPredictionPort,
	nearestSecondaryPort,
	selectTidePort,
};
