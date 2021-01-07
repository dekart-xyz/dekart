# Environment Variables

| Name        | Description           |
| ------------- | ------------- |
| `DEKART_BIGQUERY_PROJECT_ID`      | Unique identifier for your Google Cloud project with BigQuery API Enabled. <br> *Example*: `my-project`|
| `DEKART_CLOUD_STORAGE_BUCKET`      | <a href="https://cloud.google.com/storage">Google Cloud Storage</a> bucket name where Dekart Query results will be stored. <br> *Example*: `dekart-bucket`|
| `DEKART_MAPBOX_TOKEN`      | <a href="[https://](https://docs.mapbox.com/help/how-mapbox-works/access-tokens/)">Mapbox Token</a> to show a map|
| `DEKART_POSTGRES_DB`      | Database name. Dekart needs Postgres Database to store query meta information. <br> *Example*: `dekart`|
| `DEKART_POSTGRES_HOST`      | *Example*: `localhost`|
| `DEKART_POSTGRES_PORT`      | *Example*: `5432`|
| `DEKART_POSTGRES_USER`      | *Example*: `postgres`|
| `DEKART_POSTGRES_PASSWORD`      | *Example*: `******`|
|`DEKART_PORT`| *Example*: `8080`|
|`GOOGLE_APPLICATION_CREDENTIALS`| Credentials for <a href="https://cloud.google.com/docs/authentication/getting-started">Google Cloud API</a> <br> *Example*: `/.../service-account-123456.json`|

## Development specific environment variables

| Name        | Description           |
| ------------- | ------------- |
| `DEKART_LOG_DEBUG`      |  Set Dekart log level to debug <br> *Example value*: `1`|
| `DEKART_LOG_PRETTY`      |  Print pretty colorful logs in console. Be default Dekart formats logs as JSON <br> *Example value*: `1`|
| `DEKART_STATIC_FILES`      |  <br> *Example value*: `./build`|
