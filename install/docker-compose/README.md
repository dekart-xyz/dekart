# Docker Compose setups

Each setup has a dedicated Docker Compose file with `dekartxyz/dekart:latest`.

This page gives an overview of the main ways to run self-hosted Dekart with Docker Compose.
The setups differ by datasource (BigQuery or Snowflake), authentication model (no SSO, Google OAuth, or proxy-based OIDC SSO), metadata backend (PostgreSQL or SQLite), and cache backend (GCS or S3).
Use this page to pick the closest baseline, then adjust values in the linked compose file for your environment.

## Local PostgreSQL + Adminer

Use this when you only need a local metadata database and DB UI for development or debugging.
This setup does not start Dekart itself. It is useful when you run Dekart from your IDE/terminal and want a local Postgres backend plus Adminer to inspect tables and migration state.

Compose file:
[docker-compose.local.yaml](docker-compose.local.yaml)

## BigQuery

Use this for self-hosted Dekart with BigQuery as the query engine and GCS as result cache storage.
Recommended for GCP-first teams that already manage service accounts and bucket permissions.
You need a BigQuery project, a GCS bucket, and a mounted service-account JSON file.

Compose file:
[docker-compose.bigquery.yaml](docker-compose.bigquery.yaml)

## Google OAuth 2.0

Use this when users authenticate with Google OAuth directly in Dekart (no external reverse proxy).
Best for smaller teams that want simple sign-in with Google Workspace identities.
Requires a valid Dekart license key and Google OAuth client credentials.

Compose file:
[docker-compose.googleoauth.yaml](docker-compose.googleoauth.yaml)

## Snowflake with S3 cache

Use this for Snowflake as the query engine with AWS S3 as result cache storage.
This is the typical production-style Snowflake setup when you want durable cache in AWS and Postgres metadata.
Requires Snowflake credentials and AWS S3 access keys.

Compose file:
[docker-compose.snowflake-s3.yaml](docker-compose.snowflake-s3.yaml)

## Snowflake with SQLite backups

Use this for local Snowflake testing where Dekart metadata is stored in SQLite in a local mounted volume.
Good for quick experiments and demos without running a separate Postgres container.
Not recommended for multi-user production deployments.

Compose file:
[docker-compose.snowflake-sqlite.yaml](docker-compose.snowflake-sqlite.yaml)

## OIDC reverse proxy (Keycloak + oauth2-proxy)

Use this when authentication is handled by an OIDC reverse proxy and Dekart validates forwarded JWT headers.
This stack includes Keycloak and oauth2-proxy for local end-to-end SSO testing.
Recommended when your production auth model is proxy-based OIDC/IAP/ALB-style integration.
Requires a valid Dekart license key.

Compose file:
[docker-compose.oidc.yaml](docker-compose.oidc.yaml)
