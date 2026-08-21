# Changelog

## 0.6.35 — 2026-08-21

- Show the serving tidal port and optional parent region when editing a tidal-region Location.
- Save that joined relationship through the lifecycle-safe Tidal Database service, retaining Tidal Database as the single source of tidal semantics.
- Clearly report when Tidal Database is unavailable instead of silently losing or duplicating the relationship.

## 0.6.34 — 2026-08-21

- Draw a solid black ring around point-location markers and unsaved point previews so their category colours remain visible against detailed charts.

## 0.6.33 — 2026-08-21

- Remove the temporary Open-Meteo service and cache; AJRM Marine Weather Database now owns providers, forecasts and offline weather storage.
- Keep Location Editor focused on spatial locations and assisted anchoring.

## 0.6.32

- Make Location Editor a spatial catalogue only.
- Remove UKHO credentials, station mappings, secondary-port corrections, gate constants, tide prediction/cache code and tide HTTP/service contracts.
- Replace the combined historical seed with a consolidated spatial-only catalogue.
- Preserve opaque third-party extension properties during the staged migration without interpreting them.

## 0.6.31 - 2026-08-21

- Give secondary ports an explicit, mutually exclusive prediction source:
  entered almanac corrections against a standard parent, or direct UKHO Tidal
  API events for a verified secondary station.
- Migrate structurally unambiguous existing secondary records onto the explicit
  source contract and reject mixed API/correction records.
- Import 47 new API-backed Scotland and Northern Ireland locations after
  checking the workbook's requested names against the live UKHO station list;
  retain 14 unresolved workbook rows in audit metadata without connecting them
  to incorrect station IDs.
- Add 100 editable `<port name> tidal area` polygons covering every bundled
  standard/secondary port. The bounded Voronoi-style generation ensures the
  specific area interiors do not overlap and records that local review remains
  required.
- Add regression tests for API-backed secondary resolution, source validation,
  station mapping and generated-area topology.

## 0.6.30 - 2026-08-19

- Update to shared map shell 0.7.11 so the centred chart-cycle banner has a
  wider responsive text area.

## 0.6.29 - 2026-08-19

- Preserve the chart controller's intentional empty selection so chart cycling
  genuinely exposes the basemap-only step.
- Keep both **Save Location** actions visibly depressed and disabled until the
  asynchronous save and catalogue reload have completed.

## 0.6.28 - 2026-08-19

- Update to shared map shell 0.7.9 so chart cycling includes an explicit
  basemap-only step before returning to automatic selection.

## 0.6.27 - 2026-08-19

- Package the Location Editor icon at both the npm root for App Store metadata
  and the public webapp root for the installed Webapps catalogue.

## 0.6.26 - 2026-08-19

- Correct the Signal K Webapps icon URL so it resolves at the public webapp
  root rather than the nonexistent `public/public` path.
- Add a regression test for the declared `appIcon` and served asset.

## 0.6.25 - 2026-08-19

- Add explicit Point, Circle, Rectangle and Polygon editing modes while
  retaining simple interoperable GeoJSON Point/Polygon storage.
- Generate regular polygons with 3-32 selectable vertices and rectangles with
  configurable width and height.
- Add numbered draggable vertex handles for rectangles and polygons, and
  preserve an area's editor shape through later revisions.
- Move existing area geometry without silently regenerating it as a circle.

## 0.6.24 - 2026-08-19

- Make the versioned Locations catalogue the suite's only place and automatic
  profile-area store.
- Remove Harbour Editor import, Signal K `Harbour:` region discovery, dual
  publication and normalized-name compatibility merging.
- Expose profile areas directly through the shared Locations v1 service for
  Display, Traffic, Snapshot and BITE.

## 0.6.23 - 2026-08-18

- Keep broad tidal planning-region polygons visible without allowing their
  filled area to intercept clicks and hover labels intended for contained
  ports, gates, hazards and other locations.
- Retain planning-region selection through the location list.

## 0.6.22 - 2026-08-18

- Fix an upgrade failure caused by treating a shared almanac page as a unique
  location identity. Existing locations remain matched by stable record ID,
  record-specific source ID or unique name.
- Repair the one possible cross-applied bundled correction without replacing
  user geometry or deleting catalogue history.
- Give incomplete secondary-port source records stable identities so repeated
  startup migration is idempotent.

## 0.6.21 - 2026-08-18

- Add 16 Ullapool and 18 Stornoway secondary-port source records from the
  supplied Reeds page images, with each table's printed HW/LW reference times.
- Make 33 complete records available for prediction through their standard
  parent and retain Soay (Camus nan Gall) as explicitly incomplete because its
  MLWN and MLWS height differences are printed as ND.
- Seed all three secondary-port tables independently so their standard-port
  links and reference columns cannot be mixed.

## 0.6.20 - 2026-08-18

- Correct Port Ellen's HW and LW reference columns from the supplied Reeds
  table and migrate only the exact earlier incomplete bundled record.
- Add Scalasaig, Glengarrisdale Bay, Craighouse, Rubha a’ Mhail, Ardnave Point,
  Orsay Island, Bruichladdich, Port Askaig and Gigha Sound as Oban secondary
  ports with source-recorded positions and corrections.
- Retain Machrihanish's published time corrections and 0.5 m mean range as an
  explicitly incomplete secondary-port record; it is excluded from prediction
  until absolute height differences are available.

## 0.6.19 - 2026-08-18

- Keep the four primary Location Editor actions on one compact row.

## 0.6.18 - 2026-08-18

- Remove the expandable Tide relationships disclosure and show its applicable
  controls directly above the role-specific tidal fields.
- Put tidal-region, prediction-port and parent-standard-port labels alongside
  their dropdowns in the wide editor, with a stacked mobile fallback.

## 0.6.17 - 2026-08-18

- Replace the yellow new/unsaved geometry preview with bright red for stronger
  contrast against chart backgrounds.

## 0.6.16 - 2026-08-18

- Reveal and scroll to the secondary-port form immediately when its
  classification is selected.
- Widen the editor for the complete Reeds correction row on desktop displays.
- Make standard-port and secondary-port classifications mutually exclusive.
- Require a parent standard port, list only standard ports in that selector,
  and reject secondary-port parents in backend catalogue validation.

## 0.6.15 - 2026-08-18

- Put all secondary-port HW, LW and height differences on one Reeds-style
  horizontal row, with the standard-port reference times directly above.
- Keep the table on one line and allow horizontal scrolling on narrow screens.
- Remove the correction-notes control and imported source/review footer from
  the editor without deleting that metadata from existing stored records.

## 0.6.14 - 2026-08-18

- Restrict automatic Harbour-profile switching to harbour, marina, anchorage
  or mooring polygons.
- Replace the generic tidal-location relationship with a prediction-port
  assignment shown only on tidal regions.
- Support nested tidal regions and prefer the deepest/smallest containing
  region before falling back through broader regions.
- Remove duplicated parent MHWS/MHWN/MLWN/MLWS entry from secondary ports and
  migrate corrections to the parent-linked v4 contract.
- Remove the unresolvable Bucklers Hard example from the West Scotland seed.

## 0.6.13 - 2026-08-18

- Move point coordinates and polygon points from the main location drawer to
  the focused Geometry editor.
- Show prediction provider, station, datum and reference levels only for
  standard ports, and show parent-port/Reeds corrections only for secondary
  ports.
- Prevent hidden standard-port fields from being written into secondary-port
  records.
- Widen the secondary height-difference cells and provide horizontal overflow
  on small screens so signed decimal corrections are not clipped.

## 0.6.12 - 2026-08-18

- Replace duplicated 24-hour secondary-port entries with the paired 12-hour
  correction pattern printed by Reeds.
- Accept signed-HHMM time differences directly and arrange time and height
  entry as Reeds-style tables for easier transcription and validation.
- Migrate repeating v1/v2 records to `ajrm-secondary-port-corrections-v3`
  without changing their calculated results, retaining a bounded 24-hour
  representation only for genuinely non-repeating legacy data.
- Let automatic tide selection use suitable unlinked ports whose positions lie
  inside the vessel's tidal region.

## 0.6.11 - 2026-08-18

- Add a shared nearest-secondary-port recommendation constrained to the
  vessel's containing tidal region.
- Honour explicit tidal-region links and spatially include legacy unlinked
  secondary ports whose geometry lies in that region.

## 0.6.10 - 2026-08-18

- Replace fixed 0000/0600/1200/1800 secondary-port columns with explicit,
  independently timed HW and LW correction points.
- Migrate v1 corrections to `ajrm-secondary-port-corrections-v2` without
  guessing new source times.
- Resolve secondary-port and sub-port chains centrally from the standard-port
  events, with missing-parent, excessive-depth and cycle protection.
- Let consumers explicitly request a standard or secondary tidal location and
  return corrected events, reference levels and correction provenance.
- Correct Loch Melfort from the supplied Reeds table and add Seil Sound from
  the same page, marking its open-data position as approximate.

## 0.6.9 - 2026-08-18

- Add UKHO standard prediction ports Stornoway `0308` and Ullapool `0334`
  with official MHWS/MHWN/MLWN/MLWS reference levels.
- Become the sole owner and editor of all 15 migrated tidal-gate passage
  datasets, including their standard-port relationship, timing, stream-rate,
  slack and source fields.
- Upgrade matching existing locations without moving their user-edited
  geometry and add missing positioned gate records with migration provenance.

## 0.6.8 - 2026-08-18

- Make Location Editor authoritative for secondary-port correction setup.
- Store standard-port reference levels, four HW and LW time corrections, four
  height corrections and editorial/source notes in each versioned location.
- Migrate the six Marine Planning secondary-port datasets into the bundled
  catalogue, enriching matching locations that lack correction data without
  overwriting geometry or other user edits.
- Preserve stable legacy correction identifiers so existing Planning
  selections continue to resolve after migration.

## 0.6.7 - 2026-08-18

- Return to the Select Location drawer when closing an editor that was opened
  from that drawer.
- Preserve direct map/editor-toolbar behaviour: those editors still close to
  the map instead of inventing a selection-history step.

## 0.6.6 - 2026-08-18

- Store editable MHWS, MHWN, MLWN and MLWS station reference levels with tidal
  locations and validate them as explicit numeric data.
- Publish available station reference levels through the shared Tide Resolver.
- Upgrade the existing unedited bundled Oban station with its migrated
  reference levels, without overwriting user-edited locations.

## 0.6.5 - 2026-08-18

- Interpret timezone-free UKHO Tidal API event times as documented GMT rather
  than as the Pi's local timezone.
- Preserve explicitly zoned provider timestamps and publish normalized UTC
  instants to every shared Tide Resolver consumer.
- Invalidate pre-fix persistent tide caches once, forcing an authoritative
  refresh instead of retaining summer predictions shifted one hour early.

## 0.6.4 - 2026-08-18

- Accept explicit latitude/longitude selection context on tide status, refresh
  and pin requests. Chart applications can now resolve the visible area when
  there is no current own-vessel position instead of receiving an unrelated
  no-port result.

## 0.6.3 - 2026-08-18

- Register the location, tide, weather, anchoring and diagnostic services in
  lifecycle-safe process-wide registries. Signal K supplies separate `app`
  wrappers to plugins, so properties placed only on Location Editor's wrapper
  were invisible to Planning and Snapshot.

## 0.6.2 - 2026-08-18

- Expose a read-only in-process diagnostics snapshot for AJRM Marine Snapshot,
  containing catalogue counts, the last resolved tide including its fetched
  event series, the last fetched weather/marine hourly series, provenance,
  freshness and anchoring-assistance state.
- Include the full versioned location catalogue only when the diagnostic
  consumer explicitly requests it, keeping ordinary support snapshots smaller.
- Keep provider credentials out of the diagnostic contract.

## 0.6.1 - 2026-08-18

- Add a deliberately broad, explicitly-labelled West Scotland tidal planning
  region assigned to the provisional Oban prediction-port record. This lets a
  fresh catalogue follow the documented containing-region selection rule
  without introducing an unsafe global-nearest-port fallback or requiring a
  manual pin.
- Make the in-process tide and weather services wait for catalogue
  initialization, preventing early-start consumers from seeing a transient
  empty catalogue.
- Keep an explicit position/context tide request separate from the coalesced
  background own-vessel refresh, so a planner cannot receive an unrelated
  no-position result during startup.

## 0.6.0 - 2026-08-18

- Add the shared `ajrm-marine-weather-service-v1` contract for planners and
  other suite plugins, backed by position-keyed Open-Meteo weather and marine
  caches with explicit fresh/stale/expired state and fallback provenance.
- Publish only a compact current-weather projection to Signal K; detailed
  hourly provider series remain available in-process and by HTTP without
  bloating normal deltas.
- Allow consumers to request the tide resolver's normalized event series while
  retaining the compact published tide projection.

## 0.5.1 - 2026-08-18

- Clarifies that assisted anchoring selects Anchored, while Traffic owns evidence-based release.

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
