package pgjob

import (
	"encoding/binary"
	"encoding/hex"
)

const (
	ewkbZFlag    = uint32(0x80000000)
	ewkbMFlag    = uint32(0x40000000)
	ewkbSRIDFlag = uint32(0x20000000)
	ewkbFlagMask = ewkbZFlag | ewkbMFlag | ewkbSRIDFlag
)

type ewkbWalker struct {
	input  []byte
	offset int
	output []byte
}

// normalizeEWKBHex removes PostGIS EWKB flags that the map parser cannot read.
func normalizeEWKBHex(value string) string {
	// Reject ordinary strings after inspecting only the fixed-size WKB header.
	if len(value) < 10 || len(value)%2 != 0 {
		return value
	}
	var header [5]byte
	if _, err := hex.Decode(header[:], []byte(value[:10])); err != nil {
		return value
	}
	order, ok := wkbByteOrder(header[0])
	if !ok || order.Uint32(header[1:])&ewkbFlagMask == 0 {
		return value
	}

	input := make([]byte, hex.DecodedLen(len(value)))
	if _, err := hex.Decode(input, []byte(value)); err != nil {
		return value
	}
	walker := ewkbWalker{input: input, output: make([]byte, 0, len(input))}
	if !walker.walk(0, 0) || walker.offset != len(input) {
		return value
	}
	return hex.EncodeToString(walker.output)
}

// wkbByteOrder returns the byte order declared by a WKB geometry header.
func wkbByteOrder(marker byte) (binary.ByteOrder, bool) {
	switch marker {
	case 0:
		return binary.BigEndian, true
	case 1:
		return binary.LittleEndian, true
	default:
		return nil, false
	}
}

// walk validates one geometry and appends its ISO WKB representation.
func (w *ewkbWalker) walk(expectedType uint32, expectedDimensions int) bool {
	if len(w.input)-w.offset < 5 {
		return false
	}
	marker := w.input[w.offset]
	order, ok := wkbByteOrder(marker)
	if !ok {
		return false
	}
	w.offset++
	rawType := order.Uint32(w.input[w.offset : w.offset+4])
	w.offset += 4

	geometryType := rawType &^ ewkbFlagMask
	// Only geometry families supported by the current map parser are rewritten.
	if geometryType < 1 || geometryType > 6 || expectedType != 0 && geometryType != expectedType {
		return false
	}
	dimensions := 2
	isoOffset := uint32(0)
	if rawType&ewkbZFlag != 0 {
		dimensions++
		isoOffset += 1000
	}
	if rawType&ewkbMFlag != 0 {
		dimensions++
		isoOffset += 2000
	}
	// Multi-geometry children must use the same coordinate layout as their parent.
	if expectedDimensions != 0 && dimensions != expectedDimensions {
		return false
	}
	if rawType&ewkbSRIDFlag != 0 {
		if len(w.input)-w.offset < 4 {
			return false
		}
		srid := order.Uint32(w.input[w.offset : w.offset+4])
		w.offset += 4
		// Rewriting projected coordinates as plain WKB would make them silently wrong.
		if srid != 4326 {
			return false
		}
	}

	w.output = append(w.output, marker)
	typeOffset := len(w.output)
	w.output = append(w.output, 0, 0, 0, 0)
	order.PutUint32(w.output[typeOffset:], geometryType+isoOffset)

	switch geometryType {
	case 1:
		return w.copyCoordinates(1, dimensions)
	case 2:
		return w.copyCoordinateSequence(order, dimensions)
	case 3:
		return w.copyPolygon(order, dimensions)
	case 4, 5, 6:
		return w.copyMulti(order, geometryType-3, dimensions)
	default:
		return false
	}
}

// copyCoordinates copies a bounded number of coordinate tuples without decoding floats.
func (w *ewkbWalker) copyCoordinates(count uint32, dimensions int) bool {
	remaining := len(w.input) - w.offset
	stride := dimensions * 8
	if uint64(count) > uint64(remaining/stride) {
		return false
	}
	byteCount := int(count) * stride
	w.output = append(w.output, w.input[w.offset:w.offset+byteCount]...)
	w.offset += byteCount
	return true
}

// copyCount copies a collection count after proving its minimum elements fit.
func (w *ewkbWalker) copyCount(order binary.ByteOrder, minimumElementBytes int) (uint32, bool) {
	if len(w.input)-w.offset < 4 {
		return 0, false
	}
	start := w.offset
	count := order.Uint32(w.input[start : start+4])
	w.offset += 4
	if uint64(count) > uint64((len(w.input)-w.offset)/minimumElementBytes) {
		return 0, false
	}
	w.output = append(w.output, w.input[start:w.offset]...)
	return count, true
}

// copyCoordinateSequence copies a WKB count followed by coordinate tuples.
func (w *ewkbWalker) copyCoordinateSequence(order binary.ByteOrder, dimensions int) bool {
	count, ok := w.copyCount(order, dimensions*8)
	return ok && w.copyCoordinates(count, dimensions)
}

// copyPolygon copies every bounded ring in a polygon.
func (w *ewkbWalker) copyPolygon(order binary.ByteOrder, dimensions int) bool {
	ringCount, ok := w.copyCount(order, 4)
	if !ok {
		return false
	}
	for range ringCount {
		if !w.copyCoordinateSequence(order, dimensions) {
			return false
		}
	}
	return true
}

// copyMulti validates and rewrites each geometry nested in a multi-geometry.
func (w *ewkbWalker) copyMulti(order binary.ByteOrder, childType uint32, dimensions int) bool {
	count, ok := w.copyCount(order, 5)
	if !ok {
		return false
	}
	for range count {
		if !w.walk(childType, dimensions) {
			return false
		}
	}
	return true
}
