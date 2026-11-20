# Cycle Tracker browser tests (dev-only)

Not part of the app build. These mount the real cycle components in headless Chromium
with a localStorage-backed stand-in for `LS`, using a tiny stand-in for Recharts
(`recharts-stub.jsx`) so layout/behaviour can be tested without the package.

Needs: Node, `esbuild`, Python + `playwright` (with Chromium).
They were run from a scratch folder (`/home/claude/test`) with `build.sh`:
bundle `entry.jsx` with `--alias:recharts=./recharts-stub.jsx`, write an `index.html`
that loads `entry.js` + `entry.css`, serve `dist/` on port 8765, then `python3 e2e.py`.
Adjust the paths at the top of `e2e.py` for your machine. 104 checks at time of writing.

Pure engine tests need nothing: `npm test` (54 tests).

Palette check (every colour in src/cycle must be one of Sumi's own): `python3 scripts/palette-audit.py` run from src/cycle.
