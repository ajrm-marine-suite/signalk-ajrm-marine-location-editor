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

/**
 * At close chart scales, omit broad tidal ancestors when one of their more
 * specific descendants is also visible. The selected location is retained so
 * an operator can still inspect a deliberately selected parent region.
 */
export function declutterTidalRegions(locations, areas, options = {}) {
	const zoom = Number(options.zoom);
	if (!Number.isFinite(zoom) || zoom < (options.minimumZoom ?? 10)) return locations;
	const visibleIds = new Set(locations
		.filter((location) => location.types?.includes("tidalRegion"))
		.map((location) => location.id));
	const parentById = new Map((Array.isArray(areas) ? areas : [])
		.map((area) => [area.locationId, area.parentAreaLocationId || null]));
	const ancestorsWithVisibleDescendants = new Set();
	for (const locationId of visibleIds) {
		const visited = new Set([locationId]);
		let parentId = parentById.get(locationId);
		while (parentId && !visited.has(parentId)) {
			visited.add(parentId);
			if (visibleIds.has(parentId)) ancestorsWithVisibleDescendants.add(parentId);
			parentId = parentById.get(parentId);
		}
	}
	return locations.filter((location) => (
		location.id === options.selectedId || !ancestorsWithVisibleDescendants.has(location.id)
	));
}

/** Broad planning-region polygons must not mask the locations inside them. */
export function chartLocationInteractive(location) {
	return !location.types.includes("tidalRegion");
}
