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

test("bulk migration adds only previously unseen stable ids in one catalogue", async (t) => {
	const store = await fixture(t);
	const first = { id: crypto.randomUUID(), ...value("Existing Harbour") };
	const second = { id: crypto.randomUUID(), ...value("Second Harbour") };
	assert.equal((await store.addMissing([first, second], { editedBy: "Harbour migration" })).length, 2);
	assert.equal((await store.addMissing([{ ...first, name: "Must not overwrite" }])).length, 0);
	assert.equal((await store.get(first.id)).name, "Existing Harbour");
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

test("replacement tombstones omitted locations so bundled data cannot return", async (t) => {
	const store = await fixture(t);
	const removedId = crypto.randomUUID();
	const retainedId = crypto.randomUUID();
	await store.set(removedId, value("Remove me"), { expectedRevision: 0 });
	await store.set(retainedId, value("Retain me"), { expectedRevision: 0 });
	const replacement = structuredClone(await store.read());
	delete replacement.locations[removedId];
	delete replacement.history[removedId];
	await store.replace(replacement, { tombstoneMissing: true, editedBy: "Import" });
	const result = await store.read();
	assert.equal(result.locations[removedId], undefined);
	assert.equal(result.locations[retainedId].name, "Retain me");
	assert.equal(result.tombstones[removedId].name, "Remove me");
	assert.equal(result.history[removedId].at(-1).action, "delete");
	assert.equal((await store.addMissing([{ id: removedId, ...value("Seed retry") }])).length, 0);
});

test("Harbour Editor merge matches names, uses later timestamps and removes duplicates", async (t) => {
	const store = await fixture(t);
	const canonicalId = crypto.randomUUID();
	const duplicateId = crypto.randomUUID();
	const importedId = crypto.randomUUID();
	const harbour = (id, longitude, properties = {}) => ({
		id,
		name: "Same Harbour",
		types: ["harbour"],
		feature: {
			type: "Feature",
			properties: {},
			geometry: { type: "Polygon", coordinates: [[[longitude, 55.8], [longitude + 0.01, 55.8], [longitude + 0.01, 55.81], [longitude, 55.8]]] },
		},
		properties: { publishAsHarbourRegion: true, ...properties },
	});
	await store.set(canonicalId, harbour(canonicalId, -5.2, { migratedFromSignalKRegion: true }), { expectedRevision: 0 });
	await store.set(duplicateId, harbour(duplicateId, -5.1, { importedFromHarbourEditor: true }), { expectedRevision: 0 });
	const incoming = {
		locations: [{
			...harbour(importedId, -4.9, { importedFromHarbourEditor: true }),
			createdAt: "2026-08-01T00:00:00Z",
			updatedAt: "2099-08-14T00:00:00Z",
		}],
	};
	const result = await store.mergeHarboursByName(incoming);
	assert.equal(result.matchedByName, 1);
	assert.equal(result.updated, 1);
	assert.equal(result.deduplicated, 1);
	const catalog = await store.read();
	const matches = Object.values(catalog.locations).filter((location) => location.name === "Same Harbour");
	assert.equal(matches.length, 1);
	assert.equal(matches[0].id, canonicalId);
	assert.equal(matches[0].feature.geometry.coordinates[0][0][0], -4.9);
	assert.equal(catalog.tombstones[duplicateId].name, "Same Harbour");
	assert.equal(catalog.locations[importedId], undefined);

	incoming.locations[0].feature.geometry.coordinates[0][0][0] = -4.7;
	incoming.locations[0].feature.geometry.coordinates[0].at(-1)[0] = -4.7;
	incoming.locations[0].updatedAt = "2098-08-14T00:00:00Z";
	const older = await store.mergeHarboursByName(incoming);
	assert.equal(older.keptLocal, 1);
	assert.equal((await store.get(canonicalId)).feature.geometry.coordinates[0][0][0], -4.9);
});
