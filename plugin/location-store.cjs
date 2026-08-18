/**
 * Persists the AJRM marine-location catalogue with serialized, atomic file replacement.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { emptyCatalog, normalizeCatalog, normalizeLocation } = require("./location-model.cjs");

function createLocationStore(filePath) {
	let operation = Promise.resolve();

	async function read() {
		try {
			const text = await fs.readFile(filePath, "utf8");
			return normalizeCatalog(JSON.parse(text));
		} catch (error) {
			if (error.code === "ENOENT") return emptyCatalog();
			throw error;
		}
	}

	async function write(catalog) {
		const normalized = normalizeCatalog(catalog);
		normalized.updatedAt = new Date().toISOString();
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
		await fs.writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		await fs.rename(temporary, filePath);
		return normalized;
	}

	function mutate(action) {
		const result = operation.then(async () => action(await read()));
		operation = result.catch(() => {});
		return result;
	}

	return {
		filePath,
		async list() {
			return Object.values((await read()).locations);
		},
		async get(id) {
			return (await read()).locations[id] || null;
		},
		async set(id, value, options = {}) {
			return mutate(async (catalog) => {
				const previous = catalog.locations[id] || catalog.tombstones[id] || null;
				if (
					options.expectedRevision != null &&
					Number(options.expectedRevision) !== Number(previous?.revision || 0)
				) {
					throw new Error("Location changed after it was opened. Refresh it before saving.");
				}
				const editedAt = new Date().toISOString();
				const revision = Number(previous?.revision || 0) + 1;
				const editId = crypto.randomUUID();
				const location = normalizeLocation({
					...(value || {}),
					id,
					revision,
					createdAt: catalog.locations[id]?.createdAt || editedAt,
					updatedAt: editedAt,
					lastEditId: editId,
				});
				catalog.locations[id] = location;
				delete catalog.tombstones[id];
				catalog.purgedIds = catalog.purgedIds.filter((purgedId) => purgedId !== id);
				catalog.history[id] = catalog.history[id] || [];
				catalog.history[id].push({
					editId,
					revision,
					editedAt,
					editedBy: String(options.editedBy || "local"),
					action: previous ? "update" : "create",
					sourceCatalogId: catalog.catalogId,
					snapshot: structuredClone(location),
				});
				await write(catalog);
				return location;
			});
		},
		async addMissing(values, options = {}) {
			return mutate(async (catalog) => {
				const added = [];
				const editedAt = new Date().toISOString();
				for (const value of values) {
					if (catalog.locations[value.id] || catalog.tombstones[value.id] || catalog.purgedIds.includes(value.id)) continue;
					const editId = crypto.randomUUID();
					const location = normalizeLocation({
						...value,
						revision: 1,
						createdAt: editedAt,
						updatedAt: editedAt,
						lastEditId: editId,
					});
					catalog.locations[location.id] = location;
					catalog.history[location.id] = [{
						editId,
						revision: 1,
						editedAt,
						editedBy: String(options.editedBy || "migration"),
						action: "create",
						sourceCatalogId: catalog.catalogId,
						snapshot: structuredClone(location),
					}];
					added.push(location);
				}
				if (added.length) await write(catalog);
				return added;
			});
		},
		async remove(id, options = {}) {
			return mutate(async (catalog) => {
				const previous = catalog.locations[id];
				if (!previous) return false;
				if (
					options.expectedRevision != null &&
					Number(options.expectedRevision) !== Number(previous.revision)
				) {
					throw new Error("Location changed after it was opened. Refresh it before deleting.");
				}
				const editedAt = new Date().toISOString();
				const revision = Number(previous.revision || 0) + 1;
				const editId = crypto.randomUUID();
				delete catalog.locations[id];
				catalog.tombstones[id] = {
					id,
					name: previous.name,
					types: previous.types,
					revision,
					updatedAt: editedAt,
					lastEditId: editId,
				};
				catalog.history[id] = catalog.history[id] || [];
				catalog.history[id].push({
					editId,
					revision,
					editedAt,
					editedBy: String(options.editedBy || "local"),
					action: "delete",
					sourceCatalogId: catalog.catalogId,
					snapshot: null,
				});
				await write(catalog);
				return true;
			});
		},
		async history(id) {
			return structuredClone((await read()).history[id] || []);
		},
		async purgeDeleted() {
			return mutate(async (catalog) => {
				const ids = Object.keys(catalog.tombstones);
				catalog.purgedIds = [...new Set([...catalog.purgedIds, ...ids])];
				for (const id of ids) {
					delete catalog.tombstones[id];
					delete catalog.history[id];
				}
				if (ids.length) await write(catalog);
				return ids.length;
			});
		},
		async restore(id, targetEditId, options = {}) {
			return mutate(async (catalog) => {
				const entries = catalog.history[id] || [];
				const target = entries.find((entry) => entry.editId === targetEditId);
				if (!target?.snapshot) throw new Error("The requested revision has no restorable snapshot.");
				const current = catalog.locations[id] || catalog.tombstones[id];
				if (
					options.expectedRevision != null &&
					Number(options.expectedRevision) !== Number(current?.revision || 0)
				) {
					throw new Error("Location changed after its history was opened. Refresh before undoing.");
				}
				const editedAt = new Date().toISOString();
				const revision = Number(current?.revision || 0) + 1;
				const editId = crypto.randomUUID();
				const location = normalizeLocation({
					...structuredClone(target.snapshot),
					id,
					revision,
					createdAt: target.snapshot.createdAt || editedAt,
					updatedAt: editedAt,
					lastEditId: editId,
				});
				if (options.validate) await options.validate(location, catalog);
				catalog.locations[id] = location;
				delete catalog.tombstones[id];
				entries.push({
					editId,
					revision,
					editedAt,
					editedBy: String(options.editedBy || "local"),
					action: "restore",
					sourceCatalogId: catalog.catalogId,
					restoredRevision: target.revision,
					snapshot: structuredClone(location),
				});
				await write(catalog);
				return location;
			});
		},
		async replace(payload, options = {}) {
			return mutate(async (catalog) => {
				const incoming = normalizeCatalog(payload);
				if (options.tombstoneMissing) {
					const editedAt = new Date().toISOString();
					for (const [id, previous] of Object.entries(catalog.locations)) {
						if (incoming.locations[id] || incoming.tombstones[id]) continue;
						const revision = Number(previous.revision || 0) + 1;
						const editId = crypto.randomUUID();
						incoming.tombstones[id] = {
							id,
							name: previous.name,
							types: previous.types,
							revision,
							updatedAt: editedAt,
							lastEditId: editId,
						};
						incoming.history[id] = mergeHistory(catalog.history[id], incoming.history[id]);
						incoming.history[id].push({
							editId,
							revision,
							editedAt,
							editedBy: String(options.editedBy || "catalogue replacement"),
							action: "delete",
							sourceCatalogId: incoming.catalogId,
							snapshot: null,
						});
					}
				}
				return write(incoming);
			});
		},
		async merge(payload, options = {}) {
			return mutate(async (catalog) => {
				const incoming = normalizeCatalog(payload);
				for (const id of incoming.purgedIds) {
					delete catalog.locations[id];
					delete catalog.tombstones[id];
					delete catalog.history[id];
				}
				catalog.purgedIds = [...new Set([...catalog.purgedIds, ...incoming.purgedIds])];
				let added = 0;
				let updated = 0;
				let keptLocal = 0;
				const conflicts = [];
				const ids = new Set([
					...Object.keys(incoming.locations),
					...Object.keys(incoming.tombstones),
				]);
				for (const id of ids) {
					if (catalog.purgedIds.includes(id)) continue;
					const incomingValue = incoming.locations[id] || incoming.tombstones[id];
					const localValue = catalog.locations[id] || catalog.tombstones[id];
					catalog.history[id] = mergeHistory(catalog.history[id], incoming.history[id]);
					if (!localValue) {
						applyWinner(catalog, id, incoming);
						added += 1;
						continue;
					}
					if (localValue.lastEditId === incomingValue.lastEditId) {
						keptLocal += 1;
						continue;
					}
					const comparison = Date.parse(incomingValue.updatedAt) - Date.parse(localValue.updatedAt);
					if (comparison > 0) {
						applyWinner(catalog, id, incoming);
						updated += 1;
					} else if (comparison < 0) {
						keptLocal += 1;
					} else {
						conflicts.push({ id, name: localValue.name || incomingValue.name || id, updatedAt: localValue.updatedAt });
					}
				}
				if (options.validate) await options.validate(catalog);
				await write(catalog);
				return { catalog, added, updated, keptLocal, conflicts };
			});
		},
		async mergeHarboursByName(payload, options = {}) {
			return mutate(async (catalog) => {
				const incoming = normalizeCatalog(payload);
				let added = 0;
				let updated = 0;
				let keptLocal = 0;
				let matchedByName = 0;
				let deduplicated = 0;
				for (const imported of Object.values(incoming.locations)) {
					if (catalog.purgedIds.includes(imported.id)) {
						keptLocal += 1;
						continue;
					}
					const nameKey = normalizedHarbourName(imported.name);
					const matches = Object.values(catalog.locations)
						.filter((location) => normalizedHarbourName(location.name) === nameKey)
						.sort(compareHarbourMergeCandidates);
					if (!matches.length) {
						catalog.locations[imported.id] = structuredClone(imported);
						catalog.history[imported.id] = mergeHistory(catalog.history[imported.id], incoming.history[imported.id]);
						delete catalog.tombstones[imported.id];
						added += 1;
						continue;
					}
					matchedByName += 1;
					const canonical = matches[0];
					for (const duplicate of matches.slice(1)) {
						tombstoneDuplicate(catalog, duplicate, options.editedBy);
						deduplicated += 1;
					}
					const migrationTimestampIsSynthetic =
						canonical.revision === 1 &&
						canonical.properties?.migratedFromSignalKRegion === true &&
						canonical.properties?.importedFromHarbourEditor !== true;
					if (!migrationTimestampIsSynthetic && Date.parse(imported.updatedAt) <= Date.parse(canonical.updatedAt)) {
						keptLocal += 1;
						continue;
					}
					const editId = crypto.randomUUID();
					const revision = Number(canonical.revision || 0) + 1;
					const replacement = normalizeLocation({
						...structuredClone(imported),
						id: canonical.id,
						revision,
						createdAt: canonical.createdAt || imported.createdAt,
						lastEditId: editId,
					});
					catalog.locations[canonical.id] = replacement;
					delete catalog.tombstones[canonical.id];
					catalog.history[canonical.id] = catalog.history[canonical.id] || [];
					catalog.history[canonical.id].push({
						editId,
						revision,
						editedAt: replacement.updatedAt,
						editedBy: String(options.editedBy || "Harbour Editor merge"),
						action: "merge",
						sourceCatalogId: incoming.catalogId,
						snapshot: structuredClone(replacement),
					});
					updated += 1;
				}
				if (options.validate) await options.validate(catalog);
				await write(catalog);
				return { catalog, added, updated, keptLocal, matchedByName, deduplicated, conflicts: [] };
			});
		},
		read,
		write,
	};
}

function normalizedHarbourName(value) {
	return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

function compareHarbourMergeCandidates(left, right) {
	const leftImported = left.properties?.importedFromHarbourEditor === true ? 1 : 0;
	const rightImported = right.properties?.importedFromHarbourEditor === true ? 1 : 0;
	return leftImported - rightImported ||
		Number(right.revision || 0) - Number(left.revision || 0) ||
		String(left.createdAt || "").localeCompare(String(right.createdAt || "")) ||
		left.id.localeCompare(right.id);
}

function tombstoneDuplicate(catalog, duplicate, editedBy) {
	const editedAt = new Date().toISOString();
	const revision = Number(duplicate.revision || 0) + 1;
	const editId = crypto.randomUUID();
	delete catalog.locations[duplicate.id];
	catalog.tombstones[duplicate.id] = {
		id: duplicate.id,
		name: duplicate.name,
		types: duplicate.types,
		revision,
		updatedAt: editedAt,
		lastEditId: editId,
	};
	catalog.history[duplicate.id] = catalog.history[duplicate.id] || [];
	catalog.history[duplicate.id].push({
		editId,
		revision,
		editedAt,
		editedBy: String(editedBy || "Harbour Editor merge"),
		action: "delete",
		sourceCatalogId: catalog.catalogId,
		snapshot: null,
	});
}

function mergeHistory(local = [], incoming = []) {
	const byEditId = new Map();
	for (const entry of [...local, ...incoming]) byEditId.set(entry.editId, structuredClone(entry));
	return [...byEditId.values()].sort((a, b) => a.editedAt.localeCompare(b.editedAt) || a.revision - b.revision);
}

function applyWinner(catalog, id, source) {
	if (source.locations[id]) {
		catalog.locations[id] = structuredClone(source.locations[id]);
		delete catalog.tombstones[id];
	} else {
		catalog.tombstones[id] = structuredClone(source.tombstones[id]);
		delete catalog.locations[id];
	}
}

module.exports = { createLocationStore };
