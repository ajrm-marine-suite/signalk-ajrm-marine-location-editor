/**
 * Generates the reviewed Admiralty API port seed and mutually non-overlapping
 * best-effort tidal areas from the EasyTide workbook request list.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { mergeSecondaryPortSeed } = require("../plugin/secondary-port-seed.cjs");

const root = path.join(__dirname, "..");
const existingStandardIds = new Set(["0372", "0308", "0334"]);
const sourceUrl = "https://developer.admiralty.co.uk/products";
const retrievedAt = "2026-08-21T00:00:00.000Z";

// spreadsheetId is retained for audit only. stationId and coordinates were
// verified against the live UKHO Stations endpoint on 2026-08-21.
const verified = [
	["0623", "Warrenpoint", "Northern Ireland", "Secondary Port", "0628", "WARRENPOINT", -6.25, 54.1],
	["0625", "Kilkeel", "Northern Ireland", "Secondary Port", "0629", "Kilkeel", -5.983333, 54.05],
	["0629", "Newcastle", "Northern Ireland", "Secondary Port", "0630", "Newcastle (N.Ireland)", -5.883333, 54.2],
	["0631", "Ardglass", "Northern Ireland", "Secondary Port", "0631", "Ardglass", -5.6, 54.266666],
	["0633", "Strangford Bar", "Northern Ireland", "Secondary Port", "0633", "Strangford", -5.55, 54.366666],
	["0634", "Killyleagh", "Northern Ireland", "Secondary Port", "0634", "Killyleagh", -5.65, 54.4],
	["0635", "South Rock", "Northern Ireland", "Secondary Port", "0635", "South Rock", -5.416666, 54.4],
	["0637", "Donaghadee", "Northern Ireland", "Secondary Port", "0637", "Donaghadee", -5.533333, 54.65],
	["0639", "Bangor", "Northern Ireland", "Secondary Port", "0637A", "Bangor", -5.666666, 54.666666],
	["0641", "Belfast", "Northern Ireland", "Standard Port", "0638", "BELFAST", -5.916666, 54.6],
	["0643", "Carrickfergus", "Northern Ireland", "Secondary Port", "0639", "Carrickfergus", -5.8, 54.716666],
	["0645", "Larne", "Northern Ireland", "Secondary Port", "0641", "LARNE", -5.8, 54.85],
	["0649", "Red Bay", "Northern Ireland", "Secondary Port", "0643", "Red Bay", -6.05, 55.066666],
	["0651", "Portrush", "Northern Ireland", "Secondary Port", "0652", "Portrush", -6.666666, 55.2],
	["0653", "Coleraine", "Northern Ireland", "Secondary Port", "0653", "Coleraine", -6.666666, 55.133333],
	["0655", "Londonderry (Derry)", "Northern Ireland", "Secondary Port", "0659", "Londonderry", -7.316666, 55],
	["0341", "Kirkcudbright Bay", "Firth of Clyde & SW Scotland", "Secondary Port", "0422A", "Kirkcudbright Bay", -4.066666, 54.8],
	["0345", "Portpatrick", "Firth of Clyde & SW Scotland", "Secondary Port", "0415", "Portpatrick", -5.116666, 54.85],
	["0348", "Girvan", "Firth of Clyde & SW Scotland", "Secondary Port", "0414", "Girvan", -4.866666, 55.25],
	["0351", "Ayr", "Firth of Clyde & SW Scotland", "Secondary Port", "0413", "Ayr", -4.65, 55.466666],
	["0353", "Troon", "Firth of Clyde & SW Scotland", "Secondary Port", "0412", "Troon", -4.683333, 55.55],
	["0355", "Irvine", "Firth of Clyde & SW Scotland", "Secondary Port", "0411", "Irvine", -4.7, 55.6],
	["0357", "Ardrossan", "Firth of Clyde & SW Scotland", "Secondary Port", "0410", "Ardrossan", -4.816666, 55.633333],
	["0363", "Rothesay (Isle of Bute)", "Firth of Clyde & SW Scotland", "Secondary Port", "0399", "Rothesay Bay", -5.05, 55.833333],
	["0365", "Greenock", "Firth of Clyde & SW Scotland", "Standard Port", "0404", "GREENOCK", -4.766666, 55.95],
	["0367", "Glasgow", "Firth of Clyde & SW Scotland", "Secondary Port", "0407", "GLASGOW", -4.266666, 55.85],
	["0375", "Brodick (Isle of Arran)", "Firth of Clyde & SW Scotland", "Secondary Port", "0408", "Brodick Bay", -5.133333, 55.583333],
	["0377", "Campbeltown", "Firth of Clyde & SW Scotland", "Secondary Port", "0393", "CAMPBELTOWN", -5.6, 55.416666],
	["0381", "Port Ellen (Islay)", "SW Highlands & Inner Hebrides", "Secondary Port", "0381", "Port Ellen", -6.183333, 55.633333],
	["0383", "Craighouse (Jura)", "SW Highlands & Inner Hebrides", "Secondary Port", "0383", "Craighouse", -5.95, 55.833333],
	["0385", "Port Askaig (Islay)", "SW Highlands & Inner Hebrides", "Secondary Port", "0382", "Port Askaig", -6.105, 55.848333],
	["0387", "Carsaig Bay / Crinan", "SW Highlands & Inner Hebrides", "Secondary Port", "0387", "Carsaig Bay", -5.633333, 56.033333],
	["0395", "Oban", "SW Highlands & Inner Hebrides", "Standard Port", "0372", "OBAN", -5.483333, 56.416666],
	["0397", "Dunstaffnage", "SW Highlands & Inner Hebrides", "Secondary Port", "0371", "Dunstaffnage Bay", -5.433333, 56.45],
	["0399", "Lochaline", "SW Highlands & Inner Hebrides", "Secondary Port", "0365", "Loch Aline", -5.766666, 56.533333],
	["0401", "Tobermory (Isle of Mull)", "SW Highlands & Inner Hebrides", "Secondary Port", "0364", "Tobermory", -6.066666, 56.616666],
	["0403", "Coll (Arinagour)", "SW Highlands & Inner Hebrides", "Secondary Port", "0356", "Loch Eatharna", -6.516666, 56.616666],
	["0405", "Tiree (Scarinish)", "SW Highlands & Inner Hebrides", "Secondary Port", "0357", "Gott Bay", -6.8, 56.516666],
	["0409", "Corpach / Fort William", "NW Highlands & Skye", "Standard Port", "0368", "Corpach", -5.116666, 56.85],
	["0415", "Mallaig", "NW Highlands & Skye", "Secondary Port", "0353A", "Mallaig", -5.833333, 57],
	["0419", "Kyle of Lochalsh", "NW Highlands & Skye", "Secondary Port", "0349", "Kyle Of Lochalsh", -5.716666, 57.283333],
	["0421", "Portree (Skye)", "NW Highlands & Skye", "Secondary Port", "0342", "Portree", -6.183333, 57.4],
	["0423", "Gairloch", "NW Highlands & Skye", "Secondary Port", "0337", "Gairloch", -5.683333, 57.716666],
	["0425", "Ullapool", "NW Highlands & Skye", "Standard Port", "0334", "ULLAPOOL", -5.15, 57.9],
	["0427", "Lochinver", "NW Highlands & Skye", "Secondary Port", "0332", "Loch Inver", -5.3, 58.15],
	["0429", "Kinlochbervie", "NW Highlands & Skye", "Secondary Port", "0327", "Kinlochbervie", -5.05, 58.45],
	["0431", "Castlebay (Barra)", "Outer Hebrides", "Secondary Port", "0314A", "Castlebay", -7.483333, 56.95],
	["0433", "Lochmaddy (North Uist)", "Outer Hebrides", "Secondary Port", "0311", "Lochmaddy", -7.15, 57.6],
	["0435", "Tarbert (Harris)", "Outer Hebrides", "Secondary Port", "0310", "East Loch Tarbert, Outer Hebrides", -6.8, 57.9],
	["0437", "Stornoway", "Outer Hebrides", "Standard Port", "0308", "STORNOWAY", -6.383333, 58.2],
];

const unresolved = [
	["0621", "Carlingford Bar"], ["0627", "Annalong"], ["0647", "Glenarm"],
	["0359", "Fairlie"], ["0361", "Largs"], ["0369", "Dunoon"], ["0371", "Holy Loch"],
	["0373", "Lochgilphead"], ["0389", "Luing (Cuan Sound Area)"], ["0391", "Craobh Haven"],
	["0393", "Kerrera Sound"], ["0413", "Arisaig"], ["0417", "Armadale (Skye)"],
	["0439", "East Loch Roag"],
];

function stableId(value) {
	const bytes = Buffer.from(crypto.createHash("sha256").update(value).digest().subarray(0, 16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function apiPort(row) {
	const [spreadsheetId, requestedName, region, stationType, stationId, stationName, longitude, latitude] = row;
	return {
		id: stableId(`ukho-tidal-api:${stationId}`),
		name: `${requestedName} (Admiralty API)`,
		description: `Admiralty Tidal API station verified by name against the live station catalogue. Spreadsheet id ${spreadsheetId} was not used because it did not identify this station in the API.`,
		types: [stationType === "Standard Port" ? "tidalStandardPort" : "tidalSecondaryPort"],
		feature: {
			type: "Feature",
			properties: { "ajrmMarine:sourceRef": `ukho-tidal-api:${stationId}` },
			geometry: { type: "Point", coordinates: [longitude, latitude] },
		},
		properties: {
			tide: {
				...(stationType === "Secondary Port" ? { predictionSource: "ukhoTidalEvents" } : {}),
				provider: "UK Hydrographic Office",
				providerId: "ukhoTidalEvents",
				stationId,
				stationName,
				datum: "Chart Datum",
			},
			provenance: {
				reviewStatus: "sourceChecked",
				warning: "Tidal areas are machine-generated first-review boundaries and must be checked locally before operational use.",
				sources: [{
					provider: "UK Hydrographic Office Tidal API",
					sourceId: `ukho-tidal-api:${stationId}`,
					url: sourceUrl,
					retrievedAt,
				}, {
					provider: "User-supplied EasyTide workbook",
					sourceId: `easytide-workbook:${spreadsheetId}`,
					url: "https://easytide.admiralty.co.uk/",
					retrievedAt,
				}],
			},
			importRegion: region,
		},
	};
}

function point(location) {
	if (location.feature?.geometry?.type !== "Point") return null;
	return { longitude: Number(location.feature.geometry.coordinates[0]), latitude: Number(location.feature.geometry.coordinates[1]) };
}

const latitudeScale = 111320;
const longitudeScale = latitudeScale * Math.cos(56 * Math.PI / 180);
const project = ({ longitude, latitude }) => ({ x: longitude * longitudeScale, y: latitude * latitudeScale });
const unproject = ({ x, y }) => [Number((x / longitudeScale).toFixed(6)), Number((y / latitudeScale).toFixed(6))];

function clipHalfPlane(polygon, site, other) {
	const dx = other.x - site.x;
	const dy = other.y - site.y;
	const midpoint = { x: (site.x + other.x) / 2, y: (site.y + other.y) / 2 };
	const signed = (p) => (p.x - midpoint.x) * dx + (p.y - midpoint.y) * dy;
	const result = [];
	for (let index = 0; index < polygon.length; index += 1) {
		const start = polygon[index];
		const end = polygon[(index + 1) % polygon.length];
		const a = signed(start);
		const b = signed(end);
		if (a <= 0) result.push(start);
		if ((a <= 0) !== (b <= 0)) {
			const fraction = a / (a - b);
			result.push({ x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction });
		}
	}
	return result;
}

function virtualSites(ports) {
	const groups = new Map();
	for (const port of ports) {
		const position = point(port);
		const key = `${position.longitude.toFixed(5)},${position.latitude.toFixed(5)}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push({ port, position });
	}
	const sites = [];
	for (const group of groups.values()) {
		group.sort((left, right) => left.port.id.localeCompare(right.port.id));
		for (const [index, entry] of group.entries()) {
			const base = project(entry.position);
			const angle = 2 * Math.PI * index / group.length;
			const offset = group.length > 1 ? 25 : 0;
			sites.push({ ...entry, x: base.x + Math.cos(angle) * offset, y: base.y + Math.sin(angle) * offset });
		}
	}
	return sites;
}

function tidalArea(site, sites) {
	const radius = 30000;
	let polygon = [
		{ x: site.x - radius, y: site.y - radius }, { x: site.x + radius, y: site.y - radius },
		{ x: site.x + radius, y: site.y + radius }, { x: site.x - radius, y: site.y + radius },
	];
	for (const other of sites) {
		if (other === site) continue;
		polygon = clipHalfPlane(polygon, site, other);
		if (!polygon.length) break;
	}
	const coordinates = polygon.map(unproject);
	coordinates.push([...coordinates[0]]);
	return {
		id: stableId(`tidal-area:${site.port.id}`),
		name: `${site.port.name} tidal area`,
		description: "Machine-generated non-overlapping first-review tidal area. Adjust its polygon in Location Editor to match local tidal geography.",
		types: ["tidalRegion"],
		feature: {
			type: "Feature",
			properties: { "ajrmMarine:sourceRef": `generated-tidal-area:${site.port.id}`, editorShape: "Polygon" },
			geometry: { type: "Polygon", coordinates: [coordinates] },
		},
		properties: {
			tideLocationRef: `/resources/locations/${site.port.id}`,
			provenance: {
				reviewStatus: "imported",
				warning: "Machine-generated Voronoi-style boundary; review and edit before operational use.",
				sources: [{ provider: "AJRM Marine Location Editor area generator", sourceId: `generated-tidal-area:${site.port.id}`, url: "https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor", retrievedAt }],
			},
		},
	};
}

const west = JSON.parse(fs.readFileSync(path.join(root, "defaults/west-scotland-locations.json"), "utf8"));
const reedsFiles = ["secondary-port-locations.json", "secondary-port-locations-ullapool.json", "secondary-port-locations-stornoway.json"];
const mergedReeds = reedsFiles.reduce((seed, filename) => mergeSecondaryPortSeed(seed, JSON.parse(fs.readFileSync(path.join(root, "defaults", filename), "utf8"))), west);
const apiPorts = verified.filter((row) => !existingStandardIds.has(row[4])).map(apiPort);
const ports = [...mergedReeds.locations.filter((location) => location.types?.some((type) => ["tidalStandardPort", "tidalSecondaryPort"].includes(type))), ...apiPorts];
const sites = virtualSites(ports);
const areas = sites.map((site) => tidalArea(site, sites));

fs.writeFileSync(path.join(root, "defaults/admiralty-api-ports.json"), `${JSON.stringify({
	schema: "org.ajrm.marine.location-seed/v1",
	generatedAt: retrievedAt,
	requestedCount: verified.length + unresolved.length,
	verifiedCount: verified.length,
	unresolved: unresolved.map(([spreadsheetId, name]) => ({ spreadsheetId, name, reason: "No same-name UKHO Tidal API station was present; the spreadsheet id identifies another station or returns 404." })),
	locations: apiPorts,
}, null, 2)}\n`);
fs.writeFileSync(path.join(root, "defaults/tidal-port-areas.json"), `${JSON.stringify({
	schema: "org.ajrm.marine.location-seed/v1",
	generatedAt: retrievedAt,
	method: "30-km bounded planar Voronoi cells; duplicate coordinates receive deterministic 25-m virtual-site offsets",
	locations: areas,
}, null, 2)}\n`);

console.log(`Generated ${apiPorts.length} Admiralty API ports and ${areas.length} non-overlapping tidal areas; ${unresolved.length} workbook rows remain unresolved.`);
