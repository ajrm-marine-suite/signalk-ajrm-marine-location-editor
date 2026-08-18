/**
 * Browser entry point for Location Editor; edits a versioned location catalogue
 * and renders workspace-filtered places, tidal references and safety areas.
 */

import * as MapCore from "./ajrm-map-core.mjs?v=0.7.5";
import { displayTypesForWorkspace, filterLocations, groupLocations } from "./location-browser.mjs?v=0.5.1";
import { geometryNudgeNm, holdAcceleration } from "./geometry-motion.mjs?v=0.5.1";
import { createEditorNavigationState } from "./panel-navigation.mjs?v=0.1.0";
import { bindPressRepeat } from "./press-repeat.mjs?v=0.5.1";

const apiBase = "/plugins/signalk-ajrm-marine-location-editor";
const resourcePrefix = "/resources/locations/";
const storagePrefix = "ajrmMarineLocationEditor";
const chartLayerZIndex = 650;
const seamarkLayerZIndex = 750;
const typeDefinitions = {
	anchorage: ["Anchorage", "places", "#16a34a"],
	mooring: ["Mooring", "places", "#0d9488"],
	marina: ["Marina", "places", "#2563eb"],
	harbour: ["Harbour", "places", "#0369a1"],
	tidalStandardPort: ["Tidal standard port", "tides", "#0891b2"],
	tidalSecondaryPort: ["Tidal secondary port", "tides", "#06b6d4"],
	tidalObservationStation: ["Tidal observation station", "tides", "#0e7490"],
	tidalRegion: ["Tidal region", "tides", "#155e75"],
	tidalGate: ["Tidal gate", "tides", "#7c3aed"],
	hazard: ["Hazard", "hazards", "#dc2626"],
	avoidanceArea: ["Avoidance area", "hazards", "#ef4444"],
	noAnchoringArea: ["No anchoring area", "hazards", "#f97316"],
	waitingArea: ["Waiting area", "hazards", "#ca8a04"],
	preferredChannel: ["Preferred channel", "hazards", "#2563eb"],
	pointOfInterest: ["Point of interest", "places", "#64748b"],
};
const tideTypes = new Set(["tidalStandardPort", "tidalSecondaryPort", "tidalObservationStation", "tidalRegion", "tidalGate"]);
const predictionPortTypes = new Set(["tidalStandardPort", "tidalSecondaryPort"]);
const anchorageTypes = new Set(["anchorage", "mooring"]);
const hazardTypes = new Set(["hazard", "avoidanceArea", "noAnchoringArea", "waitingArea", "preferredChannel"]);
const hazardApplicationChoices = ["display", "routePlanning", "proximityWarning", "anchorPlanning"];
const secondaryPointIndexes = [1, 2, 3, 4];

const elements = Object.fromEntries([
	"map", "selectorDrawer", "editorDrawer", "settingsDrawer", "geometryControls", "geometryControlsHandle",
	"closeSelector", "closeEditor", "closeSettings", "closeGeometry", "selectedSummary", "workspace",
	"newLocation", "refreshLocations", "locationSearch", "displayTypeChoices", "showAllTypes",
	"hideAllTypes", "mapAreaOnly", "locationName", "description", "typeChoices",
	"geometryType", "setPoint", "openGeometry", "pointEditor", "polygonEditor", "point",
	"points", "profileRegionField", "publishAsHarbourRegion", "tideLocationRef", "tideRegionRef", "anchorageFields", "seabed", "chartedDepthM",
	"detectionRadiusM", "trustedAutomation", "anchorageNotes", "tideFields", "tideProviderId", "tideProvider", "tideStationId", "tideStationName",
	"parentLocationRef", "tideDatum", "tideMhws", "tideMhwn", "tideMlwn", "tideMlws", "secondaryPortFields",
	"secondaryStandardMhws", "secondaryStandardMhwn", "secondaryStandardMlwn", "secondaryStandardMlws",
	"secondaryTimePeriod", "secondaryLegacyPattern", "secondaryHwPair1", "secondaryHwPair2", "secondaryLwPair1", "secondaryLwPair2",
	...secondaryPointIndexes.flatMap((index) => [`secondaryHwTime${index}`, `secondaryHwOffset${index}`]),
	...secondaryPointIndexes.flatMap((index) => [`secondaryLwTime${index}`, `secondaryLwOffset${index}`]),
	"secondaryDiffMhws", "secondaryDiffMhwn", "secondaryDiffMlwn", "secondaryDiffMlws", "secondaryPortNotes",
	"tidalGateFields", "gateStandardPortRef", "gateFloodSet", "gateEbbSet", "gateSpringPeak", "gateNeapPeak",
	"gateFloodSpringAfter", "gateFloodNeapAfter", "gateFloodSpringSlack", "gateFloodNeapSlack",
	"gateEbbSpringAfter", "gateEbbNeapAfter", "gateEbbSpringSlack", "gateEbbNeapSlack", "gateSource",
	"hazardFields", "hazardSeverity", "hazardReason",
	"hazardClearanceM", "hazardApplications", "saveLocation", "undoLocation", "deleteLocation", "showHistory",
	"locationId", "locationListTitle", "locationList", "historyDialog", "historySummary",
	"historyList", "closeHistory", "radiusNm", "decreaseRadius", "increaseRadius",
	"applyRadius", "makeCircle", "saveGeometry", "undoGeometry", "nudgeNorth", "nudgeSouth", "nudgeWest", "nudgeEast",
	"mergeLocations", "importLocations", "exportLocations", "locationImportFile", "syncMessages",
	"deletedList", "purgeDeleted", "status", "chartCycleStatus", "provenanceFields", "provenanceStatus", "provenanceWarning", "provenanceSources",
].map((id) => [id, document.querySelector(`#${id}`)]));

let locations = [];
let tombstones = [];
let selectedId = null;
let activeDisplayTypes = loadDisplayTypes();
let map;
const editorNavigation = createEditorNavigationState();
let locationLayer;
let previewLayer;
let geometryPreviewDirty = false;
let seamarkLayer;
let autoChartGroup;
let autoChartLayer;
let autoChartId;
let autoChartList = [];
let chartCycle;
let toolbar;
let baseLayers = {};
let currentBaseLayer;

function showStatus(message, isError = false) {
	elements.status.textContent = message;
	elements.status.style.background = isError ? "#7f1d1d" : "#0f172a";
	elements.status.classList.add("visible");
	setTimeout(() => elements.status.classList.remove("visible"), 3800);
}

function setSyncMessages(lines) {
	elements.syncMessages.textContent = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join("\n") || "Ready.";
}

async function requestJson(url, options = {}) {
	const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
	return body;
}

function selectedLocation() {
	return locations.find((location) => location.id === selectedId) || null;
}

function currentWorkspace() {
	return elements.workspace.value || "places";
}

function loadDisplayTypes() {
	try {
		const stored = JSON.parse(localStorage.getItem(`${storagePrefix}DisplayTypes`) || "null");
		if (Array.isArray(stored)) return new Set(stored.filter((type) => typeDefinitions[type]));
	} catch { /* Ignore corrupt browser preferences. */ }
	return new Set(Object.keys(typeDefinitions));
}

function locationIntersectsMap(location) {
	if (!map || !elements.mapAreaOnly.checked) return true;
	const bounds = map.getBounds();
	const geometry = location.feature.geometry;
	if (geometry.type === "Point") return bounds.contains([geometry.coordinates[1], geometry.coordinates[0]]);
	const locationBounds = L.latLngBounds(geometry.coordinates[0].map(([lon, lat]) => [lat, lon]));
	return bounds.overlaps ? bounds.overlaps(locationBounds) : bounds.intersects(locationBounds);
}

function browserCandidates() {
	const terms = elements.locationSearch.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return filterLocations(locations, {
		workspace: currentWorkspace(),
		terms,
		typeWorkspaces: Object.fromEntries(Object.entries(typeDefinitions).map(([type, definition]) => [type, definition[1]])),
		typeLabels: Object.fromEntries(Object.entries(typeDefinitions).map(([type, definition]) => [type, definition[0]])),
		intersects: locationIntersectsMap,
	});
}

function visibleLocations() {
	return filterLocations(browserCandidates(), { activeTypes: activeDisplayTypes });
}

function locationColor(location) {
	if (location.properties?.hazard?.severity === "prohibited") return "#991b1b";
	if (location.properties?.hazard?.severity === "danger") return "#dc2626";
	return typeDefinitions[location.types[0]]?.[2] || "#475569";
}

function typeLabel(type) {
	return typeDefinitions[type]?.[0] || type;
}

function resourceId(reference) {
	return String(reference || "").split("/").at(-1) || "";
}

function checkedTypes() {
	return [...elements.typeChoices.querySelectorAll("input:checked")].map((input) => input.value);
}

function setupChoices() {
	for (const [type, [label]] of Object.entries(typeDefinitions)) {
		const node = document.createElement("label");
		node.className = "choice";
		node.innerHTML = `<input type="checkbox" value="${type}"> <span>${label}</span>`;
		elements.typeChoices.append(node);
		const displayNode = document.createElement("label");
		displayNode.className = "choice display-choice";
		displayNode.innerHTML = `<input type="checkbox" value="${type}"> <span>${label}</span><small data-type-count="${type}">0</small>`;
		const displayInput = displayNode.querySelector("input");
		displayInput.checked = activeDisplayTypes.has(type);
		displayInput.addEventListener("change", () => {
			if (displayInput.checked) activeDisplayTypes.add(type); else activeDisplayTypes.delete(type);
			persistDisplayTypes();
			renderLocations();
		});
		elements.displayTypeChoices.append(displayNode);
	}
	for (const value of hazardApplicationChoices) {
		const node = document.createElement("label");
		node.className = "choice";
		node.innerHTML = `<input type="checkbox" value="${value}"> <span>${value.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</span>`;
		elements.hazardApplications.append(node);
	}
}

function persistDisplayTypes() {
	localStorage.setItem(`${storagePrefix}DisplayTypes`, JSON.stringify([...activeDisplayTypes]));
}

function setAllDisplayTypes(enabled) {
	activeDisplayTypes = enabled ? displayTypesForWorkspace(typeDefinitions, currentWorkspace()) : new Set();
	elements.displayTypeChoices.querySelectorAll("input").forEach((input) => {
		input.checked = activeDisplayTypes.has(input.value);
	});
	persistDisplayTypes();
	renderLocations();
}

function applyWorkspaceDisplayTypes() {
	activeDisplayTypes = displayTypesForWorkspace(typeDefinitions, currentWorkspace());
	elements.displayTypeChoices.querySelectorAll("input").forEach((input) => {
		input.checked = activeDisplayTypes.has(input.value);
	});
	persistDisplayTypes();
	renderLocations();
}

function updateConditionalFields() {
	const types = checkedTypes();
	const profileEligible = types.some((type) => ["harbour", "anchorage", "mooring", "marina"].includes(type));
	elements.profileRegionField.hidden = !profileEligible;
	if (!profileEligible) elements.publishAsHarbourRegion.checked = false;
	elements.anchorageFields.hidden = !types.some((type) => anchorageTypes.has(type));
	elements.tideFields.hidden = !types.some((type) => tideTypes.has(type));
	elements.secondaryPortFields.hidden = !types.includes("tidalSecondaryPort");
	elements.tidalGateFields.hidden = !types.includes("tidalGate");
	elements.hazardFields.hidden = !types.some((type) => hazardTypes.has(type));
	elements.pointEditor.hidden = elements.geometryType.value !== "Point";
	elements.polygonEditor.hidden = elements.geometryType.value !== "Polygon";
	renderPreview();
}

function parsePoint(value = elements.point.value) {
	const parts = String(value).split(/[\s,]+/).filter(Boolean).map(Number);
	if (parts.length !== 2 || !parts.every(Number.isFinite) || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) {
		throw new Error("Enter position as latitude, longitude.");
	}
	return { lat: parts[0], lon: parts[1] };
}

function parsePoints() {
	const points = elements.points.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parsePoint);
	if (points.length < 3) throw new Error("An area needs at least three points.");
	return points;
}

function formatPoint(point) {
	return `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
}

function formatPoints(points) {
	return points.map(formatPoint).join("\n");
}

function formatClockMinutes(value) {
	const minutes = Number(value);
	if (!Number.isFinite(minutes)) return "";
	return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseClockMinutes(value, label) {
	const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
	if (!match) throw new Error(`${label} needs a reference time.`);
	const minutes = Number(match[1]) * 60 + Number(match[2]);
	if (minutes < 0 || minutes > 1439) throw new Error(`${label} reference time is invalid.`);
	return minutes;
}

function formatOffsetHHMM(value) {
	const minutes = Number(value);
	if (!Number.isFinite(minutes)) return "";
	const absolute = Math.abs(Math.round(minutes));
	return `${minutes < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
}

function parseOffsetHHMM(value, label) {
	const match = /^([+-])(\d{2})([0-5]\d)$/.exec(String(value || "").trim());
	if (!match) throw new Error(`${label} must be signed HHMM, for example -0055 or +0020.`);
	const minutes = Number(match[2]) * 60 + Number(match[3]);
	return match[1] === "-" ? -minutes : minutes;
}

function activeSecondaryPointIndexes() {
	return Number(elements.secondaryTimePeriod.value) === 1440 ? secondaryPointIndexes : [1, 2];
}

function updateSecondaryTimeLayout(periodMinutes = Number(elements.secondaryTimePeriod.value || 720)) {
	elements.secondaryTimePeriod.value = String(periodMinutes === 1440 ? 1440 : 720);
	const legacy = periodMinutes === 1440;
	elements.secondaryLegacyPattern.hidden = !legacy;
	document.querySelectorAll(".legacy-correction-row").forEach((row) => { row.hidden = !legacy; });
	for (const prefix of ["Hw", "Lw"]) {
		for (const index of [1, 2]) {
			const value = elements[`secondary${prefix}Time${index}`].value;
			elements[`secondary${prefix}Pair${index}`].textContent = value
				? formatClockMinutes((parseClockMinutes(value, "Reference time") + 720) % 1440)
				: "";
		}
	}
}

function correctionPoints(prefix) {
	return activeSecondaryPointIndexes().map((index) => {
		const time = elements[`secondary${prefix}Time${index}`].value;
		const offset = elements[`secondary${prefix}Offset${index}`].value;
		if (!time && offset === "") return null;
		if (!time || offset === "") throw new Error(`Complete both time and offset for ${prefix.toUpperCase()} correction ${index}.`);
		return { referenceTimeMinutes: parseClockMinutes(time, `${prefix.toUpperCase()} correction ${index}`), offsetMinutes: parseOffsetHHMM(offset, `${prefix.toUpperCase()} correction ${index}`) };
	}).filter(Boolean);
}

function makeCirclePoints(center, radiusNm, count = 40) {
	const latRadius = radiusNm / 60;
	const lonRadius = latRadius / Math.max(0.01, Math.cos(center.lat * Math.PI / 180));
	return Array.from({ length: count }, (_, index) => {
		const angle = index / count * Math.PI * 2;
		return { lat: center.lat + Math.sin(angle) * latRadius, lon: center.lon + Math.cos(angle) * lonRadius };
	});
}

function geometryFromEditor() {
	if (elements.geometryType.value === "Point") {
		const point = parsePoint();
		return { type: "Point", coordinates: [point.lon, point.lat] };
	}
	const points = parsePoints();
	const coordinates = points.map(({ lat, lon }) => [lon, lat]);
	coordinates.push([...coordinates[0]]);
	return { type: "Polygon", coordinates: [coordinates] };
}

function fillSelect(select, choices, selected, emptyLabel) {
	select.replaceChildren(new Option(emptyLabel, ""));
	for (const choice of choices) select.append(new Option(choice.label, choice.value));
	select.value = selected || "";
}

function refreshReferences(location = selectedLocation()) {
	const tidal = locations.filter((entry) => entry.types.some((type) => predictionPortTypes.has(type)) && entry.id !== location?.id);
	fillSelect(elements.tideLocationRef, tidal.map((entry) => ({ value: entry.id, label: entry.name })), resourceId(location?.properties?.tideLocationRef), "Automatic / none assigned");
	const regions = locations.filter((entry) => entry.types.includes("tidalRegion") && entry.id !== location?.id);
	fillSelect(elements.tideRegionRef, regions.map((entry) => ({ value: entry.id, label: entry.name })), resourceId(location?.properties?.tideRegionRef), "None assigned");
	const parentPorts = locations.filter((entry) => entry.types.some((type) => predictionPortTypes.has(type)) && entry.id !== location?.id);
	fillSelect(elements.parentLocationRef, parentPorts.map((entry) => ({
		value: entry.id,
		label: `${entry.name} (${entry.types.includes("tidalStandardPort") ? "standard" : "secondary"})`,
	})), resourceId(location?.properties?.tide?.parentLocationRef), "None");
	const standardPorts = locations.filter((entry) => entry.types.includes("tidalStandardPort") && entry.id !== location?.id);
	fillSelect(elements.gateStandardPortRef, standardPorts.map((entry) => ({ value: entry.id, label: entry.name })), resourceId(location?.properties?.tidalGate?.standardPortRef), "None");
}

function resetEditor() {
	selectedId = null;
	geometryPreviewDirty = true;
	elements.locationId.value = "";
	elements.locationName.value = "";
	elements.description.value = "";
	elements.typeChoices.querySelectorAll("input").forEach((input) => { input.checked = false; });
	elements.geometryType.value = "Point";
	const center = map?.getCenter() || { lat: 55.8, lng: -5.2 };
	elements.point.value = `${center.lat.toFixed(6)}, ${(center.lng ?? center.lon).toFixed(6)}`;
	elements.points.value = "";
	for (const id of ["seabed", "chartedDepthM", "detectionRadiusM", "anchorageNotes", "tideProviderId", "tideProvider", "tideStationId", "tideStationName", "tideDatum", "tideMhws", "tideMhwn", "tideMlwn", "tideMlws", "secondaryStandardMhws", "secondaryStandardMhwn", "secondaryStandardMlwn", "secondaryStandardMlws", ...secondaryPointIndexes.flatMap((index) => [`secondaryHwTime${index}`, `secondaryHwOffset${index}`, `secondaryLwTime${index}`, `secondaryLwOffset${index}`]), "secondaryDiffMhws", "secondaryDiffMhwn", "secondaryDiffMlwn", "secondaryDiffMlws", "secondaryPortNotes", "hazardReason", "hazardClearanceM"]) elements[id].value = "";
	for (const id of ["gateFloodSet", "gateEbbSet", "gateSpringPeak", "gateNeapPeak", "gateFloodSpringAfter", "gateFloodNeapAfter", "gateFloodSpringSlack", "gateFloodNeapSlack", "gateEbbSpringAfter", "gateEbbNeapAfter", "gateEbbSpringSlack", "gateEbbNeapSlack", "gateSource"]) elements[id].value = "";
	elements.trustedAutomation.checked = false;
	updateSecondaryTimeLayout(720);
	elements.hazardSeverity.value = "advisory";
	elements.publishAsHarbourRegion.checked = false;
	elements.hazardApplications.querySelectorAll("input").forEach((input) => { input.checked = false; });
	elements.selectedSummary.textContent = "New location";
	renderProvenance(null);
	elements.deleteLocation.disabled = true;
	elements.showHistory.disabled = true;
	refreshReferences(null);
	updateConditionalFields();
	renderLocations();
}

function selectLocation(id, fit = false, revealEditor = false) {
	const location = locations.find((entry) => entry.id === id);
	if (!location) return;
	selectedId = id;
	geometryPreviewDirty = false;
	elements.locationId.value = id;
	elements.locationName.value = location.name;
	elements.description.value = location.description || "";
	elements.typeChoices.querySelectorAll("input").forEach((input) => { input.checked = location.types.includes(input.value); });
	elements.geometryType.value = location.feature.geometry.type === "Point" ? "Point" : "Polygon";
	if (location.feature.geometry.type === "Point") {
		const [lon, lat] = location.feature.geometry.coordinates;
		elements.point.value = formatPoint({ lat, lon });
	} else {
		const ring = location.feature.geometry.coordinates[0];
		elements.points.value = formatPoints(ring.slice(0, -1).map(([lon, lat]) => ({ lat, lon })));
	}
	const properties = location.properties || {};
	elements.publishAsHarbourRegion.checked = properties.publishAsHarbourRegion === true;
	elements.seabed.value = properties.anchorage?.seabed || "";
	elements.chartedDepthM.value = properties.anchorage?.chartedDepthM ?? "";
	elements.detectionRadiusM.value = properties.anchorage?.detectionRadiusM ?? "";
	elements.trustedAutomation.checked = properties.anchorage?.trustedAutomation === true;
	elements.anchorageNotes.value = properties.anchorage?.notes || "";
	elements.tideProviderId.value = properties.tide?.providerId || "";
	elements.tideProvider.value = properties.tide?.provider || "";
	elements.tideStationId.value = properties.tide?.stationId || "";
	elements.tideStationName.value = properties.tide?.stationName || "";
	elements.tideDatum.value = properties.tide?.datum || "";
	elements.tideMhws.value = properties.tide?.referenceLevels?.mhws ?? "";
	elements.tideMhwn.value = properties.tide?.referenceLevels?.mhwn ?? "";
	elements.tideMlwn.value = properties.tide?.referenceLevels?.mlwn ?? "";
	elements.tideMlws.value = properties.tide?.referenceLevels?.mlws ?? "";
	const corrections = properties.tide?.secondaryPortCorrections || {};
	updateSecondaryTimeLayout(Number(corrections.timeOffsetPeriodMinutes || 720));
	for (const [id, key] of [["secondaryStandardMhws", "mhws"], ["secondaryStandardMhwn", "mhwn"], ["secondaryStandardMlwn", "mlwn"], ["secondaryStandardMlws", "mlws"]]) {
		elements[id].value = corrections.parentReferenceLevels?.[key] ?? corrections.standardReferenceLevels?.[key] ?? "";
	}
	for (const [prefix, points] of [["Hw", corrections.highWaterTimeOffsets], ["Lw", corrections.lowWaterTimeOffsets]]) {
		secondaryPointIndexes.forEach((index, pointIndex) => {
			const point = points?.[pointIndex];
			elements[`secondary${prefix}Time${index}`].value = formatClockMinutes(point?.referenceTimeMinutes);
			elements[`secondary${prefix}Offset${index}`].value = point ? formatOffsetHHMM(point.offsetMinutes) : "";
		});
	}
	updateSecondaryTimeLayout();
	for (const [id, group, key] of [
		["secondaryDiffMhws", "heightDifferencesM", "mhws"], ["secondaryDiffMhwn", "heightDifferencesM", "mhwn"],
		["secondaryDiffMlwn", "heightDifferencesM", "mlwn"], ["secondaryDiffMlws", "heightDifferencesM", "mlws"],
	]) elements[id].value = corrections[group]?.[key] ?? "";
	elements.secondaryPortNotes.value = corrections.notes || "";
	const gate = properties.tidalGate || {};
	for (const [id, key] of [["gateFloodSet", "floodSet"], ["gateEbbSet", "ebbSet"], ["gateSpringPeak", "springPeakFlowKnots"], ["gateNeapPeak", "neapPeakFlowKnots"], ["gateFloodSpringAfter", "floodSpringAfter"], ["gateFloodNeapAfter", "floodNeapAfter"], ["gateFloodSpringSlack", "floodSpringSlack"], ["gateFloodNeapSlack", "floodNeapSlack"], ["gateEbbSpringAfter", "ebbSpringAfter"], ["gateEbbNeapAfter", "ebbNeapAfter"], ["gateEbbSpringSlack", "ebbSpringSlack"], ["gateEbbNeapSlack", "ebbNeapSlack"], ["gateSource", "source"]]) elements[id].value = gate[key] ?? "";
	elements.hazardSeverity.value = properties.hazard?.severity || "advisory";
	elements.hazardReason.value = properties.hazard?.reason || "";
	elements.hazardClearanceM.value = properties.hazard?.clearanceM ?? "";
	elements.hazardApplications.querySelectorAll("input").forEach((input) => { input.checked = properties.hazard?.appliesTo?.includes(input.value) || false; });
	renderProvenance(properties.provenance);
	elements.selectedSummary.textContent = `${location.name} · revision ${location.revision}`;
	elements.deleteLocation.disabled = false;
	elements.showHistory.disabled = false;
	refreshReferences(location);
	updateConditionalFields();
	renderLocations();
	if (fit && map) {
		const geometry = location.feature.geometry;
		if (geometry.type === "Point") map.setView([geometry.coordinates[1], geometry.coordinates[0]], Math.max(map.getZoom(), 14));
		else map.fitBounds(L.latLngBounds(geometry.coordinates[0].map(([lon, lat]) => [lat, lon])), { padding: [40, 40] });
	}
	if (revealEditor) {
		editorNavigation.open({ selectorOpen: elements.selectorDrawer.classList.contains("open") });
		showLeftPanel(elements.editorDrawer);
	}
}

function buildLocation() {
	const name = elements.locationName.value.trim();
	const types = checkedTypes();
	if (!name) throw new Error("Enter a location name.");
	if (!types.length) throw new Error("Select at least one location type.");
	const current = selectedLocation();
	const properties = current?.properties?.provenance
		? { provenance: structuredClone(current.properties.provenance) }
		: {};
	if (elements.publishAsHarbourRegion.checked) properties.publishAsHarbourRegion = true;
	if (elements.tideLocationRef.value) properties.tideLocationRef = `${resourcePrefix}${elements.tideLocationRef.value}`;
	if (elements.tideRegionRef.value) properties.tideRegionRef = `${resourcePrefix}${elements.tideRegionRef.value}`;
	if (types.some((type) => anchorageTypes.has(type))) {
		properties.anchorage = {
			seabed: elements.seabed.value.trim() || undefined,
			chartedDepthM: elements.chartedDepthM.value === "" ? undefined : Number(elements.chartedDepthM.value),
			detectionRadiusM: elements.detectionRadiusM.value === "" ? undefined : Number(elements.detectionRadiusM.value),
			trustedAutomation: elements.trustedAutomation.checked || undefined,
			notes: elements.anchorageNotes.value.trim() || undefined,
		};
	}
	if (types.some((type) => tideTypes.has(type))) {
		const referenceLevels = Object.fromEntries([
			["mhws", elements.tideMhws], ["mhwn", elements.tideMhwn],
			["mlwn", elements.tideMlwn], ["mlws", elements.tideMlws],
		].filter(([, input]) => input.value !== "").map(([key, input]) => [key, Number(input.value)]));
		properties.tide = {
			providerId: elements.tideProviderId.value || undefined,
			provider: elements.tideProvider.value.trim() || undefined,
			stationId: elements.tideStationId.value.trim() || undefined,
			stationName: elements.tideStationName.value.trim() || undefined,
			parentLocationRef: elements.parentLocationRef.value ? `${resourcePrefix}${elements.parentLocationRef.value}` : undefined,
			datum: elements.tideDatum.value.trim() || undefined,
			referenceLevels: Object.keys(referenceLevels).length ? referenceLevels : undefined,
		};
		if (types.includes("tidalSecondaryPort")) {
			const numericGroup = (entries) => Object.fromEntries(entries.map(([key, id]) => {
				if (elements[id].value === "") throw new Error("Complete every secondary-port correction field; use zero where there is no correction.");
				return [key, Number(elements[id].value)];
			}));
			const highWaterTimeOffsets = correctionPoints("Hw");
			const lowWaterTimeOffsets = correctionPoints("Lw");
			if (!highWaterTimeOffsets.length || !lowWaterTimeOffsets.length) throw new Error("Enter at least one HW and one LW correction point.");
			properties.tide.secondaryPortCorrections = {
				contract: "ajrm-secondary-port-corrections-v3",
				timeOffsetPeriodMinutes: Number(elements.secondaryTimePeriod.value || 720),
				legacyId: current?.properties?.tide?.secondaryPortCorrections?.legacyId,
				standardPortName: current?.properties?.tide?.secondaryPortCorrections?.standardPortName,
				parentReferenceLevels: numericGroup([["mhws", "secondaryStandardMhws"], ["mhwn", "secondaryStandardMhwn"], ["mlwn", "secondaryStandardMlwn"], ["mlws", "secondaryStandardMlws"]]),
				highWaterTimeOffsets,
				lowWaterTimeOffsets,
				heightDifferencesM: numericGroup([["mhws", "secondaryDiffMhws"], ["mhwn", "secondaryDiffMhwn"], ["mlwn", "secondaryDiffMlwn"], ["mlws", "secondaryDiffMlws"]]),
				notes: elements.secondaryPortNotes.value.trim() || undefined,
			};
		}
	}
	if (types.includes("tidalGate")) {
		const text = (id) => elements[id].value.trim();
		const numeric = (id) => elements[id].value === "" ? null : Number(elements[id].value);
		properties.tidalGate = {
			contract: "ajrm-tidal-gate-constants-v1",
			standardPortRef: elements.gateStandardPortRef.value ? `${resourcePrefix}${elements.gateStandardPortRef.value}` : undefined,
			floodSet: text("gateFloodSet"), ebbSet: text("gateEbbSet"),
			springPeakFlowKnots: numeric("gateSpringPeak"), neapPeakFlowKnots: numeric("gateNeapPeak"),
			floodSpringAfter: text("gateFloodSpringAfter"), floodNeapAfter: text("gateFloodNeapAfter"),
			floodSpringSlack: text("gateFloodSpringSlack"), floodNeapSlack: text("gateFloodNeapSlack"),
			ebbSpringAfter: text("gateEbbSpringAfter"), ebbNeapAfter: text("gateEbbNeapAfter"),
			ebbSpringSlack: text("gateEbbSpringSlack"), ebbNeapSlack: text("gateEbbNeapSlack"),
			source: text("gateSource"),
		};
	}
	if (types.some((type) => hazardTypes.has(type))) {
		// Hazard fields are independent of the tidal-gate contract above.
		properties.hazard = {
			severity: elements.hazardSeverity.value,
			reason: elements.hazardReason.value.trim() || undefined,
			clearanceM: elements.hazardClearanceM.value === "" ? undefined : Number(elements.hazardClearanceM.value),
			appliesTo: [...elements.hazardApplications.querySelectorAll("input:checked")].map((input) => input.value),
		};
	}
	return {
		schema: "org.ajrm.marine.location/v1",
		name,
		description: elements.description.value.trim() || undefined,
		types,
		feature: {
			type: "Feature",
			properties: structuredClone(current?.feature?.properties || {}),
			geometry: geometryFromEditor(),
		},
		properties,
	};
}

function renderProvenance(provenance) {
	elements.provenanceFields.hidden = !provenance;
	if (!provenance) {
		elements.provenanceStatus.textContent = "";
		elements.provenanceWarning.textContent = "";
		elements.provenanceSources.replaceChildren();
		return;
	}
	const labels = { imported: "Imported — not locally verified", sourceChecked: "Checked against cited sources", onboardVerified: "Verified onboard" };
	elements.provenanceStatus.textContent = labels[provenance.reviewStatus] || provenance.reviewStatus || "Source recorded";
	elements.provenanceWarning.textContent = provenance.warning || "";
	elements.provenanceSources.replaceChildren();
	for (const source of provenance.sources || []) {
		const link = document.createElement("a");
		link.href = source.url;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.textContent = [source.provider, source.sourceId, source.license].filter(Boolean).join(" · ");
		elements.provenanceSources.append(link);
	}
}

async function loadLocations(preferredId = selectedId) {
	const [data, deletedData] = await Promise.all([
		requestJson(`${apiBase}/locations?workspace=all`),
		requestJson(`${apiBase}/deleted`),
	]);
	locations = data.locations || [];
	tombstones = deletedData.tombstones || [];
	refreshReferences(selectedLocation());
	renderLocations();
	renderDeleted();
	if (preferredId && locations.some((location) => location.id === preferredId)) selectLocation(preferredId);
}

async function saveLocation() {
	const previous = selectedLocation();
	const id = selectedId || crypto.randomUUID();
	const body = { ...buildLocation(), expectedRevision: previous?.revision || 0 };
	const result = await requestJson(`${apiBase}/locations/${id}`, { method: "PUT", body: JSON.stringify(body) });
	await loadLocations(id);
	geometryPreviewDirty = false;
	previewLayer?.clearLayers();
	showStatus(`Saved revision ${result.location.revision}.`);
}

function undoChanges() {
	if (selectedId && locations.some((location) => location.id === selectedId)) {
		selectLocation(selectedId);
		showStatus("Unsaved changes discarded; last saved location restored.");
		return;
	}
	resetEditor();
	showStatus("Unsaved new location cleared.");
}

async function deleteLocation() {
	const location = selectedLocation();
	if (!location || !confirm(`Delete ${location.name}? Its history will remain restorable.`)) return;
	await requestJson(`${apiBase}/locations/${location.id}?expectedRevision=${location.revision}`, { method: "DELETE" });
	await loadLocations(null);
	resetEditor();
	showStatus("Location deleted; a tombstone revision was retained.");
}

function renderLocations() {
	if (!locationLayer) return;
	locationLayer.clearLayers();
	const candidates = browserCandidates();
	const visible = visibleLocations();
	elements.locationListTitle.textContent = `${visible.length} of ${locations.length} locations shown`;
	for (const type of Object.keys(typeDefinitions)) {
		const count = candidates.filter((location) => location.types.includes(type)).length;
		const output = elements.displayTypeChoices.querySelector(`[data-type-count="${type}"]`);
		if (output) output.textContent = String(count);
	}
	elements.locationList.replaceChildren();
	const groups = groupLocations(
		visible.sort((a, b) => a.name.localeCompare(b.name)),
		new Set(Object.keys(typeDefinitions)),
	);
	for (const [groupType, groupLocations] of [...groups].sort((a, b) => typeLabel(a[0]).localeCompare(typeLabel(b[0])))) {
		const group = document.createElement("details");
		group.className = "location-group";
		group.open = Boolean(elements.locationSearch.value.trim()) || groupLocations.some((location) => location.id === selectedId) || visible.length < 30;
		const summary = document.createElement("summary");
		summary.innerHTML = `<span class="type-dot" style="--type-colour:${locationColor(groupLocations[0])}"></span><strong>${escapeHtml(typeLabel(groupType))}</strong><span>${groupLocations.length}</span>`;
		group.append(summary);
		const groupList = document.createElement("div");
		groupList.className = "region-list";
		for (const location of groupLocations) {
		const selected = location.id === selectedId;
		const color = locationColor(location);
		const geometry = location.feature.geometry;
		let layer;
		if (geometry.type === "Point") {
			layer = L.circleMarker([geometry.coordinates[1], geometry.coordinates[0]], { radius: selected ? 9 : 7, color, weight: selected ? 4 : 2, fillColor: color, fillOpacity: 0.72 });
		} else {
			layer = L.polygon(geometry.coordinates[0].map(([lon, lat]) => [lat, lon]), { color, weight: selected ? 5 : 3, fillColor: color, fillOpacity: 0.16, dashArray: location.types.some((type) => hazardTypes.has(type)) ? "8 6" : null });
		}
		layer.bindTooltip(`${location.name} — ${location.types.map(typeLabel).join(", ")}`);
		layer.on("click", () => selectLocation(location.id, false, true));
		layer.addTo(locationLayer);
		const button = document.createElement("button");
		button.type = "button";
		button.className = `region-item${selected ? " selected" : ""}`;
		button.innerHTML = `<strong>${escapeHtml(location.name)}</strong><span>${escapeHtml(location.types.map(typeLabel).join(", "))} · r${location.revision}</span>`;
		button.addEventListener("click", () => selectLocation(location.id, true, true));
		groupList.append(button);
		}
		group.append(groupList);
		elements.locationList.append(group);
	}
	if (!visible.length) {
		const empty = document.createElement("p");
		empty.className = "empty-results";
		empty.textContent = locations.length ? "No locations match these filters." : "No locations have been added yet.";
		elements.locationList.append(empty);
	}
	renderPreview();
}

function renderPreview() {
	if (!previewLayer) return;
	previewLayer.clearLayers();
	if (!geometryPreviewDirty) return;
	try {
		const geometry = geometryFromEditor();
		if (geometry.type === "Point") L.circleMarker([geometry.coordinates[1], geometry.coordinates[0]], { radius: 9, color: "#facc15", weight: 4, fillOpacity: 0.2 }).addTo(previewLayer);
		else L.polygon(geometry.coordinates[0].map(([lon, lat]) => [lat, lon]), { color: "#facc15", weight: 4, fillOpacity: 0.08 }).addTo(previewLayer);
	} catch { /* Incomplete edits are expected while typing. */ }
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function showHistory(requestedId = selectedId) {
	const location = locations.find((entry) => entry.id === requestedId) || tombstones.find((entry) => entry.id === requestedId);
	if (!location) return;
	const data = await requestJson(`${apiBase}/locations/${location.id}/history`);
	elements.historySummary.textContent = `${location.name} · current revision ${location.revision}${tombstones.some((entry) => entry.id === location.id) ? " · deleted" : ""}`;
	elements.historyList.replaceChildren();
	for (const entry of [...data.history].sort((a, b) => b.editedAt.localeCompare(a.editedAt))) {
		const row = document.createElement("div");
		row.className = "history-item";
		const details = document.createElement("div");
		details.innerHTML = `<strong>Revision ${entry.revision} · ${escapeHtml(entry.action)}</strong><span>${escapeHtml(new Date(entry.editedAt).toLocaleString())} · ${escapeHtml(entry.editedBy || "unknown editor")}</span>`;
		row.append(details);
		if (entry.snapshot && entry.editId !== location.lastEditId) {
			const restore = document.createElement("button");
			restore.type = "button";
			restore.textContent = "Restore";
			restore.addEventListener("click", async () => {
				try {
					const result = await requestJson(`${apiBase}/locations/${location.id}/restore`, { method: "POST", body: JSON.stringify({ editId: entry.editId, expectedRevision: location.revision }) });
					await loadLocations(result.location.id);
					elements.historyDialog.close();
					showStatus(`Restored as revision ${result.location.revision}.`);
				} catch (error) { showStatus(error.message, true); }
			});
			row.append(restore);
		}
		elements.historyList.append(row);
	}
	elements.historyDialog.showModal();
}

function renderDeleted() {
	elements.deletedList.replaceChildren();
	elements.purgeDeleted.disabled = tombstones.length === 0;
	if (!tombstones.length) {
		const empty = document.createElement("p");
		empty.textContent = "No deleted locations.";
		elements.deletedList.append(empty);
		return;
	}
	for (const tombstone of tombstones) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "region-item";
		button.innerHTML = `<strong>${escapeHtml(tombstone.name || tombstone.id)}</strong><span>Deleted ${escapeHtml(new Date(tombstone.updatedAt).toLocaleString())} · r${tombstone.revision}</span>`;
		button.addEventListener("click", () => showHistory(tombstone.id).catch((error) => showStatus(error.message, true)));
		elements.deletedList.append(button);
	}
}

async function purgeDeletedLocations() {
	if (!tombstones.length) return;
	if (!confirm(
		`Permanently purge ${tombstones.length} deleted location${tombstones.length === 1 ? "" : "s"} and all of their revision history?\n\n` +
		"This cannot be undone. Replacing the whole catalogue later can reintroduce purged locations.",
	)) return;
	const result = await requestJson(`${apiBase}/local/purge-deleted`, {
		method: "POST",
		body: JSON.stringify({ confirm: true }),
	});
	await loadLocations();
	setSyncMessages([`Permanently purged ${result.purged} deleted location${result.purged === 1 ? "" : "s"}.`, "Their tombstones and revision histories were removed; their IDs remain blocked from automatic seeding and ordinary merges."]);
	showStatus(`Purged ${result.purged} deleted location${result.purged === 1 ? "" : "s"}.`);
}

function chooseJsonFile() {
	return new Promise((resolve, reject) => {
		elements.locationImportFile.value = "";
		elements.locationImportFile.onchange = () => {
			const file = elements.locationImportFile.files?.[0];
			if (!file) return resolve(null);
			const reader = new FileReader();
			reader.onload = () => { try { resolve({ file, payload: JSON.parse(String(reader.result)) }); } catch (error) { reject(error); } };
			reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
			reader.readAsText(file);
		};
		elements.locationImportFile.click();
	});
}

function downloadJson(filename, payload) {
	const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
	const link = Object.assign(document.createElement("a"), { href: url, download: filename });
	link.click();
	URL.revokeObjectURL(url);
}

async function transfer(mode) {
	if (mode === "export") {
		const catalog = await requestJson(`${apiBase}/local/export`);
		downloadJson(`ajrm-marine-locations-${new Date().toISOString().slice(0, 10)}.json`, catalog);
		return setSyncMessages([`Exported ${catalog.count} active location(s).`, "Revision history and deletion tombstones are included."]);
	}
	const selected = await chooseJsonFile();
	if (!selected) return;
	const replacing = mode === "import";
	const harbourExport = selected.payload?.schema == null && Number(selected.payload?.version) === 1 && Array.isArray(selected.payload?.regions);
	const count = harbourExport ? selected.payload.regions.length : null;
	const sourceDescription = harbourExport ? `${count} Harbour Editor region(s)` : "the selected versioned catalogue";
	const warning = replacing
		? `Replace the entire Location Editor catalogue with ${sourceDescription}?\n\nExisting anchorages, tidal locations, hazards and other locations absent from the file will be deleted.`
		: `Merge ${sourceDescription} into this catalogue?\n\nExisting anchorages and other unrelated locations will remain.`;
	if (!confirm(warning)) return;
	setSyncMessages([`${replacing ? "Replacement import" : "Merge"} started.`, `Reading ${selected.file.name}...`]);
	try {
		const result = await requestJson(`${apiBase}/local/${mode}`, { method: "POST", body: JSON.stringify({ confirm: true, payload: selected.payload }) });
		setSyncMessages([`${mode === "merge" ? "Merged" : "Imported"} ${selected.file.name}.`, ...(result.log || []), ...(result.conflicts || []).map((item) => `CONFLICT ${item.name}: equal edit time; local retained.`)]);
		await loadLocations();
	} catch (error) {
		setSyncMessages([`${replacing ? "Import" : "Merge"} failed. Check the current catalogue before retrying.`, error.message]);
		throw error;
	}
}

function chartUrl(chart) { return chart?.tilemapUrl || chart?.url || chart?.tileUrl || chart?.href || ""; }
function chartZoom(chart) { return { min: Number(chart?.minzoom ?? chart?.minZoom ?? 0), max: Number(chart?.maxzoom ?? chart?.maxZoom ?? 24) }; }
function makeAutoChartLayer(chart) {
	const url = chartUrl(chart);
	if (!url) return null;
	const zoom = chartZoom(chart);
	return L.tileLayer(url, { minNativeZoom: zoom.min, maxNativeZoom: zoom.max, minZoom: zoom.min, maxZoom: 22, zIndex: chartLayerZIndex, errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" });
}
function keepLayersOnTop() { autoChartGroup?.eachLayer((layer) => layer.setZIndex?.(chartLayerZIndex)); seamarkLayer?.bringToFront?.(); locationLayer?.bringToFront?.(); previewLayer?.bringToFront?.(); }
function setBaseMap(name) {
	if (!baseLayers[name]) return;
	if (currentBaseLayer) map.removeLayer(currentBaseLayer);
	currentBaseLayer = baseLayers[name].addTo(map);
	localStorage.setItem(`${storagePrefix}BaseMap`, name);
	keepLayersOnTop();
}
function setOverlay(layer, enabled, key) {
	if (enabled) layer.addTo(map); else map.removeLayer(layer);
	localStorage.setItem(`${storagePrefix}${key}`, String(enabled));
	chartCycle?.update();
	updateAutoChart();
}
function updateAutoChart() {
	if (!map?.hasLayer(autoChartGroup)) return;
	const chart = chartCycle?.choose(autoChartList, map) ?? MapCore.chooseChart(autoChartList, map);
	if (!chart) { autoChartGroup.clearLayers(); autoChartId = null; return; }
	if (chart.__autoChartId === autoChartId && autoChartLayer) return keepLayersOnTop();
	autoChartGroup.clearLayers();
	autoChartLayer = makeAutoChartLayer(chart);
	autoChartId = chart.__autoChartId;
	if (autoChartLayer) autoChartGroup.addLayer(autoChartLayer);
	keepLayersOnTop();
}
async function loadChartResources() {
	try { autoChartList = MapCore.normalizeChartResources(await requestJson("/signalk/v1/api/resources/charts")); } catch { autoChartList = []; }
	updateAutoChart();
}
function makeNaturalEarthLayer() {
	return window.protomapsL?.leafletLayer ? window.protomapsL.leafletLayer({ url: "./ne_10m_land.pmtiles", flavor: "light", theme: "light", lang: "en", maxDataZoom: 5 }) : L.tileLayer("");
}
function syncPanels() { toolbar?.update(); setTimeout(() => map?.invalidateSize(), 180); }
function togglePanel(panel) { panel.classList.toggle("open"); syncPanels(); }
function showLeftPanel(panel) {
	for (const candidate of [elements.selectorDrawer, elements.editorDrawer]) candidate.classList.toggle("open", candidate === panel);
	syncPanels();
}
function toggleLeftPanel(panel) {
	if (panel.classList.contains("open")) {
		panel.classList.remove("open");
		syncPanels();
	} else showLeftPanel(panel);
}

function closeEditorPanel() {
	if (editorNavigation.close() === "selector") showLeftPanel(elements.selectorDrawer);
	else {
		elements.editorDrawer.classList.remove("open");
		syncPanels();
	}
}
function makeDraggable(panel, handle) {
	let drag;
	handle.addEventListener("pointerdown", (event) => { if (event.target.closest("button")) return; const rect = panel.getBoundingClientRect(); drag = { x: event.clientX - rect.left, y: event.clientY - rect.top }; handle.setPointerCapture(event.pointerId); });
	handle.addEventListener("pointermove", (event) => { if (!drag) return; panel.style.left = `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, event.clientX - drag.x))}px`; panel.style.top = `${Math.max(8, Math.min(innerHeight - panel.offsetHeight - 8, event.clientY - drag.y))}px`; panel.style.right = "auto"; });
	handle.addEventListener("pointerup", (event) => { drag = null; handle.releasePointerCapture(event.pointerId); });
}
function initMap() {
	map = L.map(elements.map, { center: [55.8, -5.2], zoom: 7, zoomControl: true, minZoom: 3, maxZoom: 22 });
	MapCore.labelLeafletZoomControls(map);
	baseLayers = {
		Empty: L.tileLayer(""),
		"NaturalEarth (offline)": makeNaturalEarthLayer(),
		OpenStreetMap: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxNativeZoom: 19, maxZoom: 22, attribution: "© OpenStreetMap" }),
		OpenTopoMap: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxNativeZoom: 17, maxZoom: 22 }),
		Satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: 17, maxZoom: 22 }),
	};
	autoChartGroup = L.layerGroup();
	seamarkLayer = L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", { maxNativeZoom: 19, maxZoom: 22, zIndex: seamarkLayerZIndex });
	locationLayer = L.layerGroup().addTo(map);
	previewLayer = L.layerGroup().addTo(map);
	setBaseMap(localStorage.getItem(`${storagePrefix}BaseMap`) || "NaturalEarth (offline)");
	setOverlay(autoChartGroup, localStorage.getItem(`${storagePrefix}AutoCharts`) === "true", "AutoCharts");
	setOverlay(seamarkLayer, localStorage.getItem(`${storagePrefix}OpenSeaMap`) !== "false", "OpenSeaMap");
	MapCore.createChartSelectorControl({ L, map, baseMaps: baseLayers, getBaseMap: () => localStorage.getItem(`${storagePrefix}BaseMap`) || "NaturalEarth (offline)", setBaseMap, overlays: [
		{ name: MapCore.OPEN_SEA_MAP_NAME, isEnabled: () => map.hasLayer(seamarkLayer), setEnabled: (enabled) => setOverlay(seamarkLayer, enabled, "OpenSeaMap") },
		{ name: MapCore.AUTO_CHARTS_NAME, isEnabled: () => map.hasLayer(autoChartGroup), setEnabled: (enabled) => setOverlay(autoChartGroup, enabled, "AutoCharts") },
	], onFoldersChanged: loadChartResources }).addTo();
	chartCycle = MapCore.createChartCycleControl({ L, map, getCharts: () => autoChartList, isEnabled: () => map.hasLayer(autoChartGroup), onChange: updateAutoChart, statusElement: elements.chartCycleStatus }).addTo();
	toolbar = MapCore.createActionToolbarControl({ L, map, actions: [
		{ title: "Select location", icon: MapCore.MAP_ACTION_ICONS.list, activate: () => toggleLeftPanel(elements.selectorDrawer), isPressed: () => elements.selectorDrawer.classList.contains("open") },
		{ title: "Edit location", icon: MapCore.MAP_ACTION_ICONS.edit, activate: () => { editorNavigation.clear(); toggleLeftPanel(elements.editorDrawer); }, isPressed: () => elements.editorDrawer.classList.contains("open") },
		{ title: "Settings", icon: MapCore.MAP_ACTION_ICONS.settings, activate: () => togglePanel(elements.settingsDrawer), isPressed: () => elements.settingsDrawer.classList.contains("open") },
	] }).addTo();
	map.on("moveend zoomend", updateAutoChart);
	loadChartResources();
}

function changeCircle(deltaRadius = 0, northNm = 0, eastNm = 0) {
	let center;
	try {
		if (elements.geometryType.value === "Point") center = parsePoint();
		else {
			const points = parsePoints();
			center = { lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length, lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length };
		}
	} catch { const mapCenter = map.getCenter(); center = { lat: mapCenter.lat, lon: mapCenter.lng }; }
	center.lat += northNm / 60;
	center.lon += eastNm / (60 * Math.max(0.01, Math.cos(center.lat * Math.PI / 180)));
	if (elements.geometryType.value === "Point") elements.point.value = formatPoint(center);
	else {
		const radius = Math.max(0.01, Number(elements.radiusNm.value || 0.2) + deltaRadius);
		elements.radiusNm.value = radius.toFixed(2);
		elements.points.value = formatPoints(makeCirclePoints(center, radius));
	}
	geometryPreviewDirty = true;
	renderPreview();
}

function nudgeGeometry(northDirection, eastDirection, context = {}) {
	const mapCenter = map.getCenter();
	const stepNm = geometryNudgeNm(map.getZoom(), mapCenter.lat, {
		multiplier: holdAcceleration(context.repeatCount),
	});
	changeCircle(0, northDirection * stepNm, eastDirection * stepNm);
}

function bindEvents() {
	for (const prefix of ["Hw", "Lw"]) {
		for (const index of [1, 2]) elements[`secondary${prefix}Time${index}`].addEventListener("input", () => updateSecondaryTimeLayout());
	}
	elements.typeChoices.addEventListener("change", updateConditionalFields);
	elements.geometryType.addEventListener("change", () => { geometryPreviewDirty = true; updateConditionalFields(); });
	elements.point.addEventListener("input", () => { geometryPreviewDirty = true; renderPreview(); });
	elements.points.addEventListener("input", () => { geometryPreviewDirty = true; renderPreview(); });
	elements.workspace.addEventListener("change", () => {
		localStorage.setItem(`${storagePrefix}Workspace`, currentWorkspace());
		applyWorkspaceDisplayTypes();
	});
	elements.locationSearch.addEventListener("input", renderLocations);
	elements.mapAreaOnly.addEventListener("change", () => { localStorage.setItem(`${storagePrefix}MapAreaOnly`, String(elements.mapAreaOnly.checked)); renderLocations(); });
	elements.showAllTypes.addEventListener("click", () => setAllDisplayTypes(true));
	elements.hideAllTypes.addEventListener("click", () => setAllDisplayTypes(false));
	elements.newLocation.addEventListener("click", () => {
		resetEditor();
		editorNavigation.open({ selectorOpen: elements.selectorDrawer.classList.contains("open") });
		showLeftPanel(elements.editorDrawer);
	});
	elements.refreshLocations.addEventListener("click", () => loadLocations().catch((error) => showStatus(error.message, true)));
	elements.setPoint.addEventListener("click", () => { const center = map.getCenter(); geometryPreviewDirty = true; elements.geometryType.value = "Point"; elements.point.value = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`; updateConditionalFields(); });
	elements.openGeometry.addEventListener("click", () => togglePanel(elements.geometryControls));
	elements.closeGeometry.addEventListener("click", () => { elements.geometryControls.classList.remove("open"); syncPanels(); });
	elements.closeSelector.addEventListener("click", () => { elements.selectorDrawer.classList.remove("open"); syncPanels(); });
	elements.closeEditor.addEventListener("click", closeEditorPanel);
	elements.closeSettings.addEventListener("click", () => { elements.settingsDrawer.classList.remove("open"); syncPanels(); });
	elements.saveLocation.addEventListener("click", () => saveLocation().catch((error) => showStatus(error.message, true)));
	elements.undoLocation.addEventListener("click", undoChanges);
	elements.deleteLocation.addEventListener("click", () => deleteLocation().catch((error) => showStatus(error.message, true)));
	elements.showHistory.addEventListener("click", () => showHistory().catch((error) => showStatus(error.message, true)));
	elements.closeHistory.addEventListener("click", () => elements.historyDialog.close());
	elements.exportLocations.addEventListener("click", () => transfer("export").catch((error) => showStatus(error.message, true)));
	elements.importLocations.addEventListener("click", () => transfer("import").catch((error) => showStatus(error.message, true)));
	elements.mergeLocations.addEventListener("click", () => transfer("merge").catch((error) => showStatus(error.message, true)));
	elements.purgeDeleted.addEventListener("click", () => purgeDeletedLocations().catch((error) => showStatus(error.message, true)));
	elements.makeCircle.addEventListener("click", () => { const center = map.getCenter(); geometryPreviewDirty = true; elements.geometryType.value = "Polygon"; elements.points.value = formatPoints(makeCirclePoints({ lat: center.lat, lon: center.lng }, Number(elements.radiusNm.value || 0.2))); updateConditionalFields(); });
	elements.saveGeometry.addEventListener("click", () => saveLocation().catch((error) => showStatus(error.message, true)));
	elements.undoGeometry.addEventListener("click", undoChanges);
	elements.applyRadius.addEventListener("click", () => changeCircle());
	elements.decreaseRadius.addEventListener("click", () => changeCircle(-0.01));
	elements.increaseRadius.addEventListener("click", () => changeCircle(0.01));
	bindPressRepeat(elements.nudgeNorth, (context) => nudgeGeometry(1, 0, context));
	bindPressRepeat(elements.nudgeSouth, (context) => nudgeGeometry(-1, 0, context));
	bindPressRepeat(elements.nudgeWest, (context) => nudgeGeometry(0, -1, context));
	bindPressRepeat(elements.nudgeEast, (context) => nudgeGeometry(0, 1, context));
	map.on("moveend zoomend", () => { if (elements.mapAreaOnly.checked) renderLocations(); });
}

setupChoices();
initMap();
bindEvents();
makeDraggable(elements.geometryControls, elements.geometryControlsHandle);
elements.workspace.value = localStorage.getItem(`${storagePrefix}Workspace`) || "all";
elements.mapAreaOnly.checked = localStorage.getItem(`${storagePrefix}MapAreaOnly`) === "true";
resetEditor();
loadLocations().catch((error) => showStatus(error.message, true));
