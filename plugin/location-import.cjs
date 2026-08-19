/**
 * Validates Location Editor catalogue imports. Historical editor and Signal K
 * region formats are deliberately not accepted by the live application.
 */

const {
	CATALOG_SCHEMA,
	CATALOG_SCHEMA_VERSION,
	normalizeCatalog,
} = require("./location-model.cjs");

function prepareLocationImport(payload) {
	if (
		payload?.schema !== CATALOG_SCHEMA ||
		Number(payload?.schemaVersion) !== CATALOG_SCHEMA_VERSION
	) {
		throw new Error(
			`Select an ${CATALOG_SCHEMA} version ${CATALOG_SCHEMA_VERSION} catalogue.`,
		);
	}
	return { catalog: normalizeCatalog(payload), format: "location-catalogue-v1" };
}

module.exports = { prepareLocationImport };
