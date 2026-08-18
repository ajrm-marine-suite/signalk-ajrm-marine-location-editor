/**
 * Calculates zoom-sensitive geometry movement and bounded press-hold
 * acceleration for Location Editor's arrow controls.
 */

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const NM_M = 1852;

export function geometryNudgeNm(zoom, latitude, {
	pixels = 6,
	minimumNm = 0.0001,
	maximumNm = 0.025,
	multiplier = 1,
} = {}) {
	const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 14;
	const safeLatitude = Math.max(-85, Math.min(85, Number(latitude) || 0));
	const metresPerPixel = EARTH_CIRCUMFERENCE_M * Math.cos(safeLatitude * Math.PI / 180) /
		(256 * 2 ** safeZoom);
	const baseNm = Math.max(minimumNm, Math.min(maximumNm, metresPerPixel * pixels / NM_M));
	return baseNm * Math.max(1, Number(multiplier) || 1);
}

export function holdAcceleration(repeatCount, {
	growth = 1.18,
	maximum = 32,
} = {}) {
	const repeats = Math.max(0, Math.floor(Number(repeatCount) || 0));
	return Math.min(maximum, growth ** repeats);
}
