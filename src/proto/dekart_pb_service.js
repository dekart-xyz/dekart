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

Dekart.CreateQuery = {
  methodName: "CreateQuery",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.CreateQueryRequest,
  responseType: proto_dekart_pb.CreateQueryResponse
};

Dekart.UpdateQuery = {
  methodName: "UpdateQuery",
  service: Dekart,
  requestStream: false,
  responseStream: false,
  requestType: proto_dekart_pb.UpdateQueryRequest,
  responseType: proto_dekart_pb.UpdateQueryResponse
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

DekartClient.prototype.updateQuery = function updateQuery(requestMessage, metadata, callback) {
  if (arguments.length === 2) {
    callback = arguments[1];
  }
  var client = grpc.unary(Dekart.UpdateQuery, {
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

exports.DekartClient = DekartClient;

