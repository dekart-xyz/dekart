FROM node:16 AS nodedeps
WORKDIR /source
ADD package.json .
ADD package-lock.json .
ADD .npmrc .
ENV CI=true
RUN npm i --legacy-peer-deps
ADD public public
ADD src/client src/client
ADD src/proto src/proto
ADD src/index.js src/index.js
ADD src/setupTests.js src/setupTests.js

FROM nodedeps AS nodebuilder
RUN npm run build

FROM nodedeps AS nodetest
RUN npm run test

FROM golang:1.20 AS godeps

# Install necessary packages for CGO
RUN apt-get update && apt-get install -y gcc

WORKDIR /source
ADD go.mod .
ADD go.sum .
RUN go mod download -x
ADD src/proto src/proto
ADD src/server src/server

FROM godeps AS gobuilder
RUN CGO_ENABLED=1 go build ./src/server

FROM godeps AS gotest
RUN go test -v -count=1 ./src/server/**/

# Stage to get the required GLIBC version
FROM ubuntu:22.04 AS glibc
RUN apt-get update && apt-get install -y --no-install-recommends \
    libc6 \
    && rm -rf /var/lib/apt/lists/*

FROM cypress/included:12.17.1 AS e2etest
WORKDIR /dekart
RUN apt-get update && apt-get install  -y --no-install-recommends \
    gcc \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN update-ca-certificates

# Copy the required GLIBC libraries from the glibc stage
COPY --from=glibc /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6
COPY --from=glibc /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/libm.so.6
COPY --from=glibc /lib/x86_64-linux-gnu/libpthread.so.0 /lib/x86_64-linux-gnu/libpthread.so.0
COPY --from=glibc /lib/x86_64-linux-gnu/libdl.so.2 /lib/x86_64-linux-gnu/libdl.so.2

ENV DEKART_PORT=3000
ENV DEKART_STATIC_FILES=./build
COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
ADD migrations migrations
ADD sqlite sqlite
ADD cypress cypress
ADD cypress.config.js .
ADD package.json .

ENTRYPOINT /bin/sh -c /dekart/server & cypress run --spec ${TEST_SPEC}

FROM ubuntu:22.04
WORKDIR /dekart
RUN apt-get update && apt-get install  -y --no-install-recommends \
    gcc \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN update-ca-certificates
COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
ADD migrations migrations
ADD sqlite sqlite

# Create a user and group
ARG USERNAME=appuser
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd -g $USER_GID $USERNAME \
    && useradd -m -u $USER_UID -g $USERNAME -s /bin/bash $USERNAME

# Set environment variables
ENV DEKART_PORT=8080
ENV DEKART_STATIC_FILES=./build

# Change ownership of the working directory to the new user
RUN chown -R $USERNAME:$USERNAME /dekart

# Switch to the non-root user
USER $USERNAME

# Expose the necessary port
EXPOSE 8080

# Run the server
CMD ["/dekart/server"]