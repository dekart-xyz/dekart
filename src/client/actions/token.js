export const SNAPSHOT_TOKEN_TYPE = 'snapshot'

// setSnapshotToken stores snapshot auth token in redux token state.
export function setSnapshotToken (token) {
  return {
    type: setSnapshotToken.name,
    token: {
      ...token,
      token_type: SNAPSHOT_TOKEN_TYPE
    }
  }
}
