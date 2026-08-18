/**
 * Verifies UKHO fetch normalization, shared cache use and tier-based persistence.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createUkhoTideProvider } = require("../plugin/tide-provider.cjs");

const port = { properties: { tide: { providerId: "ukhoTidalEvents", stationId: "0372" } } };
const payload = [
	{ DateTime: "2026-08-18T00:00:00Z", EventType: "LowWater", Height: 1 },
	{ DateTime: "2026-08-18T06:00:00Z", EventType: "HighWater", Height: 5 },
];

test("Discovery cache remains memory-only while repeated calls avoid refetching", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tides-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	let calls = 0;
	const provider = createUkhoTideProvider({
		apiKey: "secret", subscriptionTier: "discovery", cacheDirectory: directory,
		fetchFn: async () => { calls += 1; return { ok: true, json: async () => payload }; },
	});
	const first = await provider.get(port, { now: "2026-08-18T01:00:00Z" });
	const second = await provider.get(port, { now: "2026-08-18T02:00:00Z" });
	assert.equal(first.persistent, false);
	assert.equal(second.cache, "hit");
	assert.equal(calls, 1);
	assert.deepEqual(await fs.readdir(directory), []);
});

test("Foundation tier may persist and recover the shared station cache", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tides-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const provider = createUkhoTideProvider({
		apiKey: "secret", subscriptionTier: "foundation", cacheDirectory: directory,
		fetchFn: async () => ({ ok: true, json: async () => payload }),
	});
	await provider.get(port, { now: "2026-08-18T01:00:00Z" });
	assert.deepEqual(await fs.readdir(directory), ["ukho-0372.json"]);
});
