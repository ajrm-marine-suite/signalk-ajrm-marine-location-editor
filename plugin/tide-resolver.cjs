/**
 * Combines tidal-port selection, provider data and tide calculation into the
 * stable projection consumed by Signal K, Display, Capture and future planners.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { calculateTide } = require("./tide-calculation.cjs");
const { selectTidePort } = require("./tide-selection.cjs");
const { applySecondaryPortCorrections } = require("./secondary-port-corrections.cjs");

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

function referenceLevelSummary(location) {
	const source = location?.properties?.tide?.referenceLevels || location;
	if (!source || typeof source !== "object") return null;
	const result = Object.fromEntries(["mhws", "mhwn", "mlwn", "mlws"]
		.filter((key) => Number.isFinite(Number(source[key])))
		.map((key) => [key, Number(source[key])]));
	return Object.keys(result).length ? result : null;
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
		referenceLevels: referenceLevelSummary(selection.port),
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

	async function resolvePortData(port, byId, request, visited = new Set()) {
		if (!port?.id) throw new Error("Selected tidal port is invalid.");
		if (visited.has(port.id)) throw new Error("Secondary-port parent references contain a cycle.");
		if (visited.size >= 12) throw new Error("Secondary-port parent chain is too deep.");
		const nextVisited = new Set(visited).add(port.id);
		const correction = port.properties?.tide?.secondaryPortCorrections;
		if (correction) {
			const parentId = String(port.properties?.tide?.parentLocationRef || "").split("/").at(-1);
			const parent = byId.get(parentId);
			if (!parent) throw new Error(`Parent tidal location for ${port.name} was not found.`);
			const parentData = await resolvePortData(parent, byId, request, nextVisited);
			const corrected = applySecondaryPortCorrections(
				parentData.events,
				correction,
				parentData.referenceLevels,
			);
			return {
				...parentData,
				events: corrected.events,
				referenceLevels: corrected.referenceLevels,
				datum: port.properties?.tide?.datum || parentData.datum,
				correctionChain: [
					...(parentData.correctionChain || []),
					{ locationId: port.id, name: port.name, contract: correction.contract, parentLocationId: parent.id },
				],
			};
		}
		const providerData = await options.provider.get(port, request);
		return {
			...providerData,
			referenceLevels: referenceLevelSummary(port),
			datum: port.properties?.tide?.datum || null,
			rootPort: locationSummary(port),
			correctionChain: [],
		};
	}

	async function resolve(request = {}) {
		await initialize();
		const now = new Date(request.now || Date.now());
		const locations = await options.listLocations();
		const selection = selectTidePort(locations, {
			position: request.position,
			contextLocationId: request.contextLocationId,
			portId: request.portId,
			pinnedPortId,
		});
		if (!selection.port) return emptyProjection(selection, null, now);
		try {
			const providerData = await resolvePortData(
				selection.port,
				new Map(locations.map((location) => [location.id, location])),
				{ force: request.force, now },
			);
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
				datum: providerData.datum,
				referenceLevels: referenceLevelSummary(providerData.referenceLevels),
				station: {
					providerId: providerData.providerId,
					id: providerData.stationId,
					name: selection.port.properties.tide?.stationName || selection.port.name,
					standardPort: providerData.rootPort,
				},
				source: {
					provider: "UK Hydrographic Office Tidal API",
					fetchedAt: providerData.fetchedAt,
					cache: providerData.cache,
					persistent: providerData.persistent === true,
					fallbackReason: providerData.fallbackReason || null,
					interpolation: calculated.interpolation || null,
					secondaryPortCorrections: providerData.correctionChain,
				},
				freshness: dataFreshness,
				curve: calculated.curve,
				events: request.includeEvents === true ? calculated.curve : undefined,
				error: valid ? "" : dataFreshness.state === "expired" ? "Tidal data have expired." : "Current height could not be calculated.",
			};
		} catch (error) {
			return emptyProjection(selection, error.message, now);
		}
	}

	return { initialize, resolve, setPinnedPort, get pinnedPortId() { return pinnedPortId; } };
}

module.exports = { TIDE_CONTRACT, createTideResolver };
