# Installing from source for development

## Requirements

* Google Cloud Project
* BigQuery API Enabled
* Cloud Storage Bucket
* Service account credentials with access to all above
* Mapbox Token

## Steps

1. Install frontend dependencies
```
npm install
```

2. Create and edit `.env`; see [environment variables](../../docs/ENVIROMENT.md) for details


```
cp .env.example .env
```

3. Run Postgres DB locally

```
docker-compose  --env-file .env up
```

4. Run Server; you will need to install [godotenv](https://github.com/joho/godotenv) or handle environment variable otherwise

```
godotenv -f .env go run ./src/server/main.go
```

5. Run frontend

```
npm start
```

