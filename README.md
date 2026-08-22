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
southeast-entrance record is anchored to Rubha an Ridire; the separate Calve
record is anchored to the island and explicitly is not the source's offshore
timing waypoint. The vague south-end Tiree timing locus remains withheld
because no defensible gate point was established.

## Location classes

- harbours, marinas, anchorages, moorings and points of interest;
- tidal standard-port, secondary-port, observation-station, region and gate **locations** (classification and geometry only);
- weather forecast locations, which provide named forecast coordinates to Weather Database without storing provider data;
- hazards, avoidance/no-anchoring areas, waiting areas and preferred channels.

Points, circles, rectangles and true polygons can be created and edited on the chart. Changes are revisioned and can be restored. Import replaces the catalogue; merge compares stable IDs and edit timestamps; purge permanently removes deleted tombstones after confirmation.

## Shared services

The plugin exposes:

- `app.ajrmMarineLocations` / `Symbol.for("mcdonaldajr.ajrmMarineLocations")`, contract `ajrm-marine-locations-service-v1`;
- `app.ajrmMarineAnchoring`, which provides confirmation-first stationary-at-anchorage assistance;
- spatial location and anchoring services consumed by the standalone Tidal and Weather Database apps.

It deliberately does **not** expose a tide service or duplicate tidal relationships in its catalogue. Install AJRM Marine Tidal Database for tidal selection, region-to-port assignments, provider configuration, corrections, calculations and offline cache management.

## Safety

Saved locations supplement, and never replace, current official charts, publications, a proper lookout and the skipper’s judgement. User-created geometry may be incomplete or inaccurate.

## Install

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.6.47 --omit=dev --no-package-lock
sudo systemctl restart signalk
```
