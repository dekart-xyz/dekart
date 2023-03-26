FROM node:16 as nodedeps
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

FROM nodedeps as nodebuilder
RUN npm run build

FROM nodedeps as nodetest
RUN npm run test

FROM golang:1.17 as godeps
WORKDIR /source
ADD go.mod .
ADD go.sum .
RUN go mod download -x
ADD src/proto src/proto
ADD src/server src/server

FROM godeps as gobuilder
RUN go build ./src/server

FROM godeps as gotest
RUN go test -v -count=1 ./src/server/**/

FROM cypress/included:12.8.1 as e2etest
WORKDIR /dekart
RUN apt-get update && apt-get install  -y \
    ca-certificates
RUN update-ca-certificates
ENV DEKART_PORT=3000
ENV DEKART_STATIC_FILES=./build
COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
ADD migrations migrations
ADD cypress cypress
ADD cypress.config.js .
ADD package.json .
ENTRYPOINT /bin/sh -c /dekart/server & cypress run --spec ${TEST_SPEC}

FROM ubuntu:18.04
WORKDIR /dekart
RUN apt-get update && apt-get install  -y \
    ca-certificates
RUN update-ca-certificates
COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
ADD migrations migrations
ENV DEKART_PORT=8080
ENV DEKART_STATIC_FILES=./build
CMD ["/dekart/server"]