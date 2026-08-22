"""Assign a policy subject to every voting session.

A vote is labelled by finding the parliamentary procedure behind it and asking
OEIL which committee is responsible for that procedure. Getting from a vote to a
procedure takes a few hops, because the raw dump identifies a vote only by the
plenary document code printed in its title:

    "A10-0214/2025 - Lopez Aguilar - Motion for a resolution (as a whole)"
     └── document code ──┘
                          -> EP Open Data -> procedure ref 2013/0072(COD)
                          -> OEIL         -> "Transport and Tourism"
                          -> SUBJECT_MAPPING -> canonical subject

Every hop is cached on disk, keyed by the thing being looked up, so re-running
the pipeline costs no network traffic and future updates only pay for genuinely
new votes.

The top-level cache is keyed by vote id and seeded from the 2025 results, which
is what makes the historical mandates reproduce exactly: their labels are the
ones already published, not a fresh guess from an API whose answers may have
moved on since.

Known deviation from the 2025 notebook, deliberate: that code extracted a "B"
code out of an "RC-B" code (its regex matched the B inside RC-B) and let the B
lookup win, so joint motions for resolution were resolved via one of their
constituent group motions instead of the joint text - usually resolving to
nothing, leaving the vote in "Others". Here RC-B is matched before B. This only
affects votes newly labelled in this run; frozen historical labels are untouched.
"""

import re

from . import config
from .remote import (
    NOT_FOUND,
    Http,
    RemoteBlocked,
    RemoteUnavailable,
    fetch_committee_name,
    fetch_document,
    fetch_second_level_subject,
    fetch_sitting_code_map,
    fetch_subject,
)
from .report import atomic_write_json
from .jsonstream import iter_json_array

import json

_DASH = r"[-–—]"

# Most specific first: RC-B must beat B, because "RC-B10-0064/2026" also
# contains the substring "B10-0064/2026".
CODE_PATTERNS = [
    ("rc_b", re.compile(rf"\bRC{_DASH}B(\d{{1,2}}){_DASH}(\d{{1,4}})/(\d{{4}})\b"), "RC-B{m}-{n}/{y}"),
    ("a", re.compile(rf"\bA(\d{{1,2}}){_DASH}(\d{{1,4}})/(\d{{4}})\b"), "A{m}-{n}/{y}"),
    ("b", re.compile(rf"\bB(\d{{1,2}}){_DASH}(\d{{1,4}})/(\d{{4}})\b"), "B{m}-{n}/{y}"),
    ("c", re.compile(rf"\bC(\d{{1,2}}){_DASH}(\d{{1,4}})/(\d{{4}})\b"), "C{m}-{n}/{y}"),
]

# Year-first, to keep plenary document numbers (0064/2025) from being read as
# procedure references (2025/2519). See remote.EPREF_WITH_SUFFIX.
EPREF_WITH_SUFFIX = re.compile(r"\b((?:19|20)\d{2}/\d{4})\s*\([A-Z]{3,4}\)")
EPREF_BARE = re.compile(r"\b((?:19|20)\d{2}/\d{4})\b")


def normalise_epref(value):
    """Reduce any procedure reference to its bare YYYY/NNNN form."""
    if not value:
        return None
    m = EPREF_BARE.search(str(value))
    return m.group(1) if m else None


def extract_code(text):
    """Return the plenary document code in `text`, normalised, or None."""
    if not text:
        return None
    for kind, pattern, template in CODE_PATTERNS:
        m = pattern.search(text)
        if m:
            return template.format(m=m.group(1), n=m.group(2).zfill(4), y=m.group(3))
    return None


def session_reference(session):
    """Work out what to look up for a session.

    Returns (kind, value) where kind is 'epref' or 'code', or (None, None) when
    the session carries no identifiable procedure - typically a procedural vote
    on the agenda, which correctly ends up in "Others".
    """
    raw = session.get("epref")
    if isinstance(raw, list):
        raw = raw[0] if raw else None
    if isinstance(raw, str) and raw.strip():
        code = extract_code(raw)
        if code:
            return "code", code
        epref = normalise_epref(raw)
        if epref:
            return "epref", epref

    title = session.get("title") or ""
    code = extract_code(title)
    if code:
        return "code", code
    m = EPREF_WITH_SUFFIX.search(title)
    if m:
        return "epref", m.group(1)
    m = EPREF_BARE.search(title)
    if m:
        return "epref", m.group(1)
    return None, None


class JsonCache:
    """A dict persisted to disk. `None` means 'asked, and there is no answer'."""

    def __init__(self, path, seed=None):
        self.path = path
        self.data = {}
        self.hits = 0
        self.misses = 0
        self.seeded = 0
        self.dirty = False
        if path.exists():
            self.data = json.loads(path.read_text(encoding="utf-8"))
        elif seed and seed.exists():
            self.data = json.loads(seed.read_text(encoding="utf-8"))
            self.seeded = len(self.data)
            self.dirty = True

    def __contains__(self, key):
        return str(key) in self.data

    def get(self, key):
        key = str(key)
        if key in self.data:
            self.hits += 1
            return self.data[key]
        self.misses += 1
        return KeyError

    def set(self, key, value):
        self.data[str(key)] = value
        self.dirty = True

    def save(self):
        if self.dirty:
            atomic_write_json(self.path, self.data, indent=1)
            self.dirty = False
        return len(self.data)


class SubjectResolver:
    def __init__(self, report, offline=False):
        self.report = report
        self.offline = offline
        self.http = None if offline else Http()
        config.CACHE_DIR.mkdir(parents=True, exist_ok=True)

        c = config.CACHE_DIR
        b = config.BASELINE_CACHE_DIR
        self.by_voteid = JsonCache(c / "subject_by_voteid.json")
        self.code_epref = JsonCache(c / "code_to_epref.json", seed=b / "code_to_epref_cache.json")
        self.code_committees = JsonCache(c / "code_to_committees.json")
        self.epref_label = JsonCache(c / "epref_to_label.json", seed=b / "epref_cache.json")
        self.epref_label2 = JsonCache(c / "epref_to_second_level.json")
        self.committee_names = JsonCache(c / "committee_names.json")
        self.sitting_codes = JsonCache(c / "sitting_code_maps.json")
        # Hand-entered answers, highest precedence. Anything the automated route
        # cannot reach can be filled in here as {"<code or voteid>": "<subject>"}
        # and it will be used and reported.
        self.overrides = JsonCache(c / "manual_subject_overrides.json")

        self.stats = {
            "from_voteid_cache": 0,
            "resolved_via_epref": 0,
            "resolved_via_committee": 0,
            "budget_title_fallback": 0,
            "unresolved": 0,
            "no_reference": 0,
            "lookup_failures": 0,
        }
        self.failures = []

    # -- seeding --------------------------------------------------------------
    def seed_from_baseline(self):
        """Load the 2025 vote-id -> subject results so closed mandates reproduce
        exactly and no historical vote is re-fetched."""
        if self.by_voteid.data:
            return 0
        seeded = 0
        for mandate in config.MANDATE_ORDER:
            path = config.BASELINE_ENRICHED_DIR / f"ep_votes_{mandate}.json"
            if not path.exists():
                continue
            for session in iter_json_array(str(path)):
                subject = session.get("subject")
                vid = session.get("voteid")
                if vid is not None and subject:
                    self.by_voteid.set(vid, {"subject": subject, "via": "baseline-2025"})
                    seeded += 1
        self.by_voteid.save()
        return seeded

    # -- individual lookups ---------------------------------------------------
    def _cached_lookup(self, cache, key, fetcher):
        """Cache-first remote lookup. Returns the value, or None if there is
        genuinely no answer. Raises if the lookup itself could not be done."""
        got = cache.get(key)
        if got is not KeyError:
            return got
        if self.offline:
            raise RemoteUnavailable(f"offline mode: {key} is not cached")
        value = fetcher(self.http, key)
        stored = None if value is NOT_FOUND else value
        cache.set(key, stored)
        return stored

    def epref_from_sitting(self, code, sitting_date):
        """Last resort: read the code -> procedure pairing off the plenary
        sitting's own vote-results. Cached per sitting, so one request covers
        every unresolved code voted that day."""
        if not sitting_date:
            return None
        cached = self.sitting_codes.get(sitting_date)
        if cached is KeyError:
            if self.offline:
                raise RemoteUnavailable(f"offline mode: sitting {sitting_date} is not cached")
            cached = fetch_sitting_code_map(self.http, sitting_date) or {}
            self.sitting_codes.set(sitting_date, cached)
        return normalise_epref((cached or {}).get(code))

    def code_to_epref_and_committees(self, code, sitting_date=None):
        """Resolve a document code to (epref, committee abbreviations)."""
        if code.startswith("C"):
            # Council documents are not in the EP documents API at all.
            return self.epref_from_sitting(code, sitting_date), []

        if code in self.code_epref and code in self.code_committees:
            return normalise_epref(self.code_epref.get(code)), (
                self.code_committees.get(code) or []
            )

        if self.offline:
            if code in self.code_epref:
                return normalise_epref(self.code_epref.get(code)), []
            raise RemoteUnavailable(f"offline mode: {code} is not cached")

        result = fetch_document(self.http, code)
        if result is NOT_FOUND:
            epref, committees = None, []
        else:
            epref = normalise_epref(result.get("epref"))
            committees = result.get("committees") or []
        if epref is None:
            # Standalone group motions often carry no procedure of their own.
            # The sitting record still pairs the code with one.
            epref = self.epref_from_sitting(code, sitting_date)
        self.code_epref.set(code, epref)
        self.code_committees.set(code, committees)
        return epref, committees

    def committee_to_subject(self, abbr):
        name = self._cached_lookup(self.committee_names, abbr, fetch_committee_name)
        if not name:
            return None
        subject = config.canonical_subject(name)
        return subject if subject != config.FALLBACK_SUBJECT else None

    def epref_to_subject(self, epref):
        """OEIL label -> canonical subject, with the second-level fallback the
        2025 run used for anything that did not map."""
        label = self._cached_lookup(self.epref_label, epref, fetch_subject)
        subject = config.canonical_subject(label)
        if subject != config.FALLBACK_SUBJECT:
            return subject
        label2 = self._cached_lookup(self.epref_label2, epref, fetch_second_level_subject)
        return config.canonical_subject(label2)

    # -- top level ------------------------------------------------------------
    def resolve(self, session):
        """Return (subject, provenance) for one voting session."""
        vid = session.get("voteid")
        cached = self.by_voteid.get(vid)
        if cached is not KeyError and cached:
            self.stats["from_voteid_cache"] += 1
            return cached["subject"], cached["via"]

        kind, value = session_reference(session)
        subject = None
        via = None

        override = self.overrides.get(str(value)) if value else KeyError
        if override is KeyError:
            override = self.overrides.get(str(vid))
        if override is not KeyError and override:
            self.by_voteid.set(vid, {"subject": override, "via": "manual-override"})
            return override, "manual-override"

        ts = session.get("ts") or session.get("TS") or ""
        sitting_date = ts.split("T")[0] if ts else None

        try:
            if kind == "code":
                epref, committees = self.code_to_epref_and_committees(value, sitting_date)
                if epref:
                    subject = self.epref_to_subject(epref)
                    via = f"code:{value}->epref:{epref}"
                    if subject != config.FALLBACK_SUBJECT:
                        self.stats["resolved_via_epref"] += 1
                if (subject is None or subject == config.FALLBACK_SUBJECT) and committees:
                    # No procedure, or the procedure had no usable label: fall
                    # back to the committee that authored the document.
                    for abbr in committees:
                        from_cttee = self.committee_to_subject(abbr)
                        if from_cttee:
                            subject = from_cttee
                            via = f"code:{value}->committee:{abbr}"
                            self.stats["resolved_via_committee"] += 1
                            break
            elif kind == "epref":
                subject = self.epref_to_subject(value)
                via = f"epref:{value}"
                if subject != config.FALLBACK_SUBJECT:
                    self.stats["resolved_via_epref"] += 1
        except RemoteBlocked:
            raise
        except RemoteUnavailable as exc:
            self.stats["lookup_failures"] += 1
            if len(self.failures) < 50:
                self.failures.append({"voteid": vid, "ref": value, "error": str(exc)})
            return None, "lookup-failed"

        if kind is None:
            self.stats["no_reference"] += 1
            # 2025 behaviour: a vote with no procedure at all but "budget" in its
            # title is a budget vote.
            title = session.get("title") or ""
            if "budget" in title.lower():
                self.stats["budget_title_fallback"] += 1
                subject, via = "Budgets", "title-contains-budget"

        if not subject:
            subject = config.FALLBACK_SUBJECT
            via = via or "unresolved"
        if subject == config.FALLBACK_SUBJECT:
            self.stats["unresolved"] += 1

        self.by_voteid.set(vid, {"subject": subject, "via": via})
        return subject, via

    def save(self):
        sizes = {
            "subject_by_voteid": self.by_voteid.save(),
            "code_to_epref": self.code_epref.save(),
            "code_to_committees": self.code_committees.save(),
            "epref_to_label": self.epref_label.save(),
            "epref_to_second_level": self.epref_label2.save(),
            "committee_names": self.committee_names.save(),
            "sitting_code_maps": self.sitting_codes.save(),
        }
        return sizes
