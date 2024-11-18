# Dekart

**Open-source backend for Kepler.gl**: Instantly create and share Kepler.gl maps with SQL directly from BigQuery, Snowflake, Athena, and Postgres. Bring Geospatial Superpowers to Your Data Platform.

Alternative to CARTO Builder and BigQuery GeoViz — lightweight, powerful, and open.

<a href="https://cloud.dekart.xyz/reports/410b857a-aad1-4f05-8ddd-551d0f0fe650/source"><img src="https://dekart.xyz/berlin-roads_hufc8b27bf447ed9fea8a337916e339bb3_1495519_2048x0_resize_box_3.png"></a>
<div align="center"><a href="https://cloud.dekart.xyz/">Try Live Demo</a></div>

## Features

- **WebGL-Powered Maps**: Built with Kepler.gl and Deck.gl.
- **Scale**: Tested with up to 1M rows and 100MB queries.
- **SQL-First**: Side-by-side SQL editor with instant previews.
- **Cloud-Native Connectors**: BigQuery, Snowflake, Athena, and Postgres.
- **Secure**: SSO via Google OAuth/IAP, Amazon OIDC
- **Efficient**: Cached query results for predictable database usage.
- **Flexible Deployment**: Docker-based for quick setup.
- **Data Export**: PNG, CSV, GeoJSON, HTML.

## Examples and use cases 

- [BigQuery: Overture Maps](https://dekart.xyz/docs/about/overture-maps-examples/)
- [BigQuery: Public Datasets](https://dekart.xyz/docs/about/kepler-gl-map-examples/)
- [Snowflake Maps](https://dekart.xyz/docs/about/snowflake-kepler-gl-examples/)

## Data Connectors 

* [BigQuery](https://dekart.xyz/docs/configuration/environment-variables/#bigquery) | [Connect Instantly](https://cloud.dekart.xyz/)
* [Snowflake](https://dekart.xyz/docs/configuration/environment-variables/#snowflake) | [Connect Instantly](https://cloud.dekart.xyz/)
* [AWS Athena](https://dekart.xyz/docs/configuration/environment-variables/#aws-athena)
* [Postgres](https://dekart.xyz/docs/configuration/environment-variables/#postgres-as-a-data-source)

## Self-Hosting

- [Deploy to AWS/ECS (Terraform)](https://dekart.xyz/docs/self-hosting/aws-ecs-terraform/?ref=github) with Google IAP.
- [Deploy to Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=github) with Google IAP.
- [Run with Docker](https://dekart.xyz/docs/self-hosting/docker/?ref=github).

Full setup and configuration details in the [Documentation](https://dekart.xyz/docs/configuration/environment-variables/?ref=github).

## Contributing

- Join the [Dekart Community Slack](https://slack.dekart.xyz)
- [Build from Source](https://dekart.xyz/docs/contributing/build-from-source/?ref=github)
- Explore the [Architecture Diagram](https://dekart.xyz/docs/contributing/architecture-overview/?ref=github)
- Follow the [Contribution Guide](./CONTRIBUTING.md)


## Name Origin

Named after mathematician René Descartes (Latinized: Renatus Cartesius), whose family name referenced map creation (des chartes: “of the charts”).

## License

This project is open source under the GNU Affero General Public License Version 3 (AGPLv3) or any later version.

[Lifetime Commercial Licenses Available](https://dekart.xyz/self-hosted/).

Copyright (c) 2024 Volodymyr Bilonenko


