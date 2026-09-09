#!/bin/sh

set -eu

port="$1"
clone_dir="$(CDPATH= cd -- "$2" && pwd -P)"
pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"

# A free port needs no restart work.
if [ -z "$pids" ]; then
    exit 0
fi

server_pids=""
for pid in $pids; do
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    parent_pid="$(ps -p "$pid" -o ppid= | tr -d ' ')"
    parent_command="$(ps -p "$parent_pid" -o command=)"

    # Only a listener spawned by this clone's make server is safe to restart.
    if [ "$cwd" = "$clone_dir" ] && echo "$parent_command" | grep -Eq '(^|[[:space:]])go run (\./)?src/server/main\.go([[:space:]]|$)'; then
        server_pids="$server_pids $parent_pid $pid"
    else
        echo "Port $port is already in use by PID $pid outside this clone's make server"
        echo "Refusing to stop Docker, another clone, or an unrelated process"
        exit 1
    fi
done

echo "Stopping this clone's existing make server on port $port..."
kill $server_pids 2>/dev/null || true

attempts=0
while lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && [ "$attempts" -lt 50 ]; do
    sleep 0.1
    attempts=$((attempts + 1))
done

# Do not start a competing server if the owned listener resisted termination.
if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Existing make server did not stop"
    exit 1
fi
