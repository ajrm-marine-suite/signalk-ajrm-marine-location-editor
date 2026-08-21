/** Provides geometry predicates shared by spatial Location Editor features. */

function pointInRing(position, ring) {
	let inside = false;
	for (let left = 0, right = ring.length - 1; left < ring.length; right = left++) {
		const [x1,y1] = ring[left];
		const [x2,y2] = ring[right];
		if (((y1 > position.latitude) !== (y2 > position.latitude)) &&
			position.longitude < (x2-x1) * (position.latitude-y1) / ((y2-y1) || Number.EPSILON) + x1) inside = !inside;
	}
	return inside;
}

function containsPosition(location, position) {
	const geometry = location?.feature?.geometry;
	if (!geometry || !position) return false;
	if (geometry.type === "Polygon") return pointInRing(position,geometry.coordinates[0]) && !geometry.coordinates.slice(1).some((ring) => pointInRing(position,ring));
	if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => pointInRing(position,polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(position,ring)));
	return false;
}

module.exports = { containsPosition, pointInRing };
