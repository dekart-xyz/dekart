package pgjob_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/pgjob"
	"dekart/src/server/user"
)

// An unreachable host must not outlive the caller's connection-test deadline.
func TestConnectionHonorsDeadline(t *testing.T) {
	t.Setenv("DEKART_DATASOURCE", "PG")
	t.Setenv("DEKART_POSTGRES_DATASOURCE_CONNECTION",
		"host=192.0.2.1 port=50634 user=postgres password=invalid dbname=railway sslmode=require")
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{})
	ctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()

	done := make(chan *proto.TestConnectionResponse, 1)
	go func() {
		response, err := pgjob.TestConnection(ctx, &proto.TestConnectionRequest{
			Connection: &proto.Connection{ConnectionType: proto.ConnectionType_CONNECTION_TYPE_POSTGRES},
		})
		if err != nil {
			done <- nil
			return
		}
		done <- response
	}()

	select {
	case response := <-done:
		if response == nil || response.Success || !strings.Contains(response.Error, "192.0.2.1:50634") {
			t.Fatalf("expected the unreachable host in the connection error, got %v", response)
		}
	case <-time.After(time.Second):
		t.Fatal("connection test did not return after its caller deadline")
	}
}
