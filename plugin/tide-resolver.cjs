/**
 * Combines tidal-port selection, provider data and tide calculation into the
 * stable projection consumed by Signal K, Display, Capture and future planners.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { calculateTide } = require("./tide-calculation.cjs");
const { selectTidePort } = require("./tide-selection.cjs");

const TIDE_CONTRACT = "ajrm-marine-tide-resolver-v1";

async function readState(file) {
	try {
		const value = JSON.parse(await fs.readFile(file, "utf8"));
		return { pinnedPortId: typeof value.pinnedPortId === "string" ? value.pinnedPortId : null };
	} catch (error) {
		if (error.code === "ENOENT") return { pinnedPortId: null };
		throw error;
	}
}

async function writeState(file, value) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	await fs.rename(temporary, file);
}

function locationSummary(location) {
	return location ? { id: location.id, name: location.name, types: location.types } : null;
}

function eventSummary(event) {
	return event ? { at: event.at, heightM: event.heightM } : null;
}

function freshness(fetchedAt, now, options) {
	const ageSeconds = Math.max(0, (new Date(now).getTime() - Date.parse(fetchedAt)) / 1000);
	const staleAfterSeconds = options.staleAfterHours * 3600;
	const expiresAfterSeconds = options.expiresAfterHours * 3600;
	return {
		ageSeconds,
		state: ageSeconds > expiresAfterSeconds ? "expired" : ageSeconds > staleAfterSeconds ? "stale" : "fresh",
		staleAfterSeconds,
		expiresAfterSeconds,
	};
}

function emptyProjection(selection, error, now) {
	return {
		contract: TIDE_CONTRACT,
		contractVersion: 1,
		valid: false,
		calculationReferenceAt: new Date(now).toISOString(),
		selectedPort: locationSummary(selection.port),
		selection: {
			reason: selection.reason,
			pinned: selection.pinned,
			pinValid: selection.pinValid,
			requestedPinnedPortId: selection.requestedPinnedPortId,
			automaticPort: locationSummary(selection.automaticPort),
			automaticReason: selection.automaticReason,
			contextLocation: locationSummary(selection.contextLocation),
			tidalRegion: locationSummary(selection.tidalRegion),
		},
		heightNowM: null,
		nextHighWater: null,
		nextLowWater: null,
		trend: "unknown",
		datum: selection.port?.properties?.tide?.datum || null,
		station: null,
		source: null,
		freshness: null,
		curve: [],
		error: error || (selection.port ? "Tidal data are unavailable." : "No suitable tidal port was selected."),
	};
}

function createTideResolver(options) {
	const stateFile = options.stateFile;
	let pinnedPortId = null;
	let initialized = false;

	async function initialize() {
		if (!initialized) {
			pinnedPortId = (await readState(stateFile)).pinnedPortId;
			initialized = true;
		}
	}

	async function setPinnedPort(portId) {
		await initialize();
		pinnedPortId = portId || null;
		await writeState(stateFile, { pinnedPortId, updatedAt: new Date().toISOString() });
		return pinnedPortId;
	}

	async function resolve(request = {}) {
		await initialize();
		const now = new Date(request.now || Date.now());
		const locations = await options.listLocations();
		const selection = selectTidePort(locations, {
			position: request.position,
			contextLocationId: request.contextLocationId,
			pinnedPortId,
		});
		if (!selection.port) return emptyProjection(selection, null, now);
		try {
			const providerData = await options.provider.get(selection.port, { force: request.force, now });
			const calculated = calculateTide(providerData.events, now);
			const dataFreshness = freshness(providerData.fetchedAt, now, options);
			const valid = calculated.valid && dataFreshness.state !== "expired";
			return {
				...emptyProjection(selection, null, now),
				valid,
				heightNowM: valid ? calculated.heightNowM : null,
				nextHighWater: eventSummary(calculated.nextHighWater),
				nextLowWater: eventSummary(calculated.nextLowWater),
				trend: calculated.trend,
				station: {
					providerId: providerData.providerId,
					id: providerData.stationId,
					name: selection.port.properties.tide.stationName || selection.port.name,
				},
				source: {
					provider: "UK Hydrographic Office Tidal API",
					fetchedAt: providerData.fetchedAt,
					cache: providerData.cache,
					persistent: providerData.persistent === true,
					fallbackReason: providerData.fallbackReason || null,
					interpolation: calculated.interpolation || null,
				},
				freshness: dataFreshness,
				curve: calculated.curve,
				error: valid ? "" : dataFreshness.state === "expired" ? "Tidal data have expired." : "Current height could not be calculated.",
			};
		} catch (error) {
			return emptyProjection(selection, error.message, now);
		}
	}

	return { initialize, resolve, setPinnedPort, get pinnedPortId() { return pinnedPortId; } };
}

module.exports = { TIDE_CONTRACT, createTideResolver };
