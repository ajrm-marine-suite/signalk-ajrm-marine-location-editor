# AJRM Marine Location Editor

Signal K spatial catalogue and chart editor for marine places, operational areas and hazards.

Version 0.6.38 restores the canonical identifiers shared by the spatial and tidal catalogues:
bundled locations are ordinary versioned seeds and external service properties
remain opaque. Location Editor owns stable location identifiers, names, classifications, coordinates, geometry, anchorage details, hazards, revision history and merge/import/export. For a tidal-region polygon it also shows the serving tidal port and optional parent region, while saving that relationship through **AJRM Marine Tidal Database**, its single owner. At close chart scales, visible parent tidal regions are suppressed when a more-specific child is present; a deliberately selected parent remains visible with a strong outline.

## Location classes

- harbours, marinas, anchorages, moorings and points of interest;
- tidal standard-port, secondary-port, observation-station, region and gate **locations** (classification and geometry only);
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
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.6.38 --omit=dev --no-package-lock
sudo systemctl restart signalk
```
