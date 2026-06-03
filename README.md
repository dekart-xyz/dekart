<div align="center">
  <h1 align="center">Dekart</h1>
  <h3>Create Kepler.gl maps with SQL <div>for BigQuery, Snowflake, Postgres</div></h3>
  <div><code>🤖 🛑 Every line in this repo is reviewed by a human</code></div>
</div>

<br/>

<div align="center">Self-hosted alternative to <b>CARTO</b>, <b>Felt</b> and <b>Aino</b> geospatial platforms.</div>

## Features

* Connect to Postgres, BigQuery, Snowflake, and more
* Create live maps with SQL or with Claude and Codex agents
* Shareable map links
* Manage data access & sharing

<br/>
<p align="center"><a href="https://dekart.xyz/?ref=github-pic"><img alt="Self-hosted alternative to CARTO & Foursquare Studio for your data warehouse." src=".github/images/github-screencast.gif"></a></p>
<div align="center">
  <a href="https://cloud.dekart.xyz/?ref=github-try-live-demo"><img alt="Live Demo" src="https://img.shields.io/badge/Live%20Demo-blue?style=for-the-badge"></a>
</div>

## Quick Start

```sh
docker run -p 8080:8080 dekartxyz/dekart
```

Optional agentic setup:

```sh
pip install geosql && geosql       # install Claude/Codex skill
pip install dekart-cli && dekart init  # install Dekart CLI
```

Then ask Claude or Codex to build a map from your data.

## Live Map Examples

[BigQuery](https://dekart.xyz/docs/about/overture-maps-examples/)
| [Snowflake](https://dekart.xyz/docs/about/snowflake-kepler-gl-examples/)
| [Wherobots](https://dekart.xyz/docs/usage/wherobots-sql-tutorial/)


## How it works

Dekart is a self-hosted backend for Kepler.gl, built with Golang and React. It connects to your data warehouse and exposes MCP, enabling agents to create maps and improve accuracy on geospatial tasks.

## Deployment Options

Dekart is a single Docker container that can be deployed to any cloud provider or on-premises server. By default it uses built-in SQLite for metadata and local file storage, so it can run with zero configuration. For production deployments, you can configure S3/GCS backups or a Postgres metadata backend.

* [Quick Start](https://dekart.xyz/docs/self-hosting/docker/?ref=github)
* [Environment Variables](https://dekart.xyz/docs/configuration/environment-variables/)

### Deployment Guides:

- [Run with Docker](https://dekart.xyz/docs/self-hosting/docker/?ref=github)
- [Run with Docker Compose profiles](https://dekart.xyz/docs/self-hosting/docker-compose/?ref=github)
- [Keycloak + Postgres reverse proxy example](https://dekart.xyz/docs/self-hosting/keycloak-reverse-proxy/?ref=github)
- [Docker Compose examples by setup](install/docker-compose/README.md)
- [Deploy to AWS/ECS (Terraform)](https://dekart.xyz/docs/self-hosting/aws-ecs-terraform/?ref=github)
- [Deploy to Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=github)
- [Enable SSO for self-hosted instance](https://dekart.xyz/docs/self-hosting/enable-sso-open-source-instance/?ref=github)

⭐️ Press GitHub Star to get notified of updates.

## Support

* [Slack Community](https://slack.dekart.xyz)

## License

This project is open source under the GNU Affero General Public License Version 3 (AGPLv3) or any later version.

[Commercial Licenses Available](https://dekart.xyz/self-hosted/)

Copyright (c) 2026 Volodymyr Bilonenko
