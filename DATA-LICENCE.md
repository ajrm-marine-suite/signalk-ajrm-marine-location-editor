# Data licences and attribution

The software in this repository is licensed separately under AGPL-3.0-or-later.
The generated spatial records in `defaults/spatial-locations.json` retain source
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

## Ordnance Survey OS Open Names records

The Sound of Iona, Gunna Sound, Northwest Mull (Caliach Point), Loch Sunart,
Rubha an Ridire, Calve Island, Corran Narrows, Caolas Mhic Phadruig, Caolas nan
Con, Lynn of Morvern, Loch Feochan, Firth of Lorn, Cuan Sound and Bealach a'
Choin Ghlais representative points
contain OS Open Names data made available under the
[Open Government Licence 3.0 (OS OpenData)](https://os.uk/opendata/licence).
Required attribution: “Contains OS data © Crown Copyright and database rights
2026.” These are
place-name representative points, including headland and island points on land,
broad tidal-water points and named-channel points, not surveyed fairway,
safe-water or tidal-gate positions; each record preserves that uncertainty. The
Calve Island marker is explicitly not the source locus stated as three miles
southeast of the island. The Caolas Mhic Phadruig point is not a surveyed
Ballachulish Bridge clearance or passage waypoint. The Caolas nan Con point is
separate from the Loch Leven Narrows record and does not locate an exact timing
observation. The broad Lynn of Morvern name point does not define its entrance
or localize any of its separately described streams. The Loch Feochan point is
not its shoal entrance or buoyed channel. The new broad Firth of Lorn name point
is distinct from the imported legacy marker and does not define the source
fairway or any of its separately described local streams. The new Cuan and
Bealach a' Choin Ghlais points are OS naming/locating points for `Channel`
features, not the narrows, surveyed gate lines, fairways, safe-water positions,
islet-clearance lines, routes or exact stream timing/rate/slack loci; they are
also distinct from the preserved older Cuan and Grey Dogs records.

## ADMIRALTY Tidal API station records

Some records in `defaults/spatial-locations.json` contain positions sourced from UK Hydrographic Office
station identifiers, names and positions checked against the ADMIRALTY Tidal
API catalogue. Tidal predictions fetched at runtime remain subject to the
user's ADMIRALTY subscription and terms. The generated tidal-area polygons are
AJRM review aids derived from those positions; they are not UKHO tidal-area
boundaries and must be checked locally before use.

## Transport Scotland bridge corroboration

The Loch Leven Narrows record uses the Transport Scotland A82 870 Ballachulish
Bridge grid reference only to corroborate that the OS Open Names channel extent
contains the road bridge described by the reviewed source. Transport Scotland
website information is available under the
[Open Government Licence](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
The stored channel point is not a bridge-clearance or passage waypoint.

## Editorial corroboration links

Welcome Anchorages and other published references are linked only to show where
a name or classification was cross-checked. Their editorial text, facility
descriptions and prediction data are not copied into the bundled database.

## Navigation warning

These records are discovery and planning aids, not official navigation data.
They may be incomplete, stale or wrong. They do not replace official charts,
Notices to Mariners, current tide/stream information, pilotage, a proper
lookout or the skipper’s judgement.
