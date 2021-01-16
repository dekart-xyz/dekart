import React from 'react'
import prettyBites from 'pretty-bytes'

let downloadingComponents = []
export default class Downloading extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      size: 0
    }
    downloadingComponents.push(this)
  }

  componentWillUnmount () {
    downloadingComponents = downloadingComponents.filter(c => c !== this)
  }

  render () {
    const { size } = this.state
    if (size) {
      return (<span>Downloading Map Data ({prettyBites(size)})</span>)
    }
    return (<span>Downloading Map Data...</span>)
  }

  static setSize (size) {
    downloadingComponents.forEach(c => c.setState({ size }))
  }
}
