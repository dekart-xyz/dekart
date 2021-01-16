// Code generated by protoc-gen-go-grpc. DO NOT EDIT.

package proto

import (
	context "context"
	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	status "google.golang.org/grpc/status"
)

// This is a compile-time assertion to ensure that this generated file
// is compatible with the grpc package it is being compiled against.
const _ = grpc.SupportPackageIsVersion7

// DekartClient is the client API for Dekart service.
//
// For semantics around ctx use and closing/ending streaming RPCs, please refer to https://pkg.go.dev/google.golang.org/grpc/?tab=doc#ClientConn.NewStream.
type DekartClient interface {
	CreateReport(ctx context.Context, in *CreateReportRequest, opts ...grpc.CallOption) (*CreateReportResponse, error)
	UpdateReport(ctx context.Context, in *UpdateReportRequest, opts ...grpc.CallOption) (*UpdateReportResponse, error)
	ArchiveReport(ctx context.Context, in *ArchiveReportRequest, opts ...grpc.CallOption) (*ArchiveReportResponse, error)
	CreateQuery(ctx context.Context, in *CreateQueryRequest, opts ...grpc.CallOption) (*CreateQueryResponse, error)
	UpdateQuery(ctx context.Context, in *UpdateQueryRequest, opts ...grpc.CallOption) (*UpdateQueryResponse, error)
	RunQuery(ctx context.Context, in *RunQueryRequest, opts ...grpc.CallOption) (*RunQueryResponse, error)
	CancelQuery(ctx context.Context, in *CancelQueryRequest, opts ...grpc.CallOption) (*CancelQueryResponse, error)
	GetTokens(ctx context.Context, in *GetTokensRequest, opts ...grpc.CallOption) (*GetTokensResponse, error)
	GetReportStream(ctx context.Context, in *ReportStreamRequest, opts ...grpc.CallOption) (Dekart_GetReportStreamClient, error)
	GetReportListStream(ctx context.Context, in *ReportListRequest, opts ...grpc.CallOption) (Dekart_GetReportListStreamClient, error)
}

type dekartClient struct {
	cc grpc.ClientConnInterface
}

func NewDekartClient(cc grpc.ClientConnInterface) DekartClient {
	return &dekartClient{cc}
}

func (c *dekartClient) CreateReport(ctx context.Context, in *CreateReportRequest, opts ...grpc.CallOption) (*CreateReportResponse, error) {
	out := new(CreateReportResponse)
	err := c.cc.Invoke(ctx, "/Dekart/CreateReport", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) UpdateReport(ctx context.Context, in *UpdateReportRequest, opts ...grpc.CallOption) (*UpdateReportResponse, error) {
	out := new(UpdateReportResponse)
	err := c.cc.Invoke(ctx, "/Dekart/UpdateReport", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) ArchiveReport(ctx context.Context, in *ArchiveReportRequest, opts ...grpc.CallOption) (*ArchiveReportResponse, error) {
	out := new(ArchiveReportResponse)
	err := c.cc.Invoke(ctx, "/Dekart/ArchiveReport", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) CreateQuery(ctx context.Context, in *CreateQueryRequest, opts ...grpc.CallOption) (*CreateQueryResponse, error) {
	out := new(CreateQueryResponse)
	err := c.cc.Invoke(ctx, "/Dekart/CreateQuery", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) UpdateQuery(ctx context.Context, in *UpdateQueryRequest, opts ...grpc.CallOption) (*UpdateQueryResponse, error) {
	out := new(UpdateQueryResponse)
	err := c.cc.Invoke(ctx, "/Dekart/UpdateQuery", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) RunQuery(ctx context.Context, in *RunQueryRequest, opts ...grpc.CallOption) (*RunQueryResponse, error) {
	out := new(RunQueryResponse)
	err := c.cc.Invoke(ctx, "/Dekart/RunQuery", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) CancelQuery(ctx context.Context, in *CancelQueryRequest, opts ...grpc.CallOption) (*CancelQueryResponse, error) {
	out := new(CancelQueryResponse)
	err := c.cc.Invoke(ctx, "/Dekart/CancelQuery", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) GetTokens(ctx context.Context, in *GetTokensRequest, opts ...grpc.CallOption) (*GetTokensResponse, error) {
	out := new(GetTokensResponse)
	err := c.cc.Invoke(ctx, "/Dekart/GetTokens", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *dekartClient) GetReportStream(ctx context.Context, in *ReportStreamRequest, opts ...grpc.CallOption) (Dekart_GetReportStreamClient, error) {
	stream, err := c.cc.NewStream(ctx, &_Dekart_serviceDesc.Streams[0], "/Dekart/GetReportStream", opts...)
	if err != nil {
		return nil, err
	}
	x := &dekartGetReportStreamClient{stream}
	if err := x.ClientStream.SendMsg(in); err != nil {
		return nil, err
	}
	if err := x.ClientStream.CloseSend(); err != nil {
		return nil, err
	}
	return x, nil
}

type Dekart_GetReportStreamClient interface {
	Recv() (*ReportStreamResponse, error)
	grpc.ClientStream
}

type dekartGetReportStreamClient struct {
	grpc.ClientStream
}

func (x *dekartGetReportStreamClient) Recv() (*ReportStreamResponse, error) {
	m := new(ReportStreamResponse)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (c *dekartClient) GetReportListStream(ctx context.Context, in *ReportListRequest, opts ...grpc.CallOption) (Dekart_GetReportListStreamClient, error) {
	stream, err := c.cc.NewStream(ctx, &_Dekart_serviceDesc.Streams[1], "/Dekart/GetReportListStream", opts...)
	if err != nil {
		return nil, err
	}
	x := &dekartGetReportListStreamClient{stream}
	if err := x.ClientStream.SendMsg(in); err != nil {
		return nil, err
	}
	if err := x.ClientStream.CloseSend(); err != nil {
		return nil, err
	}
	return x, nil
}

type Dekart_GetReportListStreamClient interface {
	Recv() (*ReportListResponse, error)
	grpc.ClientStream
}

type dekartGetReportListStreamClient struct {
	grpc.ClientStream
}

func (x *dekartGetReportListStreamClient) Recv() (*ReportListResponse, error) {
	m := new(ReportListResponse)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

// DekartServer is the server API for Dekart service.
// All implementations must embed UnimplementedDekartServer
// for forward compatibility
type DekartServer interface {
	CreateReport(context.Context, *CreateReportRequest) (*CreateReportResponse, error)
	UpdateReport(context.Context, *UpdateReportRequest) (*UpdateReportResponse, error)
	ArchiveReport(context.Context, *ArchiveReportRequest) (*ArchiveReportResponse, error)
	CreateQuery(context.Context, *CreateQueryRequest) (*CreateQueryResponse, error)
	UpdateQuery(context.Context, *UpdateQueryRequest) (*UpdateQueryResponse, error)
	RunQuery(context.Context, *RunQueryRequest) (*RunQueryResponse, error)
	CancelQuery(context.Context, *CancelQueryRequest) (*CancelQueryResponse, error)
	GetTokens(context.Context, *GetTokensRequest) (*GetTokensResponse, error)
	GetReportStream(*ReportStreamRequest, Dekart_GetReportStreamServer) error
	GetReportListStream(*ReportListRequest, Dekart_GetReportListStreamServer) error
	mustEmbedUnimplementedDekartServer()
}

// UnimplementedDekartServer must be embedded to have forward compatible implementations.
type UnimplementedDekartServer struct {
}

func (UnimplementedDekartServer) CreateReport(context.Context, *CreateReportRequest) (*CreateReportResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateReport not implemented")
}
func (UnimplementedDekartServer) UpdateReport(context.Context, *UpdateReportRequest) (*UpdateReportResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateReport not implemented")
}
func (UnimplementedDekartServer) ArchiveReport(context.Context, *ArchiveReportRequest) (*ArchiveReportResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ArchiveReport not implemented")
}
func (UnimplementedDekartServer) CreateQuery(context.Context, *CreateQueryRequest) (*CreateQueryResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateQuery not implemented")
}
func (UnimplementedDekartServer) UpdateQuery(context.Context, *UpdateQueryRequest) (*UpdateQueryResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateQuery not implemented")
}
func (UnimplementedDekartServer) RunQuery(context.Context, *RunQueryRequest) (*RunQueryResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method RunQuery not implemented")
}
func (UnimplementedDekartServer) CancelQuery(context.Context, *CancelQueryRequest) (*CancelQueryResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CancelQuery not implemented")
}
func (UnimplementedDekartServer) GetTokens(context.Context, *GetTokensRequest) (*GetTokensResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetTokens not implemented")
}
func (UnimplementedDekartServer) GetReportStream(*ReportStreamRequest, Dekart_GetReportStreamServer) error {
	return status.Errorf(codes.Unimplemented, "method GetReportStream not implemented")
}
func (UnimplementedDekartServer) GetReportListStream(*ReportListRequest, Dekart_GetReportListStreamServer) error {
	return status.Errorf(codes.Unimplemented, "method GetReportListStream not implemented")
}
func (UnimplementedDekartServer) mustEmbedUnimplementedDekartServer() {}

// UnsafeDekartServer may be embedded to opt out of forward compatibility for this service.
// Use of this interface is not recommended, as added methods to DekartServer will
// result in compilation errors.
type UnsafeDekartServer interface {
	mustEmbedUnimplementedDekartServer()
}

func RegisterDekartServer(s grpc.ServiceRegistrar, srv DekartServer) {
	s.RegisterService(&_Dekart_serviceDesc, srv)
}

func _Dekart_CreateReport_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(CreateReportRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).CreateReport(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/CreateReport",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).CreateReport(ctx, req.(*CreateReportRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_UpdateReport_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(UpdateReportRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).UpdateReport(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/UpdateReport",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).UpdateReport(ctx, req.(*UpdateReportRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_ArchiveReport_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(ArchiveReportRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).ArchiveReport(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/ArchiveReport",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).ArchiveReport(ctx, req.(*ArchiveReportRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_CreateQuery_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(CreateQueryRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).CreateQuery(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/CreateQuery",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).CreateQuery(ctx, req.(*CreateQueryRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_UpdateQuery_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(UpdateQueryRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).UpdateQuery(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/UpdateQuery",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).UpdateQuery(ctx, req.(*UpdateQueryRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_RunQuery_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(RunQueryRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).RunQuery(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/RunQuery",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).RunQuery(ctx, req.(*RunQueryRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_CancelQuery_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(CancelQueryRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).CancelQuery(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/CancelQuery",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).CancelQuery(ctx, req.(*CancelQueryRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_GetTokens_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(GetTokensRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(DekartServer).GetTokens(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/Dekart/GetTokens",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(DekartServer).GetTokens(ctx, req.(*GetTokensRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _Dekart_GetReportStream_Handler(srv interface{}, stream grpc.ServerStream) error {
	m := new(ReportStreamRequest)
	if err := stream.RecvMsg(m); err != nil {
		return err
	}
	return srv.(DekartServer).GetReportStream(m, &dekartGetReportStreamServer{stream})
}

type Dekart_GetReportStreamServer interface {
	Send(*ReportStreamResponse) error
	grpc.ServerStream
}

type dekartGetReportStreamServer struct {
	grpc.ServerStream
}

func (x *dekartGetReportStreamServer) Send(m *ReportStreamResponse) error {
	return x.ServerStream.SendMsg(m)
}

func _Dekart_GetReportListStream_Handler(srv interface{}, stream grpc.ServerStream) error {
	m := new(ReportListRequest)
	if err := stream.RecvMsg(m); err != nil {
		return err
	}
	return srv.(DekartServer).GetReportListStream(m, &dekartGetReportListStreamServer{stream})
}

type Dekart_GetReportListStreamServer interface {
	Send(*ReportListResponse) error
	grpc.ServerStream
}

type dekartGetReportListStreamServer struct {
	grpc.ServerStream
}

func (x *dekartGetReportListStreamServer) Send(m *ReportListResponse) error {
	return x.ServerStream.SendMsg(m)
}

var _Dekart_serviceDesc = grpc.ServiceDesc{
	ServiceName: "Dekart",
	HandlerType: (*DekartServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "CreateReport",
			Handler:    _Dekart_CreateReport_Handler,
		},
		{
			MethodName: "UpdateReport",
			Handler:    _Dekart_UpdateReport_Handler,
		},
		{
			MethodName: "ArchiveReport",
			Handler:    _Dekart_ArchiveReport_Handler,
		},
		{
			MethodName: "CreateQuery",
			Handler:    _Dekart_CreateQuery_Handler,
		},
		{
			MethodName: "UpdateQuery",
			Handler:    _Dekart_UpdateQuery_Handler,
		},
		{
			MethodName: "RunQuery",
			Handler:    _Dekart_RunQuery_Handler,
		},
		{
			MethodName: "CancelQuery",
			Handler:    _Dekart_CancelQuery_Handler,
		},
		{
			MethodName: "GetTokens",
			Handler:    _Dekart_GetTokens_Handler,
		},
	},
	Streams: []grpc.StreamDesc{
		{
			StreamName:    "GetReportStream",
			Handler:       _Dekart_GetReportStream_Handler,
			ServerStreams: true,
		},
		{
			StreamName:    "GetReportListStream",
			Handler:       _Dekart_GetReportListStream_Handler,
			ServerStreams: true,
		},
	},
	Metadata: "proto/dekart.proto",
}