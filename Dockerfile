FROM node:16 as nodedeps
WORKDIR /source
ADD package.json .
ADD package-lock.json .
ADD .npmrc .
ENV CI=true
RUN npm i --legacy-peer-deps
ADD public public
ADD src src

FROM nodedeps as nodebuilder
RUN npm run build

FROM nodedeps as nodetest
RUN npm run test

FROM golang:1.17 as godeps
WORKDIR /source
ADD go.mod .
ADD go.sum .
ADD src src

FROM godeps as gobuilder
RUN go build ./src/server

FROM godeps as gotest
RUN go test -v -count=1 ./src/server/**/

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