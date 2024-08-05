#!/bin/bash

# Variables
DB_NAME="dekart"
DB_USER="dekart"
DB_PASS="dekart"
BACKUP_DIR="/dekart/backup"
VOLUME_DIR="/dekart/backup-volume"

echo "Backup script starting..."
# Wait for a minute before starting to ensure that migrations are complete
sleep 60
echo "Backup script started."
chown postgres:postgres $BACKUP_DIR

# Run indefinitely
while true; do
    # Check if a backup was created in the last hour in VOLUME_DIR
    if [ -z "$(find $VOLUME_DIR -mmin -60 -type f)" ]; then
        # No backup was created in the last hour, so create a new one
        DATE=$(date +%Y%m%d%H%M)
        su - postgres -c "pg_dump -F t $DB_NAME > $BACKUP_DIR/db_backup_$DATE.tar"
        mv $BACKUP_DIR/db_backup_$DATE.tar $VOLUME_DIR/db_backup_$DATE.tar
        echo "Backup created at $VOLUME_DIR/db_backup_$DATE.tar"
    fi

    # Delete backups older than 7 days
    find $VOLUME_DIR -type f -mtime +7 -name '*.tar' -exec rm {} \;

    # Wait for 10 minutes before checking again
    sleep 600
done