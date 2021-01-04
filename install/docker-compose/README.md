# Run Dekart locally with docker-compose

You will need:

* Google Cloud Project
* BigQuery API Enabled
* Cloud Storage Bucket
* Service account credentials with access to all above
* Mapbox Token


## Steps

1. Create `.env` file

```
POSTGRES_PASSWORD=
PROJECT_ID=
CLOUD_STORAGE_BUCKET=
MAPBOX_TOKEN=
GOOGLE_APPLICATION_CREDENTIALS=
```

2. Run

```
docker-compose  --env-file .env up
```

See [docker-compose.yaml](./docker-compose.yaml) for details