#!/bin/bash

export DEKART_PORT=8080
export DEKART_STATIC_FILES=./build
export DEKART_POSTGRES_DB=dekart
export DEKART_POSTGRES_USER=dekart
export DEKART_POSTGRES_PASSWORD=dekart
export DEKART_POSTGRES_PORT=5432
export DEKART_POSTGRES_HOST=localhost

cd /dekart

/dekart/server