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

docker-compose-up:
	docker-compose  --env-file .env up

docker-compose-rm:
	docker-compose rm

run-dev-server:
	godotenv -f .env go run ./src/server/main.go

cloud-sql-proxy-docker:
	docker build -t cloud-sql-proxy -f ./cloud_sql_proxy/Dockerfile .

cloud-sql-proxy: cloud-sql-proxy-docker
	godotenv -f .env docker run -it --rm \
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