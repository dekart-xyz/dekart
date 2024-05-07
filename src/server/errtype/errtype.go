package errtype

import "regexp"

type EmptyResult struct{}

func (e *EmptyResult) Error() string {
	return "Empty result"
}

var ContextCancelledRe = regexp.MustCompile(`context canceled`)

// Expired Error is returned when temp storage is expired
type Expired struct {
}

func (e *Expired) Error() string {
	return "expired"
}
