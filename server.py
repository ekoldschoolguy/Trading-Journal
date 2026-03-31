#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import shutil
import sys
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT_DIR = Path(__file__).resolve().parent
TRADES_DIR = ROOT_DIR / "trades"
DATA_DIR = ROOT_DIR / "data"
AUTH_FILE = DATA_DIR / "auth.json"
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9._-]+$")
SESSION_TTL_SECONDS = 60 * 60 * 24
PBKDF2_ITERATIONS = 200_000
SESSIONS: dict[str, float] = {}


def to_float_or_none(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def slugify(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text or "trade"


def safe_segment(value: str) -> str:
    text = re.sub(r"[^\w.\-]", "_", value.strip())
    return text or "file"


def parse_json_body(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def read_json(path: Path, fallback: dict | list) -> dict | list:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def validate_trade_id(trade_id: str) -> list[str]:
    parts = [part for part in trade_id.split("/") if part]
    if len(parts) < 3:
        raise ValueError("Invalid trade id")
    for part in parts:
        if not SAFE_SEGMENT.match(part):
            raise ValueError("Invalid trade id segment")
    return parts


def trade_dir_from_id(trade_id: str) -> Path:
    parts = validate_trade_id(trade_id)
    return TRADES_DIR.joinpath(*parts)


def format_date_ddmmyyyy(date_iso: str) -> str:
    yyyy, mm, dd = date_iso.split("-")
    return f"{dd}/{mm}/{yyyy}"


def create_trade(payload: dict) -> dict:
    date_iso = str(payload.get("date", "")).strip()
    time_text = str(payload.get("time", "")).strip()
    trade_name = str(payload.get("trade_name", "")).strip()
    buy_price = to_float_or_none(payload.get("buy_price"))
    sell_price = to_float_or_none(payload.get("sell_price"))
    quantity = to_float_or_none(payload.get("quantity"))
    pnl = to_float_or_none(payload.get("pnl"))
    if pnl is None and buy_price is not None and sell_price is not None and quantity is not None:
        pnl = round((sell_price - buy_price) * quantity, 2)
    tags = payload.get("tags", [])
    if not isinstance(tags, list):
        tags = []

    if not date_iso or not time_text or not trade_name:
        raise ValueError("date, time and trade_name are required")

    yyyy, mm, dd = date_iso.split("-")
    day_dir = TRADES_DIR / yyyy / mm / dd
    day_dir.mkdir(parents=True, exist_ok=True)

    base_name = slugify(trade_name)
    folder_name = base_name
    idx = 2
    while (day_dir / folder_name).exists():
        folder_name = f"{base_name}_{idx}"
        idx += 1

    trade_dir = day_dir / folder_name
    images_dir = trade_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "date": format_date_ddmmyyyy(date_iso),
        "time": time_text,
        "trade_name": trade_name,
        "buy_price": buy_price,
        "sell_price": sell_price,
        "quantity": quantity,
        "pnl": pnl,
        "tags": [str(t).strip() for t in tags if str(t).strip()],
    }
    canvas = {
        "version": 1,
        "savedAt": datetime.now().isoformat(),
        "board": {"width": 2000, "height": 1200},
        "items": [],
    }

    write_json(trade_dir / "metadata.json", metadata)
    write_json(trade_dir / "canvas.json", canvas)

    trade_id = f"{yyyy}/{mm}/{dd}/{folder_name}"
    return {
        "id": trade_id,
        "path": f"trades/{trade_id}",
        "metadata": metadata,
        "sortKey": f"{yyyy}{mm}{dd}{time_text}{folder_name}",
    }


def update_trade_metadata(trade_id: str, payload: dict) -> dict:
    trade_dir = trade_dir_from_id(trade_id)
    if not trade_dir.exists():
        raise FileNotFoundError("Trade not found")

    metadata_path = trade_dir / "metadata.json"
    metadata = read_json(metadata_path, {})
    if not isinstance(metadata, dict):
        metadata = {}

    if "trade_name" in payload:
        trade_name = str(payload.get("trade_name", "")).strip()
        if not trade_name:
            raise ValueError("trade_name cannot be empty")
        metadata["trade_name"] = trade_name

    if "buy_price" in payload:
        metadata["buy_price"] = to_float_or_none(payload.get("buy_price"))
    if "sell_price" in payload:
        metadata["sell_price"] = to_float_or_none(payload.get("sell_price"))
    if "quantity" in payload:
        metadata["quantity"] = to_float_or_none(payload.get("quantity"))
    if "pnl" in payload:
        metadata["pnl"] = to_float_or_none(payload.get("pnl"))
    if "tags" in payload:
        tags = payload.get("tags", [])
        metadata["tags"] = [str(t).strip() for t in tags if str(t).strip()] if isinstance(tags, list) else []

    if (
        metadata.get("pnl") is None
        and metadata.get("buy_price") is not None
        and metadata.get("sell_price") is not None
        and metadata.get("quantity") is not None
    ):
        metadata["pnl"] = round((metadata["sell_price"] - metadata["buy_price"]) * metadata["quantity"], 2)

    write_json(metadata_path, metadata)
    return metadata


def list_trades() -> list[dict]:
    trades: list[dict] = []
    if not TRADES_DIR.exists():
        return trades

    for year_dir in TRADES_DIR.iterdir():
        if not year_dir.is_dir():
            continue
        year = year_dir.name
        for month_dir in year_dir.iterdir():
            if not month_dir.is_dir():
                continue
            month = month_dir.name
            for third_level in month_dir.iterdir():
                if not third_level.is_dir():
                    continue

                if re.fullmatch(r"\d{2}", third_level.name):
                    day = third_level.name
                    for trade_dir in third_level.iterdir():
                        if not trade_dir.is_dir():
                            continue
                        metadata_path = trade_dir / "metadata.json"
                        if not metadata_path.exists():
                            continue
                        metadata = read_json(metadata_path, {})
                        trade_id = f"{year}/{month}/{day}/{trade_dir.name}"
                        trades.append(
                            {
                                "id": trade_id,
                                "path": f"trades/{trade_id}",
                                "metadata": metadata,
                                "sortKey": f"{year}{month}{day}{metadata.get('time', '')}{trade_dir.name}",
                            }
                        )
                    continue

                metadata_path = third_level / "metadata.json"
                if not metadata_path.exists():
                    continue
                metadata = read_json(metadata_path, {})
                trade_id = f"{year}/{month}/{third_level.name}"
                trades.append(
                    {
                        "id": trade_id,
                        "path": f"trades/{trade_id}",
                        "metadata": metadata,
                        "sortKey": f"{year}{month}{third_level.name}",
                    }
                )

    trades.sort(key=lambda entry: str(entry.get("sortKey", "")), reverse=True)
    return trades


def recompute_overall_file() -> dict:
    trades = list_trades()
    ordered = sorted(trades, key=lambda entry: str(entry.get("sortKey", "")))

    rows = []
    cumulative = []
    total_pnl = 0.0
    win_count = 0
    loss_count = 0
    considered = 0

    for trade in ordered:
        meta = trade.get("metadata", {}) if isinstance(trade.get("metadata"), dict) else {}
        pnl = to_float_or_none(meta.get("pnl"))
        buy_price = to_float_or_none(meta.get("buy_price"))
        sell_price = to_float_or_none(meta.get("sell_price"))
        quantity = to_float_or_none(meta.get("quantity"))

        if pnl is not None:
            considered += 1
            total_pnl += pnl
            if pnl > 0:
                win_count += 1
            elif pnl < 0:
                loss_count += 1
            cumulative.append(
                {
                    "id": trade.get("id"),
                    "trade_name": str(meta.get("trade_name", "")),
                    "pnl": round(pnl, 2),
                    "cumulative": round(total_pnl, 2),
                    "date": meta.get("date"),
                    "time": meta.get("time"),
                }
            )

        rows.append(
            {
                "id": trade.get("id"),
                "trade_name": str(meta.get("trade_name", "")),
                "buy_price": buy_price,
                "sell_price": sell_price,
                "quantity": quantity,
                "pnl": round(pnl, 2) if pnl is not None else 0.0,
                "date": meta.get("date"),
                "time": meta.get("time"),
                "tags": meta.get("tags", []),
            }
        )

    hit_rate = (win_count / considered * 100.0) if considered else 0.0
    overall = {
        "generated_at": datetime.now().isoformat(),
        "trade_count": len(rows),
        "considered_for_hit_rate": considered,
        "win_count": win_count,
        "loss_count": loss_count,
        "hit_rate": round(hit_rate, 2),
        "total_pnl": round(total_pnl, 2),
        "avg_pnl": round(total_pnl / considered, 2) if considered else 0.0,
        "trades": rows,
        "cumulative_pnl": cumulative,
    }
    write_json(DATA_DIR / "overall.json", overall)
    return overall


def auth_data() -> dict:
    value = read_json(AUTH_FILE, {})
    return value if isinstance(value, dict) else {}


def is_auth_configured() -> bool:
    info = auth_data()
    return bool(info.get("salt") and info.get("password_hash"))


def profile_name() -> str:
    info = auth_data()
    return str(info.get("profile_name", "")).strip()


def hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    if salt_hex is None:
        salt = secrets.token_bytes(16)
        salt_hex = salt.hex()
    else:
        salt = bytes.fromhex(salt_hex)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return salt_hex, digest.hex()


def verify_password(password: str) -> bool:
    info = auth_data()
    salt_hex = str(info.get("salt", ""))
    expected = str(info.get("password_hash", ""))
    if not salt_hex or not expected:
        return False
    _, computed = hash_password(password, salt_hex=salt_hex)
    return hmac.compare_digest(expected, computed)


def update_password(current_password: str, new_password: str) -> None:
    if not verify_password(current_password):
        raise ValueError("Current password is incorrect")
    if len(new_password) < 4:
        raise ValueError("New password must be at least 4 characters")
    info = auth_data()
    salt_hex, digest_hex = hash_password(new_password)
    info["salt"] = salt_hex
    info["password_hash"] = digest_hex
    info["updated_at"] = datetime.now().isoformat()
    write_json(AUTH_FILE, info)


def update_profile_name(new_name: str) -> dict:
    clean = new_name.strip()
    if not clean:
        raise ValueError("profile_name cannot be empty")
    info = auth_data()
    info["profile_name"] = clean
    info["updated_at"] = datetime.now().isoformat()
    write_json(AUTH_FILE, info)
    return {"profile_name": clean}


def create_session() -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    SESSIONS[token] = now + SESSION_TTL_SECONDS
    return token


def session_valid(token: str) -> bool:
    expiry = SESSIONS.get(token)
    if not expiry:
        return False
    now = time.time()
    if expiry < now:
        SESSIONS.pop(token, None)
        return False
    SESSIONS[token] = now + SESSION_TTL_SECONDS
    return True


def clear_session(token: str) -> None:
    SESSIONS.pop(token, None)


def parse_cookie_header(raw_cookie: str | None) -> dict[str, str]:
    if not raw_cookie:
        return {}
    out: dict[str, str] = {}
    for part in raw_cookie.split(";"):
        if "=" not in part:
            continue
        key, val = part.split("=", 1)
        out[key.strip()] = val.strip()
    return out


class JournalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: int, payload, extra_headers: list[tuple[str, str]] | None = None):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        for key, value in extra_headers or []:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def send_text(self, status: int, payload: str, extra_headers: list[tuple[str, str]] | None = None):
        raw = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        for key, value in extra_headers or []:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def session_token(self) -> str:
        cookies = parse_cookie_header(self.headers.get("Cookie"))
        return cookies.get("journal_session", "")

    def authenticated(self) -> bool:
        if not is_auth_configured():
            return False
        token = self.session_token()
        if not token:
            return False
        return session_valid(token)

    def require_auth(self) -> bool:
        if self.authenticated():
            return True
        self.send_text(401, "Unauthorized")
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            self.send_json(200, {"ok": True})
            return

        if path == "/api/auth/status":
            self.send_json(
                200,
                {
                    "configured": is_auth_configured(),
                    "authenticated": self.authenticated(),
                    "profile_name": profile_name(),
                },
            )
            return

        if path.startswith("/trades/"):
            if not self.require_auth():
                return
            super().do_GET()
            return

        if path.startswith("/api/"):
            if not self.require_auth():
                return

        if path == "/api/summary":
            summary = read_json(DATA_DIR / "summary.json", {"total_pnl": 0, "trade_count": 0, "pnl_per_symbol": {}})
            self.send_json(200, summary)
            return

        if path == "/api/overall":
            self.send_json(200, recompute_overall_file())
            return

        if path == "/api/profile":
            self.send_json(200, {"profile_name": profile_name()})
            return

        if path == "/api/trades":
            self.send_json(200, list_trades())
            return

        if path.startswith("/api/trades/") and path.endswith("/canvas"):
            trade_id = unquote(path[len("/api/trades/") : -len("/canvas")]).strip("/")
            try:
                trade_dir = trade_dir_from_id(trade_id)
            except ValueError as exc:
                self.send_text(400, str(exc))
                return
            canvas = read_json(
                trade_dir / "canvas.json",
                {"version": 1, "savedAt": "", "board": {"width": 2000, "height": 1200}, "items": []},
            )
            self.send_json(200, canvas)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/auth/setup":
            if is_auth_configured():
                self.send_text(400, "Password already set")
                return
            try:
                payload = parse_json_body(self)
                password = str(payload.get("password", ""))
                if len(password) < 4:
                    self.send_text(400, "Password must be at least 4 characters")
                    return
                salt_hex, digest_hex = hash_password(password)
                write_json(
                    AUTH_FILE,
                    {
                        "salt": salt_hex,
                        "password_hash": digest_hex,
                        "profile_name": str(payload.get("profile_name", "")).strip() or "Trader",
                        "iterations": PBKDF2_ITERATIONS,
                        "created_at": datetime.now().isoformat(),
                    },
                )
                token = create_session()
                cookie = f"journal_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL_SECONDS}"
                self.send_json(200, {"ok": True}, extra_headers=[("Set-Cookie", cookie)])
            except Exception as exc:
                self.send_text(400, f"Cannot setup auth: {exc}")
            return

        if path == "/api/auth/login":
            try:
                payload = parse_json_body(self)
                password = str(payload.get("password", ""))
                if not verify_password(password):
                    self.send_text(401, "Invalid password")
                    return
                token = create_session()
                cookie = f"journal_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL_SECONDS}"
                self.send_json(200, {"ok": True}, extra_headers=[("Set-Cookie", cookie)])
            except Exception as exc:
                self.send_text(400, f"Cannot login: {exc}")
            return

        if path == "/api/auth/change-password":
            if not self.require_auth():
                return
            try:
                payload = parse_json_body(self)
                current_password = str(payload.get("current_password", ""))
                new_password = str(payload.get("new_password", ""))
                update_password(current_password, new_password)
                self.send_json(200, {"ok": True})
            except Exception as exc:
                self.send_text(400, f"Cannot change password: {exc}")
            return

        if path == "/api/auth/logout":
            token = self.session_token()
            if token:
                clear_session(token)
            self.send_json(
                200,
                {"ok": True},
                extra_headers=[("Set-Cookie", "journal_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")],
            )
            return

        if path.startswith("/api/"):
            if not self.require_auth():
                return

        if path == "/api/trades":
            try:
                payload = parse_json_body(self)
                created = create_trade(payload)
                recompute_overall_file()
                self.send_json(201, created)
            except Exception as exc:
                self.send_text(400, f"Cannot create trade: {exc}")
            return

        if path.startswith("/api/trades/") and path.endswith("/images"):
            trade_id = unquote(path[len("/api/trades/") : -len("/images")]).strip("/")
            try:
                trade_dir = trade_dir_from_id(trade_id)
            except ValueError as exc:
                self.send_text(400, str(exc))
                return

            if not trade_dir.exists():
                self.send_text(404, "Trade not found")
                return

            params = parse_qs(parsed.query)
            requested_name = params.get("filename", ["image.png"])[0]
            safe_name = safe_segment(requested_name)
            images_dir = trade_dir / "images"
            images_dir.mkdir(parents=True, exist_ok=True)

            target = images_dir / safe_name
            stem = target.stem
            suffix = target.suffix
            idx = 2
            while target.exists():
                target = images_dir / f"{stem}_{idx}{suffix}"
                idx += 1

            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b""
            target.write_bytes(body)
            self.send_text(201, f"images/{target.name}")
            return

        self.send_text(404, "Not found")

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            if not self.require_auth():
                return

        if path.startswith("/api/trades/") and path.endswith("/metadata"):
            trade_id = unquote(path[len("/api/trades/") : -len("/metadata")]).strip("/")
            try:
                payload = parse_json_body(self)
                metadata = update_trade_metadata(trade_id, payload)
                recompute_overall_file()
                self.send_json(200, metadata)
            except FileNotFoundError as exc:
                self.send_text(404, str(exc))
            except Exception as exc:
                self.send_text(400, f"Cannot update metadata: {exc}")
            return

        if path == "/api/profile":
            try:
                payload = parse_json_body(self)
                result = update_profile_name(str(payload.get("profile_name", "")))
                self.send_json(200, result)
            except Exception as exc:
                self.send_text(400, f"Cannot update profile: {exc}")
            return

        if path.startswith("/api/trades/") and path.endswith("/canvas"):
            trade_id = unquote(path[len("/api/trades/") : -len("/canvas")]).strip("/")
            try:
                trade_dir = trade_dir_from_id(trade_id)
            except ValueError as exc:
                self.send_text(400, str(exc))
                return

            if not trade_dir.exists():
                self.send_text(404, "Trade not found")
                return

            try:
                payload = parse_json_body(self)
                write_json(trade_dir / "canvas.json", payload)
                self.send_text(200, "ok")
            except Exception as exc:
                self.send_text(400, f"Cannot save canvas: {exc}")
            return

        self.send_text(404, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            if not self.require_auth():
                return

        if path.startswith("/api/trades/") and path.endswith("/images"):
            trade_id = unquote(path[len("/api/trades/") : -len("/images")]).strip("/")
            try:
                trade_dir = trade_dir_from_id(trade_id)
            except ValueError as exc:
                self.send_text(400, str(exc))
                return

            if not trade_dir.exists():
                self.send_text(404, "Trade not found")
                return

            params = parse_qs(parsed.query)
            rel_path = params.get("path", [""])[0].strip()
            if not rel_path.startswith("images/"):
                self.send_text(400, "Invalid image path")
                return
            image_name = rel_path.split("/", 1)[1]
            if not SAFE_SEGMENT.match(image_name):
                self.send_text(400, "Invalid image file name")
                return

            target = trade_dir / "images" / image_name
            if target.exists():
                target.unlink()
            self.send_text(200, "ok")
            return

        if path.startswith("/api/trades/"):
            trade_id = unquote(path[len("/api/trades/") :]).strip("/")
            try:
                trade_dir = trade_dir_from_id(trade_id)
            except ValueError as exc:
                self.send_text(400, str(exc))
                return

            if not trade_dir.exists():
                self.send_text(404, "Trade not found")
                return

            shutil.rmtree(trade_dir)
            recompute_overall_file()
            self.send_text(200, "ok")
            return

        self.send_text(404, "Not found")


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            raise SystemExit("Port must be a number, e.g. python3 server.py 8001")
    server = ThreadingHTTPServer(("127.0.0.1", port), JournalHandler)
    print(f"Serving Trading Journal on http://127.0.0.1:{port}")
    print("Press Ctrl+C to stop")
    server.serve_forever()


if __name__ == "__main__":
    main()
