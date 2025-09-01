# Dekart Docker image
Open-source, self-hosted version of [Dekart Cloud](https://dekart.xyz): WebGL-powered map analytics for BigQuery and Snowflake. Lightweight alternative to CARTO and Foursquare Studio for data scientists, analysts and engineers who work with large datasets.

[Home Page](https://dekart.xyz?ref=dokerhub) | [GitHub](https://github.com/dekart/dekart?ref=dokerhub)

## Features

Create beautiful data-driven maps and share them with your team:

* State-of-the art WebGL-powered map visualization
* Optimized for large query results, tested 100Mb/1M rows
* Efficient query result caching on Amazon S3 or Google Cloud Storage
* Live editing of maps with other team members
* Side-by-side SQL editor
* Support for CSV and GeoJSON file uploads
* Export to PNG, CSV and HTML maps
* Simple Docker-based deployment with SSO support

## Available data sources

* BigQuery ([setup in Dekart Cloud](https://cloud.dekart.xyz/))
* Snowflake
* AWS Athena
* Postgres
* CSV (file upload)
* GeoJSON (file upload)

## Requirements

* Google Cloud Storage or AWS S3 bucket for storing cache
* PostgreSQL or similar (Cloud SQL, Amazon RDS, etc)
* Mapbox Token

## Running docker

### Athena

```bash
docker run \
  -e AWS_REGION=${AWS_REGION} \
  -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
  -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
  -e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
  -e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
  -e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
  -e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
  -e DEKART_POSTGRES_HOST=host.docker.internal \
  -e DEKART_STORAGE=S3 \
  -e DEKART_DATASOURCE=ATHENA \
  -e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
  -e DEKART_ATHENA_CATALOG=${DEKART_ATHENA_CATALOG} \
  -e DEKART_ATHENA_S3_OUTPUT_LOCATION=${DEKART_ATHENA_S3_OUTPUT_LOCATION} \
  -e DEKART_ATHENA_WORKGROUP=${DEKART_ATHENA_WORKGROUP} \
  -e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
  -e DEKART_CORS_ORIGIN=${DEKART_CORS_ORIGIN} \
  -p 8080:8080 \
  dekartxyz/dekart:0.19
```

### BigQuery

```bash
docker run \
  -v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
  -e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
  -e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
  -e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
  -e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
  -e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
  -e DEKART_POSTGRES_HOST=${DEKART_POSTGRES_HOST} \
  -e DEKART_STORAGE=GCS \
  -e DEKART_DATASOURCE=BQ \
  -e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
  -e DEKART_BIGQUERY_PROJECT_ID=${DEKART_BIGQUERY_PROJECT_ID} \
  -e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
  -e DEKART_CORS_ORIGIN=${DEKART_CORS_ORIGIN} \
  -p 8080:8080 \
  dekartxyz/dekart:0.19
```

### Snowflake

```bash
docker run -it --rm \
  -e AWS_REGION=${AWS_REGION} \
  -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
  -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
  -e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
  -e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
  -e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
  -e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
  -e DEKART_POSTGRES_HOST=host.docker.internal \
  -e DEKART_STORAGE=S3 \
  -e DEKART_DATASOURCE=SNOWFLAKE \
  -e DEKART_SNOWFLAKE_ACCOUNT_ID=${DEKART_SNOWFLAKE_ACCOUNT_ID} \
  -e DEKART_SNOWFLAKE_USER=${DEKART_SNOWFLAKE_USER} \
  -e DEKART_SNOWFLAKE_PASSWORD=${DEKART_SNOWFLAKE_PASSWORD} \
  -e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
  -e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
  -e DEKART_CORS_ORIGIN=${DEKART_CORS_ORIGIN} \
  -p 8080:8080 \
  dekartxyz/dekart:0.19
```

[Documentation](https://dekart.xyz/docs/?ref=dokerhub)

