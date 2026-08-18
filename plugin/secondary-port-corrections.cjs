/**
 * Defines, migrates and applies secondary-port corrections. Reeds prints most
 * time corrections as two standard-port times twelve hours apart sharing one
 * difference. Contract v3 stores that repeating 12-hour pattern directly,
 * while retaining a 24-hour period only for genuinely non-repeating imports.
 */

const CONTRACT_V1 = "ajrm-secondary-port-corrections-v1";
const CONTRACT_V2 = "ajrm-secondary-port-corrections-v2";
const CONTRACT_V3 = "ajrm-secondary-port-corrections-v3";
const REEDS_PERIOD_MINUTES = 720;
const DAY_MINUTES = 1440;
const LEVEL_KEYS = Object.freeze(["mhws", "mhwn", "mlwn", "mlws"]);
const LEGACY_TIMES = Object.freeze([
	["t0000", 0], ["t0600", 360], ["t1200", 720], ["t1800", 1080],
]);

function finite(value, label) {
	const number = Number(value);
	if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
	return number;
}

function legacyPoints(group) {
	return LEGACY_TIMES.map(([key, referenceTimeMinutes]) => ({
		referenceTimeMinutes,
		offsetMinutes: finite(group?.[key], `Legacy correction ${key}`),
	}));
}

function normalizeMinute(value, periodMinutes = DAY_MINUTES) {
	return ((Number(value) % periodMinutes) + periodMinutes) % periodMinutes;
}

function compactRepeatingPoints(points, periodMinutes = REEDS_PERIOD_MINUTES) {
	const byTime = new Map();
	for (const point of points || []) {
		const statedReferenceTimeMinutes = normalizeMinute(finite(point.referenceTimeMinutes, "Reference time"), DAY_MINUTES);
		const referenceTimeMinutes = normalizeMinute(statedReferenceTimeMinutes, periodMinutes);
		const offsetMinutes = finite(point.offsetMinutes, "Time correction");
		if (byTime.has(referenceTimeMinutes) && Math.abs(byTime.get(referenceTimeMinutes).offsetMinutes - offsetMinutes) > 1e-9) return null;
		if (!byTime.has(referenceTimeMinutes)) byTime.set(referenceTimeMinutes, { referenceTimeMinutes: statedReferenceTimeMinutes, offsetMinutes });
	}
	return [...byTime.values()].sort((left, right) =>
		normalizeMinute(left.referenceTimeMinutes, periodMinutes) - normalizeMinute(right.referenceTimeMinutes, periodMinutes));
}

function migrateSecondaryPortCorrections(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	if (value.contract === CONTRACT_V3) return structuredClone(value);
	let source = structuredClone(value);
	const migratedFromContract = source.contract;
	if (source.contract === CONTRACT_V1) {
		source = {
			...source,
			contract: CONTRACT_V2,
			parentReferenceLevels: structuredClone(source.standardReferenceLevels || {}),
			highWaterTimeOffsets: legacyPoints(source.hwTimeOffsetsMinutes),
			lowWaterTimeOffsets: legacyPoints(source.lwTimeOffsetsMinutes),
		};
		delete source.standardReferenceLevels;
		delete source.hwTimeOffsetsMinutes;
		delete source.lwTimeOffsetsMinutes;
	}
	if (source.contract !== CONTRACT_V2) return structuredClone(value);
	const compactHigh = compactRepeatingPoints(source.highWaterTimeOffsets);
	const compactLow = compactRepeatingPoints(source.lowWaterTimeOffsets);
	const repeating = Boolean(compactHigh && compactLow);
	return {
		...source,
		contract: CONTRACT_V3,
		timeOffsetPeriodMinutes: repeating ? REEDS_PERIOD_MINUTES : DAY_MINUTES,
		highWaterTimeOffsets: repeating ? compactHigh : structuredClone(source.highWaterTimeOffsets),
		lowWaterTimeOffsets: repeating ? compactLow : structuredClone(source.lowWaterTimeOffsets),
		migratedFromContract,
	};
}

function sortedPoints(points, periodMinutes = DAY_MINUTES) {
	return points.map((point) => ({
		referenceTimeMinutes: normalizeMinute(finite(point.referenceTimeMinutes, "Reference time"), periodMinutes),
		offsetMinutes: finite(point.offsetMinutes, "Time correction"),
	})).sort((left, right) => left.referenceTimeMinutes - right.referenceTimeMinutes);
}

function interpolateCircular(points, referenceTimeMinutes, periodMinutes = DAY_MINUTES) {
	const values = sortedPoints(points, periodMinutes);
	if (!values.length) throw new Error("At least one correction point is required.");
	if (values.length === 1) return values[0].offsetMinutes;
	const minute = normalizeMinute(referenceTimeMinutes, periodMinutes);
	for (let index = 0; index < values.length; index += 1) {
		const before = values[index];
		const next = values[(index + 1) % values.length];
		const afterMinute = index === values.length - 1
			? next.referenceTimeMinutes + periodMinutes
			: next.referenceTimeMinutes;
		const candidate = minute < before.referenceTimeMinutes ? minute + periodMinutes : minute;
		if (candidate < before.referenceTimeMinutes || candidate > afterMinute) continue;
		const span = afterMinute - before.referenceTimeMinutes;
		if (span === 0) return before.offsetMinutes;
		const fraction = (candidate - before.referenceTimeMinutes) / span;
		return before.offsetMinutes + (next.offsetMinutes - before.offsetMinutes) * fraction;
	}
	return values[0].offsetMinutes;
}

function interpolateHeightDifference(heightM, differences, parentLevels, type) {
	const high = type === "high";
	const neapKey = high ? "mhwn" : "mlwn";
	const springKey = high ? "mhws" : "mlws";
	const neapHeight = finite(parentLevels?.[neapKey], `Parent ${neapKey.toUpperCase()}`);
	const springHeight = finite(parentLevels?.[springKey], `Parent ${springKey.toUpperCase()}`);
	const denominator = springHeight - neapHeight;
	const factor = Math.abs(denominator) < 1e-9 ? 0 : (Number(heightM) - neapHeight) / denominator;
	const neapDifference = finite(differences?.[neapKey], `${neapKey.toUpperCase()} height correction`);
	const springDifference = finite(differences?.[springKey], `${springKey.toUpperCase()} height correction`);
	return neapDifference + (springDifference - neapDifference) * factor;
}

function correctedReferenceLevels(parentLevels, differences) {
	return Object.fromEntries(LEVEL_KEYS.map((key) => [
		key,
		Number((finite(parentLevels?.[key], `Parent ${key.toUpperCase()}`) +
			finite(differences?.[key], `${key.toUpperCase()} height correction`)).toFixed(6)),
	]));
}

function applySecondaryPortCorrections(events, correctionValue, parentLevels) {
	const correction = migrateSecondaryPortCorrections(correctionValue);
	if (correction?.contract !== CONTRACT_V3) throw new Error("Secondary-port corrections use an unsupported contract.");
	const levels = parentLevels || correction.parentReferenceLevels;
	const periodMinutes = Number(correction.timeOffsetPeriodMinutes || REEDS_PERIOD_MINUTES);
	const correctedEvents = events.map((event) => {
		if (!event?.at || !["high", "low"].includes(event.type)) return structuredClone(event);
		const instant = new Date(event.at);
		if (Number.isNaN(instant.getTime())) throw new Error("Secondary-port source event has an invalid timestamp.");
		const minute = instant.getUTCHours() * 60 + instant.getUTCMinutes();
		const points = event.type === "high" ? correction.highWaterTimeOffsets : correction.lowWaterTimeOffsets;
		const offsetMinutes = interpolateCircular(points, minute, periodMinutes);
		const heightDifferenceM = interpolateHeightDifference(event.heightM, correction.heightDifferencesM, levels, event.type);
		return {
			...structuredClone(event),
			at: new Date(instant.getTime() + offsetMinutes * 60000).toISOString(),
			heightM: Number((Number(event.heightM) + heightDifferenceM).toFixed(6)),
			secondaryPortCorrection: { offsetMinutes, heightDifferenceM },
		};
	}).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
	return {
		events: correctedEvents,
		referenceLevels: correctedReferenceLevels(levels, correction.heightDifferencesM),
	};
}

module.exports = {
	CONTRACT_V1,
	CONTRACT_V2,
	CONTRACT_V3,
	DAY_MINUTES,
	REEDS_PERIOD_MINUTES,
	LEVEL_KEYS,
	applySecondaryPortCorrections,
	compactRepeatingPoints,
	interpolateCircular,
	migrateSecondaryPortCorrections,
};
