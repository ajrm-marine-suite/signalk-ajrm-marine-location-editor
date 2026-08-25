# AJRM Marine Location Editor

Signal K spatial catalogue and chart editor for marine places, operational areas and hazards.

Location Editor owns stable location identifiers, names, classifications,
coordinates, geometry, anchorage details, hazards, revision history and
merge/import/export. Named weather forecast points are edited in the Weather
workspace and consumed by Weather Database; Locations stores no forecast or
provider data. For a tidal-region polygon it also shows the serving tidal port
and optional parent region, while saving that relationship through **AJRM Marine
Tidal Database**, its single owner. At close chart scales, visible parent tidal
regions are suppressed when a more-specific child is present; a deliberately
selected parent remains visible with a strong outline.

The bundled catalogue includes canonical Portsmouth and Bucklers Hard spatial
records so Tidal Database can attach the corrected standard/secondary
relationship without embedding coordinates in the tidal service. It also has
source-checked, explicitly approximate Ordnance Survey representative points
for Sound of Iona, Gunna Sound, Northwest Mull, Loch Sunart and two distinct
Sound of Mull timing loci so reviewed, display-only tidal evidence can join by
stable Location ID without treating a named-feature point as a surveyed route,
fairway or gate line. Corran Narrows and the Loch Leven narrows now have
separate named-channel representative points; the latter uses Caolas Mhic
Phadruig at the officially documented Ballachulish Bridge locus. Neither is a
surveyed passage waypoint or ferry track. Caolas nan Con has its own named
channel point rather than being aliased to those Loch Leven narrows. Lynn of
Morvern uses a broad named-sea point which is explicitly not an entrance line,
route, fairway, safe-water point or locator for its local streams. The
Loch Feochan record is a named tidal-water point, not its shoal entrance or
buoyed channel. A fresh Firth of Lorn named-sea representative remains distinct
from the imported legacy marker and is explicitly not the source fairway or a
local-stream position. Cuan Sound and Grey Dogs / Bealach a' Choin Ghlais now
also have fresh OS Open Names `Channel` representatives for native-v2 joins;
they remain distinct from the older Cuan and Grey Dogs records and encode no
narrows, fairway, safe-water line, stream observation, route or waypoint. The
Gulf of Corryvreckan also has a fresh, distinct OS Open Names `Sea`
representative for its native-v2 join. Its roughly 4.02 by 2.76 kilometre
source extent makes it a broad name point only, not a surveyed gate, fairway,
route, safe-water position or exact turn, slack, rate, overfall or whirlpool
locus. Sound of Luing and Dorus Mòr likewise have fresh, distinct OS
representatives for their native-v2 joins: a broad `Sea` name point and a
named `Channel` point respectively. Neither is an exact gate line, fairway,
safe-water position, route, stream observation, turn, slack, rate, eddy, race
or overfall locus, and both legacy Locations remain unchanged. The
southeast-entrance record is anchored to Rubha an Ridire; the
separate Calve
record is anchored to the island and explicitly is not the source's offshore
timing waypoint. The vague south-end Tiree timing locus remains withheld
because no defensible gate point was established.

## Location classes

- harbours, marinas, anchorages, moorings and points of interest;
- tidal standard-port, secondary-port, observation-station, region and gate **locations** (classification and geometry only);
- weather forecast locations, which provide named forecast coordinates to Weather Database without storing provider data;
- hazards, avoidance/no-anchoring areas, waiting areas and preferred channels.

A Location may have several compatible roles, but `tidalStandardPort` and
`tidalSecondaryPort` are mutually exclusive. Tidal Database independently
checks the same boundary before using a joined definition.

Points, circles, rectangles and true polygons can be created and edited on the chart. Selecting Harbour or Marina for a new Location defaults to a circle centred on the current point with automatic Harbour-profile switching enabled. Changing an existing point to an area preserves the point as the new shape's centre. Edit Geometry temporarily hides the Location Editor drawer to expose the chart and restores it when closed. Marina and harbour polygons have the same geometry and optional automatic Harbour-profile behaviour; their classification changes only the displayed place type. Moorings likewise use the same geometry, detection radius, anchoring details and stationary anchoring assistance as anchorages. Changes are revisioned and can be restored. Import replaces the catalogue; merge compares stable IDs and edit timestamps; purge permanently removes deleted tombstones after confirmation.

## Shared services

The plugin exposes:

- `app.ajrmMarineLocations` / `Symbol.for("mcdonaldajr.ajrmMarineLocations")`, contract `ajrm-marine-locations-service-v1`;
- `app.ajrmMarineAnchoring`, which provides confirmation-first stationary-at-anchorage assistance;
- spatial location and anchoring services consumed by the standalone Tidal and Weather Database apps.

The locations service includes the backward-compatible additive
`removeType(id, type, { expectedRevision, expectedLastEditId, editedBy })`
operation. It requires the current positive revision and durable edit identity,
and removes only the requested classification from
a multi-role Location, and tombstones the complete Location only when that was
its final classification. The result identifies `type-removed` or
`location-deleted`, identifies the stable Location ID, and returns the resulting live Location or deletion
tombstone, including the next revision, so a coordinating app can verify the
write exactly.

When Marine Planning v0.10.2 or later is running, public Location create/update/delete,
restore, replacement import and merge operations join Planning's mutation
coordinator. A candidate catalogue cannot remove the `tidalGate`
classification or Location for a live Planning row, or remove the
`tidalStandardPort` classification or Location selected by a live row. The
shared `removeType` operation joins the same coordinator and performs its
revision-and-edit-identity check and branch/write inside one atomic Location
catalogue mutation. Change or delete the Planning row first, then edit,
reclassify or delete the Location as a separate operation. With an older
Planning guard that cannot identify live reference ports, destructive
standard-port mutations fail closed.

It deliberately does **not** expose a tide service or duplicate tidal relationships in its catalogue. Install AJRM Marine Tidal Database for tidal selection, region-to-port assignments, provider configuration, corrections, calculations and offline cache management.
Tidal-region editing requires asynchronous
`ajrm-marine-tidal-database-service-v2`, contract version 2; Location supplies
only the region Location ID plus its serving-port and parent-region IDs, and
Tidal Database derives the current Location-owned name.

Read routes register with Signal K's read-only access boundary. Every Location,
anchoring, tidal-region or catalogue mutation also registers as `readwrite` and
retains a handler-level `readwrite` or `admin` permission check.

## Safety

Saved locations supplement, and never replace, current official charts, publications, a proper lookout and the skipper’s judgement. User-created geometry may be incomplete or inaccurate.

This software is Alpha Release and has not been tested in live environments and must not be relied upon for navigation or safety. The Authors do not accept any responsibility for loss or damage as a result of using this software.

## Install

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.7.5 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

For the coordinated Planning/Tidal contracts described above, use Marine
Planning v0.11.0 and Marine Tidal Database v0.8.3 with this v0.7.5 release.
