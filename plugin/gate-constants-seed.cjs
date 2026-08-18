/**
 * Migrates Gate Passage Planner's legacy location-constant table into
 * Location Editor's authoritative, versioned tidal-gate records.
 */

const crypto = require("node:crypto");
const GATE_CONTRACT = "ajrm-tidal-gate-constants-v1";
const FALLBACK_COORDINATES = Object.freeze({ "firth of lorn": [-5.55, 56.35] });

function normalizeName(value) {
	return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/\bgulf of\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function deterministicId(name) {
	const hex = crypto.createHash("sha256").update(`ajrm-tidal-gate:${name}`).digest("hex").slice(0, 32).split("");
	hex[12] = "4";
	hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
	return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function gateProperties(entry, standardPortId) {
	return {
		contract: GATE_CONTRACT,
		standardPortRef: `/resources/locations/${standardPortId}`,
		floodSet: entry.floodSet || "",
		ebbSet: entry.ebbSet || "",
		springPeakFlowKnots: numericOrNull(entry.springPeakFlow),
		neapPeakFlowKnots: numericOrNull(entry.neapPeakFlow),
		floodSpringAfter: entry.floodSpringAfter || "",
		floodNeapAfter: entry.floodNeapAfter || "",
		floodSpringSlack: entry.floodSpringSlack || "",
		floodNeapSlack: entry.floodNeapSlack || "",
		ebbSpringAfter: entry.ebbSpringAfter || "",
		ebbNeapAfter: entry.ebbNeapAfter || "",
		ebbSpringSlack: entry.ebbSpringSlack || "",
		ebbNeapSlack: entry.ebbNeapSlack || "",
		source: entry.source || "",
	};
}

function numericOrNull(value) {
	if (value === "" || value === null || value === undefined) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function mergeGateConstantsSeed(baseSeed, gateSeed) {
	if (gateSeed?.schema !== "org.ajrm.marine.tidal-gate-seed/v1" || !gateSeed.constants) {
		throw new Error("Bundled tidal-gate seed is invalid.");
	}
	const locations = structuredClone(baseSeed.locations || []);
	const byName = new Map(locations.map((location) => [normalizeName(location.name), location]));
	for (const [name, entry] of Object.entries(gateSeed.constants)) {
		let location = byName.get(normalizeName(name));
		if (!location) {
			const longitude = Number(entry.longitude);
			const latitude = Number(entry.latitude);
			const coordinates = Number.isFinite(longitude) && Number.isFinite(latitude) && entry.longitude !== "" && entry.latitude !== ""
				? [longitude, latitude] : FALLBACK_COORDINATES[normalizeName(name)];
			if (!coordinates) continue;
			location = {
				id: deterministicId(name), name,
				description: "Tidal-gate planning location migrated from AJRM Marine Planning. Verify the point and almanac constants before operational use.",
				types: ["tidalGate"],
				feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates } },
				properties: {
					provenance: {
						reviewStatus: "imported",
						warning: "Migrated tidal-gate constants must be checked against a current, licensed almanac before use.",
						sources: [{ provider: "AJRM Marine Planning migration", sourceId: `gate:${normalizeName(name)}`, license: "AGPL-3.0-or-later", url: "https://github.com/ajrm-marine-suite/signalk-ajrm-marine-planning", retrievedAt: "2026-08-18T00:00:00.000Z" }],
					},
				},
			};
			locations.push(location);
			byName.set(normalizeName(name), location);
		}
		location.types = [...new Set([...(location.types || []), "tidalGate"])];
		location.properties = {
			...(location.properties || {}),
			tidalGate: gateProperties(entry, gateSeed.standardPortId),
		};
	}
	return { ...baseSeed, locations };
}

module.exports = { GATE_CONTRACT, gateProperties, mergeGateConstantsSeed };
