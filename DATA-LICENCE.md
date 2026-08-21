# Data licences and attribution

The software in this repository is licensed separately under AGPL-3.0-or-later.
The generated records in `defaults/west-scotland-locations.json` retain source
and licence metadata per record.

## OpenStreetMap and OpenSeaMap-derived records

Contains information from OpenStreetMap, which is made available under the
[Open Database Licence 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
OpenSeaMap seamark classifications are stored in OpenStreetMap and are covered
by that attribution. The generated extract is offered under ODbL 1.0.

## UK National Tide Gauge Network records

Contains Environment Agency tide-gauge metadata made available under the
[Open Government Licence 3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Required attribution: “This uses Environment Agency tide gauge data from the
real-time data API (Beta).”

## ADMIRALTY Tidal API station records

`defaults/admiralty-api-ports.json` contains selected UK Hydrographic Office
station identifiers, names and positions checked against the ADMIRALTY Tidal
API catalogue. Tidal predictions fetched at runtime remain subject to the
user's ADMIRALTY subscription and terms. The generated tidal-area polygons are
AJRM review aids derived from those positions; they are not UKHO tidal-area
boundaries and must be checked locally before use.

## Editorial corroboration links

Welcome Anchorages and other published references are linked only to show where
a name or classification was cross-checked. Their editorial text, facility
descriptions and prediction data are not copied into the bundled database.

## Navigation warning

These records are discovery and planning aids, not official navigation data.
They may be incomplete, stale or wrong. They do not replace official charts,
Notices to Mariners, current tide/stream information, pilotage, a proper
lookout or the skipper’s judgement.
