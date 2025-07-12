package chjob

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/clickhouse"
	"github.com/testcontainers/testcontainers-go/wait"
)

const testBucketName = "testbucket"

// setupClickHouse sets up a ClickHouse container for database testing
func setupClickHouse() (testcontainers.Container, string, error) {
	ctx := context.Background()

	// user := "testuser"
	// password := "testpassword"
	// dbname := "testdb"

	clickhouseC, err := clickhouse.Run(ctx,
		"clickhouse/clickhouse-server:latest",
		// clickhouse.WithUsername(user),
		// clickhouse.WithPassword(password),
		// clickhouse.WithDatabase(dbname),
	)
	if err != nil {
		panic(err)
	}

	state, err := clickhouseC.State(ctx)
	if err != nil {
		return clickhouseC, "", fmt.Errorf("failed to get container state: %w", err)
	}

	if !state.Running {
		return clickhouseC, "", fmt.Errorf("container is not running")
	}

	connectionString, err := clickhouseC.ConnectionString(ctx, "skip_verify=true", "secure=false")
	if err != nil {
		return clickhouseC, "", fmt.Errorf("failed to get connection string: %w", err)
	}

	return clickhouseC, connectionString, nil
}

// setupPostgres sets up a PostgreSQL container for database testing
func setupPostgres() (testcontainers.Container, string, error) {
	ctx := context.Background()

	user := "testuser"
	password := "testpassword"
	dbname := "testdb"

	postgresC, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			AutoRemove:   true,
			Image:        "postgres:16",
			ExposedPorts: []string{"5432/tcp"},
			WaitingFor:   wait.ForLog("database system is ready to accept connections"),
			Env: map[string]string{
				"POSTGRES_DB":       dbname,
				"POSTGRES_PASSWORD": password,
				"POSTGRES_USER":     user,
			},
		},
		Started: true,
	})
	if err != nil {
		return nil, "", err
	}

	ip, err := postgresC.Host(ctx)
	if err != nil {
		return postgresC, "", err
	}

	port, err := postgresC.MappedPort(ctx, "5432")
	if err != nil {
		return postgresC, "", err
	}

	connectionString := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable", user, password, ip, port.Int(), dbname)

	return postgresC, connectionString, nil
}

// setupLocalStack sets up a LocalStack container for S3 testing
func setupLocalStack() (testcontainers.Container, string, error) {
	ctx := context.Background()

	localAWSC, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			AutoRemove:   true,
			Image:        "localstack/localstack:latest",
			ExposedPorts: []string{"4566/tcp"},
			WaitingFor:   wait.ForHTTP("/_localstack/health").WithPort("4566/tcp"),
			Env: map[string]string{
				"SERVICES": "s3",
			},
		},
		Started: true,
	})
	if err != nil {
		return nil, "", err
	}

	ip, err := localAWSC.Host(ctx)
	if err != nil {
		return localAWSC, "", err
	}

	port, err := localAWSC.MappedPort(ctx, "4566")
	if err != nil {
		return localAWSC, "", err
	}

	// setup s3 client
	url := fmt.Sprintf("http://%s:%d", ip, port.Int())
	customResolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, opts ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{
				PartitionID:   "aws",
				URL:           url,
				SigningRegion: region,
			}, nil
		})

	awsCfg, err := config.LoadDefaultConfig(
		context.TODO(),
		config.WithRegion("us-east-1"),
		config.WithEndpointResolverWithOptions(customResolver),
		config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider("dummy", "dummy", "dummy"),
		),
	)
	if err != nil {
		return localAWSC, "", fmt.Errorf("failed to get aws config: %w", err)
	}

	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	// setup fixtures
	buckets := []string{testBucketName}
	for _, bucket := range buckets {
		_, err = s3Client.CreateBucket(ctx, &s3.CreateBucketInput{
			Bucket: aws.String(bucket),
		})
		if err != nil {
			return localAWSC, "", fmt.Errorf("failed to create bucket %s: %w", bucket, err)
		}

		fmt.Printf("Create bucket success: name = %v\n", bucket)
	}

	// return localAWSC, fmt.Sprintf("%s:%d", ip, port.Int()), nil
	return localAWSC, port.Port(), nil
}
