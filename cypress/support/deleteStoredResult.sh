#!/usr/bin/env bash
# Delete only the generated result verified against the E2E fixture's local metadata.
set -euo pipefail

if [[ $# != 1 || ! "$1" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo "Expected one generated result UUID" >&2
  exit 1
fi
case "${DEKART_POSTGRES_HOST:-}" in
  localhost|127.0.0.1|::1) ;;
  *) echo "Expected local test metadata" >&2; exit 1 ;;
esac
test "${DEKART_STORAGE:-}" = S3
: "${DEKART_CLOUD_STORAGE_BUCKET:?}" "${AWS_REGION:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"

token_args=()
if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
  token_args=(--header "x-amz-security-token: $AWS_SESSION_TOKEN")
fi
curl --fail --silent --show-error --request DELETE \
  --aws-sigv4 "aws:amz:${AWS_REGION}:s3" \
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
  --header 'x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' \
  "${token_args[@]}" \
  "${AWS_ENDPOINT:-https://s3.${AWS_REGION}.amazonaws.com}/${DEKART_CLOUD_STORAGE_BUCKET}/$1.csv"
