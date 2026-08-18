/**
 * Verifies resolver provenance, freshness, persisted pinning and safe expiry.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { normalizeLocation } = require("../plugin/location-model.cjs");
const { createTideResolver } = require("../plugin/tide-resolver.cjs");

function port() {
	return normalizeLocation({
		id: crypto.randomUUID(), name: "Oban", types: ["tidalStandardPort"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5.47, 56.41] } },
		properties: { tide: { providerId: "ukhoTidalEvents", stationId: "0372", stationName: "Oban", datum: "Chart Datum", referenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 } } },
	});
}

test("manual pin resolves a fresh projection and persists across resolver instances", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tide-resolver-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const stateFile = path.join(directory, "selection.json");
	const station = port();
	const provider = { get: async () => ({
		providerId: "ukhoTidalEvents", stationId: "0372", fetchedAt: "2026-08-18T01:00:00Z", cache: "hit", persistent: true,
		events: [
			{ at: "2026-08-18T00:00:00Z", type: "low", heightM: 1 },
			{ at: "2026-08-18T06:00:00Z", type: "high", heightM: 5 },
		],
	}) };
	let resolver = createTideResolver({ stateFile, listLocations: async () => [station], provider, staleAfterHours: 24, expiresAfterHours: 72 });
	await resolver.setPinnedPort(station.id);
	let result = await resolver.resolve({ now: "2026-08-18T03:00:00Z" });
	assert.equal(result.valid, true);
	assert.equal(result.heightNowM, 3);
	assert.equal(result.selection.reason, "manualPinnedOverride");
	assert.equal(result.datum, "Chart Datum");
	assert.deepEqual(result.referenceLevels, { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 });

	resolver = createTideResolver({ stateFile, listLocations: async () => [station], provider, staleAfterHours: 24, expiresAfterHours: 72 });
	result = await resolver.resolve({ now: "2026-08-18T03:00:00Z" });
	assert.equal(result.selectedPort.id, station.id);
	assert.equal(result.selection.pinned, true);
});

test("expired source data do not publish a current height as valid", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tide-resolver-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const station = port();
	const resolver = createTideResolver({
		stateFile: path.join(directory, "selection.json"), listLocations: async () => [station],
		provider: { get: async () => ({ providerId: "ukhoTidalEvents", stationId: "0372", fetchedAt: "2026-08-10T00:00:00Z", events: [] }) },
		staleAfterHours: 24, expiresAfterHours: 72,
	});
	await resolver.setPinnedPort(station.id);
	const result = await resolver.resolve({ now: "2026-08-18T03:00:00Z" });
	assert.equal(result.valid, false);
	assert.equal(result.heightNowM, null);
	assert.equal(result.freshness.state, "expired");
});
