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

# The empty lease atomically refuses to overwrite an existing remote branch.
if ! push_output=$(git push --porcelain \
	--force-with-lease="refs/heads/$snapshot_branch:" origin \
	"$snapshot_commit:refs/heads/$snapshot_branch"); then
	printf '%s\n' "$push_output" >&2
	echo "branch-snapshot: push failed; local branch preserved: $snapshot_branch" >&2
	exit 1
fi
case "$push_output" in
	*"[new branch]"*) ;;
	*)
		echo "branch-snapshot: remote branch already exists; local branch preserved: $snapshot_branch" >&2
		exit 1
		;;
esac

echo "branch-snapshot: created and pushed $snapshot_branch to origin/$snapshot_branch"
