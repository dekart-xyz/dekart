# Dekart Premium

Welcome to the **Dekart Premium** codebase! This repository is accessible to paying organizations with **read-only access**. Below, you'll find all the information you need to start using and managing Dekart Premium effectively.

Here’s the rewritten section with a focus on using the **Project** for tracking:

---

## 📦 **Project Access & Permissions**

- You have **read-only access** to the code in this repository.
- To submit issues and feature requests, please use the **Private Issue Tracker** project, where all requests can be tracked and monitored in real time. It cab be found in the **Projects** tab.
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

Here’s the revised section, focused on using the dedicated project for issue tracking:

---

## 🚨 **Raising Issues**

- Use the **Private Issue Tracker** project to submit and track issues or feature requests.
- To create a new issue, navigate to the project’s linked repository and open an issue with detailed information, including:
  - Steps to reproduce the issue
  - Expected behavior
  - Logs or screenshots, if available

## 🔗 **Premium Support in Slack**

If you need real-time support, we offer premium support via **[Slack](https://slack.dekart.xyz/)**. Feel free to ask questions, report bugs, or suggest features directly to the team.

## 📄 **Resources**

👉 [Documentation](https://dekart.xyz/docs/)


## License

This repository is licensed under the **Dekart On-Premise Premium License**.

- You may modify, distribute, and use this software for commercial purposes, with certain restrictions.
- The software is subject to the terms outlined in the commercial license.

For full details, see the [`LICENSE`](./LICENSE) file or visit the [Dekart Premium License Terms](https://dekart.xyz/legal/dekart-premium-terms).
