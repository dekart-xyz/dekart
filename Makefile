.PHONY: proto-clean proto-build proto-docker proto nodetest docker-compose-up down cloudsql up-and-down sqlite

# load .env
# https://lithic.tech/blog/2020-05/makefile-dot-env
ifneq (,$(wildcard ./.env))
    include .env
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

e2e: bq athena snowflake

snowpark-build:
	docker buildx build --platform linux/amd64 --tag ${SNOWPARK_IMAGE_NAME} -f ./Dockerfile . --load

snowpark-run: snowpark-build
	docker run -it --rm \
	-p 8082:8080 \
	-v $$(pwd)/backup-volume:/dekart/backup-volume \
	-e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
	-e DEKART_STORAGE=SNOWFLAKE \
	-e DEKART_DATASOURCE=SNOWFLAKE \
	-e DEKART_SNOWFLAKE_ACCOUNT_ID=${DEKART_SNOWFLAKE_ACCOUNT_ID} \
	-e DEKART_SNOWFLAKE_USER=${DEKART_SNOWFLAKE_USER} \
	-e DEKART_SNOWFLAKE_PASSWORD=${DEKART_SNOWFLAKE_PASSWORD} \
	-e DEKART_CORS_ORIGIN=null \
	-e DEKART_LOG_DEBUG=1 \
	-e DEKART_CORS_ORIGIN=null \
	-e DEKART_STREAM_TIMEOUT=10 \
	-e DEKART_SQLITE_DB_PATH=./dekart.db \
	-e DEKART_SNOWFLAKE_STAGE=DEKART_DEV.PUBLIC.DEKART_DEV \
	-e DEKART_BACKUP_FREQUENCY_MIN=5 \
	${SNOWPARK_IMAGE_NAME}

snowpark-tag:
	docker tag ${SNOWPARK_IMAGE_NAME} ${SNOWPARK_REPO_URL}/${SNOWPARK_IMAGE_NAME}

snowpark-docker-login:
	docker login ${SNOWPARK_REPO_URL} -u ${DEKART_SNOWFLAKE_USER} -p ${DEKART_SNOWFLAKE_PASSWORD}

snowpark-docker-push:
	docker push ${SNOWPARK_REPO_URL}/${SNOWPARK_IMAGE_NAME}

snowpark-spec:
	snowsql -c ${SNOWSQL_CONNECTION} -q "PUT file://$(shell pwd)/snowpark/service.yaml @dekart_app.napp.app_stage overwrite=true auto_compress=false"
	snowsql -c ${SNOWSQL_CONNECTION} -q "PUT file://$(shell pwd)/snowpark/setup.sql @dekart_app.napp.app_stage overwrite=true auto_compress=false"
	snowsql -c ${SNOWSQL_CONNECTION} -q "PUT file://$(shell pwd)/snowpark/manifest.yml @dekart_app.napp.app_stage overwrite=true auto_compress=false"
	snowsql -c ${SNOWSQL_CONNECTION} -q "PUT file://$(shell pwd)/snowpark/readme.md @dekart_app.napp.app_stage overwrite=true auto_compress=false"

snowpark-patch:
	snowsql -c ${SNOWSQL_CONNECTION} -q "alter application package dekart_app_pkg ADD PATCH FOR VERSION v1 using @dekart_app.napp.app_stage;"

snowpark: snowpark-build snowpark-tag snowpark-docker-push snowpark-spec snowpark-patch

docker-test:
	docker buildx build --tag ${DEKART_DOCKER_E2E_TAG} --platform=linux/amd64 -o type=image -f ./Dockerfile --target e2etest  .
	docker run -it --rm \
	--platform=linux/amd64 \
	-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
	-v $$(pwd)/cypress/videos:/dekart/cypress/videos/ \
	-v $$(pwd)/cypress/screenshots:/dekart/cypress/screenshots/ \
	-p 3000:3000 \
	--env-file .env.snowflake-sqlite \
	-e DEKART_PORT=3000 \
	-e CYPRESS_CI=1 \
	-e TEST_SPEC=/dekart/cypress/e2e/snowflake/happyPath.cy.js \
	-e DEKART_SQLITE_DB_PATH=/dekart/dekart.db \
	-e DEKART_STATIC_FILES=./build \
	${DEKART_DOCKER_E2E_TAG}

docker: # build docker for local use
	docker buildx build --tag ${DEKART_DOCKER_DEV_TAG} -o type=image --platform=linux/amd64 -f ./Dockerfile .

up-and-down:
	docker compose  --env-file .env --profile local up; docker compose --env-file .env --profile local down --volumes
up:
	docker compose  --env-file .env --profile local up

down:
	docker compose --env-file .env --profile local down --volumes

cloudsql:
	docker compose  --env-file .env --profile cloudsql up

sqlite:
	docker-compose  --env-file .env --profile sqlite up


define run_server
	@set -a; \
	. $(1); \
	set +a; \
	go run ./src/server/main.go
endef

# Pattern rule to match any target starting with ".env."
server-%:
	$(call run_server,.env.$*)

# Rule for the default .env file
server:
	$(call run_server,.env)

npm:
	npm i --legacy-peer-deps
prerelease:
	npm version prerelease --preid=rc
preminor:
	npm version preminor --preid=rc
premajor:
	npm version premajor --preid=rc
prepatch:
	npm version prepatch --preid=rc
version:
	npm version $(MAKECMDGOALS)
minor: version
patch: version
patch: version

test:
	go test -v -count=1 ./src/server/**/
