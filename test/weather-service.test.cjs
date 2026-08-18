/** Exercises weather caching, SI normalization and offline fallback. */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createWeatherService } = require("../plugin/weather-service.cjs");

test("weather service normalizes current values and reuses its durable cache", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-weather-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	let calls = 0;
	const fetchFn = async (url) => {
		calls += 1;
		const marine = String(url).includes("marine-api");
		return { ok: true, async json() { return marine
			? { hourly: { time: ["2026-08-18T12:00"], wave_height: [1.2], wave_period: [6], wave_direction: [180], swell_wave_height: [0.8], swell_wave_period: [8], swell_wave_direction: [225] } }
			: { hourly: { time: ["2026-08-18T12:00"], temperature_2m: [14], wind_speed_10m: [10], wind_gusts_10m: [15], wind_direction_10m: [90] } }; } };
	};
	const service = createWeatherService({ cacheDirectory: directory, fetchFn, staleAfterHours: 1, expiresAfterHours: 24 });
	const request = { position: { latitude: 56.2, longitude: -5.6 }, now: "2026-08-18T12:05:00.000Z" };
	let result = await service.resolve(request);
	assert.equal(result.valid, true);
	assert.ok(Math.abs(result.current.windSpeedMps - 5.14444) < 1e-10);
	assert.ok(Math.abs(result.current.windDirectionTrueRad - Math.PI / 2) < 1e-10);
	assert.equal(calls, 2);
	result = await service.resolve(request);
	assert.equal(result.source.cache, "hit");
	assert.equal(calls, 2);
});
