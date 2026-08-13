/**
 * Verifies bounded conversion of the retired Harbour Editor export contract.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
	convertHarbourEditorExport,
	isHarbourEditorExport,
	prepareLocationImport,
} = require("../plugin/harbour-editor-import.cjs");

function region(name, declaredType = "harbour") {
	return {
		id: crypto.randomUUID(),
		name: `Harbour: ${name}`,
		description: "Imported profile region",
		timestamp: "2026-08-04T12:51:42.720Z",
		feature: {
			type: "Feature",
			properties: { "aisPlus:type": declaredType },
			geometry: {
				type: "Polygon",
				coordinates: [[[-5.2, 55.8], [-5.19, 55.8], [-5.19, 55.81], [-5.2, 55.8]]],
			},
		},
	};
}

test("recognises and converts a Harbour Editor v1 export", () => {
	const harbour = region("Test Marina", "harbour_marina");
	const payload = { ok: true, version: 1, exportedAt: "2026-08-13T14:48:56.354Z", regions: [harbour] };
	assert.equal(isHarbourEditorExport(payload), true);
	const catalog = convertHarbourEditorExport(payload);
	assert.equal(catalog.locations[harbour.id].name, "Test Marina");
	assert.deepEqual(catalog.locations[harbour.id].types, ["marina"]);
	assert.equal(catalog.locations[harbour.id].properties.publishAsHarbourRegion, true);
	assert.equal(catalog.locations[harbour.id].properties.importedFromHarbourEditor, true);
	assert.equal(catalog.locations[harbour.id].updatedAt, harbour.timestamp);
	assert.equal(catalog.history[harbour.id].length, 1);
});

test("accepts only the two documented transfer formats", () => {
	assert.throws(() => prepareLocationImport({ locations: [] }), /Harbour Editor version 1 export/);
	assert.throws(
		() => convertHarbourEditorExport({ version: 1, regions: [] }),
		/no harbour regions/,
	);
});

module.exports = { region };
