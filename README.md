# Dekart

Open-source SQL → Map backend for **Kepler.gl**, built for data scientists, analysts, and sales engineers working with Spatial SQL:

* Connects to *BigQuery*, *Snowflake*, *Wherobots*, Postgres, Amazon Athena, and ClickHouse
* Enables map sharing with secure links, email, and access control
* Supports README.md for adding context to maps
* Global filters and map templates

Alternative to CARTO Builder, Foursquare Studio, and BigQuery GeoViz.

<a href="https://cloud.dekart.xyz/reports/62130325-9fc7-4687-ac05-52f6b7513502/source?ref=github-pic"><img src="https://dekart.xyz/docs/about/map-templates/62130325-9fc7-4687-ac05-52f6b7513502_huc0563c5f6ac939a1614c238afd308de4_2022917_1600x0_resize_box_3.png"></a>
<div align="center"><a href="https://cloud.dekart.xyz/?ref=github-try-live-demo">Try Live Demo</a></div>

## How it works

Dekart is a self-hosted backend for Kepler.gl,  built with Golang and React. It connects to your data warehouse, caches query results, and serves them to the frontend for visualization.

* [BigQuery Examples](https://dekart.xyz/docs/about/overture-maps-examples/)
* [Snowflake Examples](https://dekart.xyz/docs/about/snowflake-kepler-gl-examples/)
* [Video: How to Create a Map in Dekart](https://www.youtube.com/watch?v=qwOqLm3i7Ik)

## Deployment Options

Dekart is single Docker container that can be deployed to any cloud provider or on-premises server. It requires a PostgreSQL database to store user data and Cloud Storage for caching query results.

👉 [Documentation](https://dekart.xyz/docs/configuration/environment-variables/)


### Deployment Guides:

- [Deploy to AWS/ECS (Terraform)](https://dekart.xyz/docs/self-hosting/aws-ecs-terraform/?ref=github)
- [Deploy to Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=github) with Google IAP.
- [Run with Docker](https://dekart.xyz/docs/self-hosting/docker/?ref=github)

## Support

* [Slack Community](https://slack.dekart.xyz)
* [Schedule a Demo](https://calendly.com/dekartxyz/demo?ref=github)

👉 If you like Dekart, make sure to star the repo!

## License

This project is open source under the GNU Affero General Public License Version 3 (AGPLv3) or any later version.

[Commercial Licenses Available](https://dekart.xyz/self-hosted/)

Copyright (c) 2025 Volodymyr Bilonenko
