# Dekart Premium

Welcome to the **Dekart Premium** codebase! This repository is accessible to paying organizations with **read-only access**. Below, you'll find all the information you need to start using and managing Dekart Premium effectively.

## 📦 **Repository Access & Permissions**

- You have **read-only access** to the code in this repository.
- Any issues or feature requests should be raised in a dedicated repository named **dekart-premium-[your_team_name]**.
- For live support, join our **[Slack community](https://slack.dekart.xyz/)**.

## 🛠️ **Installing Dekart Premium**

### From GitHub Packages
You can install the Dekart Premium Docker image directly from **GitHub Packages**. Follow the instructions below:

1. **Authenticate to GitHub Packages** with your GitHub account.
   ```bash
   docker login ghcr.io -u [USERNAME] -p [TOKEN]
   ```
2. **Pull the Premium image**:
   ```bash
   docker pull ghcr.io/dekart-xyz/dekart-premium/dekart:latest
   ```
3. **Run the image** with your desired configurations:
   ```bash
   docker run -d -p 8080:8080 ghcr.io/dekart-xyz/dekart-premium/dekart:latest
   ```

### Deploying Examples

* [Deploy to AWS/ECS with Terraform](https://dekart.xyz/docs/self-hosting/aws-ecs-terraform/?ref=github)  and manage access with Google IAP
* [Deploy to Google App Engine](https://dekart.xyz/docs/self-hosting/app-engine/?ref=github)  and manage access with Google IAP
* [Run with Docker](https://dekart.xyz/docs/self-hosting/docker/?ref=github)


👉 [Environment Variables Documentation](https://dekart.xyz/docs/configuration/environment-variables/?ref=github)

## 📅 **Schedule Developer Support Calls**

If you need personalized assistance, you can schedule a 1-on-1 call with a developer through our **[Calendly link](https://calendly.com/vladi-dekart/30min)**. We'll be happy to walk you through advanced features or help troubleshoot any issues.

## 🚨 **Raising Issues**

- Each team has its own repository for tracking issues. Use the format **dekart-premium-[your_team_name]** to create a new issue.
- **Example Issue Repo**: `https://github.com/dekart-xyz/dekart-premium-[your_team_name]/issues`
- Please provide as much detail as possible in your reports, including:
  - Steps to reproduce
  - Expected behavior
  - Logs or screenshots, if available

## 🔗 **Premium Support in Slack**

If you need real-time support, we offer premium support via **[Slack](https://slack.dekart.xyz/)**. Feel free to ask questions, report bugs, or suggest features directly to the team.

## 📄 **Resources**

👉 [Documentation](https://dekart.xyz/docs/)


