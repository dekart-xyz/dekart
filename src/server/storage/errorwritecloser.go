package storage

import "errors"

type errorWriteCloser struct {
	err error
}

func (w errorWriteCloser) Write(_ []byte) (int, error) {
	return 0, w.err
}

func (w errorWriteCloser) Close() error {
	if w.err != nil {
		return w.err
	}
	return errors.New("storage writer initialization failed")
}
