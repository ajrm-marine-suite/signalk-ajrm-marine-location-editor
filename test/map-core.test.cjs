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
	assert.match(html, /ajrm-map-core\.css\?v=0\.7\.3/);
	assert.match(html, /type="module" src="\.\/app\.js\?v=0\.1\.0"/);
	assert.match(html, /styles\.css\?v=0\.1\.0/);
	assert.match(html, /id="chartCycleStatus" class="ajrm-map-chart-cycle-status"[^>]+hidden/);
  assert.match(app, /zoomControl:\s*true/);
  assert.match(app, /MapCore\.createChartSelectorControl/);
	assert.match(app, /MapCore\.createChartCycleControl/);
	assert.match(app, /isEnabled:\s*\(\)\s*=>\s*map\.hasLayer\(autoChartGroup\)/);
	assert.match(app, /MapCore\.labelLeafletZoomControls\(map\)/);
	assert.match(app, /statusElement:\s*elements\.chartCycleStatus/);
  assert.match(app, /MapCore\.createActionToolbarControl/);
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
