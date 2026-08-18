/**
 * Defines, migrates and applies flexible secondary-port corrections. Reeds
 * correction columns may use different clock times for HW and LW, so v2 stores
 * the stated reference time beside each offset instead of assuming six-hourly
 * columns.
 */

const CONTRACT_V1 = "ajrm-secondary-port-corrections-v1";
const CONTRACT_V2 = "ajrm-secondary-port-corrections-v2";
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

function migrateSecondaryPortCorrections(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	if (value.contract === CONTRACT_V2) return structuredClone(value);
	if (value.contract !== CONTRACT_V1) return structuredClone(value);
	const migrated = {
		...structuredClone(value),
		contract: CONTRACT_V2,
		parentReferenceLevels: structuredClone(value.standardReferenceLevels || {}),
		highWaterTimeOffsets: legacyPoints(value.hwTimeOffsetsMinutes),
		lowWaterTimeOffsets: legacyPoints(value.lwTimeOffsetsMinutes),
		migratedFromContract: CONTRACT_V1,
	};
	delete migrated.standardReferenceLevels;
	delete migrated.hwTimeOffsetsMinutes;
	delete migrated.lwTimeOffsetsMinutes;
	return migrated;
}

function normalizeMinute(value) {
	return ((Number(value) % 1440) + 1440) % 1440;
}

function sortedPoints(points) {
	return points.map((point) => ({
		referenceTimeMinutes: normalizeMinute(finite(point.referenceTimeMinutes, "Reference time")),
		offsetMinutes: finite(point.offsetMinutes, "Time correction"),
	})).sort((left, right) => left.referenceTimeMinutes - right.referenceTimeMinutes);
}

function interpolateCircular(points, referenceTimeMinutes) {
	const values = sortedPoints(points);
	if (!values.length) throw new Error("At least one correction point is required.");
	if (values.length === 1) return values[0].offsetMinutes;
	const minute = normalizeMinute(referenceTimeMinutes);
	for (let index = 0; index < values.length; index += 1) {
		const before = values[index];
		const next = values[(index + 1) % values.length];
		const afterMinute = index === values.length - 1
			? next.referenceTimeMinutes + 1440
			: next.referenceTimeMinutes;
		const candidate = minute < before.referenceTimeMinutes ? minute + 1440 : minute;
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
	if (correction?.contract !== CONTRACT_V2) throw new Error("Secondary-port corrections use an unsupported contract.");
	const levels = parentLevels || correction.parentReferenceLevels;
	const correctedEvents = events.map((event) => {
		if (!event?.at || !["high", "low"].includes(event.type)) return structuredClone(event);
		const instant = new Date(event.at);
		if (Number.isNaN(instant.getTime())) throw new Error("Secondary-port source event has an invalid timestamp.");
		const minute = instant.getUTCHours() * 60 + instant.getUTCMinutes();
		const points = event.type === "high" ? correction.highWaterTimeOffsets : correction.lowWaterTimeOffsets;
		const offsetMinutes = interpolateCircular(points, minute);
		const heightDifferenceM = interpolateHeightDifference(
			event.heightM, correction.heightDifferencesM, levels, event.type,
		);
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
	LEVEL_KEYS,
	applySecondaryPortCorrections,
	interpolateCircular,
	migrateSecondaryPortCorrections,
};
