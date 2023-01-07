package bqjob

import (
	"encoding/json"
	"fmt"
	"io"

	goavro "github.com/linkedin/goavro/v2"
	bqStoragePb "google.golang.org/genproto/googleapis/cloud/bigquery/storage/v1"
)

type Decoder struct {
	tableFields []string
	codec       *goavro.Codec
}

func NewDecoder(session *bqStoragePb.ReadSession) (*Decoder, error) {
	avroSchema := session.GetAvroSchema()
	var avroSchemaFields AvroSchema
	err := json.Unmarshal([]byte(avroSchema.GetSchema()), &avroSchemaFields)
	if err != nil {
		return nil, err
	}
	tableFields := make([]string, len(avroSchemaFields.Fields))
	for i := range avroSchemaFields.Fields {
		tableFields[i] = avroSchemaFields.Fields[i].Name
	}

	codec, err := goavro.NewCodec(avroSchema.GetSchema())
	if err != nil {
		return nil, err
	}
	return &Decoder{
		tableFields: tableFields,
		codec:       codec,
	}, nil
}

func (d *Decoder) DecodeRows(undecoded []byte, csvRows chan []string) error {
	var err error
	for len(undecoded) > 0 {
		var datum interface{}
		datum, undecoded, err = d.codec.NativeFromBinary(undecoded)
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		valuesMap, ok := datum.(map[string]interface{})
		if !ok {
			err = fmt.Errorf("cannot convert datum to map")
			return err
		}
		// TODO: create once?
		csvRow := make([]string, len(d.tableFields))
		for i, name := range d.tableFields {
			value := valuesMap[name]
			if value == nil {
				csvRow[i] = ""
				continue
			}

			switch x := value.(type) {
			case map[string]interface{}:
				for _, v := range x {
					csvRow[i] = fmt.Sprintf("%v", v)
					break
				}
			case []interface{}:
				csvRow[i] = fmt.Sprintf("%v", x)
			case interface{}:
				csvRow[i] = fmt.Sprintf("%v", x)
			case nil:
				csvRow[i] = ""
			default:
				return fmt.Errorf("incorrect type of data: %T", x)
			}
		}
		csvRows <- csvRow
	}
	return nil
}
