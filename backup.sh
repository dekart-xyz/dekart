#!/bin/bash

# Variables
DB_NAME="dekart"
DB_USER="dekart"
DB_PASS="dekart"
BACKUP_DIR="/dekart/backup"
DATE=$(date +%Y%m%d%H%M)
VOLUME_DIR="/dekart/backup-volume"

# Export the PostgreSQL password so that pg_dump does not prompt for it.
# export PGPASSWORD=$DB_PASS

# Backup the PostgreSQL database using pg_dump.
# pg_dump -U $DB_USER -F t $DB_NAME > $BACKUP_DIR/db_backup_$DATE.tar
su - postgres -c "pg_dump -F t $DB_NAME > $BACKUP_DIR/db_backup_$DATE.tar"
mv $BACKUP_DIR/db_backup_$DATE.tar $VOLUME_DIR/db_backup_$DATE.tar



# Unset the PostgreSQL password environment variable.
# unset PGPASSWORD

echo "Backup created at $BACKUP_DIR/db_backup_$DATE.tar"