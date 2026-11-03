import { connect } from 'react-redux'
// Reuse the pinned SQLRooms fallback without loading its unrelated UI components.
import { ErrorBoundary } from '@sqlrooms/ui/dist/components/error-boundary'
import { setError } from '../actions/message'

// Report chart failures through Dekart while retaining the container or panel fallback.
class ReportWidgetsErrorBoundary extends ErrorBoundary {
  componentDidCatch (error) {
    this.props.setError(error)
    this.props.onError?.(error)
  }

  render () {
    // Individual panels retain their header and mark their snapshot as settled.
    if (this.state.hasError && this.props.fallback) return this.props.fallback
    return super.render()
  }
}

export default connect(null, { setError })(ReportWidgetsErrorBoundary)
