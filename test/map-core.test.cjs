const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const normalizeNewlines = (text) => text.replace(/\r\n?/g, "\n");

test("published map core matches the pinned internal release", () => {
  const root = path.resolve(__dirname, "..");
  assert.equal(
    normalizeNewlines(fs.readFileSync(path.join(root, "public/ajrm-map-core.mjs"), "utf8")),
    normalizeNewlines(fs.readFileSync(path.join(root, "node_modules/@ajrm-marine/map-core/src/index.mjs"), "utf8")),
  );
  assert.equal(
    normalizeNewlines(fs.readFileSync(path.join(root, "public/ajrm-map-core.css"), "utf8")),
    normalizeNewlines(fs.readFileSync(path.join(root, "node_modules/@ajrm-marine/map-core/styles/map-core.css"), "utf8")),
  );
  assert.match(
    fs.readFileSync(path.join(root, "public/ajrm-map-core.css"), "utf8"),
    /\.ajrm-map-actions\{display:flex;flex-direction:column;gap:10px/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "public/ajrm-map-core.css"), "utf8"),
    /\.ajrm-map-option input,\.ajrm-map-folder input\{[^}]*flex:0 0 16px;[^}]*width:16px;[^}]*height:16px/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "public/ajrm-map-core.mjs"), "utf8"),
    /CHART_CYCLE_SHORTCUT_STORAGE_KEY = "chartCycleShortcut"/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "public/ajrm-map-core.mjs"), "utf8"),
    /export function floatingPanelHeight/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "public/ajrm-map-core.css"), "utf8"),
    /\.ajrm-map-panel\{[^}]*overflow-x:hidden;[^}]*touch-action:pan-y/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "public/ajrm-map-core.css"), "utf8"),
    /\[data-ajrm-map-help\]::after\{/,
  );
});

test("map page uses the standard left-side controls with zoom first", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
	assert.match(html, /ajrm-map-core\.css\?v=0\.7\.13/);
	assert.match(html, /type="module" src="\.\/app\.js\?v=0\.7\.4"/);
	assert.match(html, /styles\.css\?v=0\.7\.4/);
	assert.match(app, /ajrm-map-core\.mjs\?v=0\.7\.13/);
	assert.match(app, /location-browser\.mjs\?v=0\.7\.4/);
	assert.match(html, /id="chartCycleStatus" class="ajrm-map-chart-cycle-status"[^>]+hidden/);
  assert.match(app, /zoomControl:\s*true/);
  assert.match(app, /MapCore\.createChartSelectorControl/);
	assert.match(app, /MapCore\.createChartCycleControl/);
	assert.match(app, /chartCycle\s*\?\s*chartCycle\.choose\(autoChartList, map\)\s*:\s*MapCore\.chooseChart/);
	assert.doesNotMatch(app, /chartCycle\?\.choose\([^\n]+\)\s*\?\?/);
	assert.match(fs.readFileSync(path.join(root, "public/ajrm-map-core.mjs"), "utf8"), /No Auto chart — basemap shown/);
	assert.match(fs.readFileSync(path.join(root, "public/ajrm-map-core.css"), "utf8"), /width:min\(92vw,48rem\)/);
	assert.match(app, /isEnabled:\s*\(\)\s*=>\s*map\.hasLayer\(autoChartGroup\)/);
	assert.match(app, /MapCore\.labelLeafletZoomControls\(map\)/);
	assert.match(app, /statusElement:\s*elements\.chartCycleStatus/);
	assert.match(app, /MapCore\.createActionToolbarControl/);
	assert.match(app, /title: "Select location"/);
	assert.match(app, /title: "Edit location"/);
	assert.match(html, /id="saveGeometry"[^>]*>Save Location</);
	assert.match(html, /id="undoGeometry"[^>]*>Undo Changes</);
	assert.match(html, /id="undoLocation"[^>]*>Undo Changes</);
	assert.match(html, /class="drawer-section action-row location-action-row"/);
	assert.match(css, /\.location-action-row\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
	assert.match(app, /elements\.saveGeometry\.addEventListener\("click", \(\) => saveLocationFrom\(elements\.saveGeometry\)/);
	assert.match(css, /button\.is-working,\s*button\.is-working:disabled\s*\{[^}]*transform:\s*translateY\(4px\)/s);
	assert.match(app, /elements\.undoGeometry\.addEventListener\("click", undoChanges\)/);
	assert.match(app, /function undoChanges\(\)[\s\S]*selectLocation\(selectedId\)[\s\S]*resetEditor\(\)/);
	assert.match(app, /bindPressRepeat\(elements\.nudgeNorth/);
	assert.match(app, /geometryPreviewDirty = false;\s*previewLayer\?\.clearLayers\(\);\s*showStatus\(`Saved revision/);
	assert.match(app, /previewLayer\.clearLayers\(\);\s*if \(!geometryPreviewDirty\) return;/);
	assert.match(app, /const unsavedGeometryColor = "#ff2d2d"/);
	assert.match(app, /L\.circleMarker\([\s\S]*fillColor: unsavedGeometryColor/);
	assert.match(app, /color: "#000000"[\s\S]*fillColor: color/);
	assert.match(app, /color: "#000000"[\s\S]*fillColor: unsavedGeometryColor/);
	assert.match(app, /L\.polygon\([\s\S]*color: unsavedGeometryColor/);
	assert.doesNotMatch(app, /color: "#facc15"/);
  assert.doesNotMatch(html, /name="baseMap"/);
  assert.doesNotMatch(html, /id="checkAutoCharts"/);
  assert.doesNotMatch(html, /id="checkOpenSeaMap"/);
  assert.doesNotMatch(app, /elements\.(baseMapChoices|autoCharts|openSeaMap)/);
  assert.match(css, /\.drawer-left\s*\{[^}]*left:\s*52px/s);
  assert.match(css, /\.drawer-left\s*\{[^}]*width:\s*min\(430px, calc\(100vw - 64px\)\)/s);
  assert.match(css, /\.map\s*\{[^}]*position:\s*absolute/s);
	assert.match(css, /button:active:not\(:disabled\)/);
	assert.match(css, /transform:\s*translateY\(4px\)/);
  assert.doesNotMatch(css, /\.map\s*\{[^}]*position:\s*fixed/s);
  assert.doesNotMatch(css, /\.map\s*\{[^}]*z-index/s);
  assert.doesNotMatch(app, /position:\s*["']topright["']/);
});

test("location selection and editing use separate focused drawers", () => {
	const root = path.resolve(__dirname, "..");
	const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
	const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
	const selector = html.match(/<aside id="selectorDrawer"[\s\S]*?<\/aside>/)?.[0] || "";
	const editor = html.match(/<aside id="editorDrawer"[\s\S]*?<\/aside>/)?.[0] || "";
	const geometry = html.match(/<section id="geometryControls"[\s\S]*?<\/section>/)?.[0] || "";
	assert.match(selector, /id="workspace"/);
	assert.match(selector, /id="locationList"/);
	assert.match(selector, /id="newLocation"/);
	assert.doesNotMatch(selector, /id="geometryType"|id="anchorageFields"|id="tideFields"|id="hazardFields"/);
	assert.doesNotMatch(editor, /id="geometryType"|id="pointEditor"|id="polygonEditor"/);
	assert.match(geometry, /id="geometryType"/);
	assert.match(geometry, /id="pointEditor"/);
	assert.match(geometry, /id="polygonEditor"/);
	for (const shape of ["Circle", "Rectangle", "Polygon"]) assert.match(geometry, new RegExp(`<option value="${shape}">${shape}</option>`));
	assert.match(geometry, /id="rectangleWidthNm"/);
	assert.match(geometry, /id="rectangleHeightNm"/);
	assert.match(geometry, /id="polygonPointCount"[^>]*min="3"[^>]*max="32"/);
	assert.match(app, /draggable: true/);
	assert.match(app, /class=\"geometry-vertex\"/);
	assert.match(app, /marker\.on\("drag"/);
	assert.match(app, /editorShape:/);
	assert.match(app, /convertGeometryType\(previousGeometryType, nextGeometryType\)/);
	assert.match(app, /fromType === "Point" \? parsePoint\(\) : centreOfPoints\(parsePoints\(\)\)/);
	assert.match(app, /makeSelectedShape\(origin\)/);
	assert.match(app, /applyTypeSelectionDefaults\(event\.target\)/);
	assert.match(app, /elements\.editorDrawer\.classList\.remove\("open"\)/);
	assert.match(app, /geometryNavigation\.close\(\) === "editor"/);
	assert.match(editor, /id="anchorageFields"/);
	assert.doesNotMatch(editor, /id="tideFields"|UKHO|secondary-port correction/);
	assert.match(editor, /id="hazardFields"/);
});

test("tidal classifications remain spatial while provider and correction controls are absent", () => {
	const root = path.resolve(__dirname, "..");
	const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
	const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
	assert.match(app, /tidalStandardPort: \["Tidal standard port"/);
	assert.match(app, /tidalSecondaryPort: \["Tidal secondary port"/);
	assert.match(app, /weatherForecastLocation: \["Weather forecast location", "weather"/);
	assert.match(html, /<option value="weather">Weather Forecasts<\/option>/);
	assert.match(app, /workspaceTypes\.length === 1/);
	assert.doesNotMatch(html, /UKHO|Admiralty|secondaryCorrection|tideProviderId|parentLocationRef|tidalGateFields/);
	assert.doesNotMatch(app, /ajrm-secondary-port|ukhoTidalEvents|heightDifferencesM|properties\.tidalGate/);
});
