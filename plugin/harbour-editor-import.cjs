/**
 * Recognises the explicit AJRM Marine Harbour Editor v1 export contract and
 * converts its Harbour: Signal K regions into versioned Location Editor data.
 */

const {
	CATALOG_SCHEMA,
	CATALOG_SCHEMA_VERSION,
	isResourceId,
	normalizeCatalog,
} = require("./location-model.cjs");

function isHarbourEditorExport(payload) {
	return Boolean(
		payload &&
		typeof payload === "object" &&
		!Array.isArray(payload) &&
		payload.schema == null &&
		Number(payload.version) === 1 &&
		Array.isArray(payload.regions),
	);
}

function harbourLocationType(region) {
	const declared = String(
		region?.feature?.properties?.["ajrmMarine:type"] ??
		region?.feature?.properties?.["aisPlus:type"] ??
		"harbour",
	).toLowerCase();
	if (["marina", "harbour_marina", "anchorage_marina"].includes(declared)) return "marina";
	if (["mooring", "moorings"].includes(declared)) return "mooring";
	if (declared === "anchorage") return "anchorage";
	return "harbour";
}

function validTimestamp(value, fallback) {
	return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function convertHarbourEditorExport(payload) {
	if (!isHarbourEditorExport(payload)) {
		throw new Error("The file is not an AJRM Marine Harbour Editor version 1 export.");
	}
	if (!payload.regions.length) {
		throw new Error("The Harbour Editor export contains no harbour regions.");
	}
	const importedAt = validTimestamp(payload.exportedAt, new Date().toISOString());
	const locations = payload.regions.map((region, index) => {
		if (!region || typeof region !== "object" || Array.isArray(region)) {
			throw new Error(`Harbour region ${index + 1} is invalid.`);
		}
		if (!isResourceId(region.id)) {
			throw new Error(`Harbour region ${index + 1} does not have a valid UUID.`);
		}
		const name = String(region.name || "").replace(/^Harbour:\s*/i, "").trim();
		if (!name) throw new Error(`Harbour region ${index + 1} has no name.`);
		const editedAt = validTimestamp(region.timestamp, importedAt);
		return {
			id: region.id,
			name,
			description: String(region.description || ""),
			types: [harbourLocationType(region)],
			feature: structuredClone(region.feature),
			properties: {
				publishAsHarbourRegion: true,
				migratedFromSignalKRegion: true,
				importedFromHarbourEditor: true,
			},
			createdAt: editedAt,
			updatedAt: editedAt,
		};
	});
	return normalizeCatalog({
		schema: CATALOG_SCHEMA,
		schemaVersion: CATALOG_SCHEMA_VERSION,
		updatedAt: importedAt,
		locations,
	});
}

function prepareLocationImport(payload) {
	if (isHarbourEditorExport(payload)) {
		return {
			catalog: convertHarbourEditorExport(payload),
			format: "harbour-editor-v1",
			converted: payload.regions.length,
		};
	}
	if (
		payload?.schema !== CATALOG_SCHEMA ||
		Number(payload?.schemaVersion) !== CATALOG_SCHEMA_VERSION
	) {
		throw new Error(
			`Select a ${CATALOG_SCHEMA} version ${CATALOG_SCHEMA_VERSION} catalogue or an AJRM Marine Harbour Editor version 1 export.`,
		);
	}
	return { catalog: normalizeCatalog(payload), format: "location-catalogue-v1", converted: 0 };
}

module.exports = {
	convertHarbourEditorExport,
	harbourLocationType,
	isHarbourEditorExport,
	prepareLocationImport,
};
