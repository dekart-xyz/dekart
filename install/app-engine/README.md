# Deploying Dekart to Google App Engine

You will need:
* Google Cloud Project
* BigQuery API Enabled
* Mapbox Token
* Cloud Storage Bucket
* Cloud SQL DB

## Steps

### Create db instance

```
gcloud sql instances create ${DB_INSTANCE_NAME} \
    --database-version=POSTGRES_12 \
    --tier=db-f1-micro\
    --region=europe-west1
```

### Create database

```
gcloud sql databases create dekart --instance=${DB_INSTANCE_NAME}
```

### Set password

```
gcloud sql users set-password postgres --instance=${DB_INSTANCE_NAME} --password=dekart
```

### Create storage

```
gsutil mb -b on -l europe-west1 gs://${BUCKET}/
```

### Create App Engine App

```
gcloud app create --region=europe-west
```

### Create [Dockerfile](./Dockerfile)

### Create [app.yaml](./app.example.yaml)


### Deploy app

```
gcloud app deploy app.yaml
```

## All streps in [Makefile](./Makefile)


