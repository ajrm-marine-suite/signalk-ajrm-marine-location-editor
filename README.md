# AJRM Marine Location Editor

> **Public beta disclaimer:** User-defined locations supplement, but do not
> replace, official charts, Notices to Mariners, pilotage, a proper lookout or
> the skipper's judgement. The authors do not accept responsibility for loss
> or damage resulting from their use.

A separate Signal K webapp for maintaining reusable marine knowledge without
changing **AJRM Marine Harbour Editor**. It stores:

- harbours, anchorages, moorings, marinas and points of interest;
- tidal standard ports, secondary ports and tidal gates;
- hazards, avoidance areas, no-anchoring areas, waiting areas and preferred
  channels;
- links from places to existing Harbour Editor regions and tidal locations.

The map can be filtered into Places, Tides, Hazards or All workspaces. This
first release is the catalogue and editing foundation. Tide calculations,
automatic profile selection and active hazard monitoring are deliberately not
performed yet.

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
**Import** is an explicit replacement and accepts only this app's versioned
catalogue format.

This provides deterministic offline sharing without pretending that two
simultaneous edits can always be combined automatically. Export a catalogue
before a large import or merge.

## Install on a Pi

```bash
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.1.0 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Open **AJRM Marine Location Editor** from the Signal K app list.

## Use

1. Choose the relevant workspace.
2. Press **New**, enter a name and select one or more location types.
3. Store a point at the map centre, enter a polygon, or generate a circle.
4. Add optional anchorage, tide, hazard and relationship details.
5. Press **Save Location**.
6. Open **History** to inspect or restore an earlier snapshot.

Settings provides versioned export, latest-edit merge and confirmed catalogue
replacement. Edits require Signal K read/write or administrator access.

Other plugins can use the in-process `app.ajrmMarineLocations` service to list,
get or find nearby locations. The HTTP API and its OpenAPI document provide the
same catalogue to browser applications.

## Licence

AGPL-3.0-or-later. Commercial licensing is available by arrangement.

AJRM Marine Location Editor is maintained by Anthony McDonald, with assistance
from William McAusland and OpenAI Codex.
