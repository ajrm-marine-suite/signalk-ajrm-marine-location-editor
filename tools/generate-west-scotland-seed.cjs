#!/usr/bin/env node
/**
 * Builds the bundled West Scotland starter catalogue from open marine datasets.
 * Network retrieval is intentionally a maintainer action; the plugin reads only
 * the reviewed generated JSON and never depends on these services at runtime.
 */

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeLocation } = require("../plugin/location-model.cjs");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "defaults", "west-scotland-locations.json");
const RETRIEVED_AT = "2026-08-12T00:00:00.000Z";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TIDE_GAUGE_URL = "https://environment.data.gov.uk/flood-monitoring/id/stations?type=TideGauge&_limit=500";
const OSM_QUERY = `[out:json][timeout:180];
area["ISO3166-2"="GB-SCT"]->.scotland;
(
  nwr["leisure"="marina"](area.scotland)(54.5,-9.5,59.5,-3.8);
  nwr["seamark:type"~"^(anchorage|anchor_berth|mooring|harbour)$"](area.scotland)(54.5,-9.5,59.5,-3.8);
);
out center tags;`;

const WELCOME_REFERENCES = new Map([
	["ardfern yacht centre", "https://welcome-anchorages.co.uk/yacht-services/argyll-coast/"],
	["dunstaffnage marina", "https://welcome-anchorages.co.uk/yacht-services/argyll-coast/"],
	["kerrera marina", "https://welcome-anchorages.co.uk/yacht-services/argyll-coast/"],
	["kip marina", "https://welcome-anchorages.co.uk/yacht-services/firth-of-clyde/"],
	["largs yacht haven", "https://welcome-anchorages.co.uk/yacht-services/firth-of-clyde/"],
	["james watt dock marina", "https://welcome-anchorages.co.uk/yacht-services/firth-of-clyde/"],
	["mallaig yachting marina", "https://welcome-anchorages.co.uk/yacht-services/north-west-scotland/"],
	["stornoway marina", "https://welcome-anchorages.co.uk/yacht-services/north-west-scotland/"],
]);

const UNNAMED_OSM_LOCATIONS = new Map([
	["node/4244181833", "Stornoway anchorage (OpenSeaMap)"],
	["node/6423997417", "St Kilda anchorage (OpenSeaMap)"],
	["node/6433179429", "Loch Sunart anchorage 1 (OpenSeaMap)"],
	["node/6433179430", "Loch Sunart anchorage 2 (OpenSeaMap)"],
	["node/6433179431", "Loch Sunart anchorage 3 (OpenSeaMap)"],
	["node/6433179432", "Loch Sunart anchorage 4 (OpenSeaMap)"],
	["node/6433179445", "Portree anchorage (OpenSeaMap)"],
	["node/6433179448", "Ullapool anchorage (OpenSeaMap)"],
	["way/675670350", "Helensburgh Sailing Club mooring area"],
]);

const TIDAL_GATES = [
	{
		name: "Gulf of Corryvreckan",
		position: [56.1545973, -5.7206268],
		osm: "way/931752458",
		reference: "https://www.nature.scot/sites/default/files/2017-07/Publication%202010%20-%20SNH%20Commissioned%20Report%20374%20-%20The%20Special%20Qualities%20of%20the%20National%20Scenic%20Areas.pdf",
	},
	{
		name: "Grey Dogs (Bealach a' Choin Ghlais)",
		position: [56.2008383, -5.6943978],
		osm: "node/1772991086",
		reference: "https://www.nature.scot/sites/default/files/2017-07/Publication%202010%20-%20SNH%20Commissioned%20Report%20374%20-%20The%20Special%20Qualities%20of%20the%20National%20Scenic%20Areas.pdf",
	},
	{
		name: "Cuan Sound",
		position: [56.2700479, -5.6344967],
		osm: "way/931752459",
		reference: "https://www.gov.scot/publications/foi-202100243353/",
	},
	{
		name: "Sound of Luing",
		position: [56.2154272, -5.6753028],
		osm: "way/931752461",
		reference: "https://www.gov.scot/binaries/content/documents/govscot/publications/research-and-analysis/2023/02/salmon-parasite-interactions-linnhe-lorn-shuna-spills-final-project-report/documents/final-report-sampling-analyses-sea-lice-larvae-shuna-sound-region-sampling-sea-lice-wild-fish-shuna-sound-region-ii/final-report-sampling-analyses-sea-lice-larvae-shuna-sound-region-sampling-sea-lice-wild-fish-shuna-sound-region-ii/govscot%3Adocument/final-report-sampling-analyses-sea-lice-larvae-shuna-sound-region-sampling-sea-lice-wild-fish-shuna-sound-region-ii.pdf",
	},
	{
		name: "Dorus Mòr",
		position: [56.12694, -5.6078],
		reference: "https://www.geograph.org.uk/photo/4541255",
	},
	{
		name: "Kyle Rhea",
		position: [57.2404021, -5.6567278],
		osm: "way/931437578",
		reference: "https://www.gov.scot/binaries/content/documents/govscot/publications/research-and-analysis/2013/10/use-acoustic-devices-warn-marine-mammals-tidal-stream-energy-devices/documents/00436112-pdf/00436112-pdf/govscot%3Adocument/00436112.pdf",
	},
	{
		name: "Sound of Islay",
		position: [55.8526035, -6.0978156],
		osm: "relation/11246720",
		reference: "https://www.gov.scot/binaries/content/documents/govscot/publications/research-and-analysis/2013/10/use-acoustic-devices-warn-marine-mammals-tidal-stream-energy-devices/documents/00436112-pdf/00436112-pdf/govscot%3Adocument/00436112.pdf",
	},
	{
		name: "Sound of Barra",
		position: [57.0703726, -7.3729461],
		osm: "relation/15708719",
		reference: "https://www.transport.gov.scot/publication/the-vessels-and-ports-plan-for-the-clyde-and-hebrides-and-northern-isles-networks-2025-2045-islands-connectivity-plan/annexes/",
	},
	{
		name: "Sound of Harris",
		position: [57.7426797, -7.1399052],
		osm: "way/705800660",
		reference: "https://www.transport.gov.scot/publication/the-vessels-and-ports-plan-for-the-clyde-and-hebrides-and-northern-isles-networks-2025-2045-islands-connectivity-plan/annexes/",
	},
];

function stableUuid(key) {
	const bytes = crypto.createHash("sha256").update(`ajrm-west-scotland:${key}`).digest().subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizedName(value) {
	return String(value || "").trim().toLocaleLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

function pointLocation({ key, name, description, types, latitude, longitude, properties = {}, featureProperties = {} }) {
	return normalizeLocation({
		id: stableUuid(key),
		name,
		description,
		types,
		feature: {
			type: "Feature",
			properties: featureProperties,
			geometry: { type: "Point", coordinates: [Number(longitude), Number(latitude)] },
		},
		properties,
	});
}

function osmPosition(element) {
	return {
		latitude: Number(element.lat ?? element.center?.lat),
		longitude: Number(element.lon ?? element.center?.lon),
	};
}

function osmClassifications(tags, name) {
	const seamarkType = tags["seamark:type"];
	const isMarina = tags.leisure === "marina" || tags["seamark:harbour:category"] === "marina";
	const isAnchorage = seamarkType === "anchorage" || seamarkType === "anchor_berth";
	if (seamarkType === "mooring" || /\bmoorings?\b/i.test(name)) return ["mooring"];
	if (isAnchorage && isMarina) return ["anchorage", "marina"];
	if (isAnchorage) return ["anchorage"];
	if (isMarina) return ["marina"];
	if (seamarkType === "harbour") return ["harbour"];
	return [];
}

function usableOsmName(name, types) {
	if (!name) return false;
	if (/^(?:rnli|[a-z]?\d+|mooring|leisure|fishng boats anchored|roing boat mooring|rowing boat mooring)$/i.test(name.trim())) return false;
	if (!types.includes("mooring")) return true;
	return !/^(?:visitors?\s*mooring)$/i.test(name.trim());
}

function osmLocations(elements) {
	const grouped = new Map();
	for (const element of elements) {
		const tags = element.tags || {};
		const sourceId = `${element.type}/${element.id}`;
		const name = String(tags.name || tags["seamark:name"] || UNNAMED_OSM_LOCATIONS.get(sourceId) || "").trim();
		const types = osmClassifications(tags, name);
		const position = osmPosition(element);
		if (!types.length || !usableOsmName(name, types) || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) continue;
		const key = `${types.join("+")}:${normalizedName(name)}`;
		const values = grouped.get(key) || [];
		values.push({ element, name, position, tags, types });
		grouped.set(key, values);
	}

	return [...grouped.entries()].map(([key, values]) => {
		const first = values[0];
		const latitude = values.reduce((sum, value) => sum + value.position.latitude, 0) / values.length;
		const longitude = values.reduce((sum, value) => sum + value.position.longitude, 0) / values.length;
		const sources = values.map(({ element }) => ({
			provider: "OpenStreetMap / OpenSeaMap",
			sourceId: `${element.type}/${element.id}`,
			license: "ODbL-1.0",
			url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
			retrievedAt: RETRIEVED_AT,
		}));
		const welcomeUrl = WELCOME_REFERENCES.get(normalizedName(first.name));
		if (welcomeUrl) sources.push({
			provider: "Welcome Anchorages directory (corroboration only)",
			url: welcomeUrl,
			retrievedAt: RETRIEVED_AT,
		});
		const warnings = {
			anchorage: "Community-mapped anchorage position only. Verify suitability, depths, holding, shelter and restrictions from current charts and pilotage sources.",
			mooring: "Community-mapped mooring location only. Confirm ownership, availability, capacity and condition before use.",
			marina: "Facility classification and availability can change; verify directly with the operator.",
			harbour: "Community-mapped harbour reference; verify current access and facilities.",
		};
		const primaryType = first.types[0];
		return pointLocation({
			key: `osm:${key}`,
			name: first.name,
			description: `OpenStreetMap/OpenSeaMap records this as ${first.types.map((type) => `a ${type.replace(/([A-Z])/g, " $1").toLowerCase()}`).join(" and ")}.`,
			types: first.types,
			latitude,
			longitude,
			featureProperties: {
				"ajrmMarine:source": "openstreetmap",
				"ajrmMarine:sourceRef": sources[0].sourceId,
				...(first.tags.website ? { website: first.tags.website } : {}),
			},
			properties: {
				provenance: {
					reviewStatus: welcomeUrl ? "sourceChecked" : "imported",
					warning: warnings[primaryType],
					sources,
				},
			},
		});
	});
}

function tideGaugeLocations(items) {
	const byName = new Map();
	const outsideScotland = new Set(["bangor", "portrush"]);
	for (const station of items) {
		const latitude = Number(station.lat);
		const longitude = Number(station.long);
		const unitName = station.measures?.[0]?.unitName;
		if (latitude < 54.5 || latitude > 59.5 || longitude > -3.8 || unitName !== "m" || outsideScotland.has(normalizedName(station.label))) continue;
		byName.set(normalizedName(station.label), station);
	}
	return [...byName.values()].map((station) => pointLocation({
		key: `ea-tide-gauge:${station.stationReference}`,
		name: `${station.label} tide gauge`,
		description: "UK National Tide Gauge Network observation station. This is measured water-level data, not a tidal prediction or secondary-port correction.",
		types: ["tidalObservationStation"],
		latitude: station.lat,
		longitude: station.long,
		properties: {
			tide: {
				provider: "Environment Agency real-time flood monitoring API",
				stationId: station.stationReference,
				stationName: station.label,
				datum: "local station datum",
			},
			provenance: {
				reviewStatus: "sourceChecked",
				warning: "Observations normally lag real time and are not predictions. Check datum and timestamp before use.",
				sources: [{
					provider: "UK National Tide Gauge Network / Environment Agency",
					sourceId: station.stationReference,
					license: "OGL-3.0",
					url: station["@id"] || `https://environment.data.gov.uk/flood-monitoring/id/stations/${station.stationReference}`,
					retrievedAt: RETRIEVED_AT,
				}],
			},
		},
	}));
}

function tidalGateLocations() {
	return TIDAL_GATES.map((gate) => {
		const sources = [];
		if (gate.osm) sources.push({
			provider: "OpenStreetMap",
			sourceId: gate.osm,
			license: "ODbL-1.0",
			url: `https://www.openstreetmap.org/${gate.osm}`,
			retrievedAt: RETRIEVED_AT,
		});
		sources.push({ provider: "Published corroborating reference", url: gate.reference, retrievedAt: RETRIEVED_AT });
		return pointLocation({
			key: `tidal-gate:${normalizedName(gate.name)}`,
			name: gate.name,
			description: "Tidal gate reference point. No stream rate, direction or passage time is encoded.",
			types: ["tidalGate"],
			latitude: gate.position[0],
			longitude: gate.position[1],
			properties: {
				provenance: {
					reviewStatus: "sourceChecked",
					warning: "Consult current official charts, tide/stream data and a suitable pilot before planning a passage. This marker supplies no safe-passage time.",
					sources,
				},
			},
		});
	});
}

async function fetchJson(url, options) {
	const response = await fetch(url, options);
	if (!response.ok) throw new Error(`${url} returned ${response.status} ${response.statusText}`);
	return response.json();
}

async function main() {
	const osmFile = process.argv.find((argument) => argument.startsWith("--osm="))?.slice(6);
	const tideFile = process.argv.find((argument) => argument.startsWith("--tides="))?.slice(8);
	const osm = osmFile
		? JSON.parse(await fs.readFile(osmFile, "utf8"))
		: await fetchJson(OVERPASS_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ data: OSM_QUERY }),
		});
	const tides = tideFile
		? JSON.parse(await fs.readFile(tideFile, "utf8"))
		: await fetchJson(TIDE_GAUGE_URL);
	const locations = [
		...osmLocations(osm.elements || []),
		...tideGaugeLocations(tides.items || []),
		...tidalGateLocations(),
	].sort((a, b) => a.name.localeCompare(b.name));
	const ids = new Set(locations.map((location) => location.id));
	if (ids.size !== locations.length) throw new Error("Generated seed contains duplicate stable ids.");
	const payload = {
		schema: "org.ajrm.marine.location-seed/v1",
		region: "West Scotland",
		generatedAt: RETRIEVED_AT,
		locationCount: locations.length,
		licenceNote: "Each location records its source and licence. OSM-derived records are ODbL 1.0; Environment Agency records are OGL 3.0. Editorial references are links used only for corroboration.",
		locations,
	};
	await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
	await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	const counts = {};
	for (const location of locations) for (const type of location.types) counts[type] = (counts[type] || 0) + 1;
	console.log(JSON.stringify({ output: OUTPUT, count: locations.length, counts }, null, 2));
}

main().catch((error) => {
	console.error(error.stack || error.message);
	process.exitCode = 1;
});
