// package: 
// file: proto/dekart.proto

import * as jspb from "google-protobuf";

export class GetGcpProjectListRequest extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetGcpProjectListRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetGcpProjectListRequest): GetGcpProjectListRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetGcpProjectListRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetGcpProjectListRequest;
  static deserializeBinaryFromReader(message: GetGcpProjectListRequest, reader: jspb.BinaryReader): GetGcpProjectListRequest;
}

export namespace GetGcpProjectListRequest {
  export type AsObject = {
  }
}

export class GetGcpProjectListResponse extends jspb.Message {
  clearProjectsList(): void;
  getProjectsList(): Array<string>;
  setProjectsList(value: Array<string>): void;
  addProjects(value: string, index?: number): string;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetGcpProjectListResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetGcpProjectListResponse): GetGcpProjectListResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetGcpProjectListResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetGcpProjectListResponse;
  static deserializeBinaryFromReader(message: GetGcpProjectListResponse, reader: jspb.BinaryReader): GetGcpProjectListResponse;
}

export namespace GetGcpProjectListResponse {
  export type AsObject = {
    projectsList: Array<string>,
  }
}

export class SetDefaultConnectionRequest extends jspb.Message {
  getConnectionId(): string;
  setConnectionId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SetDefaultConnectionRequest.AsObject;
  static toObject(includeInstance: boolean, msg: SetDefaultConnectionRequest): SetDefaultConnectionRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: SetDefaultConnectionRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SetDefaultConnectionRequest;
  static deserializeBinaryFromReader(message: SetDefaultConnectionRequest, reader: jspb.BinaryReader): SetDefaultConnectionRequest;
}

export namespace SetDefaultConnectionRequest {
  export type AsObject = {
    connectionId: string,
  }
}

export class SetDefaultConnectionResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SetDefaultConnectionResponse.AsObject;
  static toObject(includeInstance: boolean, msg: SetDefaultConnectionResponse): SetDefaultConnectionResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: SetDefaultConnectionResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SetDefaultConnectionResponse;
  static deserializeBinaryFromReader(message: SetDefaultConnectionResponse, reader: jspb.BinaryReader): SetDefaultConnectionResponse;
}

export namespace SetDefaultConnectionResponse {
  export type AsObject = {
  }
}

export class RunAllQueriesRequest extends jspb.Message {
  getReportId(): string;
  setReportId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RunAllQueriesRequest.AsObject;
  static toObject(includeInstance: boolean, msg: RunAllQueriesRequest): RunAllQueriesRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RunAllQueriesRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RunAllQueriesRequest;
  static deserializeBinaryFromReader(message: RunAllQueriesRequest, reader: jspb.BinaryReader): RunAllQueriesRequest;
}

export namespace RunAllQueriesRequest {
  export type AsObject = {
    reportId: string,
  }
}

export class RunAllQueriesResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RunAllQueriesResponse.AsObject;
  static toObject(includeInstance: boolean, msg: RunAllQueriesResponse): RunAllQueriesResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RunAllQueriesResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RunAllQueriesResponse;
  static deserializeBinaryFromReader(message: RunAllQueriesResponse, reader: jspb.BinaryReader): RunAllQueriesResponse;
}

export namespace RunAllQueriesResponse {
  export type AsObject = {
  }
}

export class GetConnectionListRequest extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetConnectionListRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetConnectionListRequest): GetConnectionListRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetConnectionListRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetConnectionListRequest;
  static deserializeBinaryFromReader(message: GetConnectionListRequest, reader: jspb.BinaryReader): GetConnectionListRequest;
}

export namespace GetConnectionListRequest {
  export type AsObject = {
  }
}

export class GetConnectionListResponse extends jspb.Message {
  clearConnectionsList(): void;
  getConnectionsList(): Array<Connection>;
  setConnectionsList(value: Array<Connection>): void;
  addConnections(value?: Connection, index?: number): Connection;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetConnectionListResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetConnectionListResponse): GetConnectionListResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetConnectionListResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetConnectionListResponse;
  static deserializeBinaryFromReader(message: GetConnectionListResponse, reader: jspb.BinaryReader): GetConnectionListResponse;
}

export namespace GetConnectionListResponse {
  export type AsObject = {
    connectionsList: Array<Connection.AsObject>,
  }
}

export class GetUserStreamRequest extends jspb.Message {
  hasStreamOptions(): boolean;
  clearStreamOptions(): void;
  getStreamOptions(): StreamOptions | undefined;
  setStreamOptions(value?: StreamOptions): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetUserStreamRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetUserStreamRequest): GetUserStreamRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetUserStreamRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetUserStreamRequest;
  static deserializeBinaryFromReader(message: GetUserStreamRequest, reader: jspb.BinaryReader): GetUserStreamRequest;
}

export namespace GetUserStreamRequest {
  export type AsObject = {
    streamOptions?: StreamOptions.AsObject,
  }
}

export class GetUserStreamResponse extends jspb.Message {
  hasStreamOptions(): boolean;
  clearStreamOptions(): void;
  getStreamOptions(): StreamOptions | undefined;
  setStreamOptions(value?: StreamOptions): void;

  getConnectionUpdate(): number;
  setConnectionUpdate(value: number): void;

  getEmail(): string;
  setEmail(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetUserStreamResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetUserStreamResponse): GetUserStreamResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetUserStreamResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetUserStreamResponse;
  static deserializeBinaryFromReader(message: GetUserStreamResponse, reader: jspb.BinaryReader): GetUserStreamResponse;
}

export namespace GetUserStreamResponse {
  export type AsObject = {
    streamOptions?: StreamOptions.AsObject,
    connectionUpdate: number,
    email: string,
  }
}

export class TestConnectionRequest extends jspb.Message {
  hasConnection(): boolean;
  clearConnection(): void;
  getConnection(): Connection | undefined;
  setConnection(value?: Connection): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TestConnectionRequest.AsObject;
  static toObject(includeInstance: boolean, msg: TestConnectionRequest): TestConnectionRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: TestConnectionRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TestConnectionRequest;
  static deserializeBinaryFromReader(message: TestConnectionRequest, reader: jspb.BinaryReader): TestConnectionRequest;
}

export namespace TestConnectionRequest {
  export type AsObject = {
    connection?: Connection.AsObject,
  }
}

export class TestConnectionResponse extends jspb.Message {
  getSuccess(): boolean;
  setSuccess(value: boolean): void;

  getError(): string;
  setError(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TestConnectionResponse.AsObject;
  static toObject(includeInstance: boolean, msg: TestConnectionResponse): TestConnectionResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: TestConnectionResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TestConnectionResponse;
  static deserializeBinaryFromReader(message: TestConnectionResponse, reader: jspb.BinaryReader): TestConnectionResponse;
}

export namespace TestConnectionResponse {
  export type AsObject = {
    success: boolean,
    error: string,
  }
}

export class ArchiveConnectionRequest extends jspb.Message {
  getConnectionId(): string;
  setConnectionId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ArchiveConnectionRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ArchiveConnectionRequest): ArchiveConnectionRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ArchiveConnectionRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ArchiveConnectionRequest;
  static deserializeBinaryFromReader(message: ArchiveConnectionRequest, reader: jspb.BinaryReader): ArchiveConnectionRequest;
}

export namespace ArchiveConnectionRequest {
  export type AsObject = {
    connectionId: string,
  }
}

export class ArchiveConnectionResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ArchiveConnectionResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ArchiveConnectionResponse): ArchiveConnectionResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ArchiveConnectionResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ArchiveConnectionResponse;
  static deserializeBinaryFromReader(message: ArchiveConnectionResponse, reader: jspb.BinaryReader): ArchiveConnectionResponse;
}

export namespace ArchiveConnectionResponse {
  export type AsObject = {
  }
}

export class UpdateConnectionRequest extends jspb.Message {
  hasConnection(): boolean;
  clearConnection(): void;
  getConnection(): Connection | undefined;
  setConnection(value?: Connection): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateConnectionRequest.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateConnectionRequest): UpdateConnectionRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateConnectionRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateConnectionRequest;
  static deserializeBinaryFromReader(message: UpdateConnectionRequest, reader: jspb.BinaryReader): UpdateConnectionRequest;
}

export namespace UpdateConnectionRequest {
  export type AsObject = {
    connection?: Connection.AsObject,
  }
}

export class UpdateConnectionResponse extends jspb.Message {
  hasConnection(): boolean;
  clearConnection(): void;
  getConnection(): Connection | undefined;
  setConnection(value?: Connection): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateConnectionResponse.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateConnectionResponse): UpdateConnectionResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateConnectionResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateConnectionResponse;
  static deserializeBinaryFromReader(message: UpdateConnectionResponse, reader: jspb.BinaryReader): UpdateConnectionResponse;
}

export namespace UpdateConnectionResponse {
  export type AsObject = {
    connection?: Connection.AsObject,
  }
}

export class CreateConnectionRequest extends jspb.Message {
  hasConnection(): boolean;
  clearConnection(): void;
  getConnection(): Connection | undefined;
  setConnection(value?: Connection): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateConnectionRequest.AsObject;
  static toObject(includeInstance: boolean, msg: CreateConnectionRequest): CreateConnectionRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateConnectionRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateConnectionRequest;
  static deserializeBinaryFromReader(message: CreateConnectionRequest, reader: jspb.BinaryReader): CreateConnectionRequest;
}

export namespace CreateConnectionRequest {
  export type AsObject = {
    connection?: Connection.AsObject,
  }
}

export class CreateConnectionResponse extends jspb.Message {
  hasConnection(): boolean;
  clearConnection(): void;
  getConnection(): Connection | undefined;
  setConnection(value?: Connection): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateConnectionResponse.AsObject;
  static toObject(includeInstance: boolean, msg: CreateConnectionResponse): CreateConnectionResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateConnectionResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateConnectionResponse;
  static deserializeBinaryFromReader(message: CreateConnectionResponse, reader: jspb.BinaryReader): CreateConnectionResponse;
}

export namespace CreateConnectionResponse {
  export type AsObject = {
    connection?: Connection.AsObject,
  }
}

export class Connection extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getConnectionName(): string;
  setConnectionName(value: string): void;

  getBigqueryProjectId(): string;
  setBigqueryProjectId(value: string): void;

  getCloudStorageBucket(): string;
  setCloudStorageBucket(value: string): void;

  getIsDefault(): boolean;
  setIsDefault(value: boolean): void;

  getAuthorEmail(): string;
  setAuthorEmail(value: string): void;

  getCreatedAt(): number;
  setCreatedAt(value: number): void;

  getUpdatedAt(): number;
  setUpdatedAt(value: number): void;

  getDatasetCount(): number;
  setDatasetCount(value: number): void;

  getCanStoreFiles(): boolean;
  setCanStoreFiles(value: boolean): void;

  getConnectionType(): Connection.ConnectionTypeMap[keyof Connection.ConnectionTypeMap];
  setConnectionType(value: Connection.ConnectionTypeMap[keyof Connection.ConnectionTypeMap]): void;

  getSnowflakeAccountId(): string;
  setSnowflakeAccountId(value: string): void;

  getSnowflakeUsername(): string;
  setSnowflakeUsername(value: string): void;

  hasSnowflakePassword(): boolean;
  clearSnowflakePassword(): void;
  getSnowflakePassword(): Secret | undefined;
  setSnowflakePassword(value?: Secret): void;

  getSnowflakeWarehouse(): string;
  setSnowflakeWarehouse(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Connection.AsObject;
  static toObject(includeInstance: boolean, msg: Connection): Connection.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Connection, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Connection;
  static deserializeBinaryFromReader(message: Connection, reader: jspb.BinaryReader): Connection;
}

export namespace Connection {
  export type AsObject = {
    id: string,
    connectionName: string,
    bigqueryProjectId: string,
    cloudStorageBucket: string,
    isDefault: boolean,
    authorEmail: string,
    createdAt: number,
    updatedAt: number,
    datasetCount: number,
    canStoreFiles: boolean,
    connectionType: Connection.ConnectionTypeMap[keyof Connection.ConnectionTypeMap],
    snowflakeAccountId: string,
    snowflakeUsername: string,
    snowflakePassword?: Secret.AsObject,
    snowflakeWarehouse: string,
  }

  export interface ConnectionTypeMap {
    CONNECTION_TYPE_UNSPECIFIED: 0;
    CONNECTION_TYPE_BIGQUERY: 1;
    CONNECTION_TYPE_SNOWFLAKE: 2;
  }

  export const ConnectionType: ConnectionTypeMap;
}

export class Secret extends jspb.Message {
  getClientEncrypted(): string;
  setClientEncrypted(value: string): void;

  getServerEncrypted(): string;
  setServerEncrypted(value: string): void;

  getLength(): number;
  setLength(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Secret.AsObject;
  static toObject(includeInstance: boolean, msg: Secret): Secret.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Secret, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Secret;
  static deserializeBinaryFromReader(message: Secret, reader: jspb.BinaryReader): Secret;
}

export namespace Secret {
  export type AsObject = {
    clientEncrypted: string,
    serverEncrypted: string,
    length: number,
  }
}

export class GetUsageRequest extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetUsageRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetUsageRequest): GetUsageRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetUsageRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetUsageRequest;
  static deserializeBinaryFromReader(message: GetUsageRequest, reader: jspb.BinaryReader): GetUsageRequest;
}

export namespace GetUsageRequest {
  export type AsObject = {
  }
}

export class GetUsageResponse extends jspb.Message {
  getTotalReports(): number;
  setTotalReports(value: number): void;

  getTotalQueries(): number;
  setTotalQueries(value: number): void;

  getTotalFiles(): number;
  setTotalFiles(value: number): void;

  getTotalAuthors(): number;
  setTotalAuthors(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetUsageResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetUsageResponse): GetUsageResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetUsageResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetUsageResponse;
  static deserializeBinaryFromReader(message: GetUsageResponse, reader: jspb.BinaryReader): GetUsageResponse;
}

export namespace GetUsageResponse {
  export type AsObject = {
    totalReports: number,
    totalQueries: number,
    totalFiles: number,
    totalAuthors: number,
  }
}

export class SetDiscoverableRequest extends jspb.Message {
  getReportId(): string;
  setReportId(value: string): void;

  getDiscoverable(): boolean;
  setDiscoverable(value: boolean): void;

  getAllowEdit(): boolean;
  setAllowEdit(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SetDiscoverableRequest.AsObject;
  static toObject(includeInstance: boolean, msg: SetDiscoverableRequest): SetDiscoverableRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: SetDiscoverableRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SetDiscoverableRequest;
  static deserializeBinaryFromReader(message: SetDiscoverableRequest, reader: jspb.BinaryReader): SetDiscoverableRequest;
}

export namespace SetDiscoverableRequest {
  export type AsObject = {
    reportId: string,
    discoverable: boolean,
    allowEdit: boolean,
  }
}

export class SetDiscoverableResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SetDiscoverableResponse.AsObject;
  static toObject(includeInstance: boolean, msg: SetDiscoverableResponse): SetDiscoverableResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: SetDiscoverableResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SetDiscoverableResponse;
  static deserializeBinaryFromReader(message: SetDiscoverableResponse, reader: jspb.BinaryReader): SetDiscoverableResponse;
}

export namespace SetDiscoverableResponse {
  export type AsObject = {
  }
}

export class RemoveDatasetRequest extends jspb.Message {
  getDatasetId(): string;
  setDatasetId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RemoveDatasetRequest.AsObject;
  static toObject(includeInstance: boolean, msg: RemoveDatasetRequest): RemoveDatasetRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RemoveDatasetRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RemoveDatasetRequest;
  static deserializeBinaryFromReader(message: RemoveDatasetRequest, reader: jspb.BinaryReader): RemoveDatasetRequest;
}

export namespace RemoveDatasetRequest {
  export type AsObject = {
    datasetId: string,
  }
}

export class RemoveDatasetResponse extends jspb.Message {
  getDatasetId(): string;
  setDatasetId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RemoveDatasetResponse.AsObject;
  static toObject(includeInstance: boolean, msg: RemoveDatasetResponse): RemoveDatasetResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RemoveDatasetResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RemoveDatasetResponse;
  static deserializeBinaryFromReader(message: RemoveDatasetResponse, reader: jspb.BinaryReader): RemoveDatasetResponse;
}

export namespace RemoveDatasetResponse {
  export type AsObject = {
    datasetId: string,
  }
}

export class StreamOptions extends jspb.Message {
  getSequence(): number;
  setSequence(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): StreamOptions.AsObject;
  static toObject(includeInstance: boolean, msg: StreamOptions): StreamOptions.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: StreamOptions, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): StreamOptions;
  static deserializeBinaryFromReader(message: StreamOptions, reader: jspb.BinaryReader): StreamOptions;
}

export namespace StreamOptions {
  export type AsObject = {
    sequence: number,
  }
}

export class GetEnvRequest extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetEnvRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetEnvRequest): GetEnvRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetEnvRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetEnvRequest;
  static deserializeBinaryFromReader(message: GetEnvRequest, reader: jspb.BinaryReader): GetEnvRequest;
}

export namespace GetEnvRequest {
  export type AsObject = {
  }
}

export class GetEnvResponse extends jspb.Message {
  clearVariablesList(): void;
  getVariablesList(): Array<GetEnvResponse.Variable>;
  setVariablesList(value: Array<GetEnvResponse.Variable>): void;
  addVariables(value?: GetEnvResponse.Variable, index?: number): GetEnvResponse.Variable;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetEnvResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetEnvResponse): GetEnvResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetEnvResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetEnvResponse;
  static deserializeBinaryFromReader(message: GetEnvResponse, reader: jspb.BinaryReader): GetEnvResponse;
}

export namespace GetEnvResponse {
  export type AsObject = {
    variablesList: Array<GetEnvResponse.Variable.AsObject>,
  }

  export class Variable extends jspb.Message {
    getType(): GetEnvResponse.Variable.TypeMap[keyof GetEnvResponse.Variable.TypeMap];
    setType(value: GetEnvResponse.Variable.TypeMap[keyof GetEnvResponse.Variable.TypeMap]): void;

    getValue(): string;
    setValue(value: string): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Variable.AsObject;
    static toObject(includeInstance: boolean, msg: Variable): Variable.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Variable, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Variable;
    static deserializeBinaryFromReader(message: Variable, reader: jspb.BinaryReader): Variable;
  }

  export namespace Variable {
    export type AsObject = {
      type: GetEnvResponse.Variable.TypeMap[keyof GetEnvResponse.Variable.TypeMap],
      value: string,
    }

    export interface TypeMap {
      TYPE_UNSPECIFIED: 0;
      TYPE_MAPBOX_TOKEN: 1;
      TYPE_UX_DATA_DOCUMENTATION: 2;
      TYPE_UX_HOMEPAGE: 3;
      TYPE_ALLOW_FILE_UPLOAD: 4;
      TYPE_DATASOURCE: 5;
      TYPE_STORAGE: 6;
      TYPE_REQUIRE_AMAZON_OIDC: 7;
      TYPE_REQUIRE_IAP: 8;
      TYPE_DISABLE_USAGE_STATS: 9;
      TYPE_REQUIRE_GOOGLE_OAUTH: 10;
      TYPE_BIGQUERY_PROJECT_ID: 11;
      TYPE_CLOUD_STORAGE_BUCKET: 12;
      TYPE_UX_ACCESS_ERROR_INFO_HTML: 13;
      TYPE_UX_NOT_FOUND_ERROR_INFO_HTML: 14;
      TYPE_UX_SAMPLE_QUERY_SQL: 15;
      TYPE_AES_KEY: 16;
      TYPE_AES_IV: 17;
      TYPE_AUTH_ENABLED: 18;
      TYPE_USER_DEFINED_CONNECTION: 19;
    }

    export const Type: TypeMap;
  }
}

export class RedirectState extends jspb.Message {
  getTokenJson(): string;
  setTokenJson(value: string): void;

  getError(): string;
  setError(value: string): void;

  getSensitiveScopesGranted(): boolean;
  setSensitiveScopesGranted(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RedirectState.AsObject;
  static toObject(includeInstance: boolean, msg: RedirectState): RedirectState.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RedirectState, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RedirectState;
  static deserializeBinaryFromReader(message: RedirectState, reader: jspb.BinaryReader): RedirectState;
}

export namespace RedirectState {
  export type AsObject = {
    tokenJson: string,
    error: string,
    sensitiveScopesGranted: boolean,
  }
}

export class AuthState extends jspb.Message {
  getAction(): AuthState.ActionMap[keyof AuthState.ActionMap];
  setAction(value: AuthState.ActionMap[keyof AuthState.ActionMap]): void;

  getAuthUrl(): string;
  setAuthUrl(value: string): void;

  getUiUrl(): string;
  setUiUrl(value: string): void;

  getAccessTokenToRevoke(): string;
  setAccessTokenToRevoke(value: string): void;

  getSwitchAccount(): boolean;
  setSwitchAccount(value: boolean): void;

  getSensitiveScope(): boolean;
  setSensitiveScope(value: boolean): void;

  getLoginHint(): string;
  setLoginHint(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AuthState.AsObject;
  static toObject(includeInstance: boolean, msg: AuthState): AuthState.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: AuthState, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AuthState;
  static deserializeBinaryFromReader(message: AuthState, reader: jspb.BinaryReader): AuthState;
}

export namespace AuthState {
  export type AsObject = {
    action: AuthState.ActionMap[keyof AuthState.ActionMap],
    authUrl: string,
    uiUrl: string,
    accessTokenToRevoke: string,
    switchAccount: boolean,
    sensitiveScope: boolean,
    loginHint: string,
  }

  export interface ActionMap {
    ACTION_UNSPECIFIED: 0;
    ACTION_REQUEST_CODE: 1;
    ACTION_REQUEST_TOKEN: 2;
    ACTION_REVOKE: 3;
  }

  export const Action: ActionMap;
}

export class ArchiveReportRequest extends jspb.Message {
  getReportId(): string;
  setReportId(value: string): void;

  getArchive(): boolean;
  setArchive(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ArchiveReportRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ArchiveReportRequest): ArchiveReportRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ArchiveReportRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ArchiveReportRequest;
  static deserializeBinaryFromReader(message: ArchiveReportRequest, reader: jspb.BinaryReader): ArchiveReportRequest;
}

export namespace ArchiveReportRequest {
  export type AsObject = {
    reportId: string,
    archive: boolean,
  }
}

export class ArchiveReportResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ArchiveReportResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ArchiveReportResponse): ArchiveReportResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ArchiveReportResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ArchiveReportResponse;
  static deserializeBinaryFromReader(message: ArchiveReportResponse, reader: jspb.BinaryReader): ArchiveReportResponse;
}

export namespace ArchiveReportResponse {
  export type AsObject = {
  }
}

export class ReportListRequest extends jspb.Message {
  hasStreamOptions(): boolean;
  clearStreamOptions(): void;
  getStreamOptions(): StreamOptions | undefined;
  setStreamOptions(value?: StreamOptions): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ReportListRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ReportListRequest): ReportListRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ReportListRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ReportListRequest;
  static deserializeBinaryFromReader(message: ReportListRequest, reader: jspb.BinaryReader): ReportListRequest;
}

export namespace ReportListRequest {
  export type AsObject = {
    streamOptions?: StreamOptions.AsObject,
  }
}

export class ReportListResponse extends jspb.Message {
  clearReportsList(): void;
  getReportsList(): Array<Report>;
  setReportsList(value: Array<Report>): void;
  addReports(value?: Report, index?: number): Report;

  hasStreamOptions(): boolean;
  clearStreamOptions(): void;
  getStreamOptions(): StreamOptions | undefined;
  setStreamOptions(value?: StreamOptions): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ReportListResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ReportListResponse): ReportListResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ReportListResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ReportListResponse;
  static deserializeBinaryFromReader(message: ReportListResponse, reader: jspb.BinaryReader): ReportListResponse;
}

export namespace ReportListResponse {
  export type AsObject = {
    reportsList: Array<Report.AsObject>,
    streamOptions?: StreamOptions.AsObject,
  }
}

export class Report extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getMapConfig(): string;
  setMapConfig(value: string): void;

  getTitle(): string;
  setTitle(value: string): void;

  getArchived(): boolean;
  setArchived(value: boolean): void;

  getCanWrite(): boolean;
  setCanWrite(value: boolean): void;

  getAuthorEmail(): string;
  setAuthorEmail(value: string): void;

  getDiscoverable(): boolean;
  setDiscoverable(value: boolean): void;

  getAllowEdit(): boolean;
  setAllowEdit(value: boolean): void;

  getIsAuthor(): boolean;
  setIsAuthor(value: boolean): void;

  getCreatedAt(): number;
  setCreatedAt(value: number): void;

  getUpdatedAt(): number;
  setUpdatedAt(value: number): void;

  getIsSharable(): boolean;
  setIsSharable(value: boolean): void;

  getNeedSensitiveScope(): boolean;
  setNeedSensitiveScope(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Report.AsObject;
  static toObject(includeInstance: boolean, msg: Report): Report.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Report, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Report;
  static deserializeBinaryFromReader(message: Report, reader: jspb.BinaryReader): Report;
}

export namespace Report {
  export type AsObject = {
    id: string,
    mapConfig: string,
    title: string,
    archived: boolean,
    canWrite: boolean,
    authorEmail: string,
    discoverable: boolean,
    allowEdit: boolean,
    isAuthor: boolean,
    createdAt: number,
    updatedAt: number,
    isSharable: boolean,
    needSensitiveScope: boolean,
  }
}

export class Dataset extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getReportId(): string;
  setReportId(value: string): void;

  getQueryId(): string;
  setQueryId(value: string): void;

  getCreatedAt(): number;
  setCreatedAt(value: number): void;

  getUpdatedAt(): number;
  setUpdatedAt(value: number): void;

  getFileId(): string;
  setFileId(value: string): void;

  getName(): string;
  setName(value: string): void;

  getConnectionId(): string;
  setConnectionId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Dataset.AsObject;
  static toObject(includeInstance: boolean, msg: Dataset): Dataset.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Dataset, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Dataset;
  static deserializeBinaryFromReader(message: Dataset, reader: jspb.BinaryReader): Dataset;
}

export namespace Dataset {
  export type AsObject = {
    id: string,
    reportId: string,
    queryId: string,
    createdAt: number,
    updatedAt: number,
    fileId: string,
    name: string,
    connectionId: string,
  }
}

export class Query extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getQueryText(): string;
  setQueryText(value: string): void;

  getJobStatus(): Query.JobStatusMap[keyof Query.JobStatusMap];
  setJobStatus(value: Query.JobStatusMap[keyof Query.JobStatusMap]): void;

  getJobResultId(): string;
  setJobResultId(value: string): void;

  getJobError(): string;
  setJobError(value: string): void;

  getJobDuration(): number;
  setJobDuration(value: number): void;

  getTotalRows(): number;
  setTotalRows(value: number): void;

  getBytesProcessed(): number;
  setBytesProcessed(value: number): void;

  getResultSize(): number;
  setResultSize(value: number): void;

  getCreatedAt(): number;
  setCreatedAt(value: number): void;

  getUpdatedAt(): number;
  setUpdatedAt(value: number): void;

  getQuerySource(): Query.QuerySourceMap[keyof Query.QuerySourceMap];
  setQuerySource(value: Query.QuerySourceMap[keyof Query.QuerySourceMap]): void;

  getQuerySourceId(): string;
  setQuerySourceId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Query.AsObject;
  static toObject(includeInstance: boolean, msg: Query): Query.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Query, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Query;
  static deserializeBinaryFromReader(message: Query, reader: jspb.BinaryReader): Query;
}

export namespace Query {
  export type AsObject = {
    id: string,
    queryText: string,
    jobStatus: Query.JobStatusMap[keyof Query.JobStatusMap],
    jobResultId: string,
    jobError: string,
    jobDuration: number,
    totalRows: number,
    bytesProcessed: number,
    resultSize: number,
    createdAt: number,
    updatedAt: number,
    querySource: Query.QuerySourceMap[keyof Query.QuerySourceMap],
    querySourceId: string,
  }

  export interface JobStatusMap {
    JOB_STATUS_UNSPECIFIED: 0;
    JOB_STATUS_PENDING: 1;
    JOB_STATUS_RUNNING: 2;
    JOB_STATUS_DONE_LEGACY: 3;
    JOB_STATUS_READING_RESULTS: 4;
    JOB_STATUS_DONE: 5;
  }

  export const JobStatus: JobStatusMap;

  export interface QuerySourceMap {
    QUERY_SOURCE_UNSPECIFIED: 0;
    QUERY_SOURCE_INLINE: 1;
    QUERY_SOURCE_STORAGE: 2;
  }

  export const QuerySource: QuerySourceMap;
}

export class File extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getName(): string;
  setName(value: string): void;

  getMimeType(): string;
  setMimeType(value: string): void;

  getSize(): number;
  setSize(value: number): void;

  getSourceId(): string;
  setSourceId(value: string): void;

  getCreatedAt(): number;
  setCreatedAt(value: number): void;

  getUpdatedAt(): number;
  setUpdatedAt(value: number): void;

  getFileStatus(): File.StatusMap[keyof File.StatusMap];
  setFileStatus(value: File.StatusMap[keyof File.StatusMap]): void;

  getUploadError(): string;
  setUploadError(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): File.AsObject;
  static toObject(includeInstance: boolean, msg: File): File.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: File, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): File;
  static deserializeBinaryFromReader(message: File, reader: jspb.BinaryReader): File;
}

export namespace File {
  export type AsObject = {
    id: string,
    name: string,
    mimeType: string,
    size: number,
    sourceId: string,
    createdAt: number,
    updatedAt: number,
    fileStatus: File.StatusMap[keyof File.StatusMap],
    uploadError: string,
  }

  export interface StatusMap {
    STATUS_UNSPECIFIED: 0;
    STATUS_NEW: 1;
    STATUS_RECEIVED: 2;
    STATUS_STORED: 3;
  }

  export const Status: StatusMap;
}

export class UpdateReportRequest extends jspb.Message {
  hasReport(): boolean;
  clearReport(): void;
  getReport(): Report | undefined;
  setReport(value?: Report): void;

  clearQueryList(): void;
  getQueryList(): Array<Query>;
  setQueryList(value: Array<Query>): void;
  addQuery(value?: Query, index?: number): Query;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateReportRequest.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateReportRequest): UpdateReportRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateReportRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateReportRequest;
  static deserializeBinaryFromReader(message: UpdateReportRequest, reader: jspb.BinaryReader): UpdateReportRequest;
}

export namespace UpdateReportRequest {
  export type AsObject = {
    report?: Report.AsObject,
    queryList: Array<Query.AsObject>,
  }
}

export class UpdateReportResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateReportResponse.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateReportResponse): UpdateReportResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateReportResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateReportResponse;
  static deserializeBinaryFromReader(message: UpdateReportResponse, reader: jspb.BinaryReader): UpdateReportResponse;
}

export namespace UpdateReportResponse {
  export type AsObject = {
  }
}

export class RunQueryRequest extends jspb.Message {
  getQueryId(): string;
  setQueryId(value: string): void;

  getQueryText(): string;
  setQueryText(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RunQueryRequest.AsObject;
  static toObject(includeInstance: boolean, msg: RunQueryRequest): RunQueryRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RunQueryRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RunQueryRequest;
  static deserializeBinaryFromReader(message: RunQueryRequest, reader: jspb.BinaryReader): RunQueryRequest;
}

export namespace RunQueryRequest {
  export type AsObject = {
    queryId: string,
    queryText: string,
  }
}

export class RunQueryResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RunQueryResponse.AsObject;
  static toObject(includeInstance: boolean, msg: RunQueryResponse): RunQueryResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RunQueryResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RunQueryResponse;
  static deserializeBinaryFromReader(message: RunQueryResponse, reader: jspb.BinaryReader): RunQueryResponse;
}

export namespace RunQueryResponse {
  export type AsObject = {
  }
}

export class CancelQueryRequest extends jspb.Message {
  getQueryId(): string;
  setQueryId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CancelQueryRequest.AsObject;
  static toObject(includeInstance: boolean, msg: CancelQueryRequest): CancelQueryRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CancelQueryRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CancelQueryRequest;
  static deserializeBinaryFromReader(message: CancelQueryRequest, reader: jspb.BinaryReader): CancelQueryRequest;
}

export namespace CancelQueryRequest {
  export type AsObject = {
    queryId: string,
  }
}

export class CancelQueryResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CancelQueryResponse.AsObject;
  static toObject(includeInstance: boolean, msg: CancelQueryResponse): CancelQueryResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CancelQueryResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CancelQueryResponse;
  static deserializeBinaryFromReader(message: CancelQueryResponse, reader: jspb.BinaryReader): CancelQueryResponse;
}

export namespace CancelQueryResponse {
  export type AsObject = {
  }
}

export class UpdateDatasetNameRequest extends jspb.Message {
  getDatasetId(): string;
  setDatasetId(value: string): void;

  getName(): string;
  setName(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateDatasetNameRequest.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateDatasetNameRequest): UpdateDatasetNameRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateDatasetNameRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateDatasetNameRequest;
  static deserializeBinaryFromReader(message: UpdateDatasetNameRequest, reader: jspb.BinaryReader): UpdateDatasetNameRequest;
}

export namespace UpdateDatasetNameRequest {
  export type AsObject = {
    datasetId: string,
    name: string,
  }
}

export class UpdateDatasetNameResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateDatasetNameResponse.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateDatasetNameResponse): UpdateDatasetNameResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateDatasetNameResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateDatasetNameResponse;
  static deserializeBinaryFromReader(message: UpdateDatasetNameResponse, reader: jspb.BinaryReader): UpdateDatasetNameResponse;
}

export namespace UpdateDatasetNameResponse {
  export type AsObject = {
  }
}

export class UpdateDatasetConnectionRequest extends jspb.Message {
  getDatasetId(): string;
  setDatasetId(value: string): void;

  getConnectionId(): string;
  setConnectionId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateDatasetConnectionRequest.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateDatasetConnectionRequest): UpdateDatasetConnectionRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateDatasetConnectionRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateDatasetConnectionRequest;
  static deserializeBinaryFromReader(message: UpdateDatasetConnectionRequest, reader: jspb.BinaryReader): UpdateDatasetConnectionRequest;
}

export namespace UpdateDatasetConnectionRequest {
  export type AsObject = {
    datasetId: string,
    connectionId: string,
  }
}

export class UpdateDatasetConnectionResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateDatasetConnectionResponse.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateDatasetConnectionResponse): UpdateDatasetConnectionResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateDatasetConnectionResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateDatasetConnectionResponse;
  static deserializeBinaryFromReader(message: UpdateDatasetConnectionResponse, reader: jspb.BinaryReader): UpdateDatasetConnectionResponse;
}

export namespace UpdateDatasetConnectionResponse {
  export type AsObject = {
  }
}

export class CreateDatasetRequest extends jspb.Message {
  getReportId(): string;
  setReportId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateDatasetRequest.AsObject;
  static toObject(includeInstance: boolean, msg: CreateDatasetRequest): CreateDatasetRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateDatasetRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateDatasetRequest;
  static deserializeBinaryFromReader(message: CreateDatasetRequest, reader: jspb.BinaryReader): CreateDatasetRequest;
}

export namespace CreateDatasetRequest {
  export type AsObject = {
    reportId: string,
  }
}

export class CreateDatasetResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateDatasetResponse.AsObject;
  static toObject(includeInstance: boolean, msg: CreateDatasetResponse): CreateDatasetResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateDatasetResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateDatasetResponse;
  static deserializeBinaryFromReader(message: CreateDatasetResponse, reader: jspb.BinaryReader): CreateDatasetResponse;
}

export namespace CreateDatasetResponse {
  export type AsObject = {
  }
}

export class CreateFileRequest extends jspb.Message {
  getDatasetId(): string;
  setDatasetId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateFileRequest.AsObject;
  static toObject(includeInstance: boolean, msg: CreateFileRequest): CreateFileRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateFileRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateFileRequest;
  static deserializeBinaryFromReader(message: CreateFileRequest, reader: jspb.BinaryReader): CreateFileRequest;
}

export namespace CreateFileRequest {
  export type AsObject = {
    datasetId: string,
  }
}

export class CreateFileResponse extends jspb.Message {
  getFileId(): string;
  setFileId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateFileResponse.AsObject;
  static toObject(includeInstance: boolean, msg: CreateFileResponse): CreateFileResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateFileResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateFileResponse;
  static deserializeBinaryFromReader(message: CreateFileResponse, reader: jspb.BinaryReader): CreateFileResponse;
}

export namespace CreateFileResponse {
  export type AsObject = {
    fileId: string,
  }
}

export class CreateQueryRequest extends jspb.Message {
  getDatasetId(): string;
  setDatasetId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateQueryRequest.AsObject;
  static toObject(includeInstance: boolean, msg: CreateQueryRequest): CreateQueryRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateQueryRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateQueryRequest;
  static deserializeBinaryFromReader(message: CreateQueryRequest, reader: jspb.BinaryReader): CreateQueryRequest;
}

export namespace CreateQueryRequest {
  export type AsObject = {
    datasetId: string,
  }
}

export class CreateQueryResponse extends jspb.Message {
  hasQuery(): boolean;
  clearQuery(): void;
  getQuery(): Query | undefined;
  setQuery(value?: Query): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateQueryResponse.AsObject;
  static toObject(includeInstance: boolean, msg: CreateQueryResponse): CreateQueryResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateQueryResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateQueryResponse;
  static deserializeBinaryFromReader(message: CreateQueryResponse, reader: jspb.BinaryReader): CreateQueryResponse;
}

export namespace CreateQueryResponse {
  export type AsObject = {
    query?: Query.AsObject,
  }
}

export class ReportStreamRequest extends jspb.Message {
  hasReport(): boolean;
  clearReport(): void;
  getReport(): Report | undefined;
  setReport(value?: Report): void;

  hasStreamOptions(): boolean;
  clearStreamOptions(): void;
  getStreamOptions(): StreamOptions | undefined;
  setStreamOptions(value?: StreamOptions): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ReportStreamRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ReportStreamRequest): ReportStreamRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ReportStreamRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ReportStreamRequest;
  static deserializeBinaryFromReader(message: ReportStreamRequest, reader: jspb.BinaryReader): ReportStreamRequest;
}

export namespace ReportStreamRequest {
  export type AsObject = {
    report?: Report.AsObject,
    streamOptions?: StreamOptions.AsObject,
  }
}

export class ReportStreamResponse extends jspb.Message {
  hasReport(): boolean;
  clearReport(): void;
  getReport(): Report | undefined;
  setReport(value?: Report): void;

  clearQueriesList(): void;
  getQueriesList(): Array<Query>;
  setQueriesList(value: Array<Query>): void;
  addQueries(value?: Query, index?: number): Query;

  hasStreamOptions(): boolean;
  clearStreamOptions(): void;
  getStreamOptions(): StreamOptions | undefined;
  setStreamOptions(value?: StreamOptions): void;

  clearDatasetsList(): void;
  getDatasetsList(): Array<Dataset>;
  setDatasetsList(value: Array<Dataset>): void;
  addDatasets(value?: Dataset, index?: number): Dataset;

  clearFilesList(): void;
  getFilesList(): Array<File>;
  setFilesList(value: Array<File>): void;
  addFiles(value?: File, index?: number): File;

  clearConnectionsList(): void;
  getConnectionsList(): Array<Connection>;
  setConnectionsList(value: Array<Connection>): void;
  addConnections(value?: Connection, index?: number): Connection;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ReportStreamResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ReportStreamResponse): ReportStreamResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ReportStreamResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ReportStreamResponse;
  static deserializeBinaryFromReader(message: ReportStreamResponse, reader: jspb.BinaryReader): ReportStreamResponse;
}

export namespace ReportStreamResponse {
  export type AsObject = {
    report?: Report.AsObject,
    queriesList: Array<Query.AsObject>,
    streamOptions?: StreamOptions.AsObject,
    datasetsList: Array<Dataset.AsObject>,
    filesList: Array<File.AsObject>,
    connectionsList: Array<Connection.AsObject>,
  }
}

export class ForkReportRequest extends jspb.Message {
  getReportId(): string;
  setReportId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ForkReportRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ForkReportRequest): ForkReportRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ForkReportRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ForkReportRequest;
  static deserializeBinaryFromReader(message: ForkReportRequest, reader: jspb.BinaryReader): ForkReportRequest;
}

export namespace ForkReportRequest {
  export type AsObject = {
    reportId: string,
  }
}

export class ForkReportResponse extends jspb.Message {
  getReportId(): string;
  setReportId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ForkReportResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ForkReportResponse): ForkReportResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ForkReportResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ForkReportResponse;
  static deserializeBinaryFromReader(message: ForkReportResponse, reader: jspb.BinaryReader): ForkReportResponse;
}

export namespace ForkReportResponse {
  export type AsObject = {
    reportId: string,
  }
}

export class CreateReportRequest extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateReportRequest.AsObject;
  static toObject(includeInstance: boolean, msg: CreateReportRequest): CreateReportRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateReportRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateReportRequest;
  static deserializeBinaryFromReader(message: CreateReportRequest, reader: jspb.BinaryReader): CreateReportRequest;
}

export namespace CreateReportRequest {
  export type AsObject = {
  }
}

export class CreateReportResponse extends jspb.Message {
  hasReport(): boolean;
  clearReport(): void;
  getReport(): Report | undefined;
  setReport(value?: Report): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CreateReportResponse.AsObject;
  static toObject(includeInstance: boolean, msg: CreateReportResponse): CreateReportResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: CreateReportResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CreateReportResponse;
  static deserializeBinaryFromReader(message: CreateReportResponse, reader: jspb.BinaryReader): CreateReportResponse;
}

export namespace CreateReportResponse {
  export type AsObject = {
    report?: Report.AsObject,
  }
}

