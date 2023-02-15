.PHONY: proto-build proto-docker proto docker docker-compose-up docker-compose-rm version minor patch

# load .env
# https://lithic.tech/blog/2020-05/makefile-dot-env
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

UNAME := $(shell uname -m)

proto-clean:
	rm -rf ./src/proto/*.go
	rm -rf ./src/proto/*.js
	rm -rf ./src/proto/*.ts

proto-build: proto-clean  #to run inside docker
	protoc --js_out=import_style=commonjs,binary:./src $$(find proto -type f -name "*.proto")
	protoc --ts_out=service=grpc-web:./src $$(find proto -type f -name "*.proto")
	protoc --go_out=./src $$(find proto -type f -name "*.proto")
	protoc --go-grpc_out=./src $$(find proto -type f -name "*.proto")

proto-docker: # build docker container for building protos
ifeq ($(UNAME),arm64)
	docker build -t dekart-proto -f ./proto/Dockerfile --build-arg PLATFORM=aarch_64 .
else
	docker build -t dekart-proto -f ./proto/Dockerfile .
endif

proto: proto-docker # build proto stubs
	docker run -it --rm \
		-v $$(pwd):/home/root/dekart \
		dekart-proto \
		make proto-build

nodetest:
	docker buildx build --platform=linux/amd64 -f ./Dockerfile --target nodetest .

gotest:
	docker buildx build -f ./Dockerfile --target gotest .

e2ebq:
	docker buildx build --tag ${DEKART_DOCKER_E2E_TAG} -o type=image -f ./Dockerfile --target e2etest .
	docker run -it --rm \
	-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
	-v $$(pwd)/cypress/videos:/dekart/cypress/videos/ \
	-v $$(pwd)/cypress/screenshots:/dekart/cypress/screenshots/ \
	-e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
	-e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
	-e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
	-e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
	-e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
	-e DEKART_POSTGRES_HOST=host.docker.internal \
	-e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
	-e DEKART_BIGQUERY_PROJECT_ID=${DEKART_BIGQUERY_PROJECT_ID} \
	-e DEKART_BIGQUERY_MAX_BYTES_BILLED=53687091200 \
	-e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
	-e DEKART_ALLOW_FILE_UPLOAD=1 \
	${DEKART_DOCKER_E2E_TAG}

e2eathena:
	docker buildx build --tag ${DEKART_DOCKER_E2E_TAG} -o type=image -f ./Dockerfile --target e2etest .
	docker run -it --rm \
	-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
	-v $$(pwd)/cypress/videos:/dekart/cypress/videos/ \
	-v $$(pwd)/cypress/screenshots:/dekart/cypress/screenshots/ \
	-e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
	-e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
	-e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
	-e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
	-e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
	-e DEKART_POSTGRES_HOST=host.docker.internal \
	-e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
	-e DEKART_BIGQUERY_PROJECT_ID=${DEKART_BIGQUERY_PROJECT_ID} \
	-e DEKART_BIGQUERY_MAX_BYTES_BILLED=53687091200 \
	-e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
	-e DEKART_ALLOW_FILE_UPLOAD=1 \
	${DEKART_DOCKER_E2E_TAG}


docker: # build docker for local use
	docker buildx build --push --tag ${DEKART_DOCKER_DEV_TAG} -o type=image --platform=linux/amd64 -f ./Dockerfile .

up:
	docker-compose  --env-file .env up

rm:
	docker-compose rm

server:
	go run ./src/server/main.go

cloud-sql-proxy-docker:
	docker build -t cloud-sql-proxy -f ./cloud_sql_proxy/Dockerfile .

cloud-sql-proxy: cloud-sql-proxy-docker
	docker run -it --rm \
		-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
		--env-file .env \
		-p 5432:5432 \
		cloud-sql-proxy

prerelease:
	npm version prerelease --preid=rc
preminor:
	npm version preminor --preid=rc
version:
	npm version $(MAKECMDGOALS)
minor: version
patch: version
patch: version
release:
	git push origin HEAD --tags

test:
	go test -v -count=1 ./src/server/**/

run-docker-dev:
	docker run -it --rm \
		-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
		-e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
		-e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
		-e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
		-e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
		-e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
		-e DEKART_POSTGRES_HOST=host.docker.internal \
		-e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
		-e DEKART_BIGQUERY_PROJECT_ID=${DEKART_BIGQUERY_PROJECT_ID} \
		-e DEKART_BIGQUERY_MAX_BYTES_BILLED=53687091200 \
		-e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
		-p 8080:8080 \
		${DEKART_DOCKER_DEV_TAG}


dekart-0-9-athena:
	docker run -it --rm \
		-e AWS_REGION=${AWS_REGION} \
		-e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
		-e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
		-e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
		-e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
		-e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
		-e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
		-e DEKART_POSTGRES_HOST=host.docker.internal \
		-e DEKART_STORAGE=S3 \
		-e DEKART_DATASOURCE=ATHENA \
		-e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
		-e DEKART_ATHENA_CATALOG=${DEKART_ATHENA_CATALOG} \
		-e DEKART_ATHENA_S3_OUTPUT_LOCATION=${DEKART_ATHENA_S3_OUTPUT_LOCATION} \
		-e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
		-p 8080:8080 \
		dekartxyz/dekart:0.9

dekart-0-9-bigquery:
	docker run -it --rm \
		-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
		-e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
		-e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
		-e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
		-e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
		-e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
		-e DEKART_POSTGRES_HOST=host.docker.internal \
		-e DEKART_STORAGE=GCS \
		-e DEKART_DATASOURCE=BQ \
		-e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
		-e DEKART_BIGQUERY_PROJECT_ID=${DEKART_BIGQUERY_PROJECT_ID} \
		-e DEKART_BIGQUERY_MAX_BYTES_BILLED=53687091200 \
		-e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
		-p 8080:8080 \
		dekartxyz/dekart:0.9
