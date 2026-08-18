/**
 * Converts Marine Planning's bundled secondary-port correction table into
 * versioned Location Editor records, enriching matching place records by id.
 */

const LOCATION_REF_PREFIX = "/resources/locations/";
const { CONTRACT_V4: CORRECTION_CONTRACT, REEDS_PERIOD_MINUTES } = require("./secondary-port-corrections.cjs");
const DEFAULT_REFERENCE_TIMES = [0, 360];
const LEVELS = ["mhws", "mhwn", "mlwn", "mlws"];

function keyed(keys, values) {
	return Object.fromEntries(keys.map((key, index) => [key, Number(values?.[index] ?? 0)]));
}

function correction(entry, defaults) {
	const points = (times, offsets) => times.map((referenceTimeMinutes, index) => ({
		referenceTimeMinutes: Number(referenceTimeMinutes),
		offsetMinutes: Number(offsets?.[index] ?? 0),
	}));
	return {
		contract: CORRECTION_CONTRACT,
		timeOffsetPeriodMinutes: Number(entry.timeOffsetPeriodMinutes || defaults.timeOffsetPeriodMinutes || REEDS_PERIOD_MINUTES),
		legacyId: entry.legacyId,
		standardPortName: entry.standardPortName || defaults.standardPortName,
		highWaterTimeOffsets: points(entry.hwReferenceTimesMinutes || DEFAULT_REFERENCE_TIMES, entry.hw),
		lowWaterTimeOffsets: points(entry.lwReferenceTimesMinutes || DEFAULT_REFERENCE_TIMES, entry.lw),
		heightDifferencesM: keyed(LEVELS, entry.heights),
		notes: entry.notes,
	};
}

function correctionProvenance(entry, existing) {
	const source = {
		provider: "AJRM Marine Planning migration",
		sourceId: `marine-planning-secondary:${entry.legacyId}`,
		license: "AGPL-3.0-or-later",
		url: "https://github.com/ajrm-marine-suite/signalk-ajrm-marine-planning",
		retrievedAt: "2026-08-18T00:00:00.000Z",
	};
	const sources = [...(existing?.sources || [])];
	if (!sources.some((value) => value.sourceId === source.sourceId)) sources.push(source);
	return {
		...(existing || {}),
		reviewStatus: existing?.reviewStatus || "imported",
		warning: existing?.warning || "Migrated secondary-port constants must be checked against a current, licensed almanac before use.",
		sources,
	};
}

function enrichLocation(location, entry, standardPortId, defaults) {
	const standardPortRef = entry.standardPortName
		? undefined
		: `${LOCATION_REF_PREFIX}${standardPortId}`;
	return {
		...location,
		types: [...new Set([...(location.types || []), "tidalSecondaryPort"])],
		properties: {
			...(location.properties || {}),
			tide: {
				...(location.properties?.tide || {}),
				parentLocationRef: standardPortRef || location.properties?.tide?.parentLocationRef,
				secondaryPortCorrections: correction(entry, defaults),
			},
			provenance: correctionProvenance(entry, location.properties?.provenance),
		},
	};
}

function newLocation(entry, standardPortId, defaults) {
	if (!Array.isArray(entry.coordinates) || entry.coordinates.length !== 2) {
		throw new Error(`Secondary port ${entry.name} needs a position.`);
	}
	return enrichLocation({
		id: entry.id,
		name: entry.name,
		description: "Secondary-port correction location migrated from AJRM Marine Planning. Verify its position and current almanac data before use.",
		types: [],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: entry.coordinates } },
		properties: {},
	}, entry, standardPortId, defaults);
}

function mergeSecondaryPortSeed(baseSeed, secondarySeed) {
	if (secondarySeed?.schema !== "org.ajrm.marine.secondary-port-seed/v1" || !Array.isArray(secondarySeed.locations)) {
		throw new Error("Bundled secondary-port seed is invalid.");
	}
	const byId = new Map((baseSeed.locations || []).map((location) => [location.id, structuredClone(location)]));
	for (const entry of secondarySeed.locations) {
		const existing = byId.get(entry.id);
		byId.set(entry.id, existing
			? enrichLocation(existing, entry, secondarySeed.standardPortId, secondarySeed)
			: newLocation(entry, secondarySeed.standardPortId, secondarySeed));
	}
	return { ...baseSeed, locations: [...byId.values()] };
}

module.exports = { CORRECTION_CONTRACT, mergeSecondaryPortSeed };
