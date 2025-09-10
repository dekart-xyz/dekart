<div align="center">
  <h1 align="center">Dekart</h1>
  <h3>Create Kepler.gl maps with SQL</h3>
  <div>for BigQuery, Snowflake, Wherobots</div>
</div>

<br/>

<div align="center">
  <a href="https://dekart.xyz/self-hosted/?ref=github-license"><img alt="License" src="https://img.shields.io/badge/license-AGPLv3-purple"></a>
</div>

<br/>

Self-hosted alternative to CARTO & Foursquare Studio for your data warehouse.

## Features

* Shareable map links
* Manage data access & sharing
* Up-to-date maps from BigQuery, Snowflake, Wherobots datasets

<br/>
<p><a href="https://dekart.xyz/?ref=github-pic"><img alt="Self-hosted alternative to CARTO & Foursquare Studio for your data warehouse." src=".github/images/github-screencast.gif"></a></p>
<div align="center">
  <a href="https://dekart.xyz/?ref=github-try-live-demo"><img alt="Live Demo" src="https://img.shields.io/badge/Live%20Demo-blue?style=for-the-badge"></a>
</div>

## Live Map Examples

* [BigQuery](https://dekart.xyz/docs/about/overture-maps-examples/)
* [Snowflake](https://dekart.xyz/docs/about/snowflake-kepler-gl-examples/)
* [Wherobots](https://dekart.xyz/docs/usage/wherobots-sql-tutorial/)


## How it works

Dekart is a self-hosted backend for Kepler.gl, built with Golang and React. It connects to your data warehouse, caches query results, and serves them to the frontend for visualization.

## Deployment Options

Dekart is single Docker container that can be deployed to any cloud provider or on-premises server. It requires a PostgreSQL database to store user data and Cloud Storage for caching query results.

👉 [Documentation](https://dekart.xyz/docs/configuration/environment-variables/)

⭐️ **Press GitHub Star to Get Notified of Updates**



### Deployment Guides:

- [Deploy to AWS/ECS (Terraform)](https://dekart.xyz/docs/self-hosting/aws-ecs-terraform/?ref=github)
- [Deploy to Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=github) with Google IAP.
- [Run with Docker](https://dekart.xyz/docs/self-hosting/docker/?ref=github)

## Support

* [Slack Community](https://slack.dekart.xyz)
* [Schedule a Demo](https://calendly.com/dekartxyz/demo?ref=github)

## License

This project is open source under the GNU Affero General Public License Version 3 (AGPLv3) or any later version.

[Commercial Licenses Available](https://dekart.xyz/self-hosted/)

Copyright (c) 2025 Volodymyr Bilonenko
