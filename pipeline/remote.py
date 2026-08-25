"""HTTP lookups against the EU institutions' public APIs.

Three sources, in the order the pipeline prefers them:

1. EP Open Data Portal (data.europarl.europa.eu) - official REST/JSON-LD API.
   Turns a plenary document code (A10-0001/2026) into the procedure reference
   ("epref", e.g. 2013/0072(COD)) and/or the responsible committee.
2. OEIL (oeil.secure.europarl.europa.eu) - turns a procedure reference into the
   committee responsible / policy area. This is the source the 2025 run used,
   so keeping it means new votes are labelled on the same basis as old ones.
3. EUR-Lex - last resort for Council "C" documents, which the EP API does not
   hold.

Design rules, all of them there to stop a silent wrong answer:

* Bounded retries. The 2025 notebook had a `while True:` retry loop that would
  hang forever if a service went down; here everything gives up and says so.
* A bot-challenge response raises `RemoteBlocked` rather than being read as
  "no data". www.europarl.europa.eu/doceo (the 2025 scraping target) now sits
  behind an AWS WAF JS challenge and answers 202 with a challenge page - the
  old code treated that as "not found" and silently dropped the subject.
* `NOT_FOUND` (the service answered, and has nothing) is distinguished from a
  failure (we could not ask). Only the former is cached.
"""

import re
import threading
import time

import requests

USER_AGENT = "EuropeanParliamentNetworkAnalysis/2026 (research; contact via repository)"

OPENDATA_BASE = "https://data.europarl.europa.eu/api/v2"
OEIL_FACETS = "https://oeil.secure.europarl.europa.eu/oeil/en/search/facets"
EURLEX_SEARCH = "https://eur-lex.europa.eu/search.html"

# Sentinel: the service answered and genuinely has no value for this key.
NOT_FOUND = "__not_found__"


class RemoteBlocked(RuntimeError):
    """A service answered with a bot-challenge or rate-limit wall."""


class RemoteUnavailable(RuntimeError):
    """A service could not be reached within the retry budget."""


class Http:
    """Small polite HTTP client: shared session, rate limit, bounded retries."""

    def __init__(self, min_interval=0.34, max_retries=6, timeout=45):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.min_interval = min_interval
        self.max_retries = max_retries
        self.timeout = timeout
        self._lock = threading.Lock()
        self._last = 0.0
        self.stats = {"requests": 0, "retries": 0, "blocked": 0}

    def _throttle(self):
        with self._lock:
            wait = self.min_interval - (time.time() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()

    def get(self, url, params=None, accept=None):
        headers = {"Accept": accept} if accept else None
        last_err = None
        for attempt in range(self.max_retries):
            self._throttle()
            try:
                self.stats["requests"] += 1
                r = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
            except requests.RequestException as exc:
                last_err = exc
                self.stats["retries"] += 1
                time.sleep(min(2 ** attempt, 8))
                continue

            # A WAF challenge is not an answer. Never let it read as "no data".
            if r.headers.get("x-amzn-waf-action") or r.status_code == 403:
                self.stats["blocked"] += 1
                raise RemoteBlocked(
                    f"{url} returned a bot challenge (HTTP {r.status_code}, "
                    f"waf-action={r.headers.get('x-amzn-waf-action')})"
                )
            if r.status_code == 404 or r.status_code == 204:
                return None
            if r.status_code == 429 or r.status_code >= 500:
                last_err = RemoteUnavailable(f"{url} -> HTTP {r.status_code}")
                self.stats["retries"] += 1
                if r.status_code == 429:
                    self.stats["rate_limited"] = self.stats.get("rate_limited", 0) + 1
                    # Being told to slow down deserves a real pause, and the
                    # service's own figure if it gave one.
                    try:
                        wait = float(r.headers.get("Retry-After", ""))
                    except ValueError:
                        wait = 0.0
                    time.sleep(max(wait, min(15 * (attempt + 1), 60)))
                else:
                    time.sleep(min(2 ** attempt, 8))
                continue
            if r.status_code != 200:
                last_err = RemoteUnavailable(f"{url} -> HTTP {r.status_code}")
                break
            return r
        raise RemoteUnavailable(f"giving up on {url}: {last_err}")


# --- document code helpers ---------------------------------------------------

_DASH = r"[-–—]"

# A procedure reference is year-first: 2013/0072(COD). A plenary document number
# is number-first: B10-0064/2025. Both are \d{4}/\d{4} with a parenthesised
# suffix ("(COD)" vs "(PPE)" for the tabling group), so anchoring on the leading
# year is what keeps document numbers from being mistaken for procedures.
EPREF_WITH_SUFFIX = re.compile(r"\b((?:19|20)\d{2}/\d{4}[A-Z]?)\s*\([A-Z]{3,4}\)")
EPREF_BARE = re.compile(r"\b((?:19|20)\d{2}/\d{4})\b")


def _iter_strings(obj):
    """Yield every string in a nested JSON structure."""
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, str):
            yield cur
        elif isinstance(cur, dict):
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)


def opendata_identifier(code):
    """Map a plenary document code to its EP Open Data identifier.

    A10-0001/2026     -> A-10-2026-0001
    B10-0064/2026     -> B-10-2026-0064
    RC-B10-0064/2026  -> RC-10-2026-0064   (joint motions drop the B)
    """
    m = re.match(rf"^RC{_DASH}B(\d{{1,2}}){_DASH}(\d{{1,4}})/(\d{{4}})$", code)
    if m:
        return f"RC-{m.group(1)}-{m.group(3)}-{m.group(2).zfill(4)}"
    m = re.match(rf"^([AB])(\d{{1,2}}){_DASH}(\d{{1,4}})/(\d{{4}})$", code)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(4)}-{m.group(3).zfill(4)}"
    return None


def fetch_document(http, code):
    """Look up a plenary document code.

    Returns a dict with 'epref' (procedure reference or None) and 'committees'
    (list of committee abbreviations from the document's creators), or NOT_FOUND.
    """
    ident = opendata_identifier(code)
    if ident is None:
        return NOT_FOUND
    r = http.get(f"{OPENDATA_BASE}/documents/{ident}", accept="application/ld+json")
    if r is None:
        return NOT_FOUND
    try:
        payload = r.json()
    except ValueError as exc:
        raise RemoteUnavailable(f"{ident}: response was not JSON ({exc})")

    entries = payload.get("data") or []
    if not entries:
        return NOT_FOUND
    work = entries[0]

    # The procedure reference has no dedicated field. It is embedded in the
    # document's own titles - for reports in `title_dcterms`, for motions for
    # resolution only in the per-language `is_realized_by[].title_alternative`
    # ("... - (2025/2519(RSP)) - Gabriel Mato"). Rather than guess the location,
    # scan every string in the record and take the reference that appears most
    # often: the real one repeats once per language, a stray mention does not.
    counts = {}
    for text in _iter_strings(payload):
        for m in EPREF_WITH_SUFFIX.finditer(text):
            counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    epref = max(counts, key=lambda k: (counts[k], k)) if counts else None

    committees = []
    for creator in work.get("creator") or []:
        m = re.match(r"^org/([A-Z][A-Z0-9_\-]{2,})$", str(creator))
        if m:
            committees.append(m.group(1))

    return {"epref": epref, "committees": committees, "identifier": ident}


# Any plenary document code, e.g. A10-0001/2026, B10-0064/2026, C10-0263/2025.
ANY_DOC_CODE = re.compile(rf"\b((?:RC{_DASH})?[ABC]\d{{1,2}}{_DASH}\d{{1,4}}/\d{{4}})\b")


def _normalise_doc_code(code):
    m = re.match(rf"^(RC{_DASH})?([ABC])(\d{{1,2}}){_DASH}(\d{{1,4}})/(\d{{4}})$", code)
    if not m:
        return code
    prefix = "RC-" if m.group(1) else ""
    return f"{prefix}{m.group(2)}{m.group(3)}-{m.group(4).zfill(4)}/{m.group(5)}"


def fetch_sitting_code_map(http, sitting_date):
    """Map every document code voted at a plenary sitting to its procedure.

    The sitting's vote-results carry a structured label per vote, of the form
    "Proposal for a regulation (COM(2025)0652 - C10-0263/2025 - 2025/0329(COD))",
    which pairs the document code with the procedure reference directly.

    This is the only route left for Council "C" documents: they are not in the
    EP documents API, and EUR-Lex now answers automated search with a bot
    challenge. It doubles as a fallback for any code the documents API misses.
    """
    r = http.get(
        f"{OPENDATA_BASE}/meetings/MTG-PL-{sitting_date}/vote-results",
        accept="application/ld+json",
    )
    if r is None:
        return {}
    try:
        payload = r.json()
    except ValueError as exc:
        raise RemoteUnavailable(f"vote-results {sitting_date}: non-JSON ({exc})")

    mapping = {}
    for item in payload.get("data") or []:
        labels = item.get("structuredLabel") or {}
        texts = list(labels.values()) if isinstance(labels, dict) else [labels]
        codes, eprefs = set(), set()
        for text in texts:
            if not isinstance(text, str):
                continue
            codes.update(_normalise_doc_code(c) for c in ANY_DOC_CODE.findall(text))
            eprefs.update(m.group(1) for m in EPREF_WITH_SUFFIX.finditer(text))
        # One label describes one procedure. Only trust it when it names exactly
        # one, so a label mentioning several files never mislabels a vote.
        if len(eprefs) == 1:
            epref = next(iter(eprefs))
            for code in codes:
                mapping.setdefault(code, epref)
    return mapping


# --- OEIL --------------------------------------------------------------------

def _clean_label(label):
    """'Foreign Affairs\\n (1)' -> 'Foreign Affairs'."""
    if not label:
        return ""
    out = label.replace("\n", " ")
    out = re.sub(r"\s*\(\d+\)\s*", "", out)
    return re.sub(r"\s+", " ", out).strip()


def _match_count(data):
    """How many procedures the search actually matched, from the year facet."""
    total = 0
    for field in data.get("fields", []):
        if field.get("name") == "year":
            for value in field.get("availableValues", []):
                m = re.match(r"^(\d{4})\s*\((\d+)\)$", (value.get("label") or "").strip())
                if m:
                    total += int(m.group(2))
    return total


def _oeil_query(http, epref):
    """Look up one procedure in OEIL.

    `fullText.term` is a text search, not a reference lookup: a procedure
    reference that also appears inside an unrelated file matches both, and the
    facets are then aggregated across them, so the committee handed back can
    belong to the wrong procedure. Constraining the search to the year the
    reference already carries removes that whole class of error.

    Returns (data, match_count) so the caller can refuse to trust a lookup that
    is still ambiguous after filtering.
    """
    ref = EPREF_BARE.search(str(epref))
    if not ref:
        return None, 0
    reference = ref.group(1)
    params = {"fullText.term": reference, "fullText.mode": "EXACT_WORD"}
    year = reference.split("/")[0]
    if re.fullmatch(r"(?:19|20)\d{2}", year):
        params["year"] = year

    r = http.get(OEIL_FACETS, params=params)
    if r is None:
        return None, 0
    try:
        data = r.json()
    except ValueError as exc:
        raise RemoteUnavailable(f"OEIL returned non-JSON for {epref} ({exc})")
    return data, _match_count(data)


def fetch_subject(http, epref):
    """Primary subject lookup: committee responsible, else Commission DG, else
    the first-level policy area. Mirrors the 2025 notebook's `fetch_topic`."""
    data, matches = _oeil_query(http, epref)
    if data is None:
        return NOT_FOUND

    # Still ambiguous after narrowing by year: any committee in the facets may
    # belong to another procedure, so refuse rather than guess. The policy-area
    # fallback below is aggregated and safe to read either way.
    trust_committee = matches <= 1

    committee_fields = data.get("fields", []) if trust_committee else []
    for field in committee_fields:
        if field.get("name") == "committee" and field.get("type") == "field-group":
            for sub in field.get("fields", []):
                if sub.get("name") == "committeeResponsible":
                    for value in sub.get("availableValues", []):
                        label = value.get("label", "")
                        if label and "All committees responsible" not in label:
                            cleaned = _clean_label(label)
                            if cleaned:
                                return cleaned
        if field.get("name") == "commissionDgId":
            for value in field.get("availableValues", []):
                label = value.get("label", "")
                if label and "All Commission DGs" not in label:
                    cleaned = _clean_label(label)
                    if cleaned:
                        return cleaned

    for field in data.get("fields", []):
        if field.get("name") == "subject" and field.get("type") == "tree":
            for value in field.get("availableValues", []):
                label = value.get("label", "")
                if value.get("type") == "option" and label == "All subjects":
                    continue
                cleaned = re.sub(r"^\d+\.?\s*", "", _clean_label(label)).strip()
                if cleaned:
                    return cleaned
    return NOT_FOUND


def fetch_second_level_subject(http, epref):
    """Fallback used when the primary label does not map to a canonical subject:
    the first second-level policy area, e.g. '3.45 Enterprise policy' ->
    'Enterprise policy, inter-company cooperation'."""
    data, _ = _oeil_query(http, epref)
    if data is None:
        return NOT_FOUND
    for field in data.get("fields", []):
        if field.get("name") == "subject" and field.get("type") == "tree":
            for value in field.get("availableValues", []):
                if value.get("type") != "group":
                    continue
                for child in value.get("children") or []:
                    if child.get("type") == "group":
                        label = child.get("label", "")
                        if label:
                            cleaned = re.sub(r"^\d+\.\d+\s+", "", label).strip()
                            return cleaned or label
    return NOT_FOUND


def fetch_committee_name(http, abbr):
    """Official English name of an EP committee, e.g. ENVI ->
    'Environment, Climate and Food Safety'."""
    r = http.get(f"{OPENDATA_BASE}/corporate-bodies/{abbr}", accept="application/ld+json")
    if r is None:
        return NOT_FOUND
    try:
        entries = r.json().get("data") or []
    except ValueError as exc:
        raise RemoteUnavailable(f"corporate-bodies/{abbr}: non-JSON ({exc})")
    if not entries:
        return NOT_FOUND
    alt = entries[0].get("altLabel") or {}
    name = alt.get("en")
    return name.strip() if isinstance(name, str) and name.strip() else NOT_FOUND
