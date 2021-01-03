# dekart
Visualize Data from BigQuery on a map with Kepler.gl and share it with your team

<img src="./docs/files/screen.png">

## Features

* Make Large Scale Map Visualizations using only SQL
* Can fetch from BigQuery and visualize up to 1M rows
* Easy to save map and share link with your team
* Easy to install/deploy

## Setting up Dekart Instance

* [Run locally in Docker](./install/local)
* [Deploy to Google App Engine](./install/gloud)

## Environment Variables

<table>
<tr>
    <td>Name</td>
    <td>Example</td>
    <td>Description</td>
</tr>
<tr>
    <td><pre>DEKART_BIGQUERY_PROJECT_ID</pre></td>
    <td><pre>my-project</pre></td>
    <td>Unique identifier for your Google Cloud project with BigQuery API Enabled.</td>
</tr>
<tr>
    <td><pre>DEKART_CLOUD_STORAGE_BUCKET</pre></td>
    <td><pre>dekart-bucket</pre></td>
    <td><a href="https://cloud.google.com/storage">Google Cloud Storage</a> bucket name where Dekart Query results will be stored</td>
</tr>
<tr>
    <td><pre>DEKART_MAPBOX_TOKEN</pre></td>
    <td><pre>pk.e....LA</pre></td>
    <td><a href="[https://](https://docs.mapbox.com/help/how-mapbox-works/access-tokens/)">Mapbox Token</a> to show a map</td>
</tr>
<tr>
    <td><pre>DEKART_POSTGRES_DB</pre></td>
    <td><pre>dekart</pre></td>
    <td>Database name. Dekart needs Postgres Database to store query meta information.</td>
</tr>
<tr>
    <td><pre>DEKART_POSTGRES_HOST</pre></td>
    <td><pre>localhost</pre></td>
    <td></td>
</tr>
<tr>
    <td><pre>DEKART_POSTGRES_PORT</pre></td>
    <td><pre>5432</pre></td>
    <td></td>
</tr>
<tr>
    <td><pre>DEKART_POSTGRES_USER</pre></td>
    <td><pre>postgres</pre></td>
    <td></td>
</tr>
<tr>
    <td><pre>DEKART_POSTGRES_PASSWORD</pre></td>
    <td><pre>********</pre></td>
    <td></td>
</tr>
<tr>
    <td><pre>GOOGLE_APPLICATION_CREDENTIALS</pre></td>
    <td><pre>/.../service-account-123456.json</pre></td>
    <td>Credentials for <a href="https://cloud.google.com/docs/authentication/getting-started">Google Cloud API</a></td>
</tr>
<tr>
    <td><pre>DEKART_LOG_DEBUG</pre></td>
    <td><pre>1</pre></td>
    <td>Set Dekart log level to debug</td>
</tr>
<tr>
    <td><pre>DEKART_LOG_PRETTY</pre></td>
    <td><pre>1</pre></td>
    <td>Print pretty colorful logs in console. Be default Dekart formats logs as JSON</td>
</tr>
<tr>
    <td><pre>DEKART_PORT</pre></td>
    <td><pre>8080</pre></td>
    <td>HTTP Port for Dekart server</td>
</tr>
<tr>
    <td><pre>DEKART_STATIC_FILES</pre></td>
    <td><pre>./build</pre></td>
    <td></td>
</tr>
</table>

```
make proto
```

## Develop

### Setup

```
npm install
```

Then edit `.env`

### Using .env

```
cp .env.example .env
```

Then you can run all commands using for example [godotenv](https://github.com/joho/godotenv)

### Run

Run Postgres DB

```
docker-compose  --env-file .env up
```

Run Server

```
godotenv -f .env go run ./src/server/main.go
```

Run frontend

```
npm start
```
