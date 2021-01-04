# Dekart Docker image

Dekart is an open-source data visualization and analytical tool for large scale geo-spacial data. Dekart is based on Kepler.gl visualization and supports BigQuery as a data source.

[Details](https://github.com/dekart-xyz/dekart)

## Features

Visualize Data from BigQuery on a Kepler.gl map and share it with your team:

* Beautiful, large Scale Map Visualizations using only SQL
* Can visualize up to 1 million rows
* Easy to save map and share link with your team
* Easy to install/deploy on Google Cloud

## Requirements

* Google Cloud Project
* BigQuery API Enabled
* Cloud Storage Bucket
* Service account credentials with access to all above
* Mapbox Token

## Running docker

```bash
docker run \
  -v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
  -e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
  -e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
  -e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
  -e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
  -e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
  -e DEKART_POSTGRES_HOST=${DEKART_POSTGRES_HOST} \
  -e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
  -e DEKART_BIGQUERY_PROJECT_ID=${DEKART_BIGQUERY_PROJECT_ID} \
  -e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
  -p 8080:8080 \
  dekartxyz/dekart:latest
```

See details on [environment variables](https://github.com/dekart-xyz/dekart#environment-variables)

## Other options to run Dekart

* [Run locally with docker-compose](https://github.com/dekart-xyz/dekart/tree/main/install/docker-compose)
* [Deploy to Google App Engine](https://github.com/dekart-xyz/dekart/tree/main/install/app-engine)

