# v0.24

These notes cover maintenance updates to `v0.24`.

## ⚠️ Behavior Changes

### Dataset downloads use a rolling no-progress timeout

Dataset downloads can now continue beyond the server's write-timeout window while data keeps arriving. Streams still stop after the configured period without progress, so stalled downloads continue to fail with the existing network-error message.

## ⚙️ Changes Important for Admins

The bundled AWS ECS configuration now sets the Application Load Balancer idle timeout to 120 seconds, above Dekart's default 65-second no-progress timeout for dataset streams. If Dekart runs behind another reverse proxy or load balancer, configure its idle timeout above Dekart's `DEKART_HTTP_WRITE_TIMEOUT_SECONDS` value.

This update introduces no metadata migration or new production environment variables.

## 🔧 User-Facing Bug Fixes

- PostGIS Point, LineString, Polygon, MultiPoint, MultiLineString, and MultiPolygon values with map-ready coordinates now render when selected directly, without requiring `ST_AsGeoJSON` or `ST_AsBinary`. This applies to SRID 4326 geometry and geometry without an embedded SRID, including user-defined Postgres connections that replay queries directly. Geometry in another known SRID still requires an explicit transform to 4326.
- GeoJSON geometry returned as text by a DuckDB query is now recognized as geospatial data instead of a plain string. GeoJSON Features are supported as well.

## 🚀 Upgrade Instructions

1. **Back up your metadata database.**

2. **Review proxy timeouts for long-running dataset downloads.** Ensure any reverse proxy or load balancer allows connections to remain open longer than Dekart's configured no-progress timeout. If you use the bundled AWS ECS Terraform configuration, apply it to update the ALB idle timeout.

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.24
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.24
   ```

No metadata migration is required for this update.
