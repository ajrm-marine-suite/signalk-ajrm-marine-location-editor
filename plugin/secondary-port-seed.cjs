/**
 * Converts bundled, source-recorded secondary-port tables into versioned
 * Location Editor records, enriching matching place records by id.
 */

const LOCATION_REF_PREFIX = "/resources/locations/";
const { CONTRACT_V4: CORRECTION_CONTRACT, REEDS_PERIOD_MINUTES } = require("./secondary-port-corrections.cjs");
const DEFAULT_REFERENCE_TIMES = [0, 360];
const LEVELS = ["mhws", "mhwn", "mlwn", "mlws"];
const SUPERSEDED_PORT_ELLEN_NOTES = "HW Oban -0530 at springs, -0050 at neaps. LW time not supplied.";

function keyed(keys, values) {
	return Object.fromEntries(keys.map((key, index) => [key, Number(values?.[index] ?? 0)]));
}

function points(times, offsets) {
	return times.map((referenceTimeMinutes, index) => ({
		referenceTimeMinutes: Number(referenceTimeMinutes),
		offsetMinutes: Number(offsets?.[index] ?? 0),
	}));
}

function hasCompleteHeightDifferences(entry) {
	return Array.isArray(entry.heights) && entry.heights.length === LEVELS.length &&
		entry.heights.every((value) => Number.isFinite(Number(value)));
}

function pointPairs(value) {
	return (value || []).map(({ referenceTimeMinutes, offsetMinutes }) =>
		[Number(referenceTimeMinutes), Number(offsetMinutes)]);
}

/** Only replace the exact incomplete Port Ellen seed; never overwrite user edits. */
function isSupersededBundledCorrection(value, replacement) {
	if (replacement?.legacyId !== "port-ellen" || value?.legacyId !== "port-ellen") return false;
	return value.notes === SUPERSEDED_PORT_ELLEN_NOTES &&
		JSON.stringify(pointPairs(value.highWaterTimeOffsets)) === JSON.stringify([[0, -330], [360, -50]]) &&
		JSON.stringify(pointPairs(value.lowWaterTimeOffsets)) === JSON.stringify([[0, 0], [360, 0]]) &&
		JSON.stringify(LEVELS.map((key) => Number(value.heightDifferencesM?.[key]))) ===
			JSON.stringify([-3.1, -2.1, -1.3, -0.4]);
}

function correction(entry, defaults) {
	return {
		contract: CORRECTION_CONTRACT,
		timeOffsetPeriodMinutes: Number(entry.timeOffsetPeriodMinutes || defaults.timeOffsetPeriodMinutes || REEDS_PERIOD_MINUTES),
		legacyId: entry.legacyId,
		standardPortName: entry.standardPortName || defaults.standardPortName,
		highWaterTimeOffsets: points(entry.hwReferenceTimesMinutes || defaults.hwReferenceTimesMinutes || DEFAULT_REFERENCE_TIMES, entry.hw),
		lowWaterTimeOffsets: points(entry.lwReferenceTimesMinutes || defaults.lwReferenceTimesMinutes || DEFAULT_REFERENCE_TIMES, entry.lw),
		heightDifferencesM: keyed(LEVELS, entry.heights),
		notes: entry.notes,
	};
}

function incompleteSourceData(entry, defaults) {
	const knownHeightDifferencesM = Array.isArray(entry.partialHeights)
		? Object.fromEntries(LEVELS.map((key, index) => {
			const value = entry.partialHeights[index];
			return [key, value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null];
		}))
		: undefined;
	return {
		contract: "ajrm-secondary-port-source-data-v1",
		status: "incomplete",
		timeOffsetPeriodMinutes: Number(entry.timeOffsetPeriodMinutes || defaults.timeOffsetPeriodMinutes || REEDS_PERIOD_MINUTES),
		highWaterTimeOffsets: points(entry.hwReferenceTimesMinutes || defaults.hwReferenceTimesMinutes || DEFAULT_REFERENCE_TIMES, entry.hw),
		lowWaterTimeOffsets: points(entry.lwReferenceTimesMinutes || defaults.lwReferenceTimesMinutes || DEFAULT_REFERENCE_TIMES, entry.lw),
		meanRangeM: Number.isFinite(Number(entry.meanRangeM)) ? Number(entry.meanRangeM) : null,
		...(knownHeightDifferencesM ? { knownHeightDifferencesM } : {}),
		missing: ["heightDifferencesM"],
		notes: entry.notes,
	};
}

function correctionProvenance(entry, existing, defaults) {
	const source = {
		provider: "AJRM Marine Planning migration",
		sourceId: `marine-planning-secondary:${entry.legacyId}`,
		license: "AGPL-3.0-or-later",
		url: "https://github.com/ajrm-marine-suite/signalk-ajrm-marine-planning",
		retrievedAt: "2026-08-18T00:00:00.000Z",
	};
	const sources = [...(existing?.sources || [])];
	for (const candidate of [entry.dataSource || defaults.dataSource || source, entry.positionSource || defaults.positionDataSource]) {
		if (candidate && !sources.some((value) => value.sourceId === candidate.sourceId)) sources.push(candidate);
	}
	return {
		...(existing || {}),
		reviewStatus: existing?.reviewStatus || "imported",
		warning: existing?.warning || entry.warning || "Secondary-port corrections and approximate positions must be checked against a current almanac and chart before use.",
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
				...(hasCompleteHeightDifferences(entry)
					? { secondaryPortCorrections: correction(entry, defaults) }
					: { secondaryPortSourceData: incompleteSourceData(entry, defaults) }),
			},
			provenance: correctionProvenance(entry, location.properties?.provenance, defaults),
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
		description: hasCompleteHeightDifferences(entry)
			? "Secondary-port correction location transcribed from the recorded almanac source. Verify its position and current almanac data before use."
			: "Incomplete secondary-port source record: time corrections and mean range are retained, but height differences are still required before tidal prediction can be used.",
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

module.exports = { CORRECTION_CONTRACT, isSupersededBundledCorrection, mergeSecondaryPortSeed };
