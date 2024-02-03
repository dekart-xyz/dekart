// package: 
// file: proto/dekart.proto

var proto_dekart_pb = require("../proto/dekart_pb");
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
  requestType: proto_dekart_pb.CreateReportRequest,
  responseType: proto_dekart_pb.CreateReportResponse
};

Dekart.ForkReport = {
  methodName: "ForkReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.ForkReportRequest,
  responseType: proto_dekart_pb.ForkReportResponse
};

Dekart.UpdateReport = {
  methodName: "UpdateReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.UpdateReportRequest,
  responseType: proto_dekart_pb.UpdateReportResponse
};

Dekart.ArchiveReport = {
  methodName: "ArchiveReport",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.ArchiveReportRequest,
  responseType: proto_dekart_pb.ArchiveReportResponse
};

Dekart.SetDiscoverable = {
  methodName: "SetDiscoverable",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.SetDiscoverableRequest,
  responseType: proto_dekart_pb.SetDiscoverableResponse
};

Dekart.CreateDataset = {
  methodName: "CreateDataset",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CreateDatasetRequest,
  responseType: proto_dekart_pb.CreateDatasetResponse
};

Dekart.RemoveDataset = {
  methodName: "RemoveDataset",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.RemoveDatasetRequest,
  responseType: proto_dekart_pb.RemoveDatasetResponse
};

Dekart.UpdateDatasetName = {
  methodName: "UpdateDatasetName",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.UpdateDatasetNameRequest,
  responseType: proto_dekart_pb.UpdateDatasetNameResponse
};

Dekart.UpdateDatasetConnection = {
  methodName: "UpdateDatasetConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.UpdateDatasetConnectionRequest,
  responseType: proto_dekart_pb.UpdateDatasetConnectionResponse
};

Dekart.CreateFile = {
  methodName: "CreateFile",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CreateFileRequest,
  responseType: proto_dekart_pb.CreateFileResponse
};

Dekart.CreateQuery = {
  methodName: "CreateQuery",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CreateQueryRequest,
  responseType: proto_dekart_pb.CreateQueryResponse
};

Dekart.RunQuery = {
  methodName: "RunQuery",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.RunQueryRequest,
  responseType: proto_dekart_pb.RunQueryResponse
};

Dekart.CancelQuery = {
  methodName: "CancelQuery",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CancelQueryRequest,
  responseType: proto_dekart_pb.CancelQueryResponse
};

Dekart.RunAllQueries = {
  methodName: "RunAllQueries",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.RunAllQueriesRequest,
  responseType: proto_dekart_pb.RunAllQueriesResponse
};

Dekart.GetEnv = {
  methodName: "GetEnv",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.GetEnvRequest,
  responseType: proto_dekart_pb.GetEnvResponse
};

Dekart.GetReportStream = {
  methodName: "GetReportStream",
  service: Dekart,
  requestStream: false,
  responseStream: true,
  requestType: proto_dekart_pb.ReportStreamRequest,
  responseType: proto_dekart_pb.ReportStreamResponse
};

Dekart.GetReportListStream = {
  methodName: "GetReportListStream",
  service: Dekart,
  requestStream: false,
  responseStream: true,
  requestType: proto_dekart_pb.ReportListRequest,
  responseType: proto_dekart_pb.ReportListResponse
};

Dekart.GetUserStream = {
  methodName: "GetUserStream",
  service: Dekart,
  requestStream: false,
  responseStream: true,
  requestType: proto_dekart_pb.GetUserStreamRequest,
  responseType: proto_dekart_pb.GetUserStreamResponse
};

Dekart.GetUsage = {
  methodName: "GetUsage",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.GetUsageRequest,
  responseType: proto_dekart_pb.GetUsageResponse
};

Dekart.CreateConnection = {
  methodName: "CreateConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CreateConnectionRequest,
  responseType: proto_dekart_pb.CreateConnectionResponse
};

Dekart.UpdateConnection = {
  methodName: "UpdateConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.UpdateConnectionRequest,
  responseType: proto_dekart_pb.UpdateConnectionResponse
};

Dekart.ArchiveConnection = {
  methodName: "ArchiveConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.ArchiveConnectionRequest,
  responseType: proto_dekart_pb.ArchiveConnectionResponse
};

Dekart.GetConnectionList = {
  methodName: "GetConnectionList",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.GetConnectionListRequest,
  responseType: proto_dekart_pb.GetConnectionListResponse
};

Dekart.TestConnection = {
  methodName: "TestConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.TestConnectionRequest,
  responseType: proto_dekart_pb.TestConnectionResponse
};

Dekart.SetDefaultConnection = {
  methodName: "SetDefaultConnection",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.SetDefaultConnectionRequest,
  responseType: proto_dekart_pb.SetDefaultConnectionResponse
};

Dekart.RespondToInvite = {
  methodName: "RespondToInvite",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.RespondToInviteRequest,
  responseType: proto_dekart_pb.RespondToInviteResponse
};

Dekart.CreateSubscription = {
  methodName: "CreateSubscription",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CreateSubscriptionRequest,
  responseType: proto_dekart_pb.CreateSubscriptionResponse
};

Dekart.CancelSubscription = {
  methodName: "CancelSubscription",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CancelSubscriptionRequest,
  responseType: proto_dekart_pb.CancelSubscriptionResponse
};

Dekart.GetStripePortalSession = {
  methodName: "GetStripePortalSession",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.GetStripePortalSessionRequest,
  responseType: proto_dekart_pb.GetStripePortalSessionResponse
};

Dekart.CreateWorkspace = {
  methodName: "CreateWorkspace",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CreateWorkspaceRequest,
  responseType: proto_dekart_pb.CreateWorkspaceResponse
};

Dekart.UpdateWorkspace = {
  methodName: "UpdateWorkspace",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.UpdateWorkspaceRequest,
  responseType: proto_dekart_pb.UpdateWorkspaceResponse
};

Dekart.GetWorkspace = {
  methodName: "GetWorkspace",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.GetWorkspaceRequest,
  responseType: proto_dekart_pb.GetWorkspaceResponse
};

Dekart.UpdateWorkspaceUser = {
  methodName: "UpdateWorkspaceUser",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.UpdateWorkspaceUserRequest,
  responseType: proto_dekart_pb.UpdateWorkspaceUserResponse
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

DekartClient.prototype.cancelQuery = function cancelQuery(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CancelQuery, {
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

DekartClient.prototype.cancelSubscription = function cancelSubscription(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.CancelSubscription, {
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

