#!/bin/bash

# Define a function to run ./backup.sh
backup() {
    service cron stop
    /dekart/backup.sh
    service postgresql stop
    pkill -f "/dekart/server"
    exit 0
}


# Set the trap
trap backup SIGTERM SIGINT

service postgresql start

/dekart/server