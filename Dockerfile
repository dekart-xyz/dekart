FROM node:14 as nodebuilder
WORKDIR /source
ADD package.json .
ADD package-lock.json .
RUN npm i
ADD public public
ADD src src
RUN npm run build

FROM golang:1.15 as gobuilder
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
RUN mkdir ./.query-reults

ENV DEKART_PORT=8080
ENV DEKART_STATIC_FILES=./build
ENV DEKART_QUERY_RESULTS=./.query-reults

CMD ["/dekart/server"]