/**
 * Generates editable latitude/longitude area vertices for the Location Editor.
 * Stored locations remain ordinary GeoJSON polygons regardless of editor shape.
 */

function longitudeRadius(latitude, distanceNm) {
	return distanceNm / (60 * Math.max(0.01, Math.cos(latitude * Math.PI / 180)));
}

export function circlePoints(center, radiusNm, count = 40) {
	const latRadius = radiusNm / 60;
	const lonRadius = longitudeRadius(center.lat, radiusNm);
	return Array.from({ length: count }, (_, index) => {
		const angle = index / count * Math.PI * 2;
		return { lat: center.lat + Math.sin(angle) * latRadius, lon: center.lon + Math.cos(angle) * lonRadius };
	});
}

export function rectanglePoints(center, widthNm, heightNm) {
	const halfLat = heightNm / 120;
	const halfLon = longitudeRadius(center.lat, widthNm / 2);
	return [
		{ lat: center.lat + halfLat, lon: center.lon - halfLon },
		{ lat: center.lat + halfLat, lon: center.lon + halfLon },
		{ lat: center.lat - halfLat, lon: center.lon + halfLon },
		{ lat: center.lat - halfLat, lon: center.lon - halfLon },
	];
}

export function regularPolygonPoints(center, radiusNm, requestedCount) {
	const count = Math.max(3, Math.min(32, Math.round(Number(requestedCount) || 3)));
	const circle = circlePoints(center, radiusNm, count);
	const topOffset = Math.ceil(count / 4);
	return circle.map((_point, index) => circle[(index + topOffset) % count]);
}
