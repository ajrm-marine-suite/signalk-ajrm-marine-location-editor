# Changelog

## 0.5.0 - 2026-08-18

- Add backend stationary-at-anchorage/mooring detection and publish its full
  evidence and action provenance at `plugins.ajrmMarineLocations.anchoring`.
- Ask for skipper confirmation by default; allow automation only when it is
  enabled globally and the individual location is explicitly trusted.
- Support per-location detection radii for point anchorages and moorings.
- Confirming or trusted automation selects Traffic's Anchored profile without
  fabricating an anchor position. Manual **Drop Anchor** remains the accurate
  way to record the physical anchor position and depth.
- Never infer un-anchoring from vessel movement.

## 0.4.0 - 2026-08-18

- Add the shared `ajrm-marine-tide-resolver-v1` backend contract and publish its
  rich provenance/freshness projection plus standard Signal K tide paths.
- Select an explicit place reference first, then a containing tidal-region
  assignment, then the nearest suitable port in that region; allow a persisted
  manual pin without concealing the automatic candidate.
- Add versioned tidal-region relationships and explicit provider identifiers
  to the Location Editor model and UI.
- Add UKHO high/low-water retrieval, current-height interpolation and
  fresh/stale/expired handling. Respect UKHO terms by keeping Discovery data
  memory-only and permitting durable cache only for configured Foundation or
  Premium subscriptions.
- Expose tide status, manual pin/clear and refresh through authenticated HTTP
  routes and the in-process `app.ajrmMarineTides` service.

## 0.3.8 - 2026-08-18

- Selecting a workspace now selects its relevant **Show on chart** types and
  deselects types belonging to the other workspaces.
- Scale geometry-arrow movement to the chart zoom, giving much finer control
  when zoomed in, and gradually accelerate repeated movement while held.
- Add a confirmed **Purge Deleted Locations** Settings action. It permanently
  removes tombstones and revision histories while retaining a minimal UUID
  blocklist so automatic seed loading and ordinary merges cannot recreate the
  purged records.

## 0.3.7 - 2026-08-13

- Separate the compact location selector from the full Location Editor.
- Keep workspace, search, display filters and the location list in **Select
  Location**; selecting a record opens its editor.
- Keep geometry, classification, profile, anchorage, tide, hazard, provenance
  and save/history/delete controls exclusively in **Location Editor**.
- Use the pencil map button to reopen the current editor; geometry nudging is
  launched from the editor's **Edit Geometry** action.

## 0.3.6 - 2026-08-13

- Require a unique normalized name for every active location, independent of
  type, workspace, letter case or repeated whitespace.
- Match legacy Harbour Editor merges by normalized name, retain the record's
  stable local ID, accept only a later explicit edit, and tombstone duplicate
  records created by earlier imports.
- During initial open-data setup, let a nearby same-name marina or other more
  specific classification upgrade an unedited migrated harbour region. This
  retains its useful profile polygon without adding a duplicate point record.

## 0.3.5 - 2026-08-13

- Add **Undo Changes** beside both **Save Location** actions. It restores every
  field and the geometry from the last saved revision, or clears a new draft.

## 0.3.4 - 2026-08-13

- Accept AJRM Marine Harbour Editor v1 exports in both Location Editor transfer
  actions and convert their `Harbour:` regions into versioned locations.
- Clarify that **Merge** retains unrelated locations while **Replace
  Catalogue** removes locations absent from the selected file.
- Tombstone locations omitted by replacement so bundled starter records do not
  return after restart.
- Keep transfer failures visible in the Settings messages panel.

## 0.3.3 - 2026-08-13

- Clear the yellow unsaved-geometry preview after a successful save so the
  location immediately returns to its normal saved colour.
- Show the yellow preview only while geometry is new or has been edited.

## 0.3.2 - 2026-08-13

- Repeat circle movement after an arrow is held briefly, while retaining
  single-step taps and keyboard activation.

## 0.3.1 - 2026-08-13

- Keep the nested chart-folder controls visible after Auto Charts is switched
  on or another map-selector option changes.
- Add an explicit **Save Location** action beside the circle movement and radius
  controls, clarifying that geometry adjustments are previews until saved.
- Refresh all browser asset version markers so upgrades cannot retain the older
  chart selector or Location Editor script from cache.

## 0.3.0 - 2026-08-12

- Added a repeatable, tombstone-aware West Scotland starter catalogue with
  sourced anchorages, moorings, marinas, harbours, tidal gates and tide gauges.
- Added explicit provenance, review status, source links, retrieval dates and
  per-record licence metadata, preserving them through local edits.
- Added `tidalObservationStation` so measured tide-gauge data is not
  misrepresented as a standard or secondary prediction port.
- Conservatively upgrades an unedited migrated OSM harbour to marina when the
  bundled source explicitly classifies it as a marina.
- Added a maintainer generator for refreshed OSM/OpenSeaMap and Environment
  Agency source data.

## 0.2.1

- Replace the flat harbour list with a searchable, grouped location browser.
- Add persistent **Show on chart** filters for every location type; changes
  immediately affect both map geometry and browser results.
- Show matching counts beside each type, plus an overall shown/total count.
- Add an optional current-map-area filter for large shared catalogues.
- Clearly distinguish display filters from the type classification fields that
  describe the selected record and apply on save.
- Add pure browser filtering/grouping helpers and regression tests.

## 0.2.0

- Make Location Editor a true superset and intended successor to Harbour Editor.
- Automatically copy every existing `Harbour:` Signal K region into the
  versioned catalogue on first start, preserving its UUID and geometry.
- Default to the All Locations workspace so migrated harbours and every other
  stored location are immediately visible on the chart.
- Edit harbour circles and polygons in Location Editor and publish compatible
  Signal K region resources for existing automatic profile switching.
- Allow harbours, anchorages, moorings and marinas to opt into automatic
  Harbour profile switching explicitly.
- Reconcile published regions from the canonical versioned catalogue without
  rewriting unchanged resources on every startup.
- Add migration and bulk-versioning regression tests.

## 0.1.0

- Create Location Editor as a new app while leaving Harbour Editor unchanged.
- Add Places, Tides, Hazards and All map workspaces with typed GeoJSON points,
  polygons and circles.
- Link places to existing Harbour Editor regions and tidal locations.
- Record immutable per-location revisions for saves, restores and deletions.
- Keep deletion tombstones and full snapshots so shared edits can be undone.
- Reject stale edits and merge catalogues by latest edit timestamp, reporting
  equal-time conflicts without discarding either history branch.
- Add versioned export, confirmed replacement import, merge, spatial lookup and
  an authenticated OpenAPI HTTP contract.
- Reuse the suite's common chart selection, chart-folder and overlap-cycle UI.
