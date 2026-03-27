# syntax=docker/dockerfile:1.7

FROM node:18 AS nodedeps
WORKDIR /source
COPY package.json package-lock.json .npmrc ./
ENV CI=true
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY proto proto
RUN npm run proto-copy-to-node
COPY public public
COPY src/client src/client
COPY index.html .
COPY src/index.js src/index.js
COPY src/setupTests.js src/setupTests.js
COPY vitest.config.js vite.config.js ./

FROM nodedeps AS nodebuilder
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

FROM nodedeps AS nodetest
RUN npm run lint
RUN npm run test

FROM golang:1.24 AS godeps

# Install necessary packages for CGO
RUN apt-get update && apt-get install -y gcc

WORKDIR /source
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download -x
COPY src/proto src/proto
COPY src/server src/server

FROM godeps AS gobuilder
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 go build ./src/server

FROM godeps AS gotest
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go test -v -count=1 ./src/server/**/

FROM cypress/included:13.14.2 as e2etest
WORKDIR /dekart
RUN rm -f /etc/apt/sources.list.d/google-chrome.list \
    && rm -f /etc/apt/sources.list.d/microsoft-edge.list \
    && apt-get update \
    && apt-get install  -y --no-install-recommends \
    gcc \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN update-ca-certificates
ENV DEKART_PORT=3000
ENV DEKART_STATIC_FILES=./build
# ENV DEBUG=cypress:snapshot:error
COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
COPY migrations migrations
COPY sqlite sqlite
RUN mkdir -p keys
COPY keys/license-public.pem keys/license-public.pem
COPY cypress cypress
COPY cypress.config.js .
COPY package.json .
ENTRYPOINT /bin/sh -c /dekart/server & cypress run --spec ${TEST_SPEC}

FROM ubuntu:22.04
WORKDIR /dekart
RUN apt-get clean && apt-get update --allow-releaseinfo-change && apt-get install -y --no-install-recommends \
    gcc \
    ca-certificates \
    && apt-get -y autoremove && apt-get -y autoclean \
    && rm -rf /var/lib/apt/lists/*
RUN update-ca-certificates
COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
COPY migrations migrations
COPY sqlite sqlite
RUN mkdir -p keys
COPY keys/license-public.pem keys/license-public.pem

# Create a user and group
ARG USERNAME=appuser
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd -g $USER_GID $USERNAME \
    && useradd -m -u $USER_UID -g $USERNAME -s /bin/bash $USERNAME

# Set environment variables
ENV DEKART_PORT=8080
ENV DEKART_STATIC_FILES=./build
ARG DEKART_UX_DISABLE_VERSION_CHECK
ARG DEKART_LICENSE_KEY
ENV DEKART_UX_DISABLE_VERSION_CHECK=${DEKART_UX_DISABLE_VERSION_CHECK}
ENV DEKART_LICENSE_KEY=${DEKART_LICENSE_KEY}

# Change ownership of the working directory to the new user
RUN chown -R $USERNAME:$USERNAME /dekart

# Switch to the non-root user
USER $USERNAME

# Expose the necessary port
EXPOSE 8080

# Run the server
CMD ["/dekart/server"]
