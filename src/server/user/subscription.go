package user

import (
	"dekart/src/proto"
	"os"
	"strings"
)

// GetDefaultSubscription returns default subscription
func GetDefaultSubscription() proto.PlanType {
	if os.Getenv("DEKART_CLOUD") != "" {
		return proto.PlanType_TYPE_PERSONAL
	}
	if strings.TrimSpace(os.Getenv("DEKART_LICENSE_KEY")) != "" {
		return proto.PlanType_TYPE_PREMIUM
	}
	return proto.PlanType_TYPE_COMMUNITY
}

func ReclassifyLegacySelfHostedPlan(planType proto.PlanType) proto.PlanType {
	if planType == proto.PlanType_TYPE_SELF_HOSTED {
		if strings.TrimSpace(os.Getenv("DEKART_LICENSE_KEY")) != "" {
			return proto.PlanType_TYPE_PREMIUM
		}
		return proto.PlanType_TYPE_COMMUNITY
	}
	return planType
}

func IsSelfHostedPlan(planType proto.PlanType) bool {
	return planType == proto.PlanType_TYPE_COMMUNITY ||
		planType == proto.PlanType_TYPE_PREMIUM
}
