proto-build:
	rm -rf ./src/proto/
	protoc --js_out=import_style=commonjs,binary:./src $$(find proto -type f -name "*.proto")
	protoc --ts_out=service=grpc-web:./src $$(find proto -type f -name "*.proto")
	# protoc --grpc-web_out=import_style=commonjs,mode=grpcwebtext:./src $$(find proto -type f -name "*.proto")
	protoc --go_out=./src $$(find proto -type f -name "*.proto")
	protoc --go-grpc_out=./src $$(find proto -type f -name "*.proto")

proto-docker:
	docker build -t dekart-proto -f ./proto/Dockerfile .

.PHONY: proto
proto: proto-docker
	docker run -it --rm \
		-v $$(pwd):/home/root/dekart \
		dekart-proto \
		make proto-build
