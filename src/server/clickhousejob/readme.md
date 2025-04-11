# ClickHouse Job Implementation

Implementation for executing ClickHouse queries and exporting results to S3-compatible storage.

## Core Components

### Store
- Manages ClickHouse database connection
- Creates jobs for query execution
- Requires configuration:
  ```
  DEKART_DATASOURCE=CH
  DEKART_CLICKHOUSE_DATA_CONNECTION
  DEKART_CLICKHOUSE_S3_OUTPUT_LOCATION 
  AWS_ENDPOINT
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  
  ```
`DEKART_DATASOURCE=CH`
- Specifies that the job should use ClickHouse as a data source


`DEKART_CLICKHOUSE_DATA_CONNECTION`
- ClickHouse connection string in DSN format
- Example: `clickhouse://user:password@host:port/database?dial_timeout=10s` or `http://<host>:8443?username=default&password=<password>/<database>`
- Used to establish connection with ClickHouse database

`DEKART_CLICKHOUSE_S3_OUTPUT_LOCATION`
- S3 bucket path where query results are stored
- Format: `bucket-name/optional-prefix`
- Example: `my-results`

`AWS_ENDPOINT`
- S3-compatible storage endpoint URL
- Must start with http:// or https://
- Examples:
    - AWS S3: `https://s3.amazonaws.com`
    - MinIO: `http://localhost:9000`
    - Custom S3: `https://storage.company.com`
    - Localstack: `http://localhost:4566`

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- S3 credentials for authenticating storage access
- Used by ClickHouse to write query results to S3
- Example:
  ```
  AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
  AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  ```

These credentials need write permissions to the S3 location specified in `DEKART_CLICKHOUSE_S3_OUTPUT_LOCATION`.

### Job
- Executes queries asynchronously
- Exports results to S3 using ClickHouse's s3 function. Read more https://clickhouse.com/docs/en/sql-reference/table-functions/s3
- Tracks execution status via channels
- Stores result size and status

## Query Flow
1. Store creates job with report/query IDs
2. Job executes query and exports to S3 path: `{s3://}/{output_location}/{report_id}/{query_id}/result.csv`
3. Results are copied to storage object
4. Job updates status through completion

## Status Updates
- READING_RESULTS: Copying results from S3
- RUNNING: Query execution
- DONE: Results ready


Example:
Docker Compose file:
```docker-compose
version: "3.9"
services:
  db:
    image: postgres
    profiles:
      - local
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: "${DEKART_POSTGRES_PASSWORD}"
      POSTGRES_USER: "${DEKART_POSTGRES_USER}"
      POSTGRES_DB: "${DEKART_POSTGRES_DB}"
  adminer:
      image: adminer
      restart: always
      ports:
        - 8081:8080

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
        - "8123:8123"
        - "9000:9000"
    environment:
      CLICKHOUSE_DB: dekart
      CLICKHOUSE_USER: dekart
      CLICKHOUSE_PASSWORD: dekart
    volumes:
      - ./docker/volume/clickhouse:/var/lib/clickhouse

  localstack:
    image: localstack/localstack
    hostname: "localstack"
    ports:
      - "127.0.0.1:4566:4566"               # LocalStack Gateway
      - "127.0.0.1:4510-4559:4510-4559"     # external services port range
    environment:
      - DEBUG=${DEBUG-}
      - DOCKER_HOST=unix:///var/run/docker.sock
      - PERSISTENCE=0
    volumes:
      - "${LOCALSTACK_VOLUME_DIR:-./docker/volume/localstack}:/var/lib/localstack"
      - "/var/run/docker.sock:/var/run/docker.sock"
```

Run the following command to start the services:
```bash
docker-compose up -d
```

the .env file should contain the following:
```dotenv
DEKART_STORAGE=S3
DEKART_CLOUD_STORAGE_BUCKET=dekart-dev-local
DEKART_DATASOURCE=CH
DEKART_CLICKHOUSE_DATA_CONNECTION="http://dekart:dekart@localhost:8123/dekart?secure=false&skip_verify=true"
DEKART_CLICKHOUSE_S3_OUTPUT_LOCATION=dekart-dev-local/files

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_ENDPOINT=localhost:4566
AWS_INSECURE=true

```


# Local testing 
Run Localstack via Docker and follow the next command to create a bucket or download csv file. 

```bash

LOG_LOCAL=true
AWS_REGION=us-east-1
AWS_ENDPOINT=localhost:4566
AWS_INSECURE=true

BUCKET_NAME=dekart-dev-local

# Create bucket in localstack in S3
aws --endpoint-url=http://localhost:4566 s3api create-bucket --bucket $BUCKET_NAME || true
# getting file example
# aws --endpoint-url=http://localhost:4566 s3api get-object --bucket  $BUCKET_NAME --key  my-file-name.csv ./my-file-name.csv

# connect to clickhouse
CLICKHOUSE_CONTAINER_ID=$(docker ps | grep clickhouse | awk '{print $1}')

# check connection
docker exec -it $CLICKHOUSE_CONTAINER_ID clickhouse-client --query="SELECT 1"
if [ $? -ne 0 ]; then
    echo "Clickhouse is not running"
    exit 1
fi


# prepare database with synthetic data https://clickhouse.com/docs/en/getting-started/example-datasets/uk-price-paid


```