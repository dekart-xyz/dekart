FROM node:16 as nodebuilder
WORKDIR /source
ADD package.json .
ADD package-lock.json .
ADD .npmrc .
RUN npm i --legacy-peer-deps
ADD public public
ADD src src
RUN npm run build

FROM golang:1.17 as gobuilder
WORKDIR /source
ADD go.mod .
ADD go.sum .
ADD src src
RUN go build ./src/server

# FROM scratch
FROM ubuntu:18.04

WORKDIR /dekart

RUN apt-get update
RUN apt-get install ca-certificates -y
RUN update-ca-certificates

COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
ADD migrations migrations

ENV DEKART_PORT=8080
ENV DEKART_STATIC_FILES=./build

CMD ["/dekart/server"]