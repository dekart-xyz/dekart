module dekart

go 1.17

require (
	cloud.google.com/go/bigquery v1.43.0
	cloud.google.com/go/storage v1.28.0
	github.com/aws/aws-sdk-go v1.17.7
	github.com/golang-jwt/jwt v3.2.1+incompatible // supports old JWT specifications
	github.com/golang-migrate/migrate/v4 v4.15.2
	github.com/google/uuid v1.3.0
	github.com/googleapis/gax-go/v2 v2.7.0
	github.com/gorilla/mux v1.8.0
	github.com/improbable-eng/grpc-web v0.13.0
	github.com/lib/pq v1.10.0
	github.com/linkedin/goavro/v2 v2.12.0
	github.com/rs/zerolog v1.20.0
	golang.org/x/sync v0.1.0
	google.golang.org/api v0.103.0
	google.golang.org/genproto v0.0.0-20221109142239-94d6d90a7d66
	google.golang.org/grpc v1.50.1
	google.golang.org/protobuf v1.28.1
)

require github.com/stretchr/testify v1.8.1

require (
	cloud.google.com/go v0.106.0 // indirect
	cloud.google.com/go/compute v1.12.1 // indirect
	cloud.google.com/go/compute/metadata v0.2.1 // indirect
	cloud.google.com/go/iam v0.7.0 // indirect
	github.com/andybalholm/brotli v1.0.4 // indirect
	github.com/apache/arrow/go/v10 v10.0.0 // indirect
	github.com/apache/thrift v0.16.0 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/dgryski/go-farm v0.0.0-20200201041132-a6ae2369ad13 // indirect
	github.com/dlclark/regexp2 v1.7.0 // indirect
	github.com/dop251/goja v0.0.0-20221118162653-d4bf6fde1b86 // indirect
	github.com/fatih/color v1.10.0 // indirect
	github.com/go-playground/locales v0.14.0 // indirect
	github.com/go-playground/universal-translator v0.18.0 // indirect
	github.com/go-playground/validator/v10 v10.11.0 // indirect
	github.com/go-sourcemap/sourcemap v2.1.3+incompatible // indirect
	github.com/goccy/go-json v0.10.0 // indirect
	github.com/goccy/go-yaml v1.9.5 // indirect
	github.com/goccy/go-zetasql v0.5.1 // indirect
	github.com/goccy/go-zetasqlite v0.11.6 // indirect
	github.com/golang/groupcache v0.0.0-20210331224755-41bb18bfe9da // indirect
	github.com/golang/protobuf v1.5.2 // indirect
	github.com/golang/snappy v0.0.4 // indirect
	github.com/google/flatbuffers v2.0.8+incompatible // indirect
	github.com/google/go-cmp v0.5.9 // indirect
	github.com/googleapis/enterprise-certificate-proxy v0.2.0 // indirect
	github.com/gorilla/websocket v1.4.2 // indirect
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	github.com/jmespath/go-jmespath v0.4.0 // indirect
	github.com/klauspost/asmfmt v1.3.2 // indirect
	github.com/klauspost/compress v1.15.9 // indirect
	github.com/klauspost/cpuid/v2 v2.0.9 // indirect
	github.com/leodido/go-urn v1.2.1 // indirect
	github.com/mattn/go-colorable v0.1.12 // indirect
	github.com/mattn/go-isatty v0.0.16 // indirect
	github.com/mattn/go-runewidth v0.0.9 // indirect
	github.com/mattn/go-sqlite3 v1.14.14 // indirect
	github.com/minio/asm2plan9s v0.0.0-20200509001527-cdd76441f9d8 // indirect
	github.com/minio/c2goasm v0.0.0-20190812172519-36a3d3bbc4f3 // indirect
	github.com/olekukonko/tablewriter v0.0.5 // indirect
	github.com/pierrec/lz4/v4 v4.1.15 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/segmentio/encoding v0.3.5 // indirect
	github.com/segmentio/parquet-go v0.0.0-20221020201645-63215c8128ff // indirect
	github.com/zeebo/xxh3 v1.0.2 // indirect
	go.opencensus.io v0.24.0 // indirect
	go.uber.org/multierr v1.6.0 // indirect
	go.uber.org/zap v1.21.0 // indirect
	golang.org/x/crypto v0.0.0-20211215153901-e495a2d5b3d3 // indirect
	golang.org/x/mod v0.6.0-dev.0.20220419223038-86c51ed26bb4 // indirect
	golang.org/x/net v0.1.0 // indirect
	golang.org/x/oauth2 v0.0.0-20221014153046-6fdb5e3db783 // indirect
	golang.org/x/sys v0.1.0 // indirect
	golang.org/x/text v0.4.0 // indirect
	golang.org/x/tools v0.1.12 // indirect
	golang.org/x/xerrors v0.0.0-20220907171357-04be3eba64a2 // indirect
	gonum.org/v1/gonum v0.11.0 // indirect
	google.golang.org/appengine v1.6.7 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

require (
	github.com/goccy/bigquery-emulator v0.2.6
	go.uber.org/atomic v1.10.0 // indirect
)

require (
	github.com/desertbit/timer v0.0.0-20180107155436-c41aec40b27f // indirect
	github.com/rs/cors v1.7.0 // indirect
	gotest.tools/v3 v3.1.0
)

replace (
	github.com/containerd/containerd => github.com/containerd/containerd v1.6.1
	github.com/gogo/protobuf v1.3.1 => github.com/gogo/protobuf v1.3.2
)
