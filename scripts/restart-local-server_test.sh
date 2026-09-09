#!/bin/sh

set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
subject="$script_dir/restart-local-server.sh"
fixture_dir="$(mktemp -d)"
server_pid=""
listener_pid=""

# Stop only disposable processes created by this test and preserve its status.
cleanup() {
    exit_code=$?
    trap - EXIT
    # The compiled listener may still outlive its go run parent.
    if [ -n "$listener_pid" ]; then
        kill "$listener_pid" 2>/dev/null || true
    fi
    # Reap the go run parent so it cannot leak into later tests.
    if [ -n "$server_pid" ]; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    rm -rf "$fixture_dir"
    exit "$exit_code"
}
trap cleanup EXIT

# Build the minimal directory shape recognized as a Dekart clone.
create_clone() {
    clone_dir="$1"
    mkdir -p "$clone_dir/src/server"
    cp "$fixture_dir/listener.go" "$clone_dir/src/server/main.go"
}

# Start a disposable go run parent and capture its listener port and PID.
start_server() {
    clone_dir="$1"
    port_file="$clone_dir/port"
    (cd "$clone_dir" && exec go run ./src/server/main.go "$port_file") &
    server_pid=$!

    attempts=0
    while [ ! -s "$port_file" ] && [ "$attempts" -lt 100 ]; do
        sleep 0.1
        attempts=$((attempts + 1))
    done
    # Fail clearly instead of testing against an uninitialized process.
    if [ ! -s "$port_file" ]; then
        echo "test server did not start"
        exit 1
    fi

    port="$(cat "$port_file")"
    listener_pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN)"
}

cat > "$fixture_dir/listener.go" <<'EOF'
package main

import (
    "net"
    "os"
    "strconv"
)

// Start a listener and publish its ephemeral port for the shell test.
func main() {
    listener, err := net.Listen("tcp", "127.0.0.1:0")
    // A missing listener makes the process-topology test meaningless.
    if err != nil {
        panic(err)
    }
    port := listener.Addr().(*net.TCPAddr).Port
    // Publish only after the listener is ready to be inspected.
    if err := os.WriteFile(os.Args[1], []byte(strconv.Itoa(port)), 0600); err != nil {
        panic(err)
    }
    for {
        connection, err := listener.Accept()
        if err != nil {
            panic(err)
        }
        connection.Close()
    }
}
EOF

owned_clone="$fixture_dir/owned"
create_clone "$owned_clone"
start_server "$owned_clone"
"$subject" "$port" "$owned_clone"
wait "$server_pid" 2>/dev/null || true
server_pid=""
listener_pid=""

# A stopped server leaves a free port, which must also pass the preflight.
"$subject" "$port" "$owned_clone"

other_clone="$fixture_dir/other"
create_clone "$other_clone"
start_server "$other_clone"
# The safety boundary must leave an identical server from another clone alive.
if "$subject" "$port" "$owned_clone"; then
    echo "expected another clone's listener to be refused"
    exit 1
fi
kill -0 "$server_pid"
lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null
