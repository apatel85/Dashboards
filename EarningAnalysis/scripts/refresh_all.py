#!/usr/bin/env python3
"""
refresh_all.py
Master script — runs all pipeline scripts in order.
Schedule with cron:
  0 6 * * 1-5   python scripts/refresh_all.py --step calendar
  0 18 * * 1-5  python scripts/refresh_all.py --step all
"""

import subprocess, sys, time

STEPS = [
    ("earnings_calendar", "scripts/fetch_earnings_calendar.py"),
    ("fundamentals",      "scripts/fetch_fundamentals.py"),
    ("insider",           "scripts/fetch_insider.py"),
]

def run_step(name: str, script: str):
    print(f"\n{'='*50}")
    print(f"Running: {name}")
    print(f"{'='*50}")
    t0 = time.time()
    result = subprocess.run(["python3", script], capture_output=False)
    elapsed = time.time() - t0
    status = "✓ OK" if result.returncode == 0 else "✗ FAILED"
    print(f"{status} — {elapsed:.1f}s")
    return result.returncode == 0

def main():
    step = sys.argv[2] if len(sys.argv) > 2 else "all"
    results = {}
    for name, script in STEPS:
        if step == "all" or step == name:
            results[name] = run_step(name, script)

    print("\n=== Pipeline Summary ===")
    for name, ok in results.items():
        print(f"  {'✓' if ok else '✗'} {name}")

if __name__ == "__main__":
    main()
