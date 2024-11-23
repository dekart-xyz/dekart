package user

import "dekart/src/proto"

// GetDefaultSubscription returns default subscription
func GetDefaultSubscription() proto.PlanType {
	return proto.PlanType_TYPE_PREMIUM
}
