// package: 
// file: proto/dekart.proto

import * as jspb from "google-protobuf";

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

export class GetTokensRequest extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetTokensRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetTokensRequest): GetTokensRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetTokensRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetTokensRequest;
  static deserializeBinaryFromReader(message: GetTokensRequest, reader: jspb.BinaryReader): GetTokensRequest;
}

export namespace GetTokensRequest {
  export type AsObject = {
  }
}

export class GetTokensResponse extends jspb.Message {
  clearTokensList(): void;
  getTokensList(): Array<GetTokensResponse.Token>;
  setTokensList(value: Array<GetTokensResponse.Token>): void;
  addTokens(value?: GetTokensResponse.Token, index?: number): GetTokensResponse.Token;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetTokensResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetTokensResponse): GetTokensResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetTokensResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetTokensResponse;
  static deserializeBinaryFromReader(message: GetTokensResponse, reader: jspb.BinaryReader): GetTokensResponse;
}

export namespace GetTokensResponse {
  export type AsObject = {
    tokensList: Array<GetTokensResponse.Token.AsObject>,
  }

  export class Token extends jspb.Message {
    getName(): string;
    setName(value: string): void;

    getToken(): string;
    setToken(value: string): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Token.AsObject;
    static toObject(includeInstance: boolean, msg: Token): Token.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Token, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Token;
    static deserializeBinaryFromReader(message: Token, reader: jspb.BinaryReader): Token;
  }

  export namespace Token {
    export type AsObject = {
      name: string,
      token: string,
    }
  }
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
  }
}

export class Query extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getReportId(): string;
  setReportId(value: string): void;

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
    reportId: string,
    queryText: string,
    jobStatus: Query.JobStatusMap[keyof Query.JobStatusMap],
    jobResultId: string,
    jobError: string,
    jobDuration: number,
  }

  export interface JobStatusMap {
    JOB_STATUS_UNSPECIFIED: 0;
    JOB_STATUS_PENDING: 1;
    JOB_STATUS_RUNNING: 2;
    JOB_STATUS_DONE: 3;
  }

  export const JobStatus: JobStatusMap;
}

export class UpdateReportRequest extends jspb.Message {
  hasReport(): boolean;
  clearReport(): void;
  getReport(): Report | undefined;
  setReport(value?: Report): void;

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

export class UpdateQueryRequest extends jspb.Message {
  hasQuery(): boolean;
  clearQuery(): void;
  getQuery(): Query | undefined;
  setQuery(value?: Query): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateQueryRequest.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateQueryRequest): UpdateQueryRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateQueryRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateQueryRequest;
  static deserializeBinaryFromReader(message: UpdateQueryRequest, reader: jspb.BinaryReader): UpdateQueryRequest;
}

export namespace UpdateQueryRequest {
  export type AsObject = {
    query?: Query.AsObject,
  }
}

export class UpdateQueryResponse extends jspb.Message {
  hasQuery(): boolean;
  clearQuery(): void;
  getQuery(): Query | undefined;
  setQuery(value?: Query): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateQueryResponse.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateQueryResponse): UpdateQueryResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: UpdateQueryResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateQueryResponse;
  static deserializeBinaryFromReader(message: UpdateQueryResponse, reader: jspb.BinaryReader): UpdateQueryResponse;
}

export namespace UpdateQueryResponse {
  export type AsObject = {
    query?: Query.AsObject,
  }
}

export class CreateQueryRequest extends jspb.Message {
  hasQuery(): boolean;
  clearQuery(): void;
  getQuery(): Query | undefined;
  setQuery(value?: Query): void;

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
    query?: Query.AsObject,
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

