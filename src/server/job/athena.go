// original source https://github.com/alwaysbespoke/aws/blob/1f685929a639566dcfaf72c93b67da1d607671cd/athena/athena.go
package job

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/athena"
	"github.com/rs/zerolog/log"
)

const (
	QUERY_POLLING_INTERVAL = 1
	RUNNING                = "RUNNING"
	SUCCEEDED              = "SUCCEEDED"
	PROTOCOL               = "s3://"
)

// InputParams ...
type InputParams struct {
	AwsSession   *session.Session
	Database     *string
	QueryString  *string
	Region       *string
	OutputBucket *string
	AthenaClient *athena.Athena
}

// AthenaQuery ...
type AthenaQuery struct {
	inputParams *InputParams
	startInput  athena.StartQueryExecutionInput
	startOutput *athena.StartQueryExecutionOutput
	getInput    athena.GetQueryExecutionInput
	getOutput   *athena.GetQueryExecutionOutput
	results     *athena.GetQueryResultsOutput
}

// QueryAthena ...
//
// Queries AWS Athena and returns back a result set
// func QueryAthena(inputParams *InputParams) ([]*athena.Row, error) {

// 	var err error
// 	var q AthenaQuery
// 	q.inputParams = inputParams

// 	// check nil pointers
// 	stringPointers := []*string{
// 		inputParams.Database,
// 		inputParams.QueryString,
// 		inputParams.Region,
// 		inputParams.OutputBucket,
// 	}
// 	for _, pointer := range stringPointers {
// 		if pointer == nil {
// 			return nil, errors.New("Nil pointer in input params")
// 		}
// 	}

// 	// create query
// 	q.createQuery()

// 	// create client
// 	err = q.createClient()
// 	if err != nil {
// 		return nil, err
// 	}

// 	// start query
// 	err = q.startQuery()
// 	if err != nil {
// 		return nil, err
// 	}

// 	// wait for query to process
// 	err = q.pollQueryState()
// 	if err != nil {
// 		return nil, err
// 	}

// 	// handle failure
// 	err = q.handleFailure()
// 	if err != nil {
// 		return nil, err
// 	}

// 	// handle success
// 	err = q.handleSuccess()
// 	if err != nil {
// 		return nil, err
// 	}

// 	return q.results.ResultSet.Rows, nil

// }

func (q *AthenaQuery) createQuery() {

	// set query string
	q.startInput.SetQueryString(*q.inputParams.QueryString)

	// set context
	var queryExecutionContext athena.QueryExecutionContext
	queryExecutionContext.SetCatalog(os.Getenv("DEKART_ATHENA_CATALOG"))
	// queryExecutionContext.SetDatabase(*q.inputParams.Database)
	q.startInput.SetQueryExecutionContext(&queryExecutionContext)

	// set result configuration
	var resultConfig athena.ResultConfiguration
	resultConfig.SetOutputLocation(PROTOCOL + *q.inputParams.OutputBucket)
	log.Debug().Msgf("Ouput Location: %s", PROTOCOL+*q.inputParams.OutputBucket)
	q.startInput.SetResultConfiguration(&resultConfig)

}

func (q *AthenaQuery) createClient() error {

	// if q.inputParams.AwsSession == nil {

	// 	// configure AWS session
	// 	awsConfig := &aws.Config{}
	// 	awsConfig.WithRegion(*q.inputParams.Region)

	// 	// start AWS session
	// 	var err error
	// 	q.inputParams.AwsSession, err = session.NewSession(awsConfig)
	// 	if err != nil {
	// 		return err
	// 	}

	// }

	if q.inputParams.AthenaClient == nil {

		// instantiate Athena client
		q.inputParams.AthenaClient = athena.New(q.inputParams.AwsSession, aws.NewConfig().WithRegion(*q.inputParams.Region))

	}

	return nil

}

func (q *AthenaQuery) startQuery() error {
	var err error
	q.startOutput, err = q.inputParams.AthenaClient.StartQueryExecution(&q.startInput)
	if err != nil {
		return err
	}
	return nil
}

func (q *AthenaQuery) pollQueryState(ctx context.Context) (*athena.QueryExecution, error) {
	var err error

	q.getInput.SetQueryExecutionId(*q.startOutput.QueryExecutionId)

	ticker := time.NewTicker(QUERY_POLLING_INTERVAL * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
			// get output
			q.getOutput, err = q.inputParams.AthenaClient.GetQueryExecution(&q.getInput)
			if err != nil {
				return nil, err
			}
			// log.Debug().Msg(q.getOutput.GoString())
			log.Debug().Msg(q.getOutput.QueryExecution.Status.String())
			// log.Println(q.getOutput.QueryExecution.Status)
			// check if query is running
			if *q.getOutput.QueryExecution.Status.State != RUNNING {
				return q.getOutput.QueryExecution, nil
			}
		}
	}
}

func (q *AthenaQuery) handleFailure() error {
	if *q.getOutput.QueryExecution.Status.State != SUCCEEDED {
		return fmt.Errorf("query Failed. State: %s; Reason: %s", *q.getOutput.QueryExecution.Status.State, *q.getOutput.QueryExecution.Status.StateChangeReason)
	}
	return nil
}

func (q *AthenaQuery) handleSuccess(ctx context.Context, fn func(page *athena.GetQueryResultsOutput, lastPage bool) bool) error {
	var getQueryResultsInput athena.GetQueryResultsInput
	getQueryResultsInput.SetQueryExecutionId(*q.startOutput.QueryExecutionId)
	log.Debug().Msgf("Athena query id: %s", *q.startOutput.QueryExecutionId)

	return q.inputParams.AthenaClient.GetQueryResultsPagesWithContext(ctx, &getQueryResultsInput, fn)
}
