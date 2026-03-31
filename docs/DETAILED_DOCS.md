# Detailed Docs

## 1) Architecture

### Frontend

- `index.html`: UI layout (sidebar, toolbar, canvas page, analytics page)
- `styles.css`: theme and layout styles
- `app.js`: app state + API calls + UI interactions
- `canvas.js`: whiteboard behavior (images, text, shapes, drag, zoom, save/load)

### Backend

- `server.py`: static file server + JSON APIs + auth/session + file operations

## 2) Core Flows

### Create Trade

1. User fills New Trade form
2. Frontend calls `POST /api/trades`
3. Server creates folder + `metadata.json` + empty `canvas.json`
4. Server recalculates `data/overall.json`

### Edit Trade Details

1. User updates fields in Selected Trade Details
2. Frontend calls `PUT /api/trades/{id}/metadata`
3. Server updates metadata and recalculates overall analytics

### Canvas Save

1. User draws/adds notes/images
2. Frontend builds canvas state (`items`, `board`)
3. Frontend calls `PUT /api/trades/{id}/canvas`

### Delete Trade

1. Frontend calls `DELETE /api/trades/{id}`
2. Server deletes trade folder recursively
3. Server recalculates overall analytics

## 3) API Endpoints

### Auth/Profile

- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `GET /api/profile`
- `PUT /api/profile`

### Trades

- `GET /api/trades`
- `POST /api/trades`
- `PUT /api/trades/{id}/metadata`
- `GET /api/trades/{id}/canvas`
- `PUT /api/trades/{id}/canvas`
- `POST /api/trades/{id}/images?filename=...`
- `DELETE /api/trades/{id}/images?path=images/...`
- `DELETE /api/trades/{id}`

### Analytics

- `GET /api/overall` (recomputed summary + ledger data)
- `GET /api/summary` (legacy summary file support)

## 4) Trade Data Schema

### metadata.json

Common fields:

- `date` (`DD/MM/YYYY`)
- `time`
- `trade_name`
- `buy_price` (optional number)
- `sell_price` (optional number)
- `quantity` (optional number)
- `pnl` (optional number; auto-computed when possible)
- `tags` (array of strings)

### canvas.json

- `version`
- `savedAt`
- `board`:
  - `width`
  - `height`
  - `zoom`
- `items`: array of visual elements
  - image: `path`, `x`, `y`, `width`, `height`
  - text: `text`, `x`, `y`
  - arrow/rect shapes with coordinates

## 5) Security Model

Implemented:

- password hashing (`PBKDF2-HMAC-SHA256`)
- random session tokens
- HTTP-only session cookie
- protected API and `/trades/*` file paths

Not implemented:

- TLS/HTTPS
- rate limiting / lockout
- role-based multi-user auth

## 6) Analytics Calculation

`data/overall.json` contains:

- `trade_count`
- `total_pnl`
- `hit_rate`
- `win_count`
- `loss_count`
- `avg_pnl`
- `trades` (ledger rows)
- `cumulative_pnl` (series values)

Recomputed on:

- trade create
- trade detail update
- trade delete

## 7) Troubleshooting

### Port in use

```bash
python3 journal.py 8001
```

### UI not updating

- hard refresh: `Ctrl+Shift+R`
- restart server

### Login issues

- check `data/auth.json` exists
- ensure cookies are enabled for localhost

## 8) Future Improvements

- optional export/import backup
- optional encrypted backups
- optional inactivity auto-lock
- optional CSV importer directly in UI
