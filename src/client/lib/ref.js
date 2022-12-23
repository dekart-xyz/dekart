import { version } from '../../../package.json'
import sha256 from 'crypto-js/sha256'
import { getDatasourceMeta } from './datasource'

function getHostname (location) {
  switch (location.hostname) {
    case 'localhost':
    case '127.0.0.1':
      return 'localhost'
    default:
      return sha256(location.hostname).toString().slice(0, 8)
  }
}

function getStats (env, usage) {
  return [
    getDatasourceMeta(env.variables.DATASOURCE).usageStatsId,
    usage.stats.totalReports,
    usage.stats.totalQueries,
    usage.stats.totalFiles,
    usage.stats.totalAuthors
  ].join('-')
}

export function getRef (env, usage, location = window.location, v = version) {
  if (!env.loaded || !usage.loaded) {
    return 'dekart-unknown'
  }
  if (env.variables.DISABLE_USAGE_STATS === '1') {
    return 'dekart-stats-disabled'
  }
  return `dekart-${v}-${getHostname(location)}-${getStats(env, usage)}`
}
