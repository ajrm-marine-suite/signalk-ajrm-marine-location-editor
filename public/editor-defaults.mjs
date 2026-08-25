/**
 * Returns deliberate defaults applied when classifying a new Location.
 * Existing Locations are never reshaped merely because they are opened.
 */

const harbourAreaTypes = new Set(["harbour", "marina"]);

export function defaultsForTypeSelection({
	existingLocation = false,
	type = "",
	checked = false,
	geometryType = "Point",
} = {}) {
	if (existingLocation || !checked || !harbourAreaTypes.has(type)) return null;
	return {
		geometryType: geometryType === "Point" ? "Circle" : geometryType,
		automaticProfileArea: true,
	};
}
