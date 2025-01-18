package snowflakeutils

import (
	"context"
	"dekart/src/server/errtype"
	"fmt"
	"io"
	"time"

	"github.com/rs/zerolog"
	"github.com/sirupsen/logrus"
	sf "github.com/snowflakedb/gosnowflake"
)

// ConfigureSnowflakeLogger replaces the default Snowflake logger
// to suppress context cancellation errors.
func ConfigureSnowflakeLogger(dekartLogger *zerolog.Logger) {
	sf.SetLogger(NewSnowflakeLogger(dekartLogger))
}

func NewSnowflakeLogger(dekartLogger *zerolog.Logger) *sf.SFLogger {
	// Create a new logrus.Logger instance
	logrusLogger := logrus.New()

	// Set the formatter to JSONFormatter
	logrusLogger.SetFormatter(&logrus.JSONFormatter{})

	// Set the log level
	logrusLogger.SetLevel(logrus.ErrorLevel)

	logger := &SFLogger{inner: logrusLogger, dekartLogger: dekartLogger}
	var sfLogger sf.SFLogger = logger
	return &sfLogger
}

// Copy of https://github.com/snowflakedb/gosnowflake/blob/8257f91fef2e7927cb5bf23f26a8ba09d02d8c2f/log.go#L59
// with some modifications
type SFLogger struct {
	inner        *logrus.Logger
	dekartLogger *zerolog.Logger
}

// SetLogLevel set logging level for calling defaultLogger
func (log *SFLogger) SetLogLevel(level string) error {
	// use dekart log level
	return nil
}

// WithContext return Entry to include fields in context
func (log *SFLogger) WithContext(ctx context.Context) *logrus.Entry {
	fields := context2Fields(ctx)
	return log.inner.WithFields(*fields)
}

// WithField allocates a new entry and adds a field to it.
// Debug, Print, Info, Warn, Error, Fatal or Panic must be then applied to
// this new returned entry.
// If you want multiple fields, use `WithFields`.
func (log *SFLogger) WithField(key string, value interface{}) *logrus.Entry {
	return log.inner.WithField(key, value)
}

// Adds a struct of fields to the log entry. All it does is call `WithField` for
// each `Field`.
func (log *SFLogger) WithFields(fields logrus.Fields) *logrus.Entry {
	return log.inner.WithFields(fields)
}

// Add an error as single field to the log entry.  All it does is call
// `WithError` for the given `error`.
func (log *SFLogger) WithError(err error) *logrus.Entry {
	return log.inner.WithError(err)
}

// Overrides the time of the log entry.
func (log *SFLogger) WithTime(t time.Time) *logrus.Entry {
	return log.inner.WithTime(t)
}

func (log *SFLogger) Logf(level logrus.Level, format string, args ...interface{}) {
	log.inner.Logf(level, format, args...)
}

func (log *SFLogger) Tracef(format string, args ...interface{}) {
	log.inner.Tracef(format, args...)
}

func (log *SFLogger) Debugf(format string, args ...interface{}) {
	log.inner.Debugf(format, args...)
}

func (log *SFLogger) Infof(format string, args ...interface{}) {
	log.inner.Infof(format, args...)
}

func (log *SFLogger) Printf(format string, args ...interface{}) {
	log.inner.Printf(format, args...)
}

func (log *SFLogger) Warnf(format string, args ...interface{}) {
	log.inner.Warnf(format, args...)
}

func (log *SFLogger) Warningf(format string, args ...interface{}) {
	log.inner.Warningf(format, args...)
}

func (log *SFLogger) Errorf(format string, args ...interface{}) {
	//check if error is context cancellation error and suppress it
	if errtype.ContextCancelledRe.MatchString(fmt.Sprintf(format, args...)) {
		log.dekartLogger.Warn().Msgf(format, args...)
		return
	}
	log.dekartLogger.Error().Msgf(format, args...)
}

func (log *SFLogger) Fatalf(format string, args ...interface{}) {
	log.inner.Fatalf(format, args...)
}

func (log *SFLogger) Panicf(format string, args ...interface{}) {
	log.inner.Panicf(format, args...)
}

func (log *SFLogger) Log(level logrus.Level, args ...interface{}) {
	log.inner.Log(level, args...)
}

func (log *SFLogger) LogFn(level logrus.Level, fn logrus.LogFunction) {
	log.inner.LogFn(level, fn)
}

func (log *SFLogger) Trace(args ...interface{}) {
	log.inner.Trace(args...)
}

func (log *SFLogger) Debug(args ...interface{}) {
	log.inner.Debug(args...)
}

func (log *SFLogger) Info(args ...interface{}) {
	log.inner.Info(args...)
}

func (log *SFLogger) Print(args ...interface{}) {
	log.inner.Print(args...)
}

func (log *SFLogger) Warn(args ...interface{}) {
	log.inner.Warn(args...)
}

func (log *SFLogger) Warning(args ...interface{}) {
	log.inner.Warning(args...)
}

func (log *SFLogger) Error(args ...interface{}) {
	log.inner.Error(args...)
}

func (log *SFLogger) Fatal(args ...interface{}) {
	log.inner.Fatal(args...)
}

func (log *SFLogger) Panic(args ...interface{}) {
	log.inner.Panic(args...)
}

func (log *SFLogger) TraceFn(fn logrus.LogFunction) {
	log.inner.TraceFn(fn)
}

func (log *SFLogger) DebugFn(fn logrus.LogFunction) {
	log.inner.DebugFn(fn)
}

func (log *SFLogger) InfoFn(fn logrus.LogFunction) {
	log.inner.InfoFn(fn)
}

func (log *SFLogger) PrintFn(fn logrus.LogFunction) {
	log.inner.PrintFn(fn)
}

func (log *SFLogger) WarnFn(fn logrus.LogFunction) {
	log.inner.PrintFn(fn)
}

func (log *SFLogger) WarningFn(fn logrus.LogFunction) {
	log.inner.WarningFn(fn)
}

func (log *SFLogger) ErrorFn(fn logrus.LogFunction) {
	log.inner.ErrorFn(fn)
}

func (log *SFLogger) FatalFn(fn logrus.LogFunction) {
	log.inner.FatalFn(fn)
}

func (log *SFLogger) PanicFn(fn logrus.LogFunction) {
	log.inner.PanicFn(fn)
}

func (log *SFLogger) Logln(level logrus.Level, args ...interface{}) {
	log.inner.Logln(level, args...)
}

func (log *SFLogger) Traceln(args ...interface{}) {
	log.inner.Traceln(args...)
}

func (log *SFLogger) Debugln(args ...interface{}) {
	log.inner.Debugln(args...)
}

func (log *SFLogger) Infoln(args ...interface{}) {
	log.inner.Infoln(args...)
}

func (log *SFLogger) Println(args ...interface{}) {
	log.inner.Println(args...)
}

func (log *SFLogger) Warnln(args ...interface{}) {
	log.inner.Warnln(args...)
}

func (log *SFLogger) Warningln(args ...interface{}) {
	log.inner.Warningln(args...)
}

func (log *SFLogger) Errorln(args ...interface{}) {
	log.inner.Errorln(args...)
}

func (log *SFLogger) Fatalln(args ...interface{}) {
	log.inner.Fatalln(args...)
}

func (log *SFLogger) Panicln(args ...interface{}) {
	log.inner.Panicln(args...)
}

func (log *SFLogger) Exit(code int) {
	log.inner.Exit(code)
}

// SetLevel sets the logger level.
func (log *SFLogger) SetLevel(level logrus.Level) {
	log.inner.SetLevel(level)
}

// GetLevel returns the logger level.
func (log *SFLogger) GetLevel() logrus.Level {
	return log.inner.GetLevel()
}

// AddHook adds a hook to the logger hooks.
func (log *SFLogger) AddHook(hook logrus.Hook) {
	log.inner.AddHook(hook)

}

// IsLevelEnabled checks if the log level of the logger is greater than the level param
func (log *SFLogger) IsLevelEnabled(level logrus.Level) bool {
	return log.inner.IsLevelEnabled(level)
}

// SetFormatter sets the logger formatter.
func (log *SFLogger) SetFormatter(formatter logrus.Formatter) {
	log.inner.SetFormatter(formatter)
}

// SetOutput sets the logger output.
func (log *SFLogger) SetOutput(output io.Writer) {
	log.inner.SetOutput(output)
}

func (log *SFLogger) SetReportCaller(reportCaller bool) {
	log.inner.SetReportCaller(reportCaller)
}

func context2Fields(ctx context.Context) *logrus.Fields {
	var fields = logrus.Fields{}
	if ctx == nil {
		return &fields
	}

	for i := 0; i < len(sf.LogKeys); i++ {
		if ctx.Value(sf.LogKeys[i]) != nil {
			fields[string(sf.LogKeys[i])] = ctx.Value(sf.LogKeys[i])
		}
	}
	return &fields
}
