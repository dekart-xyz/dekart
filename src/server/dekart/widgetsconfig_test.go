package dekart

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"dekart/src/proto"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

func validWidgetsConfig() string {
	return `{"version":1,"widgets":[{"id":"count_1","dataId":"dataset-old","type":"number","title":"Rows dataset-old","settings":{"operation":"count","format":"auto","decimals":2,"subtitle":"dataset-old","prefix":"","suffix":""}},{"id":"category_1","dataId":"dataset-old","type":"count-plot","title":"Category","settings":{"field":"category","metric":"count","sort":"value-desc","maxBars":20}},{"id":"histogram_1","dataId":"dataset-other","type":"histogram","title":"Amount","settings":{"field":"amount","maxBins":15,"color":"red"}}]}`
}

func TestValidateWidgetsConfigV1(t *testing.T) {
	require.NoError(t, validateWidgetsConfig(validWidgetsConfig()))
	require.NoError(t, validateWidgetsConfig(`{"version":1,"widgets":[{"id":"sum","dataId":"dataset-1","type":"number","title":"Sum","settings":{"operation":"sum","field":"amount"}}]}`))
	for name, value := range map[string]string{
		"blank":              " ",
		"old shape":          `{"version":1,"provider":"sqlrooms","config":{"dashboardsById":{}}}`,
		"unknown root key":   `{"version":1,"widgets":[],"selection":[]}`,
		"future chart":       `{"version":1,"widgets":[{"id":"p","dataId":"d","type":"pie","title":"x","settings":{}}]}`,
		"missing field":      `{"version":1,"widgets":[{"id":"p","dataId":"d","type":"number","title":"x","settings":{"operation":"sum"}}]}`,
		"duplicate ids":      `{"version":1,"widgets":[{"id":"p","dataId":"d","type":"number","title":"x","settings":{"operation":"count"}},{"id":"p","dataId":"d","type":"number","title":"y","settings":{"operation":"count"}}]}`,
		"unknown widget key": `{"version":1,"widgets":[{"id":"p","dataId":"d","type":"number","title":"x","settings":{"operation":"count"},"sql":"select 1"}]}`,
	} {
		t.Run(name, func(t *testing.T) { require.Error(t, validateWidgetsConfig(value)) })
	}
	require.Error(t, validateWidgetsConfig(`{"version":1,"widgets":[{"id":"p","dataId":"d","type":"number","title":"`+strings.Repeat("x", 257)+`","settings":{"operation":"count"}}]}`))
}

func TestValidateReportWidgetsConfigTxRejectsUnknownDataID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id FROM datasets WHERE report_id=\\$1").WithArgs("report-1").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("dataset-1").AddRow("dataset-2"))
	tx, err := db.BeginTx(context.Background(), nil)
	require.NoError(t, err)
	server := NewServer(db, nil, nil)
	err = server.validateReportWidgetsConfigTx(context.Background(), tx, "report-1", `{"version":1,"widgets":[{"id":"p","dataId":"dataset-missing","type":"number","title":"x","settings":{"operation":"count"}}]}`)
	var validationErr *widgetsConfigValidationError
	require.ErrorAs(t, err, &validationErr)
	require.Equal(t, "widgets_config.widgets[0].dataId", validationErr.Issues[0].Path)
	require.Equal(t, "one of: dataset-1, dataset-2", validationErr.Issues[0].Expected)
	require.Equal(t, "dataset-missing", validationErr.Issues[0].Actual)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRemapWidgetDatasetsOnlyChangesBindings(t *testing.T) {
	remapped, err := remapWidgetDatasets(validWidgetsConfig(), []*proto.Dataset{{Id: "dataset-old"}, {Id: "dataset-other"}}, []string{"dataset-new", "dataset-new-other"})
	require.NoError(t, err)
	var value persistedWidgetsConfig
	require.NoError(t, json.Unmarshal([]byte(remapped), &value))
	require.Equal(t, 1, value.Version)
	require.Equal(t, []string{"count_1", "category_1", "histogram_1"}, []string{value.Widgets[0].ID, value.Widgets[1].ID, value.Widgets[2].ID})
	require.Equal(t, "dataset-new", value.Widgets[0].DataID)
	require.Equal(t, "dataset-new", value.Widgets[1].DataID)
	require.Equal(t, "dataset-new-other", value.Widgets[2].DataID)
	require.Equal(t, "Rows dataset-old", value.Widgets[0].Title)
	require.Equal(t, "dataset-old", value.Widgets[0].Settings["subtitle"])
}
