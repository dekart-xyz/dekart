proto-build:
	rm -rf ./proto/js
	rm -rf ./proto/go
	mkdir -p ./proto/js
	mkdir -p ./proto/go
	protoc --js_out=import_style=commonjs,binary:./proto/js/ $$(find proto -type f -name "*.proto")
	protoc --grpc-web_out=import_style=commonjs,mode=grpcwebtext:./proto/js/ $$(find proto -type f -name "*.proto")
	protoc --go_out=./proto/go/ $$(find proto -type f -name "*.proto")
	protoc --go-grpc_out=./proto/go/ $$(find proto -type f -name "*.proto")

proto-docker:
	docker build -t dekart-proto -f ./proto/Dockerfile .

.PHONY: proto
proto: proto-docker
	docker run -it --rm \
		-v $$(pwd):/home/root/dekart \
		dekart-proto \
		make proto-build
