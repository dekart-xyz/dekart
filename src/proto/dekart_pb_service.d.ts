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

type DekartUpdateDatasetName = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.UpdateDatasetNameRequest;
  readonly responseType: typeof proto_dekart_pb.UpdateDatasetNameResponse;
};

type DekartUpdateDatasetConnection = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.UpdateDatasetConnectionRequest;
  readonly responseType: typeof proto_dekart_pb.UpdateDatasetConnectionResponse;
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

type DekartRunAllQueries = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.RunAllQueriesRequest;
  readonly responseType: typeof proto_dekart_pb.RunAllQueriesResponse;
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

type DekartCreateConnection = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateConnectionRequest;
  readonly responseType: typeof proto_dekart_pb.CreateConnectionResponse;
};

type DekartUpdateConnection = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.UpdateConnectionRequest;
  readonly responseType: typeof proto_dekart_pb.UpdateConnectionResponse;
};

type DekartArchiveConnection = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.ArchiveConnectionRequest;
  readonly responseType: typeof proto_dekart_pb.ArchiveConnectionResponse;
};

type DekartGetConnectionList = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.GetConnectionListRequest;
  readonly responseType: typeof proto_dekart_pb.GetConnectionListResponse;
};

type DekartTestConnection = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.TestConnectionRequest;
  readonly responseType: typeof proto_dekart_pb.TestConnectionResponse;
};

type DekartSetDefaultConnection = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.SetDefaultConnectionRequest;
  readonly responseType: typeof proto_dekart_pb.SetDefaultConnectionResponse;
};

type DekartCreateSubscription = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CreateSubscriptionRequest;
  readonly responseType: typeof proto_dekart_pb.CreateSubscriptionResponse;
};

type DekartGetSubscription = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.GetSubscriptionRequest;
  readonly responseType: typeof proto_dekart_pb.GetSubscriptionResponse;
};

type DekartCancelSubscription = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.CancelSubscriptionRequest;
  readonly responseType: typeof proto_dekart_pb.CancelSubscriptionResponse;
};

type DekartListUsers = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.ListUsersRequest;
  readonly responseType: typeof proto_dekart_pb.ListUsersResponse;
};

type DekartAddUser = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.AddUserRequest;
  readonly responseType: typeof proto_dekart_pb.AddUserResponse;
};

type DekartRemoveUser = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.RemoveUserRequest;
  readonly responseType: typeof proto_dekart_pb.RemoveUserResponse;
};

type DekartConfirmJoinOrganization = {
  readonly methodName: string;
  readonly service: typeof Dekart;
  readonly requestStream: false;
  readonly responseStream: false;
  readonly requestType: typeof proto_dekart_pb.ConfirmJoinOrganizationRequest;
  readonly responseType: typeof proto_dekart_pb.ConfirmJoinOrganizationResponse;
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
  static readonly UpdateDatasetName: DekartUpdateDatasetName;
  static readonly UpdateDatasetConnection: DekartUpdateDatasetConnection;
  static readonly CreateFile: DekartCreateFile;
  static readonly CreateQuery: DekartCreateQuery;
  static readonly RunQuery: DekartRunQuery;
  static readonly CancelQuery: DekartCancelQuery;
  static readonly RunAllQueries: DekartRunAllQueries;
  static readonly GetEnv: DekartGetEnv;
  static readonly GetReportStream: DekartGetReportStream;
  static readonly GetReportListStream: DekartGetReportListStream;
  static readonly GetUserStream: DekartGetUserStream;
  static readonly GetUsage: DekartGetUsage;
  static readonly CreateConnection: DekartCreateConnection;
  static readonly UpdateConnection: DekartUpdateConnection;
  static readonly ArchiveConnection: DekartArchiveConnection;
  static readonly GetConnectionList: DekartGetConnectionList;
  static readonly TestConnection: DekartTestConnection;
  static readonly SetDefaultConnection: DekartSetDefaultConnection;
  static readonly CreateSubscription: DekartCreateSubscription;
  static readonly GetSubscription: DekartGetSubscription;
  static readonly CancelSubscription: DekartCancelSubscription;
  static readonly ListUsers: DekartListUsers;
  static readonly AddUser: DekartAddUser;
  static readonly RemoveUser: DekartRemoveUser;
  static readonly ConfirmJoinOrganization: DekartConfirmJoinOrganization;
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
  updateDatasetName(
    requestMessage: proto_dekart_pb.UpdateDatasetNameRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateDatasetNameResponse|null) => void
  ): UnaryResponse;
  updateDatasetName(
    requestMessage: proto_dekart_pb.UpdateDatasetNameRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateDatasetNameResponse|null) => void
  ): UnaryResponse;
  updateDatasetConnection(
    requestMessage: proto_dekart_pb.UpdateDatasetConnectionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateDatasetConnectionResponse|null) => void
  ): UnaryResponse;
  updateDatasetConnection(
    requestMessage: proto_dekart_pb.UpdateDatasetConnectionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateDatasetConnectionResponse|null) => void
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
  runAllQueries(
    requestMessage: proto_dekart_pb.RunAllQueriesRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RunAllQueriesResponse|null) => void
  ): UnaryResponse;
  runAllQueries(
    requestMessage: proto_dekart_pb.RunAllQueriesRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RunAllQueriesResponse|null) => void
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
  createConnection(
    requestMessage: proto_dekart_pb.CreateConnectionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateConnectionResponse|null) => void
  ): UnaryResponse;
  createConnection(
    requestMessage: proto_dekart_pb.CreateConnectionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateConnectionResponse|null) => void
  ): UnaryResponse;
  updateConnection(
    requestMessage: proto_dekart_pb.UpdateConnectionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateConnectionResponse|null) => void
  ): UnaryResponse;
  updateConnection(
    requestMessage: proto_dekart_pb.UpdateConnectionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.UpdateConnectionResponse|null) => void
  ): UnaryResponse;
  archiveConnection(
    requestMessage: proto_dekart_pb.ArchiveConnectionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ArchiveConnectionResponse|null) => void
  ): UnaryResponse;
  archiveConnection(
    requestMessage: proto_dekart_pb.ArchiveConnectionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ArchiveConnectionResponse|null) => void
  ): UnaryResponse;
  getConnectionList(
    requestMessage: proto_dekart_pb.GetConnectionListRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetConnectionListResponse|null) => void
  ): UnaryResponse;
  getConnectionList(
    requestMessage: proto_dekart_pb.GetConnectionListRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetConnectionListResponse|null) => void
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
  setDefaultConnection(
    requestMessage: proto_dekart_pb.SetDefaultConnectionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.SetDefaultConnectionResponse|null) => void
  ): UnaryResponse;
  setDefaultConnection(
    requestMessage: proto_dekart_pb.SetDefaultConnectionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.SetDefaultConnectionResponse|null) => void
  ): UnaryResponse;
  createSubscription(
    requestMessage: proto_dekart_pb.CreateSubscriptionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateSubscriptionResponse|null) => void
  ): UnaryResponse;
  createSubscription(
    requestMessage: proto_dekart_pb.CreateSubscriptionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CreateSubscriptionResponse|null) => void
  ): UnaryResponse;
  getSubscription(
    requestMessage: proto_dekart_pb.GetSubscriptionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetSubscriptionResponse|null) => void
  ): UnaryResponse;
  getSubscription(
    requestMessage: proto_dekart_pb.GetSubscriptionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.GetSubscriptionResponse|null) => void
  ): UnaryResponse;
  cancelSubscription(
    requestMessage: proto_dekart_pb.CancelSubscriptionRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CancelSubscriptionResponse|null) => void
  ): UnaryResponse;
  cancelSubscription(
    requestMessage: proto_dekart_pb.CancelSubscriptionRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.CancelSubscriptionResponse|null) => void
  ): UnaryResponse;
  listUsers(
    requestMessage: proto_dekart_pb.ListUsersRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ListUsersResponse|null) => void
  ): UnaryResponse;
  listUsers(
    requestMessage: proto_dekart_pb.ListUsersRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ListUsersResponse|null) => void
  ): UnaryResponse;
  addUser(
    requestMessage: proto_dekart_pb.AddUserRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.AddUserResponse|null) => void
  ): UnaryResponse;
  addUser(
    requestMessage: proto_dekart_pb.AddUserRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.AddUserResponse|null) => void
  ): UnaryResponse;
  removeUser(
    requestMessage: proto_dekart_pb.RemoveUserRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveUserResponse|null) => void
  ): UnaryResponse;
  removeUser(
    requestMessage: proto_dekart_pb.RemoveUserRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.RemoveUserResponse|null) => void
  ): UnaryResponse;
  confirmJoinOrganization(
    requestMessage: proto_dekart_pb.ConfirmJoinOrganizationRequest,
    metadata: grpc.Metadata,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ConfirmJoinOrganizationResponse|null) => void
  ): UnaryResponse;
  confirmJoinOrganization(
    requestMessage: proto_dekart_pb.ConfirmJoinOrganizationRequest,
    callback: (error: ServiceError|null, responseMessage: proto_dekart_pb.ConfirmJoinOrganizationResponse|null) => void
  ): UnaryResponse;
}

