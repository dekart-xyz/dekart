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

FROM golang:1.20 as godeps
WORKDIR /source
ADD go.mod .
ADD go.sum .
RUN go mod download -x
ADD src/proto src/proto
ADD src/server src/server

FROM godeps as gobuilder
RUN CGO_ENABLED=0 go build ./src/server

FROM godeps as gotest
RUN go test -v -count=1 ./src/server/**/

FROM cypress/included:12.17.1 as e2etest
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
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install  -y \
    postgresql-10 postgresql-contrib-10 \
    ca-certificates
RUN update-ca-certificates

COPY --from=nodebuilder /source/build build
COPY --from=gobuilder /source/server .
ADD migrations migrations

RUN mkdir -p /dekart/backup
RUN chown -R postgres:postgres /dekart/backup

VOLUME /dekart/backup-volume

USER postgres
RUN service postgresql start &&\
    psql --command "CREATE USER dekart WITH SUPERUSER PASSWORD 'dekart';" &&\
    createdb -O dekart dekart

USER root

ADD init.sh .
RUN chmod +x init.sh

ADD backup.sh .
RUN chmod +x backup.sh

ADD start.sh .
RUN chmod +x start.sh

# Create a non-root user 'appuser' and give ownership of necessary directories
RUN adduser --disabled-password --gecos "" appuser &&\
    chown -R appuser:appuser /dekart &&\
    chown -R appuser:appuser /dekart/migrations &&\
    chown appuser:appuser start.sh

# includes backup and restore scripts wich require root access
CMD [ "./init.sh" ]