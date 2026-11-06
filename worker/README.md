# worker

Python side of the Igala speech programme. Today it holds the scoring module
only: `igala_speech/normalise.py` and `igala_speech/metrics.py` are ports of
`web/src/lib/speech/normalise.ts` and `metrics.ts`. Both sides read
`web/src/lib/speech/metrics.fixtures.json`, so a number computed in the app and
a number computed here are the same number.

## Run

```
cd worker && uv venv && uv pip install -e ".[dev]" && .venv/bin/pytest
.venv/bin/ruff check
```

Python 3.11 or 3.12. `.venv` is git-ignored.

## Change the scoring rules

Change the TypeScript and the Python together, add a fixture case, and run
`pnpm exec vitest run src/lib/speech/metrics.test.ts` (from `web/`) and
`pytest` (from `worker/`). The two must give the same numbers.
