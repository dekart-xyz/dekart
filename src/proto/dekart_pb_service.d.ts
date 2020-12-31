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

type DekartRunQuery = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.RunQueryRequest;
  readonly responseType: typeof proto_dekart_pb.RunQueryResponse;
};

type DekartGetTokens = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.GetTokensRequest;
  readonly responseType: typeof proto_dekart_pb.GetTokensResponse;
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
  static readonly CreateQuery: DekartCreateQuery;
  static readonly UpdateQuery: DekartUpdateQuery;
  static readonly UpdateReport: DekartUpdateReport;
  static readonly ArchiveReport: DekartArchiveReport;
  static readonly RunQuery: DekartRunQuery;
  static readonly GetTokens: DekartGetTokens;
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
  runQuery(
    requestMessage: proto_dekart_pb.RunQueryRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RunQueryResponse|null) => void
  ): UnaryResponse;
  runQuery(
    requestMessage: proto_dekart_pb.RunQueryRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RunQueryResponse|null) => void
  ): UnaryResponse;
  getTokens(
    requestMessage: proto_dekart_pb.GetTokensRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetTokensResponse|null) => void
  ): UnaryResponse;
  getTokens(
    requestMessage: proto_dekart_pb.GetTokensRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetTokensResponse|null) => void
  ): UnaryResponse;
  getReportStream(requestMessage: proto_dekart_pb.ReportStreamRequest, metadata?: grpc.Metadata): ResponseStream<proto_dekart_pb.ReportStreamResponse>;
  getReportListStream(requestMessage: proto_dekart_pb.ReportListRequest, metadata?: grpc.Metadata): ResponseStream<proto_dekart_pb.ReportListResponse>;
}

