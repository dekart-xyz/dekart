module dekart

go 1.17

require (
	cloud.google.com/go/bigquery v1.8.0
	cloud.google.com/go/storage v1.10.0
	github.com/golang-migrate/migrate/v4 v4.14.1
	github.com/golang/protobuf v1.4.3
	github.com/google/uuid v1.1.2
	github.com/googleapis/gax-go/v2 v2.0.5
	github.com/gorilla/mux v1.8.0
	github.com/improbable-eng/grpc-web v0.13.0
	github.com/lib/pq v1.9.0
	github.com/linkedin/goavro/v2 v2.10.1
	github.com/rs/zerolog v1.20.0
	google.golang.org/api v0.30.0
	google.golang.org/genproto v0.0.0-20201030142918-24207fddd1c3
	google.golang.org/grpc v1.33.1
	google.golang.org/protobuf v1.25.0
)

require github.com/pkg/errors v0.9.1 // indirect

require (
	cloud.google.com/go v0.64.0 // indirect
	github.com/desertbit/timer v0.0.0-20180107155436-c41aec40b27f // indirect
	github.com/golang/groupcache v0.0.0-20200121045136-8c9f03a8e57e // indirect
	github.com/golang/snappy v0.0.1 // indirect
	github.com/google/go-cmp v0.5.1 // indirect
	github.com/gorilla/websocket v1.4.2 // indirect
	github.com/hashicorp/errwrap v1.0.0 // indirect
	github.com/hashicorp/go-multierror v1.1.0 // indirect
	github.com/jstemmer/go-junit-report v0.9.1 // indirect
	github.com/mwitkow/go-conntrack v0.0.0-20190716064945-2f068394615f // indirect
	github.com/rs/cors v1.7.0 // indirect
	go.opencensus.io v0.22.4 // indirect
	golang.org/x/lint v0.0.0-20200302205851-738671d3881b // indirect
	golang.org/x/mod v0.3.0 // indirect
	golang.org/x/net v0.0.0-20201029221708-28c70e62bb1d // indirect
	golang.org/x/oauth2 v0.0.0-20200107190931-bf48bf16ab8d // indirect
	golang.org/x/sys v0.0.0-20201029080932-201ba4db2418 // indirect
	golang.org/x/text v0.3.3 // indirect
	golang.org/x/tools v0.0.0-20200818005847-188abfa75333 // indirect
	golang.org/x/xerrors v0.0.0-20200804184101-5ec99f83aff1 // indirect
	google.golang.org/appengine v1.6.6 // indirect
	gotest.tools/v3 v3.0.3
)

replace github.com/containerd/containerd => github.com/containerd/containerd v1.4.11
