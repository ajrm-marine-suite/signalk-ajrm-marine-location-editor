/**
 * Fetches UKHO tidal extremes and maintains one shared, licence-aware cache;
 * Discovery data remains memory-only while paid tiers may persist it on disk.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeTideEvents } = require("./tide-calculation.cjs");

const UKHO_ENDPOINTS = [
	"https://admiraltyapi.azure-api.net/uktidalapi/v1/Stations",
	"https://admiraltyapi.azure-api.net/uktidalapi/api/v1/Stations",
];
const PERSISTENT_TIERS = new Set(["foundation", "premium"]);
const CACHE_TIMESTAMP_CONTRACT = "ukho-gmt-v1";

function safeStationId(value) {
	const stationId = String(value || "").trim();
	if (!/^[A-Za-z0-9._-]{1,100}$/.test(stationId)) throw new Error("Tidal station identifier is invalid.");
	return stationId;
}

function cacheFile(directory, stationId) {
	return path.join(directory, `ukho-${safeStationId(stationId)}.json`);
}

async function writeJsonAtomic(file, value) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	await fs.rename(temporary, file);
}

function createUkhoTideProvider(options = {}) {
	const fetchFn = options.fetchFn || globalThis.fetch;
	const directory = options.cacheDirectory;
	const tier = String(options.subscriptionTier || "discovery").toLowerCase();
	const refreshMs = Math.max(1, Number(options.refreshHours) || 24) * 3600000;
	const memory = new Map();

	async function readPersistent(stationId) {
		if (!directory || !PERSISTENT_TIERS.has(tier)) return null;
		try {
			const value = JSON.parse(await fs.readFile(cacheFile(directory, stationId), "utf8"));
			// Pre-0.6.5 caches may contain UKHO GMT wall-clock values that were
			// interpreted as BST before serialization. They cannot be repaired
			// reliably, so force one authoritative refetch after upgrade.
			return value.timestampContract === CACHE_TIMESTAMP_CONTRACT && Array.isArray(value.events) ? value : null;
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	}

	async function fetchEvents(stationId, apiKey) {
		if (!apiKey) throw new Error("Configure a UKHO Tidal API subscription key.");
		let lastError = null;
		for (const base of UKHO_ENDPOINTS) {
			try {
				const response = await fetchFn(`${base}/${encodeURIComponent(stationId)}/TidalEvents`, {
					headers: { "Ocp-Apim-Subscription-Key": apiKey },
					signal: AbortSignal.timeout(15000),
				});
				if (!response.ok) throw new Error(`UKHO Tidal API returned ${response.status} ${response.statusText}.`);
				const events = normalizeTideEvents(await response.json());
				if (events.length < 2) throw new Error("UKHO Tidal API returned insufficient high/low-water events.");
				return events;
			} catch (error) {
				lastError = error;
			}
		}
		throw lastError || new Error("UKHO Tidal API did not respond.");
	}

	async function get(port, request = {}) {
		if (port?.properties?.tide?.providerId !== "ukhoTidalEvents") {
			throw new Error(`Unsupported tidal provider: ${port?.properties?.tide?.providerId || "not configured"}.`);
		}
		const stationId = safeStationId(port.properties.tide.stationId);
		const now = new Date(request.now || Date.now());
		let cached = memory.get(stationId) || await readPersistent(stationId);
		if (cached) memory.set(stationId, cached);
		const ageMs = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Infinity;
		if (!request.force && cached && ageMs < refreshMs) return { ...cached, cache: "hit" };
		try {
			const events = await fetchEvents(stationId, request.apiKey || options.apiKey);
			const result = {
				providerId: "ukhoTidalEvents",
				timestampContract: CACHE_TIMESTAMP_CONTRACT,
				stationId,
				fetchedAt: now.toISOString(),
				events,
				cache: "network",
				persistent: PERSISTENT_TIERS.has(tier),
			};
			memory.set(stationId, result);
			if (directory && result.persistent) await writeJsonAtomic(cacheFile(directory, stationId), result);
			return result;
		} catch (error) {
			if (cached) return { ...cached, cache: "staleFallback", fallbackReason: error.message };
			throw error;
		}
	}

	return { get, persistentCachePermitted: PERSISTENT_TIERS.has(tier), tier };
}

module.exports = { createUkhoTideProvider, safeStationId };
