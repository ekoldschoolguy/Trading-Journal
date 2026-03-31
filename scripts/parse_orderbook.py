#!/usr/bin/env python3
"""
Parse an orderbook CSV and write JSON summary to data/summary.json.

Usage:
  python3 scripts/parse_orderbook.py --input /path/to/orderbook.csv
  python3 scripts/parse_orderbook.py --input orderbook.csv --output data/summary.json
"""

import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def parse_float(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def first_non_empty(row, keys):
    for key in keys:
        if key in row and str(row[key]).strip():
            return str(row[key]).strip()
    return ""


def infer_pnl(row):
    explicit_pnl_keys = ["pnl", "net_pnl", "realized_pnl", "profit_loss", "profit", "net"]
    for key in explicit_pnl_keys:
        if key in row:
            value = parse_float(row[key])
            if value is not None:
                return value

    buy_price = parse_float(row.get("buy_price"))
    sell_price = parse_float(row.get("sell_price"))
    qty = parse_float(row.get("qty")) or parse_float(row.get("quantity"))
    if buy_price is not None and sell_price is not None and qty is not None:
        return (sell_price - buy_price) * qty

    return None


def main():
    parser = argparse.ArgumentParser(description="Orderbook CSV -> summary.json")
    parser.add_argument("--input", required=True, help="Path to orderbook CSV")
    parser.add_argument(
        "--output",
        default="data/summary.json",
        help="Output JSON path (default: data/summary.json)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise SystemExit(f"Input CSV not found: {input_path}")

    total_pnl = 0.0
    trade_count = 0
    pnl_per_symbol = defaultdict(float)

    with input_path.open("r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw_row in reader:
            row = {str(k).strip().lower(): v for k, v in raw_row.items()}
            symbol = first_non_empty(row, ["symbol", "tradingsymbol", "instrument", "ticker"]) or "UNKNOWN"
            pnl = infer_pnl(row)
            if pnl is None:
                continue
            total_pnl += pnl
            pnl_per_symbol[symbol] += pnl
            trade_count += 1

    summary = {
        "generated_at": datetime.now().isoformat(),
        "total_pnl": round(total_pnl, 2),
        "trade_count": trade_count,
        "pnl_per_symbol": {k: round(v, 2) for k, v in sorted(pnl_per_symbol.items())},
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote summary: {output_path}")


if __name__ == "__main__":
    main()
