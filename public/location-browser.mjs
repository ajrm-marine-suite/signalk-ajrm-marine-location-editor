/**
 * Pure helpers for searching, filtering and grouping the Location Editor catalogue.
 */

export function filterLocations(locations, options = {}) {
	const workspace = options.workspace || "all";
	const terms = Array.isArray(options.terms) ? options.terms : [];
	const activeTypes = options.activeTypes instanceof Set ? options.activeTypes : null;
	const typeWorkspaces = options.typeWorkspaces || {};
	const typeLabels = options.typeLabels || {};
	const intersects = options.intersects || (() => true);
	return locations.filter((location) => {
		if (
			workspace !== "all" &&
			!location.types.some((type) => typeWorkspaces[type] === workspace)
		) return false;
		if (activeTypes && !location.types.some((type) => activeTypes.has(type))) return false;
		if (!intersects(location)) return false;
		const searchable = [
			location.name,
			location.description,
			...location.types.map((type) => typeLabels[type] || type),
		].join(" ").toLocaleLowerCase();
		return terms.every((term) => searchable.includes(term));
	});
}

export function groupLocations(locations, knownTypes) {
	const groups = new Map();
	for (const location of locations) {
		const primaryType = location.types.find((type) => knownTypes.has(type)) || "pointOfInterest";
		if (!groups.has(primaryType)) groups.set(primaryType, []);
		groups.get(primaryType).push(location);
	}
	return groups;
}

export function displayTypesForWorkspace(typeDefinitions, workspace = "all") {
	return new Set(Object.entries(typeDefinitions)
		.filter(([, definition]) => workspace === "all" || definition?.[1] === workspace)
		.map(([type]) => type));
}

/** Broad planning-region polygons must not mask the locations inside them. */
export function chartLocationInteractive(location) {
	return !location.types.includes("tidalRegion");
}
