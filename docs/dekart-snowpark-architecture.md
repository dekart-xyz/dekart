# Dekart Snowpark Architecture

## System Architecture

```mermaid
graph TB
    subgraph "External Services"
        MapboxAPI[Mapbox API<br/>api.mapbox.com<br/>Base Map Tiles]
    end

    subgraph "User Browser"
        Browser[Web Browser<br/>Kepler.gl Map Renderer]
    end

    subgraph "Snowflake Account - Consumer"
        subgraph "Snowpark Container Service"
            subgraph "Dekart Container"
                DekartApp[Dekart Application<br/>Go Backend + React Frontend]
                SQLiteDB[(SQLite Database<br/>./dekart.db<br/>Reports, Queries, Datasets,<br/>Connections, Users)]
            end
        end

        subgraph "Application Objects"
            AppStage[(app_public.app_state_stage<br/>SQLite Backups Only)]
            AppService[app_public.st_spcs<br/>Container Service]
        end

        subgraph "Consumer Resources"
            ComputePool[Compute Pool<br/>CPU_X64_XS]
            Warehouse[Warehouse<br/>wh_dekart]
            UserData[(User Databases<br/>Query Execution)]
        end
    end

    %% User interactions
    Browser -->|1. HTTP/gRPC Requests| AppService
    AppService -->|Routes to| DekartApp
    Browser -->|2. Receive Query Results| DekartApp
    Browser -->|3. Request Map Tiles| MapboxAPI
    MapboxAPI -->|4. Return Map Tiles| Browser

    %% SQLite workflow
    DekartApp -->|Read/Write Metadata| SQLiteDB
    DekartApp -->|Backup Every 5min| AppStage
    AppStage -->|Restore on Startup| SQLiteDB

    %% Query execution
    DekartApp -->|Execute SQL| UserData
    UserData -->|Return Query ID| DekartApp
    DekartApp -->|Fetch by Query ID<br/>No CSV Storage| UserData
    DekartApp -->|Stream CSV| Browser

    %% Snowpark entities
    AppService -->|Runs on| ComputePool
    AppService -->|Uses| Warehouse

    %% Styling
    classDef userClass fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef containerClass fill:#29b5e8,stroke:#0d47a1,stroke-width:2px
    classDef snowflakeClass fill:#4caf50,stroke:#1b5e20,stroke-width:2px
    classDef externalClass fill:#ffeb3b,stroke:#f57f17,stroke-width:2px

    class Browser userClass
    class DekartApp,SQLiteDB containerClass
    class AppStage,AppService,ComputePool,Warehouse,UserData snowflakeClass
    class MapboxAPI externalClass
```

## SQLite Workflow

### Purpose
SQLite stores all application metadata:
- **Reports**: Map configurations, titles, descriptions
- **Queries**: SQL text, parameters, job status
- **Datasets**: Links between queries/files and reports
- **Connections**: Data source configurations
- **Users**: User permissions and settings

### Backup & Restore Process

```mermaid
sequenceDiagram
    participant SQLite as SQLite DB<br/>./dekart.db
    participant Dekart as Dekart App
    participant Stage as Snowflake Stage<br/>app_public.app_state_stage

    Note over SQLite,Stage: Startup - Restore Process
    Dekart->>Stage: LIST @app_state_stage<br/>pattern='.*backup'
    Stage-->>Dekart: List backup files
    Dekart->>Dekart: Find latest backup<br/>(by timestamp)
    alt Latest backup found
        Dekart->>Stage: GET @app_state_stage/{backup_file}<br/>file:///dekart/
        Stage-->>Dekart: Download backup
        Dekart->>SQLite: Rename to ./dekart.db
        Note over SQLite: Database restored
    else No backup found
        Note over SQLite: Create new database
    end

    Note over SQLite,Stage: Runtime - Backup Process (Every 5 minutes)
    loop Every 5 minutes
        Dekart->>SQLite: VACUUM INTO backup file<br/>(timestamped)
        SQLite-->>Dekart: Backup created
        Dekart->>Stage: PUT file://backup<br/>@app_state_stage<br/>auto_compress=false
        Stage-->>Dekart: Backup uploaded
        Dekart->>Dekart: Delete local backup file
        Dekart->>Stage: Remove backups older than 7 days
    end
```

### Key Configuration

- **Database Path**: `DEKART_SQLITE_DB_PATH=./dekart.db`
- **Stage Location**: `DEKART_SNOWFLAKE_STAGE=app_public.app_state_stage`
- **Backup Frequency**: `DEKART_BACKUP_FREQUENCY_MIN=5` (default: 5 minutes)
- **Backup Retention**: `DEKART_MAX_BACKUPS_AGE_DAYS=7` (default: 7 days)

### Backup File Format
- **Pattern**: `dekart.db_YYYYMMDD_HHMMSS.backup`
- **Storage**: Snowflake Stage (not in container filesystem)
- **Method**: SQLite `VACUUM INTO` command (creates clean copy)

## Snowflake Result Serving

### Efficient Query Result Storage

When `DEKART_STORAGE=SNOWFLAKE`, query results are **NOT** written to CSV files in a stage. Instead:

```mermaid
sequenceDiagram
    participant User as User Browser
    participant Dekart as Dekart App
    participant Snowflake as Snowflake Database

    Note over User,Snowflake: Query Execution
    User->>Dekart: Submit SQL Query
    Dekart->>Snowflake: Execute Query<br/>WithQueryIDChan()
    Snowflake-->>Dekart: Query ID + Results

    Note over Dekart,Snowflake: Result Storage Strategy
    alt Snowflake Storage Mode
        Dekart->>Dekart: Store Query ID only<br/>(No CSV write)
        Note over Dekart: Results stay in<br/>Snowflake temp storage
    else Other Storage Mode
        Dekart->>Dekart: Stream rows to CSV<br/>Write to storage
    end

    Note over User,Snowflake: Result Retrieval
    User->>Dekart: Request Query Results
    Dekart->>Snowflake: FetchResultByID(queryID)<br/>WithStreamDownloader()
    Snowflake-->>Dekart: Stream CSV rows
    Dekart-->>User: Stream CSV via gRPC
```

### Benefits of Snowflake Storage Mode

1. **No Duplication**: Results stay in Snowflake's temporary result storage
2. **No Stage I/O**: No need to write/read CSV files
3. **Automatic Cleanup**: Snowflake manages result expiration
4. **Efficient Streaming**: Direct fetch by Query ID with streaming

### Implementation Details

- **Storage Object**: `SnowflakeStorageObject` (stores Query ID only)
- **Reader**: Uses `WithFetchResultByID()` and `WithStreamDownloader()`
- **Expiration**: Snowflake automatically expires results (error 612)
- **Code Reference**: `src/server/storage/snowflakestorage.go`

## Snowpark Entities

### Application Instance (Consumer Account)

```mermaid
graph TB
    AppInst[Application Instance<br/>dekart_app_instance]
    AppSchema[app_public Schema]
    Stage[app_state_stage]
    Service[st_spcs Service]
    Proc[Stored Procedures]

    AppInst --> AppSchema
    AppSchema --> Stage
    AppSchema --> Service
    AppSchema --> Proc
```

**Created Objects**:
- **Application Instance**: `dekart_app_instance` (installed from package)
- **Schema**: `app_public` (application-owned schema)
- **Stage**: `app_public.app_state_stage` (for SQLite backups)
- **Service**: `app_public.st_spcs` (container service)
- **Procedures**: `v1.start_service()`, `v1.init()`, etc.

### Consumer Resources

**Compute Pool**:
- **Name**: `service_compute_pool` (or custom)
- **Size**: `CPU_X64_XS` (minimum)
- **Nodes**: `MIN_NODES=1, MAX_NODES=1`
- **Purpose**: Runs Dekart container

**Warehouse**:
- **Name**: `wh_dekart` (or custom)
- **Size**: `XSMALL`
- **Purpose**: Executes SQL queries and manages stage operations

**External Access Integration**:
- **Name**: `MAPBOX_EAI` (optional, for map tiles)
- **Network Rule**: Allows egress to `api.mapbox.com`
- **Purpose**: Enables Mapbox API access from container

### Application Roles

- **`app_admin`**: Full access (backup/restore, service management)
- **`app_user`**: Read access (view reports, execute queries)

### Service Endpoints

- **Service**: `app_public.st_spcs`
- **Endpoint**: `app` (port 8080)
- **Public**: Yes (accessible via Snowflake-provided URL)

## Complete Data Flow

```mermaid
sequenceDiagram
    participant User as User Browser
    participant Service as Container Service<br/>st_spcs
    participant Dekart as Dekart App
    participant SQLite as SQLite DB
    participant Snowflake as Snowflake DB
    participant Stage as app_state_stage

    Note over User,Stage: Report Creation
    User->>Service: Create Report
    Service->>Dekart: gRPC Request
    Dekart->>SQLite: INSERT INTO reports
    SQLite-->>Dekart: Report ID
    Dekart-->>User: Report Created

    Note over User,Stage: Query Execution
    User->>Service: Execute SQL Query
    Service->>Dekart: Run Query
    Dekart->>Snowflake: Execute Query
    Snowflake-->>Dekart: Query ID + Metadata
    Dekart->>SQLite: INSERT INTO query_jobs<br/>(store Query ID)
    Dekart->>Snowflake: FetchResultByID(queryID)
    Snowflake-->>Dekart: Stream CSV rows
    Dekart-->>User: Stream CSV via gRPC

    Note over User,Stage: Backup Process
    loop Every 5 minutes
        Dekart->>SQLite: VACUUM INTO backup
        SQLite-->>Dekart: Backup file
        Dekart->>Stage: PUT backup file
        Stage-->>Dekart: Uploaded
    end
```

## Key Configuration Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DEKART_STORAGE` | Storage backend | `SNOWFLAKE` |
| `DEKART_DATASOURCE` | Data source type | `SNOWFLAKE` |
| `DEKART_SQLITE_DB_PATH` | SQLite file path | `./dekart.db` |
| `DEKART_SNOWFLAKE_STAGE` | Backup stage location | `app_public.app_state_stage` |
| `DEKART_BACKUP_FREQUENCY_MIN` | Backup interval | `5` |
| `DEKART_REQUIRE_SNOWFLAKE_CONTEXT` | Enforce Snowflake auth | `1` |

## Map Provider Note

**Mapbox** (optional):
- **Token**: `DEKART_MAPBOX_TOKEN` (required for base maps)
- **Usage**: Base map tiles only (no user data transmitted)
- **Alternative**: "No-basemap" option available
- **Network**: Requires External Access Integration for `api.mapbox.com`

