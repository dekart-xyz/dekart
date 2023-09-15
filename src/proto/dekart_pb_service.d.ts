// package: 
// file: proto/dekart.proto

import * as proto_dekart_pb from "../proto/dekart_pb";
import {grpc} from "@improbable-eng/grpc-web";

type DekartCreateReport = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateReportRequest;
  readonly responseType: typeof proto_dekart_pb.CreateReportResponse;
};

type DekartForkReport = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.ForkReportRequest;
  readonly responseType: typeof proto_dekart_pb.ForkReportResponse;
};

type DekartUpdateReport = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.UpdateReportRequest;
  readonly responseType: typeof proto_dekart_pb.UpdateReportResponse;
};

type DekartArchiveReport = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.ArchiveReportRequest;
  readonly responseType: typeof proto_dekart_pb.ArchiveReportResponse;
};

type DekartSetDiscoverable = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.SetDiscoverableRequest;
  readonly responseType: typeof proto_dekart_pb.SetDiscoverableResponse;
};

type DekartCreateDataset = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateDatasetRequest;
  readonly responseType: typeof proto_dekart_pb.CreateDatasetResponse;
};

type DekartRemoveDataset = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.RemoveDatasetRequest;
  readonly responseType: typeof proto_dekart_pb.RemoveDatasetResponse;
};

type DekartUpdateDataset = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.UpdateDatasetRequest;
  readonly responseType: typeof proto_dekart_pb.UpdateDatasetResponse;
};

type DekartCreateFile = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateFileRequest;
  readonly responseType: typeof proto_dekart_pb.CreateFileResponse;
};

type DekartCreateQuery = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateQueryRequest;
  readonly responseType: typeof proto_dekart_pb.CreateQueryResponse;
};

type DekartRunQuery = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.RunQueryRequest;
  readonly responseType: typeof proto_dekart_pb.RunQueryResponse;
};

type DekartCancelQuery = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CancelQueryRequest;
  readonly responseType: typeof proto_dekart_pb.CancelQueryResponse;
};

type DekartGetEnv = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.GetEnvRequest;
  readonly responseType: typeof proto_dekart_pb.GetEnvResponse;
};

type DekartGetReportStream = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: true;
  readonly requestType: typeof proto_dekart_pb.ReportStreamRequest;
  readonly responseType: typeof proto_dekart_pb.ReportStreamResponse;
};

type DekartGetReportListStream = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: true;
  readonly requestType: typeof proto_dekart_pb.ReportListRequest;
  readonly responseType: typeof proto_dekart_pb.ReportListResponse;
};

type DekartGetUserStream = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: true;
  readonly requestType: typeof proto_dekart_pb.GetUserStreamRequest;
  readonly responseType: typeof proto_dekart_pb.GetUserStreamResponse;
};

type DekartGetUsage = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.GetUsageRequest;
  readonly responseType: typeof proto_dekart_pb.GetUsageResponse;
};

type DekartCreateSource = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateSourceRequest;
  readonly responseType: typeof proto_dekart_pb.CreateSourceResponse;
};

type DekartUpdateSource = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.UpdateSourceRequest;
  readonly responseType: typeof proto_dekart_pb.UpdateSourceResponse;
};

type DekartRemoveSource = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.RemoveSourceRequest;
  readonly responseType: typeof proto_dekart_pb.RemoveSourceResponse;
};

type DekartGetSourceList = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.GetSourceListRequest;
  readonly responseType: typeof proto_dekart_pb.GetSourceListResponse;
};

type DekartTestConnection = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.TestConnectionRequest;
  readonly responseType: typeof proto_dekart_pb.TestConnectionResponse;
};

export class Dekart {
  static readonly serviceName: string;
  static readonly CreateReport: DekartCreateReport;
  static readonly ForkReport: DekartForkReport;
  static readonly UpdateReport: DekartUpdateReport;
  static readonly ArchiveReport: DekartArchiveReport;
  static readonly SetDiscoverable: DekartSetDiscoverable;
  static readonly CreateDataset: DekartCreateDataset;
  static readonly RemoveDataset: DekartRemoveDataset;
  static readonly UpdateDataset: DekartUpdateDataset;
  static readonly CreateFile: DekartCreateFile;
  static readonly CreateQuery: DekartCreateQuery;
  static readonly RunQuery: DekartRunQuery;
  static readonly CancelQuery: DekartCancelQuery;
  static readonly GetEnv: DekartGetEnv;
  static readonly GetReportStream: DekartGetReportStream;
  static readonly GetReportListStream: DekartGetReportListStream;
  static readonly GetUserStream: DekartGetUserStream;
  static readonly GetUsage: DekartGetUsage;
  static readonly CreateSource: DekartCreateSource;
  static readonly UpdateSource: DekartUpdateSource;
  static readonly RemoveSource: DekartRemoveSource;
  static readonly GetSourceList: DekartGetSourceList;
  static readonly TestConnection: DekartTestConnection;
}

export type ServiceError = { message: string, code: number; metadata: grpc.Metadata }
export type Status = { details: string, code: number; metadata: grpc.Metadata }

interface UnaryResponse {
  cancel(): void;
}
interface ResponseStream<T> {
  cancel(): void;
  on(type: 'data', handler: (message: T) => void): ResponseStream<T>;
  on(type: 'end', handler: (status?: Status) => void): ResponseStream<T>;
  on(type: 'status', handler: (status: Status) => void): ResponseStream<T>;
}
interface RequestStream<T> {
  write(message: T): RequestStream<T>;
  end(): void;
  cancel(): void;
  on(type: 'end', handler: (status?: Status) => void): RequestStream<T>;
  on(type: 'status', handler: (status: Status) => void): RequestStream<T>;
}
interface BidirectionalStream<ReqT, ResT> {
  write(message: ReqT): BidirectionalStream<ReqT, ResT>;
  end(): void;
  cancel(): void;
  on(type: 'data', handler: (message: ResT) => void): BidirectionalStream<ReqT, ResT>;
  on(type: 'end', handler: (status?: Status) => void): BidirectionalStream<ReqT, ResT>;
  on(type: 'status', handler: (status: Status) => void): BidirectionalStream<ReqT, ResT>;
}

export class DekartClient {
  readonly serviceHost: string;

  constructor(serviceHost: string, options?: grpc.RpcOptions);
  createReport(
    requestMessage: proto_dekart_pb.CreateReportRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateReportResponse|null) => void
  ): UnaryResponse;
  createReport(
    requestMessage: proto_dekart_pb.CreateReportRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateReportResponse|null) => void
  ): UnaryResponse;
  forkReport(
    requestMessage: proto_dekart_pb.ForkReportRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ForkReportResponse|null) => void
  ): UnaryResponse;
  forkReport(
    requestMessage: proto_dekart_pb.ForkReportRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ForkReportResponse|null) => void
  ): UnaryResponse;
  updateReport(
    requestMessage: proto_dekart_pb.UpdateReportRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateReportResponse|null) => void
  ): UnaryResponse;
  updateReport(
    requestMessage: proto_dekart_pb.UpdateReportRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateReportResponse|null) => void
  ): UnaryResponse;
  archiveReport(
    requestMessage: proto_dekart_pb.ArchiveReportRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ArchiveReportResponse|null) => void
  ): UnaryResponse;
  archiveReport(
    requestMessage: proto_dekart_pb.ArchiveReportRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ArchiveReportResponse|null) => void
  ): UnaryResponse;
  setDiscoverable(
    requestMessage: proto_dekart_pb.SetDiscoverableRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.SetDiscoverableResponse|null) => void
  ): UnaryResponse;
  setDiscoverable(
    requestMessage: proto_dekart_pb.SetDiscoverableRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.SetDiscoverableResponse|null) => void
  ): UnaryResponse;
  createDataset(
    requestMessage: proto_dekart_pb.CreateDatasetRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateDatasetResponse|null) => void
  ): UnaryResponse;
  createDataset(
    requestMessage: proto_dekart_pb.CreateDatasetRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateDatasetResponse|null) => void
  ): UnaryResponse;
  removeDataset(
    requestMessage: proto_dekart_pb.RemoveDatasetRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveDatasetResponse|null) => void
  ): UnaryResponse;
  removeDataset(
    requestMessage: proto_dekart_pb.RemoveDatasetRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveDatasetResponse|null) => void
  ): UnaryResponse;
  updateDataset(
    requestMessage: proto_dekart_pb.UpdateDatasetRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateDatasetResponse|null) => void
  ): UnaryResponse;
  updateDataset(
    requestMessage: proto_dekart_pb.UpdateDatasetRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateDatasetResponse|null) => void
  ): UnaryResponse;
  createFile(
    requestMessage: proto_dekart_pb.CreateFileRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateFileResponse|null) => void
  ): UnaryResponse;
  createFile(
    requestMessage: proto_dekart_pb.CreateFileRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateFileResponse|null) => void
  ): UnaryResponse;
  createQuery(
    requestMessage: proto_dekart_pb.CreateQueryRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateQueryResponse|null) => void
  ): UnaryResponse;
  createQuery(
    requestMessage: proto_dekart_pb.CreateQueryRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateQueryResponse|null) => void
  ): UnaryResponse;
  runQuery(
    requestMessage: proto_dekart_pb.RunQueryRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RunQueryResponse|null) => void
  ): UnaryResponse;
  runQuery(
    requestMessage: proto_dekart_pb.RunQueryRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RunQueryResponse|null) => void
  ): UnaryResponse;
  cancelQuery(
    requestMessage: proto_dekart_pb.CancelQueryRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CancelQueryResponse|null) => void
  ): UnaryResponse;
  cancelQuery(
    requestMessage: proto_dekart_pb.CancelQueryRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CancelQueryResponse|null) => void
  ): UnaryResponse;
  getEnv(
    requestMessage: proto_dekart_pb.GetEnvRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetEnvResponse|null) => void
  ): UnaryResponse;
  getEnv(
    requestMessage: proto_dekart_pb.GetEnvRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetEnvResponse|null) => void
  ): UnaryResponse;
  getReportStream(requestMessage: proto_dekart_pb.ReportStreamRequest, metadata?: grpc.Metadata): ResponseStream<proto_dekart_pb.ReportStreamResponse>;
  getReportListStream(requestMessage: proto_dekart_pb.ReportListRequest, metadata?: grpc.Metadata): ResponseStream<proto_dekart_pb.ReportListResponse>;
  getUserStream(requestMessage: proto_dekart_pb.GetUserStreamRequest, metadata?: grpc.Metadata): ResponseStream<proto_dekart_pb.GetUserStreamResponse>;
  getUsage(
    requestMessage: proto_dekart_pb.GetUsageRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetUsageResponse|null) => void
  ): UnaryResponse;
  getUsage(
    requestMessage: proto_dekart_pb.GetUsageRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetUsageResponse|null) => void
  ): UnaryResponse;
  createSource(
    requestMessage: proto_dekart_pb.CreateSourceRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateSourceResponse|null) => void
  ): UnaryResponse;
  createSource(
    requestMessage: proto_dekart_pb.CreateSourceRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateSourceResponse|null) => void
  ): UnaryResponse;
  updateSource(
    requestMessage: proto_dekart_pb.UpdateSourceRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateSourceResponse|null) => void
  ): UnaryResponse;
  updateSource(
    requestMessage: proto_dekart_pb.UpdateSourceRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateSourceResponse|null) => void
  ): UnaryResponse;
  removeSource(
    requestMessage: proto_dekart_pb.RemoveSourceRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveSourceResponse|null) => void
  ): UnaryResponse;
  removeSource(
    requestMessage: proto_dekart_pb.RemoveSourceRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveSourceResponse|null) => void
  ): UnaryResponse;
  getSourceList(
    requestMessage: proto_dekart_pb.GetSourceListRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetSourceListResponse|null) => void
  ): UnaryResponse;
  getSourceList(
    requestMessage: proto_dekart_pb.GetSourceListRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetSourceListResponse|null) => void
  ): UnaryResponse;
  testConnection(
    requestMessage: proto_dekart_pb.TestConnectionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.TestConnectionResponse|null) => void
  ): UnaryResponse;
  testConnection(
    requestMessage: proto_dekart_pb.TestConnectionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.TestConnectionResponse|null) => void
  ): UnaryResponse;
}

