"""
Continuous Integration AI Evaluation Quality Gate.
Runs the golden test set through the AI inference pipeline and enforces a minimum quality threshold.
"""
import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

CASES_PATH = Path(__file__).parent / "eval_cases_example.json"
PASS_RATE_THRESHOLD = 0.70


async def main() -> int:
    from shared.eval_harness import EvalCase, run_eval

    if not CASES_PATH.exists():
        print(f"[eval-ci] ERROR: eval cases file not found at {CASES_PATH}", flush=True)
        return 1

    raw = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    cases = [EvalCase(**c) for c in raw]

    print(f"[eval-ci] Running {len(cases)} eval cases ...", flush=True)
    report = await run_eval(cases)

    print(f"[eval-ci] Results: {report.passed}/{report.total} passed (pass_rate={report.pass_rate:.2f})", flush=True)

    for result in report.cases:
        status = "PASS" if result.passed else "FAIL"
        print(f"  [{status}] {result.case_id}", flush=True)
        if not result.passed and result.checks_failed:
            for reason in result.checks_failed:
                print(f"         - {reason}", flush=True)

    if report.pass_rate < PASS_RATE_THRESHOLD:
        print(
            f"\n[eval-ci] FAILED - pass rate {report.pass_rate:.2f} is below threshold {PASS_RATE_THRESHOLD:.2f}",
            flush=True,
        )
        return 1

    print(
        f"\n[eval-ci] PASSED - pass rate {report.pass_rate:.2f} meets threshold {PASS_RATE_THRESHOLD:.2f}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

