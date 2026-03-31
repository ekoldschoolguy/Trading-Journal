# Trading Journal (Local-First)

Minimal, fast, dependency-light trading journal built with:

- `HTML + CSS + Vanilla JavaScript`
- small local `Python` server (for file APIs, auth, and analytics)

No framework, no build step, no cloud database.

## What It Does

- One trade = one visual canvas
- Add screenshots (original files preserved, no compression)
- Draw arrows/rectangles and place text notes
- Resize images visually (original image file unchanged)
- Zoom canvas for overview
- Create/edit/delete trades
- Save trade details (buy/sell/qty/pnl/tags)
- View overall analytics + ledger
- Login/profile/password change for local protection

## Run

```bash
cd "/home/anoldschoolguy/Documents/Trading Journal "
python3 journal.py
```

Open:

- [http://127.0.0.1:8000](http://127.0.0.1:8000)

If port `8000` is busy:

```bash
python3 journal.py 8001
```

Then open `http://127.0.0.1:8001`.

## First Login

- First run asks to set password and profile name
- Later runs require login

## Storage Layout

Trades are stored as files:

- `trades/YYYY/MM/DD/trade_name/`
  - `metadata.json`
  - `canvas.json`
  - `images/`

Analytics file:

- `data/overall.json` (auto-generated and refreshed on create/update/delete)

## Notes

- This is local security for personal use (not enterprise-grade)
- Keep regular backups of the `trades/` and `data/` folders
- Use hard refresh (`Ctrl+Shift+R`) after UI updates
