import prettyBites from 'pretty-bytes'

export default function Downloading ({ size }) {
  if (size) {
    return (<span>Downloading Map Data ({prettyBites(size)})</span>)
  }
  return (<span>Downloading Map Data...</span>)
}
