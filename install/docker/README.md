# Dekart Docker image

Dekart is an open-source data visualization and analytical tool for large scale geo-spacial data. Dekart is based on Kepler.gl visualization and supports BigQuery as a data source.

[Home Page](https://dekart.xyz?ref=dokerhub) | [GitHub](https://github.com/dekart/dekart?ref=dokerhub)

## Features

Visualize Data from BigQuery on a Kepler.gl map and share it with your team:

* Beautiful, large Scale Map Visualizations using only SQL
* Can visualize up to 1 million rows
* Easy to save map and share link with your team
* Easy to install/deploy on Google Cloud

## Requirements

* Google Cloud Project
* BigQuery API Enabled
* PostgreSQL (for example Cloud SQL)
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
  dekartxyz/dekart:0.5
```
[Configuration details](https://dekart.xyz/docs/configuration/environment-variables/?ref=dokerhub)

## Other options to run Dekart

* [Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=dockerhub)
* [docker-compose](https://dekart.xyz/docs/self-hosting/docker-compose/?ref=dockerhub)

