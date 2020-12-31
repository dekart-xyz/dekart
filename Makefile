proto-build: #to run inside docker
	rm -rf ./src/proto/
	protoc --js_out=import_style=commonjs,binary:./src $$(find proto -type f -name "*.proto")
	protoc --ts_out=service=grpc-web:./src $$(find proto -type f -name "*.proto")
	protoc --go_out=./src $$(find proto -type f -name "*.proto")
	protoc --go-grpc_out=./src $$(find proto -type f -name "*.proto")

proto-docker: # build docker container for building protos
	docker build -t dekart-proto -f ./proto/Dockerfile .

.PHONY: proto
proto: proto-docker # build proto stubs
	docker run -it --rm \
		-v $$(pwd):/home/root/dekart \
		dekart-proto \
		make proto-build

docker:
	docker build -t dekart-dev -f ./Dockerfile .