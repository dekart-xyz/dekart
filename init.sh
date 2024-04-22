#!/bin/bash
set -e

service postgresql start
su - postgres -c "psql -d postgres -c \"SELECT pg_switch_wal();\""
su - postgres -c "pgbackrest --stanza=main --log-level-console=info stanza-create"
/dekart/server