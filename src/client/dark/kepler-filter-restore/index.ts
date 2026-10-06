/**
 * **Restore authored Kepler.gl filters after data replacement clears, clamps or drops them.**
 *
 * A reducer wrapper captures filters by Kepler table binding ID, restores them with
 * current table metadata, and discards recovery superseded by explicit filter edits.
 * Plain actions target one Kepler instance. Recovery belongs to Redux state and
 * is excluded from authored map configuration.
 *
 * @packageDocumentation
 */
export { createFilterRestore } from './filterRestore'
export type { FilterRestore, KeplerState, RecoveryAction } from './filterRestore'
