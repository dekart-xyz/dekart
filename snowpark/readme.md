# Dekart Snowpark Application

**Dekart** enables you to create powerful **Kepler.gl** visualizations directly from SQL queries in Snowflake, simplifying the process of visualizing and sharing location data without ETL pipelines.

## 💡 How Dekart Works

- **Single Docker Container**: Dekart runs efficiently as a single container within the Snowpark Container Service, requiring minimal setup.
- **State Management**: All Dekart's state is securely stored on `dekart.app_public.app_state_stage`, which includes 7 days of backups. When the application is uninstalled, the associated stage is also deleted.
- **Data Warehouse**: Dekart uses a dedicated `dw_dekart` data warehouse for executing and storing SQL queries.
- **Query Results**: Query data is loaded from Snowflake's persisted query results. If the query results expire, Dekart will automatically rerun the query to refresh the map data.

  **Recommended limits**:
  - Maximum result size: **100 MB**
  - Maximum number of rows: **1 million rows**

## 🛡️ Accessing Datasets

To use datasets in your visualizations, Dekart needs access to the relevant databases. For instance, to grant Dekart access to the **OpenStreetMap New York** dataset, run the following SQL command:

```SQL
-- Grant access to a dataset (e.g., OpenStreetMap New York)
GRANT IMPORTED PRIVILEGES ON DATABASE OPENSTREETMAP_NEW_YORK TO application DEKART__WEBGL_MAPS_FOR_SNOWFLAKE;
```

💡 Please note that app name could be changed during the installation process.

## 👫 Granting Access to Other Users

To allow other users access to the Dekart application, assign them the appropriate role with the following SQL command:

```SQL
-- Grant access to a user role
GRANT application role DEKART__WEBGL_MAPS_FOR_SNOWFLAKE.app_public.app_user TO role user_role;
```

💡 Please note that app name could be changed during the installation process.

## 🎁 Getting access to free Overture Maps

Dekart offers great way to explore Overture Maps datasets and enrich your visualizations with Places, Roads, and other map data.

1. Go to Snowflake Marketplace and search for [Overture Maps](https://app.snowflake.com/marketplace/data-products/search?search=overture%20maps)

2. Get Datasets you need, for example Places. They are instantly available in your Snowflake account.

3. Give Dekart access to the dataset:

```SQL
-- as ACCOUNTADMIN
GRANT IMPORTED PRIVILEGES ON DATABASE OVERTURE_MAPS__PLACES TO APPLICATION DEKART__WEBGL_MAPS_FOR_SNOWFLAKE;
```

4. Go to Dekart application, create a new report click *Start with sample query* to test it.

💡 Please note that app name could be changed during the installation process.

## 🛟 Support

* [Get support in Slack Community](https://slack.dekart.xyz/)
* [Book a walkthrough demo with our team](https://calendly.com/vladi-dekart/30min)
* [Create a GitHub Issue](https://github.com/dekart-xyz/dekart/issues)
* Contact us over email [support@dekart.xyz](mailto:support@dekart.xyz)
