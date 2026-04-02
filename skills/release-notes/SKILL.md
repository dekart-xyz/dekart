# Release Notes Skill

## Trigger

Use this skill when asked to write release notes.

## Instructions

- Use `docs/release-notes-0-21-0.md` as the formatting template and section style baseline.
- Present items in this exact order:
  1. User-facing features first.
  2. Changes important for admins/operators second.
  3. User-facing bug fixes third.
  4. Upgrade instructions last.
- Skip chore/internal-only changes that do not affect users or admins (for example CI/workflow-only changes).
- Keep language outcome-focused (what changed for users/admins), not implementation-heavy.
- Include only changes in the requested version/tag diff range.
