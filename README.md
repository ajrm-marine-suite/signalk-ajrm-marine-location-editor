# AJRM Marine Location Editor

> **Public beta disclaimer:** User-defined locations supplement, but do not
> replace, official charts, Notices to Mariners, pilotage, a proper lookout or
> the skipper's judgement. The authors do not accept responsibility for loss
> or damage resulting from their use.

A Signal K webapp for maintaining reusable marine knowledge. It is a superset
of **AJRM Marine Harbour Editor** and is intended to replace it after migration
and onboard testing. It stores:

- harbours, anchorages, moorings, marinas and points of interest;
- tidal standard ports, secondary ports and tidal gates;
- tidal observation stations, kept distinct from prediction stations;
- hazards, avoidance areas, no-anchoring areas, waiting areas and preferred
  channels;
- links from places to tidal locations.

The map defaults to **All Locations**, displaying migrated harbours and every
other stored location. Its location browser supports text search, grouped
results, persistent per-type chart filters and an optional current-map-area
filter. It can also be filtered into Places, Tides, Hazards or All workspaces.
The separate **Classify this location** choices describe the record being
edited and apply only when it is saved. Tide calculations,
automatic profile selection and active hazard monitoring are deliberately not
performed yet.

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

This provides deterministic offline sharing without pretending that two
simultaneous edits can always be combined automatically. Export a catalogue
before a large import or merge.

## Install on a Pi

```bash
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.3.7 --omit=dev --no-package-lock
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

Settings provides versioned export, latest-edit merge and confirmed catalogue
replacement. Edits require Signal K read/write or administrator access.

Other plugins can use the in-process `app.ajrmMarineLocations` service to list,
get or find nearby locations. The HTTP API and its OpenAPI document provide the
same catalogue to browser applications.

## Licence

AGPL-3.0-or-later. Commercial licensing is available by arrangement.

AJRM Marine Location Editor is maintained by Anthony McDonald, with assistance
from William McAusland and OpenAI Codex.
