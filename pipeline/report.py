"""Run reporting and validation gates.

The point of this module is that a broken run must be *loud*. Every step records
what it did and asserts the invariants it depends on; a failed invariant raises
and stops the pipeline before anything is published, and every run leaves a
report on disk so a result can be traced back to the data that produced it.
"""

import json
import os
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone

from . import config


class PipelineError(RuntimeError):
    """Raised when a validation gate fails. Never caught inside the pipeline."""


class Report:
    def __init__(self, run_name: str):
        self.run_name = run_name
        self.started = datetime.now(timezone.utc)
        self._t0 = time.time()
        self.steps = []
        self.checks = []
        self.facts = {}
        self._current = None

    # -- structure ------------------------------------------------------------
    def step(self, name: str):
        self._current = {"name": name, "started": time.time(), "facts": {}}
        self.steps.append(self._current)
        print(f"\n=== {name} ===", flush=True)
        return self

    def end_step(self):
        if self._current is not None:
            self._current["seconds"] = round(time.time() - self._current["started"], 1)
            self._current.pop("started", None)
            self._current = None

    # -- recording ------------------------------------------------------------
    def fact(self, key, value):
        """Record a number/label worth seeing in the report."""
        target = self._current["facts"] if self._current else self.facts
        target[key] = value
        print(f"  {key}: {value}", flush=True)
        return value

    def note(self, message):
        print(f"  - {message}", flush=True)

    # -- gates ----------------------------------------------------------------
    def check(self, name, ok, detail="", *, fatal=True):
        """Assert an invariant.

        fatal=True (the default) aborts the run. Use fatal=False only for things
        that are worth a human's attention but cannot corrupt a published number.
        """
        entry = {
            "name": name,
            "ok": bool(ok),
            "detail": str(detail),
            "fatal": fatal,
            "step": self._current["name"] if self._current else None,
        }
        self.checks.append(entry)
        if ok:
            # `detail` describes the failure, so it is only meaningful when the
            # check did not pass.
            print(f"  [ok]   {name}", flush=True)
            return True
        marker = "FAIL" if fatal else "WARN"
        print(f"  [{marker}] {name} - {detail}", flush=True)
        if fatal:
            self.write()
            raise PipelineError(f"{name}: {detail}")
        return False

    def check_equal(self, name, actual, expected, *, fatal=True):
        return self.check(
            name, actual == expected, f"expected {expected!r}, got {actual!r}", fatal=fatal
        )

    # -- persistence ----------------------------------------------------------
    @property
    def failed(self):
        return [c for c in self.checks if not c["ok"]]

    def _provenance(self):
        prov = {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "started_utc": self.started.isoformat(),
            "seconds": round(time.time() - self._t0, 1),
        }
        try:
            prov["git_commit"] = subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=config.REPO_ROOT, text=True
            ).strip()
            prov["git_dirty"] = bool(
                subprocess.check_output(
                    ["git", "status", "--porcelain"], cwd=config.REPO_ROOT, text=True
                ).strip()
            )
        except Exception:
            pass
        for label, path in (("raw_votes", config.RAW_VOTES), ("raw_meps", config.RAW_MEPS)):
            if path.exists():
                st = path.stat()
                prov[f"{label}_bytes"] = st.st_size
                prov[f"{label}_mtime"] = datetime.fromtimestamp(
                    st.st_mtime, timezone.utc
                ).isoformat()
        return prov

    def to_dict(self):
        self.end_step()
        warnings = [c for c in self.checks if not c["ok"] and not c["fatal"]]
        failures = [c for c in self.checks if not c["ok"] and c["fatal"]]
        return {
            "run": self.run_name,
            "provenance": self._provenance(),
            "summary": {
                "checks": len(self.checks),
                "passed": sum(1 for c in self.checks if c["ok"]),
                "warnings": len(warnings),
                "failures": len(failures),
            },
            "facts": self.facts,
            "steps": self.steps,
            "checks": self.checks,
        }

    def write(self):
        config.REPORT_DIR.mkdir(parents=True, exist_ok=True)
        payload = self.to_dict()
        stamp = self.started.strftime("%Y%m%dT%H%M%SZ")
        path = config.REPORT_DIR / f"{stamp}_{self.run_name}.json"
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        latest = config.REPORT_DIR / f"latest_{self.run_name}.json"
        latest.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        return path

    def print_summary(self):
        d = self.to_dict()
        s = d["summary"]
        print("\n" + "=" * 68)
        print(f"{self.run_name}: {s['passed']}/{s['checks']} checks passed, "
              f"{s['warnings']} warning(s), {s['failures']} failure(s) "
              f"in {d['provenance']['seconds']}s")
        for c in self.checks:
            if not c["ok"]:
                print(f"  {'FAIL' if c['fatal'] else 'WARN'}: {c['name']} - {c['detail']}")
        print("=" * 68, flush=True)


def atomic_write_json(path, obj, indent=None):
    """Write JSON via a temp file so a crash never leaves a half-valid file
    that the next step would happily read."""
    path = str(path)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)
    return path
