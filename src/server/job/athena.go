package job

import (
	"errors"
	"os"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/athena"
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

func (q *AthenaQuery) pollQueryState() error {

	q.getInput.SetQueryExecutionId(*q.startOutput.QueryExecutionId)

	var err error

	for {

		// get output
		q.getOutput, err = q.inputParams.AthenaClient.GetQueryExecution(&q.getInput)
		if err != nil {
			return err
		}

		// check if query is running
		if *q.getOutput.QueryExecution.Status.State != RUNNING {
			return nil
		}

		// rest between iterations
		time.Sleep(QUERY_POLLING_INTERVAL * time.Second)

	}

}

func (q *AthenaQuery) handleFailure() error {
	if *q.getOutput.QueryExecution.Status.State != SUCCEEDED {
		return errors.New("Query failure: " + *q.getOutput.QueryExecution.Status.State)
	}
	return nil
}

func (q *AthenaQuery) handleSuccess() error {
	var getQueryResultsInput athena.GetQueryResultsInput
	getQueryResultsInput.SetQueryExecutionId(*q.startOutput.QueryExecutionId)
	var err error
	q.results, err = q.inputParams.AthenaClient.GetQueryResults(&getQueryResultsInput)
	if err != nil {
		return err
	}
	return nil
}
