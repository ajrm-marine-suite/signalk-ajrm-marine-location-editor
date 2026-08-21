/**
 * Detects a stationary vessel at an anchorage or mooring and manages an
 * evidence-backed Anchored-profile suggestion; release remains Traffic's responsibility.
 */

const crypto = require("node:crypto");
const { containsPosition } = require("./spatial-geometry.cjs");
const { nearestLocations } = require("./location-model.cjs");

const CONTRACT = "ajrm-marine-anchoring-assistance-v1";
const LOCATION_TYPES = ["anchorage", "mooring"];

function validPosition(value) {
	const latitude = Number(value?.latitude);
	const longitude = Number(value?.longitude);
	return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
		Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function candidateLocation(locations, position, defaultRadiusM) {
	const candidates = locations.filter((location) =>
		location.types?.some((type) => LOCATION_TYPES.includes(type)),
	);
	const containing = candidates.find((location) => containsPosition(location, position));
	if (containing) return { location: containing, match: "insideArea", distanceM: 0 };
	const nearest = nearestLocations(candidates.filter((location) =>
		location.feature?.geometry?.type === "Point",
	), position, { limit: 10 });
	const point = nearest.find((location) => location.distanceM <=
		(Number(location.properties?.anchorage?.detectionRadiusM) || defaultRadiusM));
	return point ? { location: point, match: "nearPoint", distanceM: point.distanceM } : null;
}

function createAnchoringAssistant({
	listLocations,
	getTrafficApi,
	publish = () => {},
	now = () => Date.now(),
	options = {},
}) {
	const settings = {
		enabled: options.enabled !== false,
		stationarySpeedMps: Math.max(0, Number(options.stationarySpeedMps) || 0.154333),
		stationarySeconds: Math.max(1, Number(options.stationarySeconds) || 300),
		pointRadiusM: Math.max(10, Number(options.pointRadiusM) || 250),
		trustedLocationAutomation: options.trustedLocationAutomation === true,
	};
	let state = baseState();
	let observingLocationId = null;
	let stationarySinceMs = null;
	let dismissedLocationId = null;

	function baseState() {
		return {
			contract: CONTRACT,
			contractVersion: 1,
			enabled: settings?.enabled ?? options.enabled !== false,
			state: "idle",
			location: null,
			match: null,
			distanceM: null,
			stationary: false,
			stationarySince: null,
			stationarySeconds: 0,
			requiredStationarySeconds: settings?.stationarySeconds ?? (Number(options.stationarySeconds) || 300),
			suggestionId: null,
			action: null,
			updatedAt: new Date(now()).toISOString(),
		};
	}

	function trafficProfile() {
		return String(getTrafficApi?.()?.status?.()?.profiles?.current || "").toLowerCase();
	}

	function locationProjection(location) {
		return location ? {
			id: location.id,
			name: location.name,
			types: location.types.filter((type) => LOCATION_TYPES.includes(type)),
			trustedAutomation: location.properties?.anchorage?.trustedAutomation === true,
		} : null;
	}

	function commit(next) {
		state = { ...state, ...next, updatedAt: new Date(now()).toISOString() };
		publish(state);
		return structuredClone(state);
	}

	async function observe({ position, sog, at } = {}) {
		const observedAt = Number.isNaN(Date.parse(at)) ? now() : Date.parse(at || new Date(now()).toISOString());
		const profile = trafficProfile();
		if (["confirmed", "automated"].includes(state.state) && profile === "anchor") {
			return commit({ stationary: Number(sog) <= settings.stationarySpeedMps });
		}
		if (["confirmed", "automated"].includes(state.state) && profile && profile !== "anchor") {
			dismissedLocationId = state.location?.id || dismissedLocationId;
			observingLocationId = null;
			stationarySinceMs = null;
			return commit({ ...baseState(), state: "dismissed", location: state.location, action: {
				type: "explicitProfileChange", at: new Date(observedAt).toISOString(), profile,
			} });
		}
		if (!settings.enabled || !validPosition(position) || !Number.isFinite(Number(sog)) || Number(sog) > settings.stationarySpeedMps) {
			observingLocationId = null;
			stationarySinceMs = null;
			if (validPosition(position)) dismissedLocationId = null;
			return commit(baseState());
		}
		const candidate = candidateLocation(await listLocations(), position, settings.pointRadiusM);
		if (!candidate) {
			observingLocationId = null;
			stationarySinceMs = null;
			dismissedLocationId = null;
			return commit(baseState());
		}
		const location = candidate.location;
		if (dismissedLocationId === location.id) {
			return commit({ ...baseState(), state: "dismissed", location: locationProjection(location),
				match: candidate.match, distanceM: Math.round(candidate.distanceM) });
		}
		if (observingLocationId !== location.id) {
			observingLocationId = location.id;
			stationarySinceMs = observedAt;
		}
		const elapsed = Math.max(0, (observedAt - stationarySinceMs) / 1000);
		const common = {
			location: locationProjection(location), match: candidate.match,
			distanceM: Math.round(candidate.distanceM), stationary: true,
			stationarySince: new Date(stationarySinceMs).toISOString(),
			stationarySeconds: Math.round(elapsed),
		};
		if (elapsed < settings.stationarySeconds) return commit({ ...common, state: "observing", suggestionId: null });
		if (settings.trustedLocationAutomation && location.properties?.anchorage?.trustedAutomation === true) {
			const traffic = getTrafficApi?.();
			if (typeof traffic?.setProfile !== "function") {
				return commit({ ...common, state: "suggested", suggestionId: state.suggestionId || crypto.randomUUID(),
					action: { type: "automationUnavailable", at: new Date(observedAt).toISOString() } });
			}
			traffic.setProfile("anchor", { source: "anchoringAssistance", locationId: location.id });
			return commit({ ...common, state: "automated", suggestionId: null, action: {
				type: "trustedLocationAutomation", at: new Date(observedAt).toISOString(), profile: "anchor",
			} });
		}
		return commit({ ...common, state: "suggested", suggestionId: state.suggestionId || crypto.randomUUID() });
	}

	function requireSuggestion(suggestionId) {
		if (state.state !== "suggested" || !state.suggestionId || state.suggestionId !== suggestionId) {
			throw new Error("The anchoring suggestion is no longer current.");
		}
	}

	async function confirm(suggestionId) {
		requireSuggestion(suggestionId);
		const traffic = getTrafficApi?.();
		if (typeof traffic?.setProfile !== "function") throw new Error("AJRM Marine Traffic profile control is unavailable.");
		traffic.setProfile("anchor", { source: "anchoringAssistance", locationId: state.location.id });
		return commit({ state: "confirmed", suggestionId: null, action: {
			type: "skipperConfirmed", at: new Date(now()).toISOString(), profile: "anchor",
		} });

	}

	function dismiss(suggestionId) {
		requireSuggestion(suggestionId);
		dismissedLocationId = state.location.id;
		return commit({ state: "dismissed", suggestionId: null, action: {
			type: "skipperDismissed", at: new Date(now()).toISOString(),
		} });
	}

	return { observe, status: () => structuredClone(state), confirm, dismiss };
}

module.exports = { CONTRACT, candidateLocation, createAnchoringAssistant };
