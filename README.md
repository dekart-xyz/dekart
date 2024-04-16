# Dekart

WebGL-powered map analytics for BigQuery and Snowflake. Lightweight alternative to CARTO and Foursquare Studio for data scientists, analysts and engineers.

<a href="https://cloud.dekart.xyz/reports/bef92772-5ad8-4b6a-8d94-72f45f44bf92/source"><img src="./docs/files/screen.png"></a>
<p align="center"><a href="https://dekart.xyz/docs/about/playground/?ref=github">BigQuery Playground</a> | <a href="https://cloud.dekart.xyz/playground">Live demo</a></p>

## Features

Create beautiful data-driven maps and share them with your team:

* WebGL map visualization based on kepler.gl and deck.gl
* Data connectors for BigQuery, Snowflake, and other SQL databases
* Side-by-side SQL editor
* Live editing of maps with other team members
* Efficient query result caching on Amazon S3 or Google Cloud Storage
* Support for CSV and GeoJSON file uploads
* Export to PNG, CSV and HTML maps
* Simple Docker-based deployment with SSO support

## Use cases

* Explore large datasets with millions of rows and visualize them on a map
  * [All (400k) Toronto Buildings (100Mb)](https://cloud.dekart.xyz/reports/8f2da1e3-9769-4654-abb8-983afd2a2795)
  * [1M points (30Mb)](https://cloud.dekart.xyz/reports/f63fb537-800e-48f6-8c18-8d542a0fed30)
  * [All ramps in Illinois ](https://cloud.dekart.xyz/reports/b818f41a-5bd2-4b3b-87b8-4797a390a2a6)
  * [Population over 10k ](https://cloud.dekart.xyz/reports/b099fbd3-d0ae-4636-aa44-217c0bac53f6)
* Export OpenStreetMap data
  * [All German schools from OSM data](https://cloud.dekart.xyz/reports/e539b5f6-cec2-45d5-97b3-d5bf541a9389)
  * [Admin Boundaries](https://dekart.xyz/blog/admin-boundaries-in-bigquery-public-datasets/)
  * [All roads in Nevada excluding parking and service roads (26Mb)](https://cloud.dekart.xyz/reports/556330cb-e7ba-4e34-89df-5644cd0ec8b2)
  * [Every parking lot in Nevada from the OSM](https://cloud.dekart.xyz/reports/b2f2e1b3-78ec-42d9-9cc6-c38a2a57f72e)
  * [US States Borders](https://cloud.dekart.xyz/reports/ec7f842a-73f3-4710-a5e8-a2e2d8f63c55/source)
* Perform geospatial analytics with BigQuery and Snowflake Spatial SQL
  * [Locate empty building plots](https://cloud.dekart.xyz/reports/aeefb6e0-d83a-489a-b371-50b306535e2d)

## Available data sources

* BigQuery ([setup in Dekart Cloud](https://cloud.dekart.xyz/))
* Snowflake
* AWS Athena
* Postgres
* CSV (file upload)
* GeoJSON (file upload)

## Self-hosting Dekart

* [Deploy to AWS/ECS with Terraform](https://dekart.xyz/docs/self-hosting/aws-ecs-terraform/?ref=github)  and manage access with Google IAP
* [Deploy to Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=github)  and manage access with Google IAP
* [Run with Docker](https://dekart.xyz/docs/self-hosting/docker/?ref=github)
* [Documentation](https://dekart.xyz/docs/configuration/environment-variables/?ref=github)

## Support us in building Dekart

* Give it ⭐️ on GitHub!
* Be part of the conversation in the [Dekart Community Slack](https://slack.dekart.xyz)

## Contributing

* [Build from source](https://dekart.xyz/docs/contributing/build-from-source/?ref=github)
* [Architecture Diagram](https://dekart.xyz/docs/contributing/architecture-overview/?ref=github)
* [Contribution Guide](./CONTRIBUTING.md)


## Name origin

Dekart is named after French mathematician René Descartes (French: [ʁəne dekaʁt], Latinized: Renatus Cartesius). Descartes was the name of a French family surname derived from the word des chartes, meaning "of the charts"; this was a reference to the family's involvement in the creation of maps and globes.

## License

MIT
