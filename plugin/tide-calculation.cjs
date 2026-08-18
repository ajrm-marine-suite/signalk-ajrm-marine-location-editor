/**
 * Normalizes tidal extremes and derives an explicitly-labelled cosine estimate
 * of height between the surrounding high and low waters.
 */

function eventTime(event) {
	const value = String(event?.at || event?.DateTime || event?.dateTime || "").trim();
	if (!value) return Number.NaN;
	// UKHO documents Tidal API prediction times as GMT, but its DateTime values
	// do not carry a Z or numeric offset. Date.parse would otherwise interpret
	// them in the Pi's local zone and silently shift summer predictions by an
	// hour. Preserve explicitly-zoned inputs and make UKHO's implicit GMT clear.
	const explicitlyZoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
	return Date.parse(explicitlyZoned ? value : `${value}Z`);
}

function eventHeight(event) {
	return Number(event?.heightM ?? event?.Height ?? event?.height);
}

function eventType(event) {
	const value = String(event?.type || event?.EventType || "").toLowerCase();
	if (value === "highwater" || value === "high") return "high";
	if (value === "lowwater" || value === "low") return "low";
	return "";
}

function normalizeTideEvents(payload) {
	const values = Array.isArray(payload) ? payload : payload?.events || payload?.items || [];
	return values.map((event) => {
		const at = eventTime(event);
		return {
			at: Number.isFinite(at) ? new Date(at).toISOString() : "",
			heightM: eventHeight(event),
			type: eventType(event),
		};
	}).filter((event) => event.type && Number.isFinite(event.heightM) && event.at)
		.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function calculateTide(events, now = new Date()) {
	const values = normalizeTideEvents(events);
	const nowMs = new Date(now).getTime();
	const nextHigh = values.find((event) => event.type === "high" && Date.parse(event.at) >= nowMs) || null;
	const nextLow = values.find((event) => event.type === "low" && Date.parse(event.at) >= nowMs) || null;
	let before = null;
	let after = null;
	for (const event of values) {
		const at = Date.parse(event.at);
		if (at <= nowMs) before = event;
		if (at >= nowMs && !after) after = event;
	}
	if (!before || !after || before.type === after.type || Date.parse(after.at) === Date.parse(before.at)) {
		return { valid: false, heightNowM: null, trend: "unknown", nextHighWater: nextHigh, nextLowWater: nextLow, curve: values };
	}
	const fraction = Math.max(0, Math.min(1,
		(nowMs - Date.parse(before.at)) / (Date.parse(after.at) - Date.parse(before.at)),
	));
	const progress = (1 - Math.cos(Math.PI * fraction)) / 2;
	const heightNowM = before.heightM + (after.heightM - before.heightM) * progress;
	return {
		valid: true,
		heightNowM,
		trend: after.heightM > before.heightM ? "rising" : "falling",
		nextHighWater: nextHigh,
		nextLowWater: nextLow,
		bracketingEvents: [before, after],
		curve: values,
		interpolation: "cosine-between-extremes-v1",
	};
}

module.exports = { calculateTide, normalizeTideEvents };
