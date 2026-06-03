---
name: release-notes
description: Use this skill when asked to write versioned release notes and you need repo-specific structure, ordering, and scope filtering.
---

# Release Notes Skill

## Trigger

Use this skill when asked to write release notes.

## Instructions

- Use `docs/release-notes-0-21-0.md` as the formatting template and section style baseline.
- Present items in this exact order:
  1. User-facing features first.
  2. Operator behavior changes second.
  3. Other changes important for admins/operators third.
  4. User-facing bug fixes fourth.
  5. Upgrade instructions last.
- Add a dedicated `Behavior Changes` section for changes that can alter existing deployment behavior or require operator action.
- Include environment variables only when they are relevant to operator action, compatibility, or upgrade safety. Do not include exhaustive variable inventories.
- Skip chore/internal-only changes that do not affect users or admins (for example CI/workflow-only changes).
- Keep language outcome-focused (what changed for users/admins), not implementation-heavy.
- Include only changes in the requested version/tag diff range.
- Use the major.minor release version in release-note copy and image tags (for example `0.23`).
- Never mention release-candidate tags or patch versions in release notes, even when an RC commit or tag defines the diff endpoint.
- Every `DEKART_LICENSE_KEY` mention must include the CTA: `[Get a key free here](https://mailchi.mp/dekart/upgrade-to-sso)`.
