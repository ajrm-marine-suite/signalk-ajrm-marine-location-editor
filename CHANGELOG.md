# Changelog

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
