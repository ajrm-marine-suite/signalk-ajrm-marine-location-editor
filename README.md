# AJRM Marine Location Editor

Version `0.6.28` updates chart cycling to include an explicit basemap-only step.
Version `0.6.27` packages the icon at both Signal K consumer locations: the App
Store package root and installed webapp public URL.

Version `0.6.25` adds explicit circles, rectangles and true polygons to the
Geometry editor. Rectangles have configurable width and height; polygons have
3-32 generated vertices; rectangles and polygons expose numbered draggable
points on the chart. Storage remains ordinary interoperable GeoJSON polygons.

Version `0.6.24` made Locations the sole place and automatic profile-area
contract while retaining versioned tidal planning regions without masking the
individual locations drawn inside them.

Version `0.6.22` fixes the v0.6.21 startup migration failure caused by several
secondary ports legitimately citing the same almanac page. Catalogue records
are preserved, migration is idempotent, and the known cross-applied bundled
correction is repaired automatically without moving user-edited geometry.

Version `0.6.21` adds 33 complete Ullapool and Stornoway secondary ports from
the supplied Reeds tables. Soay (Camus nan Gall) is retained as an incomplete
record because its MLWN and MLWS height differences are printed as ND.

Version `0.6.20` corrects Port Ellen from the supplied Reeds table and adds the
other Oban secondary ports shown on that page. Machrihanish is retained as an
incomplete secondary-port record because the page supplies times and mean
range, but not enough height data for chart-datum predictions.

Version `0.6.19` keeps Save Location, Undo Changes, History and Delete together
on one compact action row so the primary editor controls remain visually
connected.

Version `0.6.18` removes the Tide relationships disclosure. Relevant tidal
region and prediction-port selectors are always shown within Tidal location
details, immediately above the role-specific fields. Relationship labels and
their dropdowns share one compact row on wide screens and stack on narrow
ones.

Version `0.6.17` draws new and unsaved location geometry in bright red so its
circle or polygon remains conspicuous against chart colours.

Version `0.6.16` makes creation of a secondary port an explicit standard-port
correction workflow. Selecting the secondary-port classification immediately
opens its Reeds table in a wider editor, and standard-port and secondary-port
roles are mutually exclusive. The required parent selector lists standard
ports only; both the editor and backend reject a secondary-port parent.

Version `0.6.15` arranges the complete secondary-port correction set as one
Reeds-style horizontal row: two HW time differences, two LW time differences,
and the MHWS/MHWN/MLWN/MLWS height differences. Standard-port reference times
sit directly above their differences, and the table scrolls rather than wraps
on a narrow screen. The redundant correction-notes and imported-provenance
footer has been removed from the editor, while existing metadata remains in
stored records and exports.

Version `0.6.14` separates tidal geography from tidal prediction data. A
tidal-region polygon may select its prediction port and may itself belong to a
broader parent region; automatic resolution chooses the most specific
containing region before falling back through broader regions. Harbour-profile
switching is offered only for harbour, marina, anchorage or mooring areas.
Secondary ports now store only their linked parent and published differences;
the parent's MHWS/MHWN/MLWN/MLWS values come from the parent record.

Version `0.6.13` shortens and clarifies location editing. Coordinate and
polygon entry now live entirely in the separate Geometry panel, while tidal
fields are divided by location class: standard ports show prediction-source,
station, datum and reference-level data; secondary ports show only their
parent port and Reeds corrections. The secondary height table is wider and
scrolls on narrow displays so signed values such as `-0.8` remain visible.

Version `0.6.12` makes secondary-port entry match the paired columns in Reeds.
HW and LW reference times twelve hours apart now share one signed-HHMM
difference, and parent-port levels and four height differences appear in one
table for direct transcription and checking. Existing repeating v2 records are
compacted automatically to the new 12-hour contract; genuinely non-repeating
legacy records retain their full 24-hour pattern. Time and height corrections
continue to be interpolated independently against the parent prediction.

Version `0.6.11` adds a shared recommendation for the nearest usable secondary
port inside the vessel's containing tidal region. It respects explicit region
links and spatially classifies older unlinked secondary-port records, allowing
planning consumers to offer a consistent nearby-port action.

Version `0.6.10` replaced the fixed secondary-port clock columns with the
`ajrm-secondary-port-corrections-v2` contract. Each HW and LW correction
stores the reference time printed in the almanac, so tables beginning at 0100,
1200, 1300 or another stated time are represented exactly. The Tide Resolver
applies corrections centrally, follows secondary-to-secondary parent chains
with cycle protection, and returns fully resolved events to Display and
Planning. Existing v1 records migrate automatically. Loch Melfort is corrected
from the supplied Reeds page and Seil Sound is added from the same table.

Version `0.6.9` also makes Location Editor the single owner of tidal-gate
passage constants. All 15 datasets formerly bundled in Gate Passage Planner
are migrated into versioned `tidalGate` locations, editable only here. The
bundled standard prediction ports now include Oban, Stornoway (`0308`) and
Ullapool (`0334`) with their reference levels.

Version `0.6.8` makes Location Editor the single owner of secondary-port
setup. It stores the parent-port reference levels, HW/LW time corrections,
height corrections and source notes needed by Marine Planning. Existing
Marine Planning constants are bundled as versioned locations and matching
locations without correction data are upgraded automatically without changing
their geometry or other user-edited fields.

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

A Signal K webapp for maintaining reusable, versioned marine knowledge. It is
the suite's only location catalogue and stores:

- harbours, anchorages, moorings, marinas and points of interest;
- tidal standard ports, secondary ports, tidal regions and tidal gates;
- tidal observation stations, kept distinct from prediction stations;
- hazards, avoidance areas, no-anchoring areas, waiting areas and preferred
  channels;
- hierarchical links between tidal regions and prediction ports.

For a `tidalSecondaryPort`, select its immediate parent tidal port and enter
the almanac's printed HW and LW reference times, their time differences, the
four height differences and source notes. Do not copy the parent's mean levels:
they belong to the parent standard-port record. Marine Planning reads fully
corrected events from Location Editor; it no longer maintains or applies a
second copy. The parent must be a standard port; the editor and backend reject
a secondary-port parent. Almanac clock times are stored as explicit UT
minute-of-day values and resolved events remain canonical UTC instants.

The calculation follows the structure of the published secondary-port table:

- for each parent HW or LW event, linearly interpolate the applicable time
  difference from the separately printed HW or LW time columns, then add it to
  the parent event time;
- for HW height, interpolate (or extrapolate) the height difference between
  the parent's MHWN and MHWS levels; for LW height, do the same between MLWN
  and MLWS; then add that difference to the parent event height;
- derive the child's mean levels by adding the four published height
  differences to the parent's stored mean levels.

This is consistent with the [ADMIRALTY Tide Tables description](https://www.admiralty.co.uk/publications/publications-and-reference-guides/admiralty-tide-tables)
and the layout of UKHO's official [secondary-port time and height difference table](https://assets.admiralty.co.uk/public/documents/2024-05/5613.pdf).
The calculation deliberately keeps time and height interpolation independent.

The bundled migration includes Tobermory, Cuan Sound, Port Ellen, Scalasaig,
Glengarrisdale Bay, Craighouse, Rubha a’ Mhail, Ardnave Point, Orsay Island,
Bruichladdich, Port Askaig, Gigha Sound, Machrihanish, Craignure, Loch Melfort
and Seil Sound, together with the supplied Ullapool and Stornoway secondary
port tables. Apart from positions explicitly
printed in a supplied source, their planning positions and migrated constants
must be checked against current licensed sources.

For a `tidalGate`, select its reference standard port and maintain the flood
and ebb sets, spring/neap peak rates, start offsets, slack durations and source
notes in the **Tidal-gate constants** section. Gate Passage Planner consumes
this data read-only.

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

1. the prediction port assigned to the most specific containing tidal-region
   polygon;
2. the nearest configured prediction port belonging to that region;
3. the same two checks in each broader containing/parent region.

Region hierarchy is explicit: a small local tidal region can select a
secondary port and name a broader region whose standard port remains the
fallback. When overlapping regions have no explicit parent link, the smaller
polygon is treated as more specific.

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

## Automatic profile areas

Harbours, marinas, anchorages and moorings can be marked **Use this area for
automatic Harbour profile switching**. Display and Traffic read these polygons
directly from the shared Locations service. No duplicate Signal K region or
name prefix is created or required.

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
accept this app's versioned catalogue format. Location names are unique across the whole catalogue,
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
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.6.28 --omit=dev --no-package-lock
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
4. Store a point at the map centre, or create a circle, rectangle or regular
   polygon. Set rectangle dimensions or polygon vertex count, press **Make
   Shape at Map Centre**, then drag its numbered red points into place. The
   coordinate list remains available for exact edits.
5. Add optional anchorage, tide, hazard and relationship details. Imported
   source and review metadata remains part of the stored record and exports,
   without adding a read-only provenance footer to the editing form.
6. For a harbour-profile area, select a harbour, anchorage, mooring or marina
   type, use any area geometry, and tick **Use this area for automatic
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
