---
name: release-notes
description: Write versioned Dekart release notes with repo-specific structure, scope filtering, and cropped Cypress screenshots of the main product features.
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

## Product Images

Include screenshots of the main visible product features by default, unless the user requests text only. Place each image immediately after the feature it illustrates. Skip screenshots for internal changes or features without a useful visible interface.

- Use real local UI flows and demo data through Cypress. Follow `skills/cypress-quick-start/SKILL.md` and `skills/dev-runtime/SKILL.md`; keep temporary capture specs named `tmp*.cy.js` per repository rules. Never use production credentials or expose complete tokens in screenshots.
- Capture at **2× device pixel density**. In a temporary Cypress configuration, register `before:browser:launch`, replace Chrome's existing `--force-device-scale-factor` argument with `--force-device-scale-factor=2`, and give the browser a window larger than the test viewport (for example `--window-size=1600,1200` for a `1440×1000` viewport). Preserve the existing `setupNodeEvents` handlers.
- Assert `window.devicePixelRatio === 2` and check the saved PNG dimensions. A `1440×1000` capture should contain `2880×2000` pixels. Do not upscale a 1× screenshot to simulate a higher-density capture.
- Wait for loaded content, map previews, and completed modal transitions before capturing. Use full-page captures to avoid cutting off tall panels; inspect the resulting PNG rather than relying only on passing assertions.
- Record the relevant controls' bounds with `getBoundingClientRect()`, including a little surrounding space. Crop the saved screenshot using those bounds multiplied by the actual capture scale; account for page scroll if present. Verify the crop fits inside the PNG.
- Save the cropped, lossless PNGs in `docs/images/release-<major>-<minor>/` with descriptive filenames. Keep the captured pixel resolution; do not shrink or blur the files to make them display smaller.
- Set display size separately using HTML in the Markdown, for example `<img src="images/release-0-27/http-source.png" alt="HTTP source connection settings" width="276">`. Default to compact images around half the cropped UI width, as in the 0.27 notes; adjust when needed for legibility or the user's preference.
- Before finishing, view every final crop, check readable text and complete controls, verify all image links, and report the Cypress result. When asked to make an image smaller, change its display width while retaining the high-resolution source.
