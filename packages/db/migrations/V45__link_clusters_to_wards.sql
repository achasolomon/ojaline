-- ============================================================================
-- V45 — Link every market area (cluster) to the ward it belongs to
--   Adds catalog.clusters.ward_id and backfills each real cluster to its
--   nearest ward within the same LGA (PostGIS ST_Distance). V44-seeded clusters
--   sit exactly on a ward point, so they tie to their ward; legacy Lagos
--   clusters get their closest ward. 'Test LGA' / unresolvable clusters stay
--   NULL (they are fixtures from automated test runs). Future admin-registered
--   clusters attach a ward explicitly via this column.
--   With this, MARKET → CLUSTER → WARD, and ward selection can drive
--   distance-ordered "markets near this ward" lookups.
-- ============================================================================

ALTER TABLE catalog.clusters
  ADD COLUMN ward_id UUID REFERENCES catalog.wards(id);

CREATE INDEX idx_clusters_ward ON catalog.clusters(ward_id);

-- Nearest-ward backfill, per cluster, within the same state+LGA.
WITH ranked AS (
  SELECT c.id AS cluster_id,
         w.id AS ward_id,
         row_number() OVER (
           PARTITION BY c.id
           ORDER BY ST_Distance(
             c.centroid,
             ST_SetSRID(ST_MakePoint(w.longitude, w.latitude), 4326)::geography
           ) ASC
         ) AS rn
  FROM catalog.clusters c
  JOIN catalog.states st ON st.name = c.state
  JOIN catalog.lgas l    ON l.state_id = st.id
                         AND translate(l.name, '-', '/') = translate(c.lga, '-', '/')
  JOIN catalog.wards w   ON w.lga_id = l.id
)
UPDATE catalog.clusters c
   SET ward_id = ranked.ward_id
  FROM ranked
 WHERE ranked.cluster_id = c.id AND ranked.rn = 1;