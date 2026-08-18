# AJRM Marine Location Editor

Version `0.6.7` restores the selection workflow after editing: closing an
editor opened from **Select Location** returns to the location selector rather
than dropping the user back to the map.

Version `0.6.6` stores optional MHWS, MHWN, MLWN and MLWS reference levels
with each tidal prediction port and publishes them through the shared Tide
Resolver. Existing unedited bundled ports are upgraded automatically.

Version `0.6.5` treats UKHO's timezone-free Tidal API predictions explicitly
as GMT before publishing UTC instants to Display and Planning. Older durable
tide caches are invalidated once because their summer timestamps may be one
hour early.

Version `0.6.4` lets chart applications supply the visible chart centre to
tide status, refresh and pin requests. Automatic port selection therefore
continues to work while inspecting an area without a current vessel position.

Version `0.5.1` clarifies that Location Editor owns assisted Anchored-profile
selection only; evidence-based automatic release is owned by AJRM Marine
Traffic.

> **Public beta disclaimer:** User-defined locations supplement, but do not
> replace, official charts, Notices to Mariners, pilotage, a proper lookout or
> the skipper's judgement. The authors do not accept responsibility for loss
> or damage resulting from their use.

A Signal K webapp for maintaining reusable marine knowledge. It is a superset
of **AJRM Marine Harbour Editor** and is intended to replace it after migration
and onboard testing. It stores:

- harbours, anchorages, moorings, marinas and points of interest;
- tidal standard ports, secondary ports, tidal regions and tidal gates;
- tidal observation stations, kept distinct from prediction stations;
- hazards, avoidance areas, no-anchoring areas, waiting areas and preferred
  channels;
- links from places to tidal locations.

The map defaults to **All Locations**, displaying migrated harbours and every
other stored location. Its location browser supports text search, grouped
results, persistent per-type chart filters and an optional current-map-area
filter. It can also be filtered into Places, Tides, Hazards or All workspaces.
Selecting a workspace selects only the chart types belonging to it. Geometry
arrow movement follows the current chart zoom and accelerates gradually while
an arrow is held.
The separate **Classify this location** choices describe the record being
edited and apply only when it is saved. The shared Tide Resolver now selects
and publishes tidal predictions; automatic profile selection and active hazard
monitoring are separate later stages.

## Assisted Anchored-profile detection

The backend watches position and speed over ground. When the vessel remains at
or below the configured stationary speed for the configured time inside an
anchorage/mooring area—or within the configured radius of a point
anchorage/mooring—it publishes an Anchored-profile suggestion. Display asks the
skipper to confirm or dismiss it. A dismissal remains effective until the
vessel leaves or moves.

Confirmation selects the Anchored profile but does not invent an anchor
position. Use Display's manual **Drop Anchor** action when the anchor is
actually dropped to retain the accurate position and depth below keel.

Trusted automation is deliberately double opt-in: enable it in Signal K plugin
settings and mark the individual anchorage/mooring as trusted in Location
Editor. Location Editor itself never infers un-anchoring from a location
change. AJRM Marine Traffic may separately release Anchored after its
configured sustained speed test or, when Display has a manual anchor mark,
its sustained anchor-radius test.

## Shared Tide Resolver

The backend exposes `app.ajrmMarineTides` and
`plugins.ajrmMarineLocations.tide` as the common tide contract for Display,
Capture and the planners. It also publishes the standard Signal K paths
`environment.tide.heightNow`, `heightHigh`, `heightLow`, `timeHigh` and
`timeLow` when its result is valid.

The automatic candidate is selected in this order:

1. the place's explicit **Tidal location used here**;
2. the tidal port assigned to the containing tidal-region polygon;
3. the nearest configured prediction port assigned to that same region.

A valid manually pinned port then overrides that candidate. The projection
retains the automatic port and reason so the override remains auditable. A
missing/deleted pin is reported and does not suppress a valid automatic
selection.

Prediction ports need an explicit provider identifier and station identifier;
the resolver never guesses either from a name. Version 0.4 supports UKHO Tidal
API high/low-water events and labels its present-height estimate as
`cosine-between-extremes-v1`. The projection includes the selected station,
datum, next high and low waters, trend, curve, fetch source, cache mode and
fresh/stale/expired state. Expired data never produce a valid standard Signal K
height.

Configure the UKHO subscription key and its actual subscription tier in Signal
K's plugin settings. UKHO states that Discovery-tier data must not be cached,
so it remains memory-only. Foundation and Premium cache one shared station file
on disk for offline fallback. The key remains in the Signal K backend and is
never returned to browsers.

Contains ADMIRALTY® tidal data:
© Crown Copyright and database right.

Tidal predictions and interpolation are planning aids, not a substitute for
official current information or safe navigation. Verify datum, station,
freshness and suitability for the intended use.

## Shared Weather Service

The backend also exposes `app.ajrmMarineWeather` and publishes a compact current
projection at `plugins.ajrmMarineLocations.weather`. Consumers request a
location or position; the service retrieves Open-Meteo weather and marine
hourly forecasts, stores a position-keyed cache, and reports explicit
fresh/stale/expired state and offline-fallback provenance. The in-process and
HTTP contracts can return the full hourly series, while the normal Signal K
delta deliberately omits it. Compact speeds and directions use Signal K SI
units; the retained provider payload includes its own explicit units.

AJRM Marine Planning consumes this service instead of maintaining another
forecast cache. Forecast data remain planning inputs which must be checked
against current official forecasts and observed conditions.

`app.ajrmMarineLocationDiagnostics` gives the suite's Snapshot plugin a
non-mutating view of the last data already fetched by these services. It does
not perform a network refresh. The normal form contains catalogue counts,
full tidal events, full weather/marine hourly series and anchoring state; an
explicit debug request can additionally include the full versioned catalogue.
API keys are never part of this contract.

## Bundled West Scotland starter data

On first start, the plugin adds a sourced West Scotland starter catalogue. It
currently contains named anchorages, mooring locations, marinas, harbours,
tidal gates and National Tide Gauge Network observation stations. Stable IDs
make the import repeatable. A locally edited record is never overwritten, and
deleting a bundled record leaves a tombstone so a later software update does
not recreate it.

OpenStreetMap/OpenSeaMap supplies the distributable place positions and
classifications. Selected marina entries are cross-checked against Welcome
Anchorages, but its editorial directory is linked rather than copied. Tide
gauge identities come from the Environment Agency open API. Each record shows
its sources, licence, retrieval date and review status in the editor.

The tidal-gate markers intentionally contain no stream direction, rate,
passage time or clearance advice. Anchorage markers contain no assertion that
an anchorage is suitable for a particular vessel or conditions. Use current
official charts, Notices to Mariners, tidal data and appropriate pilotage.
`DATA-LICENCE.md` records the data attributions separately from the software
licence.

## Existing harbours and transition

On first start, Location Editor reads every existing Signal K region whose
name begins `Harbour:` and copies it into the versioned catalogue. The stable
region UUID, circle or polygon, name, description and explicit marina/harbour
type are retained. The original Signal K resources are not removed.

From then on, the Location Editor record is canonical. Saving a location with
**Use this area for automatic Harbour profile switching** publishes the same
UUID and geometry as a compatible `Harbour:` Signal K region, so existing
Traffic automatic-profile behaviour continues to work. Unchecking it or
deleting the location retracts that region; undo republishes it.

During testing, keep Harbour Editor installed but make harbour changes in
Location Editor. Once migration, editing and profile switching have been
verified, Harbour Editor can be uninstalled without losing the versioned
locations or the compatible runtime regions.

## Versioning and sharing

Every save and deletion is an immutable edit:

- a monotonically increasing revision is assigned to each location;
- each history entry records its edit UUID, timestamp, editor, action and
  complete snapshot;
- deleting a location creates a tombstone so deletion can be shared;
- restoring an older snapshot creates a new revision and never erases history;
- stale browser saves are rejected instead of overwriting a newer edit.

**Export** includes the catalogue UUID, all active locations, tombstones and
history. **Merge** compares the latest `updatedAt` for each stable location UUID.
The newer edit wins, while both histories are retained. An equal timestamp with
different edit UUIDs is reported as a conflict and the local value is kept for
manual review. Device clocks therefore need to be reasonably synchronized.
**Replace Catalogue** is an explicit replacement. **Merge** retains unrelated
locations and compares matching stable UUIDs by latest edit time. Both actions
accept this app's versioned catalogue format and AJRM Marine Harbour Editor v1
exports. Legacy `Harbour:` regions are converted into versioned locations and
matched to existing locations by name (ignoring case and repeated whitespace),
because the older exporter did not preserve stable IDs.
The later explicit edit timestamp wins and any earlier duplicate records with
that name are tombstoned. Location names are unique across the whole catalogue,
ignoring letter case and repeated whitespace, regardless of type or workspace.
Replacement creates tombstones for omitted existing locations so bundled
starter locations do not silently return after Signal K restarts.

Settings can permanently purge deleted records and their revision histories.
Purged UUIDs remain in a minimal blocklist, preventing automatic starter-data
loading and ordinary merges from recreating them. A deliberate **Replace
Catalogue** operation replaces that blocklist as part of replacing the whole
catalogue.

This provides deterministic offline sharing without pretending that two
simultaneous edits can always be combined automatically. Export a catalogue
before a large import or merge.

## Install on a Pi

```bash
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.5.1 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Open **AJRM Marine Location Editor** from the Signal K app list.

## Use

1. Open **Select Location** to browse existing records, choose a filtered
   workspace, or search by name and type.
2. Select a record to open it in the separate **Location Editor**, or press
   **New Location**. The pencil toolbar button reopens the current editor.
3. Enter a name and select one or more location types. Geometry and fields for
   anchorages, tides and hazards appear only in the editor.
4. Store a point at the map centre, enter a polygon, or generate a circle.
5. Add optional anchorage, tide, hazard and relationship details. Imported
   records display their source and review status below these fields.
6. For a harbour-profile area, select a harbour, anchorage, mooring or marina
   type, use polygon/circle geometry, and tick **Use this area for automatic
   Harbour profile switching**.
7. Press **Save Location**, or **Undo Changes** to discard the draft and return
   to the last saved location.
8. Open **History** to inspect or restore an earlier saved snapshot.

Settings provides versioned export, latest-edit merge, confirmed catalogue
replacement and permanent purging of deleted records. Edits and purge require
Signal K read/write or administrator access.

Other plugins can use `app.ajrmMarineLocations` to list, get or find nearby
locations, `app.ajrmMarineTides` to resolve, pin or refresh the shared tide
projection, `app.ajrmMarineWeather` for cached marine forecasts, and
`app.ajrmMarineAnchoring` to inspect/confirm/dismiss assisted anchoring. The
HTTP API and its OpenAPI document provide the same services to browser
applications.

## Licence

AGPL-3.0-or-later. Commercial licensing is available by arrangement.

AJRM Marine Location Editor is maintained by Anthony McDonald, with assistance
from William McAusland and OpenAI Codex.
