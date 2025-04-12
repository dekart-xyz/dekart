package user

import (
	"dekart/src/proto"
	"os"
)

// GetDefaultSubscription returns default subscription
func GetDefaultSubscription() proto.PlanType {
	if os.Getenv("DEKART_CLOUD") != "" {
		return proto.PlanType_TYPE_PERSONAL
	}
	return proto.PlanType_TYPE_SELF_HOSTED
}
