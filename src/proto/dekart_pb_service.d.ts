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

type DekartCreateDataset = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateDatasetRequest;
  readonly responseType: typeof proto_dekart_pb.CreateDatasetResponse;
};

type DekartCreateQuery = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateQueryRequest;
  readonly responseType: typeof proto_dekart_pb.CreateQueryResponse;
};

type DekartUpdateQuery = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.UpdateQueryRequest;
  readonly responseType: typeof proto_dekart_pb.UpdateQueryResponse;
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

type DekartRemoveQuery = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.RemoveQueryRequest;
  readonly responseType: typeof proto_dekart_pb.RemoveQueryResponse;
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

export class Dekart {
  static readonly serviceName: string;
  static readonly CreateReport: DekartCreateReport;
  static readonly ForkReport: DekartForkReport;
  static readonly UpdateReport: DekartUpdateReport;
  static readonly ArchiveReport: DekartArchiveReport;
  static readonly CreateDataset: DekartCreateDataset;
  static readonly CreateQuery: DekartCreateQuery;
  static readonly UpdateQuery: DekartUpdateQuery;
  static readonly RunQuery: DekartRunQuery;
  static readonly CancelQuery: DekartCancelQuery;
  static readonly RemoveQuery: DekartRemoveQuery;
  static readonly GetEnv: DekartGetEnv;
  static readonly GetReportStream: DekartGetReportStream;
  static readonly GetReportListStream: DekartGetReportListStream;
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
  createDataset(
    requestMessage: proto_dekart_pb.CreateDatasetRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateDatasetResponse|null) => void
  ): UnaryResponse;
  createDataset(
    requestMessage: proto_dekart_pb.CreateDatasetRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateDatasetResponse|null) => void
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
  updateQuery(
    requestMessage: proto_dekart_pb.UpdateQueryRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateQueryResponse|null) => void
  ): UnaryResponse;
  updateQuery(
    requestMessage: proto_dekart_pb.UpdateQueryRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateQueryResponse|null) => void
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
  removeQuery(
    requestMessage: proto_dekart_pb.RemoveQueryRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveQueryResponse|null) => void
  ): UnaryResponse;
  removeQuery(
    requestMessage: proto_dekart_pb.RemoveQueryRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveQueryResponse|null) => void
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
}

