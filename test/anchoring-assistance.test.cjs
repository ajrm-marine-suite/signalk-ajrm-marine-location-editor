/**
 * Verifies anchoring suggestions, confirmation, trusted automation and the
 * rule that vessel motion never revokes an Anchored profile.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAnchoringAssistant } = require("../plugin/anchoring-assistance.cjs");

function anchorage(properties = {}) {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		name: "Test Anchorage",
		types: ["anchorage"],
		feature: { type: "Feature", geometry: { type: "Point", coordinates: [-5.2, 55.8] } },
		properties: { anchorage: properties },
	};
}

function fixture({ trusted = false } = {}) {
	let now = Date.parse("2026-08-18T10:00:00Z");
	let profile = "coastal";
	const selected = [];
	const assistant = createAnchoringAssistant({
		listLocations: async () => [anchorage({ trustedAutomation: trusted })],
		getTrafficApi: () => ({
			status: () => ({ profiles: { current: profile } }),
			setProfile(value, context) { profile = value; selected.push({ value, context }); },
		}),
		now: () => now,
		options: { stationarySeconds: 300, trustedLocationAutomation: trusted },
	});
	return {
		assistant, selected,
		advance(seconds) { now += seconds * 1000; },
		position: { latitude: 55.8, longitude: -5.2 },
		profile: () => profile,
	};
}

test("stationary evidence creates a confirmation-first anchoring suggestion", async () => {
	const f = fixture();
	let status = await f.assistant.observe({ position: f.position, sog: 0.05 });
	assert.equal(status.state, "observing");
	f.advance(299);
	status = await f.assistant.observe({ position: f.position, sog: 0.05 });
	assert.equal(status.state, "observing");
	f.advance(1);
	status = await f.assistant.observe({ position: f.position, sog: 0.05 });
	assert.equal(status.state, "suggested");
	assert.ok(status.suggestionId);
	assert.deepEqual(f.selected, []);
	status = await f.assistant.confirm(status.suggestionId);
	assert.equal(status.state, "confirmed");
	assert.equal(f.profile(), "anchor");
	assert.equal(f.selected[0].context.source, "anchoringAssistance");
});

test("a trusted location can select Anchored without browser confirmation", async () => {
	const f = fixture({ trusted: true });
	await f.assistant.observe({ position: f.position, sog: 0 });
	f.advance(300);
	const status = await f.assistant.observe({ position: f.position, sog: 0 });
	assert.equal(status.state, "automated");
	assert.equal(f.profile(), "anchor");
});

test("movement after confirmation does not un-anchor", async () => {
	const f = fixture();
	await f.assistant.observe({ position: f.position, sog: 0 });
	f.advance(300);
	let status = await f.assistant.observe({ position: f.position, sog: 0 });
	status = await f.assistant.confirm(status.suggestionId);
	f.advance(10);
	status = await f.assistant.observe({ position: f.position, sog: 4 });
	assert.equal(status.state, "confirmed");
	assert.equal(f.profile(), "anchor");
	assert.equal(f.selected.length, 1);
});

test("dismissed suggestions stay dismissed until the vessel leaves or moves", async () => {
	const f = fixture();
	await f.assistant.observe({ position: f.position, sog: 0 });
	f.advance(300);
	let status = await f.assistant.observe({ position: f.position, sog: 0 });
	status = f.assistant.dismiss(status.suggestionId);
	assert.equal(status.state, "dismissed");
	f.advance(30);
	status = await f.assistant.observe({ position: f.position, sog: 0 });
	assert.equal(status.state, "dismissed");
	status = await f.assistant.observe({ position: f.position, sog: 1 });
	assert.equal(status.state, "idle");
});
