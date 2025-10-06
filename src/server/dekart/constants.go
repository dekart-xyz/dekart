package dekart

// Message size limits to prevent gRPC message size errors
const (
	// MaxMapConfigSize is the maximum allowed size for map configurations
	// Set to 3MB to prevent gRPC message size errors while allowing reasonable map complexity
	MaxMapConfigSize = 3 * 1024 * 1024 // 3MB
)
