FROM golang:1.20

ENV GOPATH=/home/root/go/
ENV PATH="${GOPATH}/bin:${PATH}"
ENV GO111MODULE="on"

RUN apt-get update
RUN apt-get install -y unzip curl

# Install Node.js 16.20.2
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt-get install -y nodejs=16.20.2-1nodesource1

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
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Install protobuf JavaScript library using npm
RUN mkdir -p /home/root/protobuf-js
WORKDIR /home/root/protobuf-js
RUN npm install google-protobuf

RUN npm install -g ts-protoc-gen

WORKDIR /home/root/dekart