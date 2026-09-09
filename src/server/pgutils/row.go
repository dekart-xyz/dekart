package pgutils

import "database/sql"

// ScanRow reads one PostgreSQL row and converts its values to CSV strings.
func ScanRow(rows *sql.Rows, columnCount int) ([]string, error) {
	values := make([]any, columnCount)
	for i := range values {
		values[i] = new(sql.NullString)
	}
	if err := rows.Scan(values...); err != nil {
		return nil, err
	}

	csvRow := make([]string, columnCount)
	for i, value := range values {
		csvRow[i] = NormalizeEWKBHex(value.(*sql.NullString).String)
	}
	return csvRow, nil
}
