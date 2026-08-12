/**
 * Verifies durable revisions, stale-edit protection, undo and latest-edit merging.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const { createLocationStore } = require("../plugin/location-store.cjs");

function value(name = "Test Anchorage") {
	return {
		name,
		types: ["anchorage"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5.2, 55.8] } },
		properties: {},
	};
}

async function fixture(t) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-location-store-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	return createLocationStore(path.join(directory, "locations.json"));
}

test("each save creates an immutable revision and rejects stale saves", async (t) => {
	const store = await fixture(t);
	const id = crypto.randomUUID();
	const first = await store.set(id, value(), { expectedRevision: 0, editedBy: "Alice" });
	const second = await store.set(id, value("Edited Anchorage"), { expectedRevision: 1, editedBy: "Bob" });
	assert.equal(first.revision, 1);
	assert.equal(second.revision, 2);
	assert.notEqual(first.lastEditId, second.lastEditId);
	assert.deepEqual((await store.history(id)).map((entry) => entry.snapshot?.name), ["Test Anchorage", "Edited Anchorage"]);
	await assert.rejects(store.set(id, value("Stale"), { expectedRevision: 1 }), /changed after it was opened/);
});

test("deletion leaves a tombstone and restore appends a new revision", async (t) => {
	const store = await fixture(t);
	const id = crypto.randomUUID();
	const first = await store.set(id, value(), { expectedRevision: 0 });
	await store.remove(id, { expectedRevision: 1 });
	assert.equal(await store.get(id), null);
	assert.equal((await store.read()).tombstones[id].revision, 2);
	const restored = await store.restore(id, first.lastEditId, { expectedRevision: 2 });
	assert.equal(restored.revision, 3);
	assert.equal(restored.name, "Test Anchorage");
	assert.deepEqual((await store.history(id)).map((entry) => entry.action), ["create", "delete", "restore"]);
});

test("merge accepts the latest edit and reports equal-time conflicts", async (t) => {
	const store = await fixture(t);
	const id = crypto.randomUUID();
	await store.set(id, value("Local"), { expectedRevision: 0 });
	const incoming = structuredClone(await store.read());
	const incomingEdit = crypto.randomUUID();
	incoming.locations[id] = {
		...incoming.locations[id], name: "Imported newer", revision: 2,
		updatedAt: new Date(Date.parse(incoming.locations[id].updatedAt) + 5000).toISOString(), lastEditId: incomingEdit,
	};
	incoming.history[id].push({ editId: incomingEdit, revision: 2, editedAt: incoming.locations[id].updatedAt, editedBy: "Another sailor", action: "update", sourceCatalogId: incoming.catalogId, snapshot: structuredClone(incoming.locations[id]) });
	const newer = await store.merge(incoming);
	assert.equal(newer.updated, 1);
	assert.equal((await store.get(id)).name, "Imported newer");

	const conflict = structuredClone(await store.read());
	conflict.locations[id].name = "Equal-time branch";
	conflict.locations[id].lastEditId = crypto.randomUUID();
	const result = await store.merge(conflict);
	assert.equal(result.conflicts.length, 1);
	assert.equal((await store.get(id)).name, "Imported newer");
});
