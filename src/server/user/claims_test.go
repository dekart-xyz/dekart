package user

import (
	"context"
	"fmt"
	"testing"
)

const testToken = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjBvZUxjUSJ9.eyJhdWQiOiIvcHJvamVjdHMvNjE0MDQ4NTMxNzcyL2FwcHMvZGVrYXJ0LXBsYXlncm91bmQiLCJlbWFpbCI6ImJpbG9uZW5rby52QGdtYWlsLmNvbSIsImV4cCI6MTYxMjI1MTQ1MSwiaWF0IjoxNjEyMjUwODUxLCJpc3MiOiJodHRwczovL2Nsb3VkLmdvb2dsZS5jb20vaWFwIiwic3ViIjoiYWNjb3VudHMuZ29vZ2xlLmNvbToxMTI3MTcxNDkyNDYzMjQ0MjgzNDQifQ.ZU6aaxxG4pP-otOXYPMmF3UyPUupzuwwwEL4hfdhR1pPspc-LatLQdFqNPskl19Hdp2VA4oKJ_Rb-m8--Eruzg"

func TestContext(t *testing.T) {
	t.Run("validateJWTFromAppEngine", func(t *testing.T) {
		ctx := context.Background()
		d := validateJWTFromAppEngine(ctx, testToken)
		fmt.Println(d)
	})
}
