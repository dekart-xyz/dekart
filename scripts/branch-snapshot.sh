#!/bin/sh

set -eu

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
	echo "branch-snapshot: not inside a Git repository" >&2
	exit 1
}
cd "$repo_root"

# Snapshot names require a stable source branch and must never be made from main.
if ! source_branch=$(git symbolic-ref --quiet --short HEAD); then
	echo "branch-snapshot: detached HEAD is not supported" >&2
	exit 1
fi
if [ "$source_branch" = "main" ]; then
	echo "branch-snapshot: refusing to snapshot main" >&2
	exit 1
fi

timestamp=$(date '+%Y%m%d_%H%M%S')
snapshot_branch="${source_branch}_snapshot_${timestamp}"

# Refuse collisions before writing a local branch or snapshot commit.
if git show-ref --verify --quiet "refs/heads/$snapshot_branch"; then
	echo "branch-snapshot: local branch already exists: $snapshot_branch" >&2
	exit 1
fi
remote_refs=$(git ls-remote --heads origin "refs/heads/$snapshot_branch") || {
	echo "branch-snapshot: could not inspect origin for branch collisions" >&2
	exit 1
}
if [ -n "$remote_refs" ]; then
	echo "branch-snapshot: remote branch already exists: origin/$snapshot_branch" >&2
	exit 1
fi

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/dekart-branch-snapshot.XXXXXX")
temp_index="$temp_dir/index"

# Remove only the private temporary index directory created above.
cleanup() {
	rm -rf "$temp_dir"
}
trap cleanup 0 HUP INT TERM

# A private index captures the working tree without changing the user's real index.
GIT_INDEX_FILE="$temp_index" git read-tree HEAD
GIT_INDEX_FILE="$temp_index" git add -A -- .
snapshot_tree=$(GIT_INDEX_FILE="$temp_index" git write-tree)
head_tree=$(git rev-parse 'HEAD^{tree}')
snapshot_commit=$(git rev-parse HEAD)

# Add one commit only when the working tree differs from the current commit.
if [ "$snapshot_tree" != "$head_tree" ]; then
	snapshot_commit=$(printf 'Snapshot %s at %s\n' "$source_branch" "$timestamp" |
		git commit-tree "$snapshot_tree" -p HEAD)
fi

git branch "$snapshot_branch" "$snapshot_commit"

# Keep the local snapshot branch when the remote push fails.
if ! git push origin "refs/heads/$snapshot_branch:refs/heads/$snapshot_branch"; then
	echo "branch-snapshot: push failed; local branch preserved: $snapshot_branch" >&2
	exit 1
fi

echo "branch-snapshot: created and pushed $snapshot_branch to origin/$snapshot_branch"
