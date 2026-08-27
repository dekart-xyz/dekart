# DuckDB extension assets

These signed WebAssembly extensions are the official DuckDB v1.4.3 builds that
match `@duckdb/duckdb-wasm` 1.32.0:

- `parquet-eh.duckdb_extension.wasm` from
  `https://extensions.duckdb.org/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm`
  (SHA-256 `22765c8f7dc741cda2b571a66ac7bb355295d7d69a6c37e5315b265672984f55`)
- `parquet-mvp.duckdb_extension.wasm` from
  `https://extensions.duckdb.org/v1.4.3/wasm_mvp/parquet.duckdb_extension.wasm`
  (SHA-256 `0785c6c95d003eff4faa7b3b4b660f02c9c92f6d68d135ddf330d42e3a650600`)
- `spatial-eh.duckdb_extension.wasm` from
  `https://extensions.duckdb.org/v1.4.3/wasm_eh/spatial.duckdb_extension.wasm`
  (SHA-256 `04b776946da64a15a7b14501790c75093e38f876acc46b2922f0daeb6aaa1d60`)
- `spatial-mvp.duckdb_extension.wasm` from
  `https://extensions.duckdb.org/v1.4.3/wasm_mvp/spatial.duckdb_extension.wasm`
  (SHA-256 `7a745cfc5259f69b46f077bc6afeb7a6aefb8ef8d8b336bb0b770e5449708bb4`)

They are bundled so browser-local GeoJSON queries never fetch an extension
from a CDN or other external runtime service.
