package main

import (
	"fmt"
	"os"
	"time"

	"github.com/pulumi/pulumi-gcp/sdk/v7/go/gcp/appengine"
	"github.com/pulumi/pulumi-gcp/sdk/v7/go/gcp/sql"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "")

		image := os.Getenv("IMAGE_DIGEST")
		ctx.Log.Info(fmt.Sprintf("Using image digest: %s", image), nil)

		// Create a PostgreSQL Cloud SQL Database Instance
		db, err := sql.NewDatabaseInstance(ctx, "cloud-db", &sql.DatabaseInstanceArgs{
			Name:            pulumi.String("cloud-db"),
			DatabaseVersion: pulumi.String("POSTGRES_15"),
			Settings: &sql.DatabaseInstanceSettingsArgs{
				Tier: pulumi.String("db-f1-micro"),
				BackupConfiguration: &sql.DatabaseInstanceSettingsBackupConfigurationArgs{
					Enabled:                    pulumi.Bool(true),
					PointInTimeRecoveryEnabled: pulumi.Bool(true),
					BackupRetentionSettings: &sql.DatabaseInstanceSettingsBackupConfigurationBackupRetentionSettingsArgs{
						RetainedBackups: pulumi.Int(7),
					},
				},
			},
		})
		if err != nil {
			return err
		}

		const databaseName = pulumi.String("dekart")

		// Create a PostgreSQL Database on the Cloud SQL Database Instance
		_, err = sql.NewDatabase(ctx, "dekart", &sql.DatabaseArgs{
			Instance: db.Name,
			Name:     databaseName,
		})
		if err != nil {
			ctx.Log.Error(fmt.Sprintf("Error creating Cloud SQL Database: %v", err), nil)
			return err
		}

		// Set the password for the "postgres" user
		_, err = sql.NewUser(ctx, "db-user", &sql.UserArgs{
			Instance: db.Name,
			Name:     pulumi.String("postgres"),
			Password: cfg.RequireSecret("DEKART_POSTGRES_PASSWORD"),
		})
		if err != nil {
			return err
		}

		versionId := os.Getenv("VERSION_ID")

		if versionId == "" {
			versionId = time.Now().Format("200601021504")
		}

		// Create App Engine Flexible App Version
		ver, err := appengine.NewFlexibleAppVersion(ctx, "dekart-cloud", &appengine.FlexibleAppVersionArgs{
			Service:       pulumi.String("default"),
			Runtime:       pulumi.String("custom"),
			ServingStatus: pulumi.String("SERVING"),
			VersionId:     pulumi.String(versionId), // Get the current time and format it as a string
			Handlers: appengine.FlexibleAppVersionHandlerArray{
				appengine.FlexibleAppVersionHandlerArgs{
					UrlRegex:      pulumi.String("/.*"),
					Script:        &appengine.FlexibleAppVersionHandlerScriptArgs{ScriptPath: pulumi.String("./*")},
					SecurityLevel: pulumi.String("SECURE_ALWAYS"),
				},
			},
			EnvVariables: pulumi.StringMap{
				"DEKART_LOG_DEBUG":                   pulumi.String("1"),
				"DEKART_POSTGRES_DB":                 databaseName,
				"DEKART_POSTGRES_USER":               pulumi.String("postgres"),
				"DEKART_POSTGRES_PASSWORD":           cfg.RequireSecret("DEKART_POSTGRES_PASSWORD"),
				"DEKART_POSTGRES_PORT":               pulumi.String("5432"),
				"DEKART_POSTGRES_HOST":               pulumi.String("172.17.0.1"),
				"DEKART_STORAGE":                     pulumi.String("USER"),
				"DEKART_DATASOURCE":                  pulumi.String("USER"),
				"DEKART_ALLOW_FILE_UPLOAD":           pulumi.String("1"),
				"DEKART_REQUIRE_GOOGLE_OAUTH":        pulumi.String("1"),
				"DEKART_GOOGLE_OAUTH_CLIENT_ID":      pulumi.String(cfg.Require("DEKART_GOOGLE_OAUTH_CLIENT_ID")),
				"DEKART_GOOGLE_OAUTH_SECRET":         cfg.RequireSecret("DEKART_GOOGLE_OAUTH_SECRET"),
				"STRIPE_SECRET_KEY":                  cfg.RequireSecret("STRIPE_SECRET_KEY"),
				"STRIPE_PRICE_ID":                    pulumi.String(cfg.Require("STRIPE_PRICE_ID")),
				"STRIPE_PRICE_ID_GROW":               pulumi.String(cfg.Require("STRIPE_PRICE_ID_GROW")),
				"STRIPE_PRICE_ID_MAX":                pulumi.String(cfg.Require("STRIPE_PRICE_ID_MAX")),
				"DEKART_MAPBOX_TOKEN":                pulumi.String(cfg.Require("DEKART_MAPBOX_TOKEN")),
				"DEKART_HTML_CUSTOM_CODE":            pulumi.String(cfg.Require("DEKART_HTML_CUSTOM_CODE")),
				"DEKART_UX_HOMEPAGE":                 pulumi.String("/"),
				"DEKART_BIGQUERY_PROJECT_ID":         pulumi.String("dekart-playground"),
				"DEKART_CLOUD_STORAGE_BUCKET":        pulumi.String("dekart-playground"),
				"DEKART_CLOUD_PUBLIC_STORAGE_BUCKET": pulumi.String("dekart-playground"),
				"DEKART_BIGQUERY_MAX_BYTES_BILLED":   pulumi.String("107374182400"),
				"DEKART_CORS_ORIGIN":                 pulumi.String("null"),
				"DEKART_DATA_ENCRYPTION_KEY":         pulumi.String("projects/398860824064/secrets/dekart-prod-user-data-encoding-key/versions/1"),
			},
			Deployment: &appengine.FlexibleAppVersionDeploymentArgs{
				Container: &appengine.FlexibleAppVersionDeploymentContainerArgs{
					Image: pulumi.String(image),
				},
			},
			// AutomaticScaling: &appengine.FlexibleAppVersionAutomaticScalingArgs{
			// 	MinTotalInstances: pulumi.Int(0),
			// 	MaxTotalInstances: pulumi.Int(1),
			// },
			ManualScaling: &appengine.FlexibleAppVersionManualScalingArgs{
				Instances: pulumi.Int(1),
			},
			Resources: &appengine.FlexibleAppVersionResourcesArgs{
				MemoryGb: pulumi.Float64(2.0),
			},
			LivenessCheck: &appengine.FlexibleAppVersionLivenessCheckArgs{
				Path:          pulumi.String("/health"),
				CheckInterval: pulumi.String("60s"),
			},
			ReadinessCheck: &appengine.FlexibleAppVersionReadinessCheckArgs{
				Path:          pulumi.String("/health"),
				CheckInterval: pulumi.String("60s"),
			},
			BetaSettings: pulumi.StringMap{
				"cloud_sql_instances": db.ConnectionName.ApplyT(func(cn string) string {
					return fmt.Sprintf("%s=tcp:5432", cn)
				}).(pulumi.StringOutput),
			},
			NoopOnDestroy: pulumi.Bool(false),
		})

		if err != nil {
			return err
		}

		// Split traffic to the new version
		allocations := pulumi.StringMap{}
		allocations[versionId] = pulumi.String("1.0")

		_, err = appengine.NewEngineSplitTraffic(ctx, "dekart-cloud-split", &appengine.EngineSplitTrafficArgs{
			Service:        ver.Service,
			MigrateTraffic: pulumi.Bool(false), // immediately move 100% of traffic to the new version (default is true, which would move traffic gradually over time
			Split: appengine.EngineSplitTrafficSplitArgs{
				Allocations: allocations,
			},
		})

		if err != nil {
			return err
		}

		return nil
	})
}
