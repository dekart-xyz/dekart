package bqjob

import (
	"testing"

	"gotest.tools/v3/assert"
)

func TestOrderByRe(t *testing.T) {
	assert.Equal(t, orderByRe.MatchString("order by id desc"), true)
	assert.Equal(t, orderByRe.MatchString("order \n by id desc"), true)
	assert.Equal(t, orderByRe.MatchString("orderby id desc"), false)
	assert.Equal(t, orderByRe.MatchString(`
		select order from
		table by
	`), false)
	assert.Equal(t, orderByRe.MatchString(`
		select * from
		table name
		order by id desc
	`), true)
}
