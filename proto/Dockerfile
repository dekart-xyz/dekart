FROM golang:1.14.1

ENV GOPATH=/home/root/go/
ENV PATH="${GOPATH}/bin:${PATH}"
ENV GO111MODULE="on"

RUN apt-get update
RUN apt-get install -y unzip
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get install -y nodejs

WORKDIR /home/root/

# Install protoc compiler
RUN curl -OL https://github.com/protocolbuffers/protobuf/releases/download/v3.14.0/protoc-3.14.0-linux-x86_64.zip
RUN unzip -o protoc-3.14.0-linux-x86_64.zip -d /usr/local bin/protoc
RUN unzip -o protoc-3.14.0-linux-x86_64.zip -d /usr/local 'include/*'
RUN rm -f protoc-3.14.0-linux-x86_64.zip

# Install buf
RUN curl -sSL \
    "https://github.com/bufbuild/buf/releases/download/v0.33.0/buf-$(uname -s)-$(uname -m)" -o "/usr/local/bin/buf"
RUN chmod +x "/usr/local/bin/buf"

# RUN curl -sSL "https://github.com/bufbuild/buf/releases/download/v${BUF_VERSION}/buf-Linux-x86_64" \
#         -o "/usr/local/bin/buf" \
#     && chmod +x "/usr/local/bin/buf"

# Install protoc plugins
# RUN python -m pip install grpcio==1.19.0 grpcio-tools==1.19.0
RUN go get google.golang.org/protobuf/cmd/protoc-gen-go
RUN go get google.golang.org/grpc/cmd/protoc-gen-go-grpc

RUN curl -OL https://github.com/protocolbuffers/protobuf/releases/download/v3.14.0/protobuf-js-3.14.0.zip
RUN unzip -o protobuf-js-3.14.0.zip -d ./protobuf-js-3.14.0
WORKDIR /home/root/protobuf-js-3.14.0
RUN npm install

RUN curl -OL https://github.com/grpc/grpc-web/releases/download/1.2.1/protoc-gen-grpc-web-1.2.1-linux-x86_64
RUN mv protoc-gen-grpc-web-1.2.1-linux-x86_64 /usr/local/bin/protoc-gen-grpc-web
RUN chmod +x /usr/local/bin/protoc-gen-grpc-web
# RUN unzip -o protoc-gen-grpc-web-1.2.1-linux-x86_64 -d ./protobuf-js-3.14.0




WORKDIR /home/root/dekart