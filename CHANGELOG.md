# Changelog

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
