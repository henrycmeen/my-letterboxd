# Data

Runtime and local persistence for the app.

## Expected Contents

- `club/filmklubb.sqlite`
  Primary floor-board database (runtime state).
- `club-floor-board.json`
  Legacy JSON source used for one-time migration to SQLite.

SQLite files are local runtime data and should not be committed.
