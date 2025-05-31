// package: 
// file: dekart.proto

var dekart_pb = require("./dekart_pb");
var grpc = require("@improbable-eng/grpc-web").grpc;

var Dekart = (function () {
  function Dekart() {}
  Dekart.serviceName = "Dekart";
  return Dekart;
}());

Dekart.CreateReport = {
  methodName: "CreateReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CreateReportRequest,
  responseType: dekart_pb.CreateReportResponse
};

Dekart.ForkReport = {
  methodName: "ForkReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.ForkReportRequest,
  responseType: dekart_pb.ForkReportResponse
};

Dekart.UpdateReport = {
  methodName: "UpdateReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.UpdateReportRequest,
  responseType: dekart_pb.UpdateReportResponse
};

Dekart.ArchiveReport = {
  methodName: "ArchiveReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.ArchiveReportRequest,
  responseType: dekart_pb.ArchiveReportResponse
};

Dekart.SetDiscoverable = {
  methodName: "SetDiscoverable",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.SetDiscoverableRequest,
  responseType: dekart_pb.SetDiscoverableResponse
};

Dekart.PublishReport = {
  methodName: "PublishReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.PublishReportRequest,
  responseType: dekart_pb.PublishReportResponse
};

Dekart.AllowExportDatasets = {
  methodName: "AllowExportDatasets",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.AllowExportDatasetsRequest,
  responseType: dekart_pb.AllowExportDatasetsResponse
};

Dekart.AddReadme = {
  methodName: "AddReadme",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.AddReadmeRequest,
  responseType: dekart_pb.AddReadmeResponse
};

Dekart.RemoveReadme = {
  methodName: "RemoveReadme",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.RemoveReadmeRequest,
  responseType: dekart_pb.RemoveReadmeResponse
};

Dekart.AddReportDirectAccess = {
  methodName: "AddReportDirectAccess",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.AddReportDirectAccessRequest,
  responseType: dekart_pb.AddReportDirectAccessResponse
};

Dekart.CreateDataset = {
  methodName: "CreateDataset",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CreateDatasetRequest,
  responseType: dekart_pb.CreateDatasetResponse
};

Dekart.RemoveDataset = {
  methodName: "RemoveDataset",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.RemoveDatasetRequest,
  responseType: dekart_pb.RemoveDatasetResponse
};

Dekart.UpdateDatasetName = {
  methodName: "UpdateDatasetName",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.UpdateDatasetNameRequest,
  responseType: dekart_pb.UpdateDatasetNameResponse
};

Dekart.UpdateDatasetConnection = {
  methodName: "UpdateDatasetConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.UpdateDatasetConnectionRequest,
  responseType: dekart_pb.UpdateDatasetConnectionResponse
};

Dekart.CreateFile = {
  methodName: "CreateFile",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CreateFileRequest,
  responseType: dekart_pb.CreateFileResponse
};

Dekart.CreateQuery = {
  methodName: "CreateQuery",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CreateQueryRequest,
  responseType: dekart_pb.CreateQueryResponse
};

Dekart.RunQuery = {
  methodName: "RunQuery",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.RunQueryRequest,
  responseType: dekart_pb.RunQueryResponse
};

Dekart.RunAllQueries = {
  methodName: "RunAllQueries",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.RunAllQueriesRequest,
  responseType: dekart_pb.RunAllQueriesResponse
};

Dekart.CancelJob = {
  methodName: "CancelJob",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CancelJobRequest,
  responseType: dekart_pb.CancelJobResponse
};

Dekart.GetEnv = {
  methodName: "GetEnv",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.GetEnvRequest,
  responseType: dekart_pb.GetEnvResponse
};

Dekart.GetReportStream = {
  methodName: "GetReportStream",
  service: Dekart,
  requestStream: false,
  responseStream: true,
  requestType: dekart_pb.ReportStreamRequest,
  responseType: dekart_pb.ReportStreamResponse
};

Dekart.GetReportListStream = {
  methodName: "GetReportListStream",
  service: Dekart,
  requestStream: false,
  responseStream: true,
  requestType: dekart_pb.ReportListRequest,
  responseType: dekart_pb.ReportListResponse
};

Dekart.GetUserStream = {
  methodName: "GetUserStream",
  service: Dekart,
  requestStream: false,
  responseStream: true,
  requestType: dekart_pb.GetUserStreamRequest,
  responseType: dekart_pb.GetUserStreamResponse
};

Dekart.GetUsage = {
  methodName: "GetUsage",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.GetUsageRequest,
  responseType: dekart_pb.GetUsageResponse
};

Dekart.GetReportAnalytics = {
  methodName: "GetReportAnalytics",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.GetReportAnalyticsRequest,
  responseType: dekart_pb.GetReportAnalyticsResponse
};

Dekart.CreateConnection = {
  methodName: "CreateConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CreateConnectionRequest,
  responseType: dekart_pb.CreateConnectionResponse
};

Dekart.GetGcpProjectList = {
  methodName: "GetGcpProjectList",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.GetGcpProjectListRequest,
  responseType: dekart_pb.GetGcpProjectListResponse
};

Dekart.UpdateConnection = {
  methodName: "UpdateConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.UpdateConnectionRequest,
  responseType: dekart_pb.UpdateConnectionResponse
};

Dekart.ArchiveConnection = {
  methodName: "ArchiveConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.ArchiveConnectionRequest,
  responseType: dekart_pb.ArchiveConnectionResponse
};

Dekart.GetConnectionList = {
  methodName: "GetConnectionList",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.GetConnectionListRequest,
  responseType: dekart_pb.GetConnectionListResponse
};

Dekart.TestConnection = {
  methodName: "TestConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.TestConnectionRequest,
  responseType: dekart_pb.TestConnectionResponse
};

Dekart.SetDefaultConnection = {
  methodName: "SetDefaultConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.SetDefaultConnectionRequest,
  responseType: dekart_pb.SetDefaultConnectionResponse
};

Dekart.RespondToInvite = {
  methodName: "RespondToInvite",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.RespondToInviteRequest,
  responseType: dekart_pb.RespondToInviteResponse
};

Dekart.CreateSubscription = {
  methodName: "CreateSubscription",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CreateSubscriptionRequest,
  responseType: dekart_pb.CreateSubscriptionResponse
};

Dekart.GetStripePortalSession = {
  methodName: "GetStripePortalSession",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.GetStripePortalSessionRequest,
  responseType: dekart_pb.GetStripePortalSessionResponse
};

Dekart.CreateWorkspace = {
  methodName: "CreateWorkspace",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.CreateWorkspaceRequest,
  responseType: dekart_pb.CreateWorkspaceResponse
};

Dekart.UpdateWorkspace = {
  methodName: "UpdateWorkspace",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.UpdateWorkspaceRequest,
  responseType: dekart_pb.UpdateWorkspaceResponse
};

Dekart.GetWorkspace = {
  methodName: "GetWorkspace",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.GetWorkspaceRequest,
  responseType: dekart_pb.GetWorkspaceResponse
};

Dekart.UpdateWorkspaceUser = {
  methodName: "UpdateWorkspaceUser",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: dekart_pb.UpdateWorkspaceUserRequest,
  responseType: dekart_pb.UpdateWorkspaceUserResponse
};

exports.Dekart = Dekart;

function DekartClient(serviceHost, options) {
  this.serviceHost = serviceHost;
  this.options = options || {};
}

DekartClient.prototype.createReport = function createReport(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CreateReport, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.forkReport = function forkReport(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.ForkReport, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.updateReport = function updateReport(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.UpdateReport, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.archiveReport = function archiveReport(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.ArchiveReport, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.setDiscoverable = function setDiscoverable(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.SetDiscoverable, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.publishReport = function publishReport(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.PublishReport, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.allowExportDatasets = function allowExportDatasets(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.AllowExportDatasets, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.addReadme = function addReadme(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.AddReadme, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.removeReadme = function removeReadme(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.RemoveReadme, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.addReportDirectAccess = function addReportDirectAccess(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.AddReportDirectAccess, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.createDataset = function createDataset(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CreateDataset, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.removeDataset = function removeDataset(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.RemoveDataset, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.updateDatasetName = function updateDatasetName(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.UpdateDatasetName, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.updateDatasetConnection = function updateDatasetConnection(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.UpdateDatasetConnection, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.createFile = function createFile(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CreateFile, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.createQuery = function createQuery(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CreateQuery, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.runQuery = function runQuery(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.RunQuery, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.runAllQueries = function runAllQueries(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.RunAllQueries, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.cancelJob = function cancelJob(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CancelJob, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.getEnv = function getEnv(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.GetEnv, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.getReportStream = function getReportStream(requestMessage, metadata) {
  var listeners = {
    data: [],
    end: [],
    status: []
  };
  var client = grpc.invoke(Dekart.GetReportStream, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onMessage: function (responseMessage) {
      listeners.data.forEach(function (handler) {
        handler(responseMessage);
      });
    },
    onEnd: function (status, statusMessage, trailers) {
      listeners.status.forEach(function (handler) {
        handler({ code: status, details: statusMessage, metadata: trailers });
      });
      listeners.end.forEach(function (handler) {
        handler({ code: status, details: statusMessage, metadata: trailers });
      });
      listeners = null;
    }
  });
  return {
    on: function (type, handler) {
      listeners[type].push(handler);
      return this;
    },
    cancel: function () {
      listeners = null;
      client.close();
    }
  };
};

DekartClient.prototype.getReportListStream = function getReportListStream(requestMessage, metadata) {
  var listeners = {
    data: [],
    end: [],
    status: []
  };
  var client = grpc.invoke(Dekart.GetReportListStream, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onMessage: function (responseMessage) {
      listeners.data.forEach(function (handler) {
        handler(responseMessage);
      });
    },
    onEnd: function (status, statusMessage, trailers) {
      listeners.status.forEach(function (handler) {
        handler({ code: status, details: statusMessage, metadata: trailers });
      });
      listeners.end.forEach(function (handler) {
        handler({ code: status, details: statusMessage, metadata: trailers });
      });
      listeners = null;
    }
  });
  return {
    on: function (type, handler) {
      listeners[type].push(handler);
      return this;
    },
    cancel: function () {
      listeners = null;
      client.close();
    }
  };
};

DekartClient.prototype.getUserStream = function getUserStream(requestMessage, metadata) {
  var listeners = {
    data: [],
    end: [],
    status: []
  };
  var client = grpc.invoke(Dekart.GetUserStream, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onMessage: function (responseMessage) {
      listeners.data.forEach(function (handler) {
        handler(responseMessage);
      });
    },
    onEnd: function (status, statusMessage, trailers) {
      listeners.status.forEach(function (handler) {
        handler({ code: status, details: statusMessage, metadata: trailers });
      });
      listeners.end.forEach(function (handler) {
        handler({ code: status, details: statusMessage, metadata: trailers });
      });
      listeners = null;
    }
  });
  return {
    on: function (type, handler) {
      listeners[type].push(handler);
      return this;
    },
    cancel: function () {
      listeners = null;
      client.close();
    }
  };
};

DekartClient.prototype.getUsage = function getUsage(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.GetUsage, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.getReportAnalytics = function getReportAnalytics(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.GetReportAnalytics, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.createConnection = function createConnection(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CreateConnection, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.getGcpProjectList = function getGcpProjectList(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.GetGcpProjectList, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.updateConnection = function updateConnection(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.UpdateConnection, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.archiveConnection = function archiveConnection(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.ArchiveConnection, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.getConnectionList = function getConnectionList(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.GetConnectionList, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.testConnection = function testConnection(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.TestConnection, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.setDefaultConnection = function setDefaultConnection(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.SetDefaultConnection, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.respondToInvite = function respondToInvite(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.RespondToInvite, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.createSubscription = function createSubscription(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CreateSubscription, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.getStripePortalSession = function getStripePortalSession(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.GetStripePortalSession, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.createWorkspace = function createWorkspace(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CreateWorkspace, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.updateWorkspace = function updateWorkspace(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.UpdateWorkspace, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.getWorkspace = function getWorkspace(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.GetWorkspace, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

DekartClient.prototype.updateWorkspaceUser = function updateWorkspaceUser(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.UpdateWorkspaceUser, {
    request: requestMessage,
    host: this.serviceHost,
    metadata: metadata,
    transport: this.options.transport,
    debug: this.options.debug,
    onEnd: function (response) {
      if (callback) {
        if (response.status !== grpc.Code.OK) {
          var err = new Error(response.statusMessage);
          err.code = response.status;
          err.metadata = response.trailers;
          callback(err, null);
        } else {
          callback(null, response.message);
        }
      }
    }
  });
  return {
    cancel: function () {
      callback = null;
      client.close();
    }
  };
};

exports.DekartClient = DekartClient;

