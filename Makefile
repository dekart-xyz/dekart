.PHONY: proto-clean proto-build proto-docker proto nodetest docker-compose-up down cloudsql up-and-down up-and-down-oidc sqlite proto-copy-to-node proto-stub server dev-ports-release runner-install runner-register runner-start runner-stop runner-status runner-service-install runner-service-start runner-service-stop runner-service-status github-runner license-keygen license-issue

# load .env
# https://lithic.tech/blog/2020-05/makefile-dot-env
ifneq (,$(wildcard ./.env))
    include .env
endif

UNAME := $(shell uname -m)
DOCKER_TTY := $(shell if [ -t 0 ] && [ -t 1 ]; then echo -it; fi)
RUNNER_DIR ?= $(HOME)/actions-runner
RUNNER_URL ?= https://github.com/dekart-xyz/dekart
RUNNER_LABELS ?= self-hosted,laptop-build
RUNNER_NAME ?= $(shell hostname)-dekart-laptop
GITHUB_RUNNER_TOKEN ?= $(RUNNER_TOKEN)
RUNNER_VERSION ?= 2.328.0

proto-clean:
	rm -rf ./src/proto/*.go
	rm -rf ./src/proto/*.js
	rm -rf ./src/proto/*.ts
	rm -rf ./proto/*.go
	rm -rf ./proto/*.js
	rm -rf ./proto/*.ts
	rm -rf ./node_modules/dekart-proto

proto-build: proto-clean  #to run inside docker
	protoc --proto_path=./proto --js_out=import_style=commonjs,binary:./proto $$(find proto -type f -name "*.proto")
	protoc --proto_path=./proto --ts_out=service=grpc-web:./proto $$(find proto -type f -name "*.proto")
	protoc --go_out=./src $$(find proto -type f -name "*.proto")
	protoc --go-grpc_out=./src $$(find proto -type f -name "*.proto")

proto-docker: # build docker container for building protos
ifeq ($(UNAME),arm64)
	docker buildx build --load -t dekart-proto -f ./proto/Dockerfile --build-arg PLATFORM=aarch_64 .
else
	docker buildx build --load -t dekart-proto -f ./proto/Dockerfile .
endif

proto-copy-to-node:
	rm -rf ./node_modules/dekart-proto
	rm -rf ./node_modules/.vite
	mkdir -p ./node_modules/dekart-proto
	cp -r ./proto/* ./node_modules/dekart-proto/

proto: proto-stub proto-copy-to-node

proto-stub: proto-docker # build proto stubs
	docker run $(DOCKER_TTY) --rm \
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
	docker buildx build --tag ${DEKART_DOCKER_E2E_TAG} -o type=image -f ./Dockerfile --target e2etest  .
	docker run -it --rm \
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
	docker compose --env-file .env --profile local up db adminer browserless; \
	docker compose --env-file .env --profile local down --volumes
up-and-down-oidc:
	docker compose --env-file .env.oidc --profile oidc up db adminer keycloak oauth2-proxy; docker compose --env-file .env.oidc --profile oidc down --volumes
cloud:
	docker compose  --env-file .env.cloud --profile cloud up; docker compose --profile cloud down --volumes
up:
	docker compose  --env-file .env --profile local up

down:
	docker compose --env-file .env --profile local down --volumes

dev-ports-release:
	@echo "Releasing local dev ports 8080 and 3000..."
	@pids="$$(lsof -tiTCP:8080,3000 -sTCP:LISTEN)"; \
	if [ -n "$$pids" ]; then \
		kill -9 $$pids; \
		echo "Force-stopped listeners: $$pids"; \
	else \
		echo "No listeners on 8080 or 3000"; \
	fi

cloudsql:
	docker compose  --env-file .env --profile cloudsql up

sqlite:
	docker-compose  --env-file .env --profile sqlite up


define run_server
	@echo "Releasing local dev port 8080..."; \
	pids="$$(lsof -tiTCP:8080 -sTCP:LISTEN)"; \
	if [ -n "$$pids" ]; then \
		kill -9 $$pids; \
		echo "Force-stopped listeners: $$pids"; \
	else \
		echo "No listeners on 8080"; \
	fi; \
	set -a; \
	. $(1); \
	set +a; \
	go run ./src/server/main.go
endef

# Rule for the default .env file or custom env file passed as argument
# Usage: make server           -> uses .env
#        make server .env.cloud -> uses .env.cloud
server:
	$(call run_server,$(or $(filter-out server,$(MAKECMDGOALS)),.env))

# Dummy target to prevent Make from trying to build .env files as targets
# This pattern rule makes .env* targets as no-ops that are always "up to date"
.env%:
	@:

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

# License key helpers (offline JWT license keys).
#
# Generates an RSA keypair used to sign license tokens:
# - Private key MUST be kept secret (never commit).
# - Public key can be embedded in the binary for verification.
# Prefer existing ./keys directory if present, otherwise default to ./license-keys.
LICENSE_KEYS_DIR ?= $(if $(wildcard ./keys),./keys,./license-keys)
LICENSE_PRIVATE_KEY ?= $(LICENSE_KEYS_DIR)/license-private.pem
LICENSE_PUBLIC_KEY ?= $(LICENSE_KEYS_DIR)/license-public.pem

license-keygen:
	@set -e; \
	mkdir -p "$(LICENSE_KEYS_DIR)"; \
	if [ -f "$(LICENSE_PRIVATE_KEY)" ] || [ -f "$(LICENSE_PUBLIC_KEY)" ]; then \
		echo "Refusing to overwrite existing key(s)."; \
		echo "Delete them manually if you really want to re-generate:"; \
		echo "  rm -f \"$(LICENSE_PRIVATE_KEY)\" \"$(LICENSE_PUBLIC_KEY)\""; \
		exit 1; \
	fi; \
	openssl genrsa -out "$(LICENSE_PRIVATE_KEY)" 2048; \
	openssl rsa -in "$(LICENSE_PRIVATE_KEY)" -pubout -out "$(LICENSE_PUBLIC_KEY)"; \
	echo "Generated:"; \
	echo "  $(LICENSE_PRIVATE_KEY) (KEEP SECRET; do not commit)"; \
	echo "  $(LICENSE_PUBLIC_KEY) (public; can be embedded/committed)"

# Issue a license token (prints DEKART_LICENSE_KEY=...).
# Usage:
#   make license-issue EMAIL=me@company.com
#   make license-issue EMAIL=me@company.com DAYS=14
#   make license-issue EMAIL=me@company.com EXPIRE_FROM_NOW_SECONDS=3600
#   make license-issue EMAIL=me@company.com EXPIRE_FROM_NOW_SECONDS=-3600
EMAIL ?=
DAYS ?= 0
EXPIRE_FROM_NOW_SECONDS ?=
license-issue:
	@test -n "$(EMAIL)" || (echo "EMAIL is required. Example: make license-issue EMAIL=me@company.com"; exit 1)
	@test -f "$(LICENSE_PRIVATE_KEY)" || (echo "Missing private key: $(LICENSE_PRIVATE_KEY). Run: make license-keygen"; exit 1)
	@go run ./scripts/license-issue.go --email "$(EMAIL)" --private-key "$(LICENSE_PRIVATE_KEY)" \
		$(if $(filter-out 0,$(DAYS)),--days "$(DAYS)",) \
		$(if $(strip $(EXPIRE_FROM_NOW_SECONDS)),--expire-from-now-seconds "$(EXPIRE_FROM_NOW_SECONDS)",)

# GitHub self-hosted runner helpers (local laptop runner).
# Usage:
#   make runner-register             # installs runner if needed, then registers
#   make runner-start
#   make runner-service-install
#   make runner-service-start
runner-install:
	@if [ -x "$(RUNNER_DIR)/config.sh" ]; then \
		echo "Runner already installed at $(RUNNER_DIR)"; \
		exit 0; \
	fi
	@set -e; \
	OS=$$(uname -s); \
	ARCH=$$(uname -m); \
	case "$$OS" in \
		Darwin) OS_TAG="osx" ;; \
		Linux) OS_TAG="linux" ;; \
		*) echo "Unsupported OS: $$OS"; exit 1 ;; \
	esac; \
	case "$$ARCH" in \
		x86_64|amd64) ARCH_TAG="x64" ;; \
		arm64|aarch64) ARCH_TAG="arm64" ;; \
		*) echo "Unsupported architecture: $$ARCH"; exit 1 ;; \
	esac; \
	PKG="actions-runner-$${OS_TAG}-$${ARCH_TAG}-$(RUNNER_VERSION).tar.gz"; \
	URL="https://github.com/actions/runner/releases/download/v$(RUNNER_VERSION)/$$PKG"; \
	echo "Installing GitHub runner $(RUNNER_VERSION) from $$URL"; \
	mkdir -p "$(RUNNER_DIR)"; \
	cd "$(RUNNER_DIR)"; \
	curl -fL "$$URL" -o "$$PKG"; \
	tar xzf "$$PKG"; \
	rm -f "$$PKG"; \
	test -x "$(RUNNER_DIR)/config.sh" || (echo "Runner install failed"; exit 1); \
	echo "Runner installed in $(RUNNER_DIR)"

runner-register: runner-install
	@test -n "$(GITHUB_RUNNER_TOKEN)" || (echo "GITHUB_RUNNER_TOKEN (or RUNNER_TOKEN) is required. Add it to .env or pass on command line."; exit 1)
	@cd "$(RUNNER_DIR)" && ./config.sh \
		--url "$(RUNNER_URL)" \
		--token "$(GITHUB_RUNNER_TOKEN)" \
		--labels "$(RUNNER_LABELS)" \
		--name "$(RUNNER_NAME)" \
		--unattended \
		--replace

runner-start:
	@test -x "$(RUNNER_DIR)/run.sh" || (echo "Missing $(RUNNER_DIR)/run.sh. Install and register runner first."; exit 1)
	cd "$(RUNNER_DIR)" && ./run.sh

runner-stop:
	@pkill -f "$(RUNNER_DIR)/bin/Runner.Listener" || true

runner-status:
	@pgrep -af "$(RUNNER_DIR)/bin/Runner.Listener" || echo "Runner is not running."

runner-service-install:
	@test -x "$(RUNNER_DIR)/svc.sh" || (echo "Missing $(RUNNER_DIR)/svc.sh. Install actions runner first."; exit 1)
	cd "$(RUNNER_DIR)" && sudo ./svc.sh install

runner-service-start:
	@test -x "$(RUNNER_DIR)/svc.sh" || (echo "Missing $(RUNNER_DIR)/svc.sh. Install actions runner first."; exit 1)
	cd "$(RUNNER_DIR)" && sudo ./svc.sh start

runner-service-stop:
	@test -x "$(RUNNER_DIR)/svc.sh" || (echo "Missing $(RUNNER_DIR)/svc.sh. Install actions runner first."; exit 1)
	cd "$(RUNNER_DIR)" && sudo ./svc.sh stop

runner-service-status:
	@test -x "$(RUNNER_DIR)/svc.sh" || (echo "Missing $(RUNNER_DIR)/svc.sh. Install actions runner first."; exit 1)
	cd "$(RUNNER_DIR)" && sudo ./svc.sh status

# Simplified foreground runner command (keeps terminal open with live logs).
github-runner: runner-start
