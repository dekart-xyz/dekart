.PHONY: proto-build proto-docker proto docker docker-compose-up docker-compose-rm version minor patch

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
	docker build -t dekart-proto -f ./proto/Dockerfile .

proto: proto-docker # build proto stubs
	docker run -it --rm \
		-v $$(pwd):/home/root/dekart \
		dekart-proto \
		make proto-build

docker: # build docker for local use
	docker build -t dekart-dev -f ./Dockerfile .

ecr-dev:
	docker tag dekart-dev eu.gcr.io/dekart-playground/dekart:dev
	docker push eu.gcr.io/dekart-playground/dekart:dev

docker-compose-up:
	docker-compose  --env-file .env up

docker-compose-rm:
	docker-compose rm

run-dev-server:
	godotenv -f .env go run ./src/server/main.go

cloud-sql-proxy-docker:
	docker build -t cloud-sql-proxy -f ./cloud_sql_proxy/Dockerfile .

cloud-sql-proxy: cloud-sql-proxy-docker
	docker run -it --rm \
		-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
		--env-file .env \
		-p 5432:5432 \
		cloud-sql-proxy
version:
	npm version $(MAKECMDGOALS)
minor: version
patch: version
release:
	git push origin HEAD --tags
test:
	go test -v -count=1 ./src/server/**/

dekart-0-7:
	docker run -it --rm \
		-v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
		-e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
		-e DEKART_POSTGRES_DB=${DEKART_POSTGRES_DB} \
		-e DEKART_POSTGRES_USER=${DEKART_POSTGRES_USER} \
		-e DEKART_POSTGRES_PASSWORD=${DEKART_POSTGRES_PASSWORD} \
		-e DEKART_POSTGRES_PORT=${DEKART_POSTGRES_PORT} \
		-e DEKART_POSTGRES_HOST=${DEKART_POSTGRES_HOST} \
		-e DEKART_CLOUD_STORAGE_BUCKET=${DEKART_CLOUD_STORAGE_BUCKET} \
		-e DEKART_BIGQUERY_PROJECT_ID=${DEKART_BIGQUERY_PROJECT_ID} \
		-e DEKART_BIGQUERY_MAX_BYTES_BILLED=53687091200 \
		-e DEKART_MAPBOX_TOKEN=${DEKART_MAPBOX_TOKEN} \
		-p 8080:8080 \
		dekartxyz/dekart:0.7
