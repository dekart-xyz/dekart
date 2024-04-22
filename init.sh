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

restore() {
    DB_NAME="dekart"
    DB_USER="dekart"
    DB_PASS="dekart"
    BACKUP_DIR="/dekart/backup"
    VOLUME_DIR="/dekart/backup-volume"
    LATEST_BACKUP=$(ls -t $VOLUME_DIR | head -n 1)

    if [ -z "$LATEST_BACKUP" ]; then
        echo "No backup found."
    else
        echo "Restoring from $LATEST_BACKUP..."
        cp $VOLUME_DIR/$LATEST_BACKUP $BACKUP_DIR/$LATEST_BACKUP
        chown postgres:postgres $BACKUP_DIR/$LATEST_BACKUP
        su - postgres -c "pg_restore -d $DB_NAME -1 $BACKUP_DIR/$LATEST_BACKUP"
        echo "Restore complete."
    fi
}

restore

/dekart/server