FROM golang:1.14.1

ENV GOPATH=/home/root/go/
ENV PATH="${GOPATH}/bin:${PATH}"
ENV GO111MODULE="on"

RUN apt-get update
RUN apt-get install -y unzip
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get install -y nodejs

WORKDIR /home/root/


# getting protoc for correct platform;
ARG PLATFORM=x86_64 
RUN curl -OL https://github.com/protocolbuffers/protobuf/releases/download/v3.14.0/protoc-3.14.0-linux-${PLATFORM}.zip
RUN unzip -o protoc-3.14.0-linux-${PLATFORM}.zip -d /usr/local bin/protoc
RUN unzip -o protoc-3.14.0-linux-${PLATFORM}.zip -d /usr/local 'include/*'
RUN rm -f protoc-3.14.0-linux-${PLATFORM}.zip

# Install buf
RUN curl -sSL \
    "https://github.com/bufbuild/buf/releases/download/v0.33.0/buf-$(uname -s)-$(uname -m)" -o "/usr/local/bin/buf"
RUN chmod +x "/usr/local/bin/buf"

# Install protoc plugins
RUN go get google.golang.org/protobuf/cmd/protoc-gen-go
RUN go get google.golang.org/grpc/cmd/protoc-gen-go-grpc
RUN curl -OL https://github.com/protocolbuffers/protobuf/releases/download/v3.14.0/protobuf-js-3.14.0.zip
RUN unzip -o protobuf-js-3.14.0.zip -d ./protobuf-js-3.14.0
WORKDIR /home/root/protobuf-js-3.14.0
RUN npm install

RUN npm install -g ts-protoc-gen

WORKDIR /home/root/dekart