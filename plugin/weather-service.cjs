/**
 * Provides cached Open-Meteo weather and marine forecasts for a requested
 * marine location while exposing an explicit freshness/provenance contract.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const WEATHER_CONTRACT = "ajrm-marine-weather-service-v1";

function finite(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function validPosition(value) {
	const latitude = Number(value?.latitude);
	const longitude = Number(value?.longitude);
	return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
		Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
		? { latitude, longitude }
		: null;
}

function cacheKey(position, weatherDays, marineDays) {
	return `${position.latitude.toFixed(4)}_${position.longitude.toFixed(4)}_${weatherDays}_${marineDays}`
		.replace(/[^a-z0-9._-]+/gi, "_");
}

async function readJson(file) {
	try { return JSON.parse(await fs.readFile(file, "utf8")); }
	catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function writeJson(file, value) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
	await fs.rename(temporary, file);
}

async function providerJson(fetchFn, url, label) {
	const response = await fetchFn(url);
	if (!response.ok) throw new Error(`${label} returned ${response.status} ${response.statusText}.`);
	return response.json();
}

function freshness(fetchedAt, now, staleAfterHours, expiresAfterHours) {
	const ageSeconds = Math.max(0, (Date.parse(now) - Date.parse(fetchedAt)) / 1000);
	const staleAfterSeconds = staleAfterHours * 3600;
	const expiresAfterSeconds = expiresAfterHours * 3600;
	return {
		ageSeconds,
		state: ageSeconds > expiresAfterSeconds ? "expired" : ageSeconds > staleAfterSeconds ? "stale" : "fresh",
		staleAfterSeconds,
		expiresAfterSeconds,
	};
}

function valueAt(hourly, key, index) {
	const value = Number(hourly?.[key]?.[index]);
	return Number.isFinite(value) ? value : null;
}

function nearestHourIndex(times, now) {
	if (!Array.isArray(times) || !times.length) return -1;
	const target = Date.parse(now);
	let selected = -1;
	let distance = Infinity;
	for (let index = 0; index < times.length; index += 1) {
		const candidate = Math.abs(Date.parse(`${times[index]}Z`) - target);
		if (Number.isFinite(candidate) && candidate < distance) {
			selected = index;
			distance = candidate;
		}
	}
	return selected;
}

function currentSummary(forecast, marine, now) {
	const weatherIndex = nearestHourIndex(forecast?.hourly?.time, now);
	const marineIndex = nearestHourIndex(marine?.hourly?.time, now);
	return {
		at: weatherIndex >= 0 ? `${forecast.hourly.time[weatherIndex]}Z` : null,
		temperatureC: valueAt(forecast?.hourly, "temperature_2m", weatherIndex),
		windSpeedMps: knotsToMps(valueAt(forecast?.hourly, "wind_speed_10m", weatherIndex)),
		windGustMps: knotsToMps(valueAt(forecast?.hourly, "wind_gusts_10m", weatherIndex)),
		windDirectionTrueRad: degreesToRadians(valueAt(forecast?.hourly, "wind_direction_10m", weatherIndex)),
		waveHeightM: valueAt(marine?.hourly, "wave_height", marineIndex),
		wavePeriodSeconds: valueAt(marine?.hourly, "wave_period", marineIndex),
		waveDirectionTrueRad: degreesToRadians(valueAt(marine?.hourly, "wave_direction", marineIndex)),
		swellHeightM: valueAt(marine?.hourly, "swell_wave_height", marineIndex),
		swellPeriodSeconds: valueAt(marine?.hourly, "swell_wave_period", marineIndex),
		swellDirectionTrueRad: degreesToRadians(valueAt(marine?.hourly, "swell_wave_direction", marineIndex)),
	};
}

function degreesToRadians(value) {
	return Number.isFinite(value) ? value * Math.PI / 180 : null;
}

function knotsToMps(value) {
	return Number.isFinite(value) ? value * 0.514444 : null;
}

function emptyProjection(position, contextLocation, error, now) {
	return {
		contract: WEATHER_CONTRACT,
		contractVersion: 1,
		valid: false,
		calculationReferenceAt: new Date(now).toISOString(),
		position,
		contextLocation: contextLocation
			? { id: contextLocation.id, name: contextLocation.name, types: contextLocation.types }
			: null,
		current: null,
		hourly: { forecast: null, marine: null },
		source: null,
		freshness: null,
		error,
	};
}

function contextSummary(contextLocation) {
	return contextLocation
		? { id: contextLocation.id, name: contextLocation.name, types: contextLocation.types }
		: null;
}

function createWeatherService(options) {
	const cacheDirectory = options.cacheDirectory;
	const fetchFn = options.fetchFn || globalThis.fetch;
	if (typeof fetchFn !== "function") throw new Error("Weather service requires fetch support.");
	const staleAfterHours = Math.max(0.25, finite(options.staleAfterHours, 1));
	const expiresAfterHours = Math.max(staleAfterHours, finite(options.expiresAfterHours, 24));

	async function resolve(request = {}) {
		const now = new Date(request.now || Date.now()).toISOString();
		const contextLocation = request.contextLocation || null;
		const position = validPosition(request.position);
		if (!position) return emptyProjection(null, contextLocation, "A position is required for weather.", now);
		const weatherDays = Math.max(1, Math.min(16, Math.round(finite(request.weatherDays, 16))));
		const marineDays = Math.max(1, Math.min(8, Math.round(finite(request.marineDays, 8))));
		const file = path.join(cacheDirectory, `weather-${cacheKey(position, weatherDays, marineDays)}.json`);
		const cached = await readJson(file);
		const cachedFreshness = cached?.source?.fetchedAt
			? freshness(cached.source.fetchedAt, now, staleAfterHours, expiresAfterHours)
			: null;
		if (cached && request.force !== true && cachedFreshness?.state === "fresh") {
			return {
				...cached,
				calculationReferenceAt: now,
				contextLocation: contextSummary(contextLocation),
				freshness: cachedFreshness,
				source: { ...cached.source, cache: "hit" },
			};
		}

		const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
		forecastUrl.search = new URLSearchParams({
			latitude: String(position.latitude), longitude: String(position.longitude),
			hourly: "temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
			wind_speed_unit: "kn", forecast_days: String(weatherDays), timezone: "GMT",
		});
		const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
		marineUrl.search = new URLSearchParams({
			latitude: String(position.latitude), longitude: String(position.longitude),
			hourly: "wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction",
			forecast_days: String(marineDays), timezone: "GMT",
		});

		try {
			const [forecast, marine] = await Promise.all([
				providerJson(fetchFn, forecastUrl, "Open-Meteo weather"),
				providerJson(fetchFn, marineUrl, "Open-Meteo marine"),
			]);
			const fetchedAt = new Date().toISOString();
			const projection = {
				...emptyProjection(position, contextLocation, "", now),
				valid: true,
				current: currentSummary(forecast, marine, now),
				hourly: { forecast, marine },
				source: { provider: "Open-Meteo", fetchedAt, cache: "network", persistent: true, fallbackReason: null },
				freshness: freshness(fetchedAt, now, staleAfterHours, expiresAfterHours),
			};
			await writeJson(file, projection);
			return projection;
		} catch (error) {
			if (cached && cachedFreshness?.state !== "expired") {
				return {
					...cached,
					calculationReferenceAt: now,
					contextLocation: contextSummary(contextLocation),
					freshness: cachedFreshness,
					source: { ...cached.source, cache: "fallback", fallbackReason: error.message },
				};
			}
			return emptyProjection(position, contextLocation, error.message, now);
		}
	}

	return { contract: WEATHER_CONTRACT, resolve };
}

module.exports = { WEATHER_CONTRACT, createWeatherService, currentSummary, validPosition };
