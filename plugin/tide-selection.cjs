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
		tide?.secondaryPortCorrections?.contract === "ajrm-secondary-port-corrections-v2" &&
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

/**
 * Finds the closest usable secondary port in the vessel's containing tidal
 * region. Explicit region links win; unlinked legacy records are accepted
 * when their own geometry lies in that same region.
 */
function nearestSecondaryPort(locations, { position } = {}) {
	const tidalRegion = containingLocations(locations, position)
		.find((location) => location.types.includes("tidalRegion")) || null;
	if (!tidalRegion) return { port: null, tidalRegion: null, reason: "outsideTidalRegion" };
	const regionReference = `${LOCATION_REF_PREFIX}${tidalRegion.id}`;
	const eligible = locations.filter((location) => {
		if (!location.types?.includes("tidalSecondaryPort") || !isPredictionPort(location)) return false;
		if (location.properties?.tideRegionRef === regionReference) return true;
		if (location.properties?.tideRegionRef) return false;
		const locationPosition = representativePosition(location);
		return Boolean(locationPosition && containsPosition(tidalRegion, locationPosition));
	});
	const port = nearestLocations(eligible, position, { limit: 1 })[0] || null;
	return {
		port,
		tidalRegion,
		reason: port ? "nearestSecondaryPortInTidalRegion" : "noSecondaryPortInTidalRegion",
		distanceM: port?.distanceM ?? null,
	};
}

function candidateFromReference(reference, byId) {
	const location = byId.get(referenceId(reference));
	return isPredictionPort(location) ? location : null;
}

function automaticSelection(locations, { position, contextLocationId } = {}) {
	const byId = new Map(locations.map((location) => [location.id, location]));
	const containing = containingLocations(locations, position);
	const context = byId.get(contextLocationId) ||
		containing.find((location) => location.properties?.tideLocationRef && !location.types.includes("tidalRegion"));
	const explicit = candidateFromReference(context?.properties?.tideLocationRef, byId);
	if (explicit) {
		return { port: explicit, reason: "explicitTideLocationRef", contextLocation: context, tidalRegion: null };
	}

	const tidalRegion = containing.find((location) => location.types.includes("tidalRegion")) || null;
	const assigned = candidateFromReference(tidalRegion?.properties?.tideLocationRef, byId);
	if (assigned) {
		return { port: assigned, reason: "containingRegionAssignment", contextLocation: context || null, tidalRegion };
	}

	if (tidalRegion) {
		const regionReference = `${LOCATION_REF_PREFIX}${tidalRegion.id}`;
		const eligible = locations.filter((location) =>
			isPredictionPort(location) && location.properties?.tideRegionRef === regionReference,
		);
		const nearest = position ? nearestLocations(eligible, position, { limit: 1 })[0] : null;
		if (nearest) {
			return { port: nearest, reason: "nearestPortInTidalRegion", contextLocation: context || null, tidalRegion };
		}
	}

	return { port: null, reason: "none", contextLocation: context || null, tidalRegion };
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
	containsPosition,
	isPredictionPort,
	nearestSecondaryPort,
	selectTidePort,
};
