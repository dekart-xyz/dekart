# Dekart
Open-source, self-hosted version of [Dekart Cloud](https://dekart.xyz): WebGL-powered map analytics for BigQuery and Snowflake. Lightweight alternative to CARTO and Foursquare Studio for data scientists, analysts and engineers who work with large datasets.

<a href="https://cloud.dekart.xyz/reports/bef92772-5ad8-4b6a-8d94-72f45f44bf92/source"><img src="./docs/files/screen.png"></a>
<p align="center"><a href="https://dekart.xyz/docs/about/playground/?ref=github">BigQuery Playground</a> | <a href="https://cloud.dekart.xyz/playground">Live demo</a></p>

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

## Self-hosting Dekart

* [Deploy to AWS/ECS with Terraform](https://dekart.xyz/docs/self-hosting/aws-ecs-terraform/?ref=github)  and manage access with Google IAP
* [Deploy to Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=github)  and manage access with Google IAP
* [Run with Docker](https://dekart.xyz/docs/self-hosting/docker/?ref=github)
* [Documentation](https://dekart.xyz/docs/configuration/environment-variables/?ref=github)

## Support us in building Dekart

* Give it ⭐️ on GitHub!
* Be part of the conversation in the [Dekart Community Slack](https://slack.dekart.xyz)
* Vote for new features by adding 👍 to new items in the [Public Road map](https://github.com/orgs/dekart-xyz/projects/1/views/2?visibleFields=%5B%22Title%22%2C%22Status%22%2C44878637%5D).
* Raise issues and feature requests in [Dekart GitHub Issues](https://github.com/dekart-xyz/dekart/issues/new/choose)

## Contributing

* [Build from source](https://dekart.xyz/docs/contributing/build-from-source/?ref=github)
* [Architecture Diagram](https://dekart.xyz/docs/contributing/architecture-overview/?ref=github)
* [Contribution Guide](./CONTRIBUTING.md)


## Name origin

Dekart is named after French mathematician René Descartes (French: [ʁəne dekaʁt], Latinized: Renatus Cartesius). Descartes was the name of a French family surname derived from the word des chartes, meaning "of the charts"; this was a reference to the family's involvement in the creation of maps and globes.

## License

MIT
