"""Last-resort subject classification for votes the deterministic route cannot label.

The chain in `subjects.py` is evidence-based: vote title -> document code ->
procedure reference -> the committee OEIL says is responsible. When every hop
succeeds the label is a fact about the procedure, not an opinion, and that is
why it is trusted without review.

Some votes have no such chain to follow. Three kinds, all of them real:

  * a joint motion whose procedure the APIs simply do not carry;
  * a procedure whose OEIL policy area maps to nothing in our vocabulary
    ("Community policies", "Secretariat-General");
  * a vote with no document reference at all - an agenda change, a budget
    line number, an old plenary text identified only by its French title.

Everything above lands in "Others", which is not a subject: it is the absence
of one. This module asks a model to read whatever evidence does exist and pick
a subject, so that the residual category disappears.

The important part is that this is kept *separate and visible*, never mixed
into the deterministic labels:

  * it only ever runs on votes already labelled "Others";
  * every label it produces is recorded with `via = "llm:<model>"`, so any
    later question about a number can be traced to how it was reached;
  * `validate` measures the classifier against votes whose deterministic label
    is strongest, with the answer hidden, and reports the agreement rate. A
    classifier that cannot reproduce known-good labels has no business
    inventing unknown ones.

Nothing here writes to disk until `apply` is called explicitly.
"""

import concurrent.futures as cf
import datetime as _dt
import json
import os
import re
import sys
import time

from . import config
from .jsonstream import JsonArrayWriter, iter_json_array
from .report import atomic_write_json
from .subjects import JsonCache, session_reference

# Defaults. Both are overridable from the CLI, because which model is good
# enough here is a question the validation harness answers with a number rather
# than something to assert: this is bounded classification against a fixed
# 22-item enum on ~1,700-token inputs, which is the shape of task a smaller
# model often handles at a fraction of the latency.
MODEL = "claude-sonnet-5"
# "low", on evidence rather than taste. Measured against the same 200 held-out
# cases, low effort scored 61.0% to medium's 60.1%, answered all 200 where
# medium truncated 2 at max_tokens, ran in 192s against 575s, and was better
# calibrated where it matters: 89% correct on the cases it called "high"
# confidence against medium's 80%. Deeper deliberation does not help a bounded
# choice between 23 fixed strings; it just spends tokens thinking.
EFFORT = "low"

# Bumped whenever the prompt or the vocabulary changes, so a cached answer is
# never silently reused under a different question.
PROMPT_VERSION = "2026-08-24.2"

# Defined in config, because build_votes checks every written subject against
# CANONICAL_SUBJECTS and would reject a name that only this module knew about.
PROCEDURE_SUBJECT = config.PROCEDURE_SUBJECT

# Hand-verified answers for cases the model gets wrong. Kept separate from the
# model's own cache so that re-running the classifier never overwrites human
# work, and so the site can tell the two apart.
CASE_OVERRIDES_PATH = config.CACHE_DIR / "manual_case_subjects.json"
CASES_PATH = config.CACHE_DIR / "llm_cases.json"
LABELS_PATH = config.CACHE_DIR / "llm_subject_by_case.json"
VALIDATION_PATH = config.REPORT_DIR / "llm_classifier_validation.json"

# One case per request, several requests at a time.
#
# Batching many cases into one request looks like the obvious economy and was
# the original design. It went wrong three separate ways: the model answered
# about two of fifteen cases and silently closed the array; forcing
# completeness by making each case a required property hit "Schema is too
# complex for compilation" past about a dozen, because the API compiles that
# into a grammar accepting the properties in any order; and the resulting
# unusual schema drew a 500. One case per request makes the schema trivial, a
# partial answer impossible, and every answer independently cacheable, so an
# interrupted run resumes exactly where it stopped. The requests are small and
# independent, so the throughput comes back from concurrency instead.
WORKERS = 8


def vocabulary():
    """The subjects the model may choose from.

    "Others" is deliberately absent: it is the thing this step exists to
    remove, and an enum that still offers it would let the model decline every
    hard case and leave the residual exactly where it was. The model must
    commit to a subject and say how confident it is instead.

    Sorted, so the prompt is byte-stable between runs and the cached prefix
    actually hits.
    """
    canonical = set(config.SUBJECT_MAPPING.values()) - {config.FALLBACK_SUBJECT}
    return sorted(canonical) + [PROCEDURE_SUBJECT]


# --- grouping ---------------------------------------------------------------
# A vote on a paragraph, an amendment and the final text of one resolution are
# three votes about one subject. Classifying the resolution once and applying
# it to all three costs a fifteenth as much and gives the model the whole
# document rather than a fragment of it.

_SUFFIX = re.compile(
    r"\s*[-–—]\s*(?:"
    r"am(?:\.|endement|endment)?\s*\d+.*"
    r"|par(?:\.|agraph(?:e)?)?\s*\d+.*"
    r"|§\s*\d+.*"
    r"|consid[ée]rant\s.*"
    r"|recital\s.*"
    r"|r[ée]solution(?:\s*\(.*\))?\s*$"
    r"|vote\s+unique.*"
    r"|ensemble\s+du\s+texte.*"
    r"|as\s+a\s+whole.*"
    r")$",
    re.I,
)


def base_title(title):
    """Strip the "- am. 4", "- par. 6/1", "- résolution" tail off a vote title."""
    text = (title or "").strip()
    for _ in range(4):
        shorter = _SUFFIX.sub("", text).strip(" -–—")
        if shorter == text or not shorter:
            break
        text = shorter
    return text


def case_key(session):
    """The unit of classification: the procedure if we know it, else the text."""
    kind, ref = session_reference(session)
    if kind:
        return f"{kind}:{ref}"
    title = base_title(session.get("title"))
    return f"title:{title}" if title else f"voteid:{session.get('voteid')}"


# --- evidence ---------------------------------------------------------------
def collect_cases(mandates=None, report=None):
    """Group every "Others" vote into cases and attach the evidence we hold.

    Returns {key: case}. Reads `data/final`, so `votes` must have run first.
    """
    mandates = mandates or config.MANDATE_ORDER
    labels = JsonCache(config.CACHE_DIR / "epref_to_label.json")
    labels2 = JsonCache(config.CACHE_DIR / "epref_to_second_level.json")

    cases = {}
    for mandate in mandates:
        path = config.FINAL_DIR / f"ep_votes_{mandate}.json"
        if not path.exists():
            raise FileNotFoundError(f"{path} is missing - run `votes` first")
        for session in iter_json_array(str(path)):
            if session.get("subject") != config.FALLBACK_SUBJECT:
                continue
            key = case_key(session)
            case = cases.setdefault(
                key,
                {
                    "key": key,
                    "titles": [],
                    "voteids": [],
                    "mandates": [],
                    "dates": [],
                    "oeil_label": None,
                },
            )
            title = base_title(session.get("title")) or (session.get("title") or "")
            if title and title not in case["titles"]:
                case["titles"].append(title)
            # ids come out of the dump as a mix of int and str; one type
            # throughout, or the id map below silently misses half of them.
            case["voteids"].append(str(session.get("voteid")))
            if mandate not in case["mandates"]:
                case["mandates"].append(mandate)
            ts = (session.get("ts") or "").split("T")[0]
            if ts:
                case["dates"].append(ts)

    # The OEIL policy area that failed to map is itself evidence: knowing a
    # procedure was filed under "Community policies" is weak, but knowing it
    # was filed under "Secretariat-General" says something real.
    for key, case in cases.items():
        if key.startswith("epref:"):
            epref = key.split(":", 1)[1]
            got = labels.get(epref)
            if got is KeyError or not got:
                got = labels2.get(epref)
            case["oeil_label"] = None if got is KeyError else got
        case["votes"] = len(case["voteids"])
        case["dates"] = [min(case["dates"]), max(case["dates"])] if case["dates"] else []
        # Keep the file reviewable; the ids are recoverable from data/final.
        case["voteids"] = sorted(case["voteids"])  # already strings

    if report:
        report.fact("cases to classify", len(cases))
        report.fact("votes covered", sum(c["votes"] for c in cases.values()))
    return cases


# --- the model ---------------------------------------------------------------
SYSTEM = """You classify European Parliament roll-call votes by policy area.

You will be given cases. A case is one parliamentary text (a report, a motion \
for a resolution, a budget item, a procedural motion) together with every vote \
title the plenary recorded for it. Vote titles are terse, often abbreviated, \
and appear in English, French or German - sometimes several languages in one \
string. Assign each case exactly one subject from the fixed list.

Conventions that decide many cases:

- A code like "A9-0280/2019", "B6-0161/2006" or "RC6-0377/2008" is the plenary \
document number, not content. "RC" means a joint motion for a resolution that \
several political groups tabled together. The words after the code carry the \
subject.
- A bare numeric string like "07 02 01" or "05 04 01" is a line in the Union \
budget. Those are Budgets.
- "Modification de l'ordre du jour", "Wednesday's agenda - Request by the X \
Group", "Calendrier des périodes de session", "Élection de la Commission", a \
request for urgent procedure, or a vote on the Rules of Procedure is the \
House's own business, not a policy area. Those are "Parliamentary Procedure".
- Resolutions on the situation in a named non-EU country or region, on human \
rights abroad, on relations with a third country, or on EU development aid are \
Foreign Affairs.
- Discharge of an institution's accounts is Budgetary Control; adopting or \
amending the budget itself is Budgets.

Judge the case on its dominant substance. Where a case genuinely spans two \
areas, pick the one the responsible committee would have been. Do not invent \
a subject outside the list, and do not leave a case unclassified: choose the \
best available fit and mark your confidence.

Set confidence honestly:
- "high": the evidence names the subject or is unambiguous.
- "medium": the subject is a sound inference from partial evidence.
- "low": you are guessing from very little - a bare number, an untranslatable \
fragment, a title with no topical content.

Give the reason first, before choosing: quote or name the specific evidence in \
the case that decides it - a phrase from a title, the OEIL policy area, the \
shape of the document code. One sentence. If the evidence is too thin to name, \
say so plainly and mark the confidence "low"; that is a useful answer, an \
empty or filler reason is not."""


def _schema(subjects):
    """The answer for one case. Small enough to always compile.

    `reason` is deliberately first. Structured output is generated in schema
    order, so a reason placed after the subject is written once the answer is
    already committed and becomes a formality - the first run of this produced
    "placeholder", "," and empty strings. Generated first, it has to carry the
    evidence the subject is then chosen from, which is what makes it worth
    anything as an audit trail.
    """
    return {
        "type": "object",
        "properties": {
            "reason": {"type": "string"},
            "subject": {"type": "string", "enum": subjects},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        },
        "required": ["reason", "subject", "confidence"],
        "additionalProperties": False,
    }


def render_case(case):
    """One case as the model sees it. Deliberately plain: every line is
    evidence we actually hold, with nothing inferred or padded."""
    lines = [f"key: {case['key']}"]
    if case.get("oeil_label"):
        lines.append(f"OEIL policy area (did not map to our list): {case['oeil_label']}")
    if case.get("dates"):
        span = case["dates"][0] if case["dates"][0] == case["dates"][-1] else \
            f"{case['dates'][0]} to {case['dates'][-1]}"
        n = case["votes"]
        lines.append(f"voted: {span} ({n} roll-call vote{'s' if n != 1 else ''})")
    # Longest first: the plenary records the full multilingual title on the
    # headline vote and a bare document code on the amendments, so length is a
    # good proxy for how much subject matter a title actually carries. With a
    # cap on how many we send, the informative ones must be the ones that fit.
    for title in sorted(case["titles"], key=len, reverse=True)[:6]:
        lines.append(f"title: {title}")
    return "\n".join(lines)


def _client():
    try:
        import anthropic
    except ImportError:
        raise RuntimeError(
            "the anthropic SDK is not installed. It is the only third-party "
            "dependency in the pipeline and only this step needs it:\n"
            "    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt\n"
            "then run this step as `.venv/bin/python -m pipeline.run classify`"
        )
    import pathlib
    profile = pathlib.Path.home() / ".config" / "anthropic"
    if not (os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
            or profile.exists()):
        raise RuntimeError(
            "no Anthropic credentials found. Either export a key:\n"
            "    export ANTHROPIC_API_KEY=sk-ant-...\n"
            "or log in once with the Anthropic CLI, which stores a profile the "
            "SDK picks up on its own:\n"
            "    brew install anthropics/tap/ant && ant auth login"
        )
    # Two bounds, both deliberate.
    #
    # timeout: the SDK default is 10 minutes, which is the wrong order of
    # magnitude here - a batch of 15 short classifications takes a couple of
    # minutes, so a request still open after five has stalled rather than
    # being slow. Left at the default, one stalled request sat silently for
    # ten minutes before the first retry even began.
    #
    # max_retries: transient 429/5xx are worth riding out, but every retry
    # multiplies the timeout above, so the worst case per batch has to stay
    # somewhere a person is willing to wait.
    return anthropic.Anthropic(max_retries=3, timeout=300.0)


# Adaptive thinking exists only on 4.6-and-later models. Asking for it on
# Haiku 4.5 fails every request with "adaptive thinking is not supported on
# this model" - which is a config error, not a result, and cost a full 200-case
# validation run to discover. Older models take an explicit token budget
# instead, and do not accept the effort knob at all.
_ADAPTIVE = ("opus-5", "sonnet-5", "fable-5", "opus-4-8", "opus-4-7",
             "opus-4-6", "sonnet-4-6")


def _reasoning(model, effort, schema):
    """The thinking/output settings this particular model will accept."""
    if any(tag in model for tag in _ADAPTIVE):
        return ({"type": "adaptive"},
                {"effort": effort,
                 "format": {"type": "json_schema", "schema": schema}})
    return ({"type": "enabled", "budget_tokens": 3000},
            {"format": {"type": "json_schema", "schema": schema}})


def _ask_one(client, case, subjects, schema, model, effort, retry_effort="low"):
    """Classify a single case. Returns the verdict dict, or raises."""
    user = (
        "Classify this case.\n\n"
        "Allowed subjects:\n- " + "\n- ".join(subjects) + "\n\n"
        "Case:\n\n" + render_case(case)
    )
    # Streamed because thinking counts against max_tokens and a truncated
    # answer would arrive as unparseable JSON rather than an obvious failure.
    thinking, output_config = _reasoning(model, effort, schema)
    with client.messages.stream(
        model=model,
        max_tokens=8000,
        system=[{"type": "text", "text": SYSTEM,
                 "cache_control": {"type": "ephemeral"}}],
        thinking=thinking,
        output_config=output_config,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        response = stream.get_final_message()

    key = case["key"]
    if response.stop_reason == "refusal":
        raise RuntimeError(f"model declined to classify {key}")
    if response.stop_reason == "max_tokens":
        # The model spent the whole budget thinking and never emitted the
        # answer. On a 23-way choice that is over-deliberation, not a hard
        # case, and it happened to ~1% of a 200-case run. Retrying once at
        # "low" effort shrinks the thinking rather than the answer, which is
        # the right thing to cut. A second truncation is a real failure.
        if retry_effort:
            return _ask_one(client, case, subjects, schema, model,
                            retry_effort, retry_effort=None)
        raise RuntimeError(f"answer for {key} was truncated at max_tokens")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise RuntimeError(
            f"empty response for {key} (stop_reason={response.stop_reason})")
    try:
        answer = json.loads(text)
    except ValueError as exc:
        raise RuntimeError(f"unparseable answer for {key}: {exc}")

    # Never trust the enum to have been enforced. A live 200-case run came
    # back with "Civil Liberties, Justice And Home Affairs" - the canonical
    # name with one letter recased - which is not in the enum it was given.
    # Written through unchecked that becomes a 24th subject on the site, or a
    # late failure in build_votes' canonical check, from a step whose whole
    # purpose is to be auditable. Fold to the canonical spelling where the
    # name is merely recased, and fail the case outright where it is not.
    canonical = {subject.casefold(): subject for subject in subjects}
    got = str(answer.get("subject", ""))
    resolved = canonical.get(got.casefold())
    if resolved is None:
        raise RuntimeError(
            f"{key}: model returned {got!r}, which is not one of the "
            f"{len(subjects)} allowed subjects")
    answer["subject"] = resolved
    return answer


def classify_cases(cases, limit=None, report=None, workers=WORKERS,
                   store_path=None, model=None, effort=None):
    """Label every case not already in the cache. Returns {key: answer}.

    The cache is keyed by case key and records the model and prompt version
    alongside the answer, so changing either re-asks rather than silently
    reusing an answer to a different question. It is written as answers arrive,
    so an interrupted run loses at most the requests still in flight.
    """
    model = model or MODEL
    effort = effort or EFFORT
    store = JsonCache(store_path or LABELS_PATH)
    subjects = vocabulary()
    schema = _schema(subjects)

    todo = []
    for key, case in cases.items():
        got = store.get(key)
        if (got is not KeyError and got
                and got.get("model") == model
                and got.get("prompt_version") == PROMPT_VERSION):
            continue
        todo.append(case)
    # Biggest first, so a run cut short has still covered the cases that
    # account for the most votes.
    todo.sort(key=lambda c: (-c["votes"], c["key"]))
    cached = len(cases) - len(todo)
    if limit:
        todo = todo[:limit]

    if report:
        report.fact("model", model)
        report.fact("effort", effort)
        report.fact("cases already cached", cached)
        report.fact("cases to send", len(todo))
    if not todo:
        return {k: store.get(k) for k in cases if store.get(k) is not KeyError}

    client = _client()
    stamp = _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")
    t0 = time.monotonic()
    done = failures = 0

    # Results are collected in this thread and written here; JsonCache is not
    # thread-safe and does not need to be.
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(_ask_one, client, case, subjects, schema, model, effort): case
            for case in todo
        }
        for future in cf.as_completed(futures):
            case = futures[future]
            try:
                answer = future.result()
            except Exception as exc:
                # One bad case must not lose the run. It stays uncached, so
                # re-running asks about it again and nothing is written for it
                # in the meantime.
                failures += 1
                print(f"  ! {case['key']}: {exc}", file=sys.stderr)
                continue
            store.set(case["key"], {
                "subject": answer["subject"],
                "confidence": answer["confidence"],
                "reason": answer["reason"],
                "model": model,
                "prompt_version": PROMPT_VERSION,
                "classified_at": stamp,
            })
            done += 1
            # Flushed, and often enough that even a short run shows movement:
            # a silent process is indistinguishable from a hung one, and this
            # step has been mistaken for hung more than once.
            if done % 10 == 0 or done == len(todo):
                store.save()
                rate = done / max(time.monotonic() - t0, 1e-9)
                left = (len(todo) - done) / rate if rate else 0
                print(f"  classified {done}/{len(todo)} "
                      f"(~{left / 60:.0f} min left)", file=sys.stderr, flush=True)
    store.save()

    if report:
        report.fact("cases classified", done)
        # Not fatal: this reports a measurement, and throwing away 198 good
        # answers because 2 failed tells you less, not more. It still fails
        # loudly, and the failed cases stay uncached so a re-run retries them.
        report.check("every case sent got an answer", failures == 0,
                     f"{failures} case(s) failed and were left unlabelled",
                     fatal=False)
    elif failures:
        print(f"  {failures} case(s) failed and were left unlabelled",
              file=sys.stderr)

    return {k: store.get(k) for k in cases if store.get(k) is not KeyError}


# --- how much a case actually gives the model to work with ------------------
# The residual and the held-out set do not look alike: the residual is mostly
# multi-vote resolutions carrying a full trilingual title, while the strongest
# deterministic labels sit on single legislative votes whose title is a
# document code and a rapporteur's name. A single overall agreement rate over
# the held-out set would therefore understate performance on the population it
# is actually going to be used on. Both are reported per bucket instead.

_CODE = re.compile(r"\b(?:RC[-–—]?)?[ABC]?\d{1,2}[-–—]\d{1,4}/\d{4}\b")
_BOILER = {
    "resolution", "résolution", "legislative", "législative", "motion", "vote",
    "proposition", "proposal", "amendment", "amendement", "texte", "text",
    "ensemble", "whole", "unique", "single", "approbation", "approval",
    "rapport", "report", "draft", "projet", "recommendation", "recommandation",
    "provisional", "provisoire", "agreement", "accord", "commission",
    "council", "conseil", "parlement", "parliament",
}


def evidence_bucket(case):
    """"topical" if a title says what the vote is about; "bare" if it only
    identifies the document. Deliberately crude - it is a reporting stratum,
    never an input to a label."""
    best = max(case.get("titles") or [""], key=len)
    stripped = _CODE.sub(" ", best)
    words = [w.lower().strip(".,;:()[]-–—§") for w in re.split(r"[\s/]+", stripped)]
    content = [w for w in words
               if len(w) > 3 and not w.isdigit() and w.lower() not in _BOILER
               and any(ch.isalpha() for ch in w)]
    return "topical" if len(set(content)) >= 3 else "bare"


# --- validation --------------------------------------------------------------
def _held_out_sample(size, seed=20260824):
    """Cases whose deterministic label is strongest, with the answer removed.

    "Strongest" means the full evidence chain ran: the vote carried a document
    code or procedure reference, that reference resolved to a procedure, and
    OEIL's own policy area for the procedure matched our vocabulary directly -
    no second-level fallback, no committee guess. Those are the labels we are
    willing to publish unreviewed, so they are the right thing to be measured
    against.

    Two details make the comparison fair rather than flattering or unfair:

      * held-out votes are grouped into cases by the same `case_key` and
        rendered by the same `render_case` as the real residual, so the model
        sees the same shape and quality of evidence in both. Scoring it on
        single stripped amendment titles would understate it; letting it see
        the whole procedure record would overstate it.
      * the OEIL policy area is withheld, because that label *is* the answer.
    """
    import random

    code_epref = JsonCache(config.CACHE_DIR / "code_to_epref.json")
    labels = JsonCache(config.CACHE_DIR / "epref_to_label.json")

    strong = {
        ref: config.canonical_subject(label)
        for ref, label in labels.data.items()
        if label and config.canonical_subject(label) != config.FALLBACK_SUBJECT
    }

    def epref_of(kind, ref):
        if kind == "epref":
            return ref
        if kind == "code":
            got = code_epref.get(ref)
            if got is not KeyError and got:
                return re.search(r"((?:19|20)\d{2}/\d{4})", str(got)).group(1) \
                    if re.search(r"((?:19|20)\d{2}/\d{4})", str(got)) else None
        return None

    cases = {}
    for mandate in config.MANDATE_ORDER:
        path = config.FINAL_DIR / f"ep_votes_{mandate}.json"
        if not path.exists():
            continue
        for session in iter_json_array(str(path)):
            subject = session.get("subject")
            if not subject or subject == config.FALLBACK_SUBJECT:
                continue
            kind, ref = session_reference(session)
            epref = epref_of(kind, ref)
            if not epref or epref not in strong:
                continue
            # The published label has to agree with what the strong evidence
            # says, or this vote is not an example of the chain working.
            if strong[epref] != subject:
                continue
            key = case_key(session)
            case = cases.setdefault(key, {
                "key": key, "titles": [], "votes": 0, "dates": [],
                "oeil_label": None, "truth": subject, "mandate": mandate,
            })
            if case["truth"] != subject:
                case["truth"] = None          # ambiguous; dropped below
            title = base_title(session.get("title")) or (session.get("title") or "")
            if title and title not in case["titles"]:
                case["titles"].append(title)
            case["votes"] += 1
            ts = (session.get("ts") or "").split("T")[0]
            if ts:
                case["dates"].append(ts)

    pool = []
    for case in cases.values():
        if not case["truth"]:
            continue
        case["dates"] = ([min(case["dates"]), max(case["dates"])]
                         if case["dates"] else [])
        pool.append(case)
    random.Random(seed).shuffle(pool)
    return pool[:size]


def validate(size=200, report=None, model=None, effort=None):
    """Score the classifier on held-out known-good labels and write the detail."""
    sample = _held_out_sample(size)
    if not sample:
        raise RuntimeError("no held-out votes found - has `votes` been run?")

    by_key = {c["key"]: c for c in sample}
    truth = {c["key"]: c.pop("truth") for c in sample}
    mandate = {c["key"]: c.pop("mandate") for c in sample}

    # Scored in a scratch store so a validation run never contaminates the
    # labels that get published - and one store per (model, effort), because
    # comparing two configurations is the whole point of running this twice.
    # A single shared file let the second run overwrite the first's answers,
    # which silently turned a comparison into a re-measurement of whichever
    # ran last.
    slug = f"{(model or MODEL).replace('/', '-')}_{effort or EFFORT}"
    answers = classify_cases(
        {c["key"]: c for c in sample},
        report=report,
        store_path=config.CACHE_DIR / f"llm_validation_cache_{slug}.json",
        model=model, effort=effort,
    )

    # A score is only a score if most of the sample actually answered. A run
    # where every request failed on a bad config produced "agreement: 0.0%"
    # and wrote it to a report, which reads exactly like "this model is
    # useless" instead of "this never ran". Refuse to publish a number that
    # thin - the failures are already printed above.
    answered = sum(1 for k in truth if (answers.get(k) or {}).get("subject"))
    coverage = answered / max(len(truth), 1)
    if coverage < 0.9:
        raise RuntimeError(
            f"only {answered}/{len(truth)} cases ({coverage:.0%}) came back with "
            f"an answer - too few to score. This is a broken run, not a bad "
            f"model; fix the errors above and re-run. No score was written.")

    rows, hits = [], 0
    for key, expected in truth.items():
        answer = answers.get(key) or {}
        got = answer.get("subject")
        ok = got == expected
        hits += ok
        rows.append({
            "key": key, "mandate": mandate[key], "expected": expected,
            "got": got, "agree": ok,
            "confidence": answer.get("confidence"),
            "reason": answer.get("reason"),
            "evidence": evidence_bucket(by_key[key]),
            "title": sample_title(sample, key),
        })

    residual = collect_cases()
    residual_mix = {}
    for case in residual.values():
        b = evidence_bucket(case)
        entry = residual_mix.setdefault(b, {"cases": 0, "votes": 0})
        entry["cases"] += 1
        entry["votes"] += case["votes"]

    n = len(rows)
    rate = hits / n if n else 0.0
    # Wilson 95% interval - honest about a sample this size in a way that
    # hits/n alone is not.
    import math
    z = 1.96
    denom = 1 + z * z / n
    centre = (rate + z * z / (2 * n)) / denom
    half = z * math.sqrt(rate * (1 - rate) / n + z * z / (4 * n * n)) / denom

    def tally(field):
        out = {}
        for row in rows:
            b = out.setdefault(row[field] or "unknown", {"n": 0, "agree": 0})
            b["n"] += 1
            b["agree"] += row["agree"]
        return {k: {**v, "rate": round(v["agree"] / v["n"], 4)}
                for k, v in sorted(out.items())}

    by_conf = tally("confidence")
    by_evidence = tally("evidence")
    by_mandate = tally("mandate")

    result = {
        "model": model or MODEL,
        "effort": effort or EFFORT,
        "prompt_version": PROMPT_VERSION,
        "sample_size": n,
        "agreement": round(rate, 4),
        "agreement_ci95": [round(max(0.0, centre - half), 4),
                           round(min(1.0, centre + half), 4)],
        "by_confidence": by_conf,
        "by_evidence": by_evidence,
        "by_mandate": by_mandate,
        # What the residual actually looks like, so the reader can weight the
        # buckets above rather than reading the headline rate as the answer.
        "residual_evidence_mix": residual_mix,
        "disagreements": [r for r in rows if not r["agree"]],
    }
    config.REPORT_DIR.mkdir(parents=True, exist_ok=True)
    # Per model, so validating a second model never overwrites the first's
    # score - comparing them is the whole point of running this twice.
    atomic_write_json(VALIDATION_PATH, result, indent=1)
    atomic_write_json(config.REPORT_DIR / f"llm_classifier_validation_{slug}.json",
                      result, indent=1)
    if report:
        report.fact("validation sample", n)
        report.fact("agreement with known-good labels", f"{rate:.1%}")
        report.fact("95% CI", f"{result['agreement_ci95'][0]:.1%}"
                              f"-{result['agreement_ci95'][1]:.1%}")
        for bucket, v in by_evidence.items():
            report.fact(f"agreement on {bucket}-title cases",
                        f"{v['rate']:.1%} (n={v['n']})")
    return result


def sample_title(sample, key):
    for case in sample:
        if case["key"] == key:
            return (case["titles"] or [""])[0]
    return ""


def apply_overrides(answers, report=None):
    """Overlay hand-verified subjects onto the model's answers.

    The classifier's errors are not spread evenly: they concentrate on a few
    large cases whose titles carry no topic, and those same cases decide
    disproportionately many votes. Correcting a dozen of them by hand moves the
    vote-weighted accuracy far more than any amount of prompt tuning, so this
    is the intended finishing step rather than a workaround.

    Entries are marked `via = "hand:verified"` so a hand-checked label is never
    reported as something a model produced.
    """
    if not CASE_OVERRIDES_PATH.exists():
        return answers
    raw = json.loads(CASE_OVERRIDES_PATH.read_text())
    applied = unknown = 0
    for key, entry in raw.items():
        if key.startswith("_"):
            continue
        subject = entry.get("subject")
        if subject not in config.CANONICAL_SUBJECTS:
            raise RuntimeError(
                f"{CASE_OVERRIDES_PATH.name}: {key} names subject {subject!r}, "
                f"which is not canonical")
        if key not in answers:
            # Not fatal, but worth saying: a stale key means the override is
            # silently doing nothing, which is the failure mode this file
            # exists to prevent.
            unknown += 1
            print(f"  ! override for unknown case {key} - ignored",
                  file=sys.stderr)
            continue
        answers[key] = {**answers[key], "subject": subject,
                        "confidence": "high", "via": "hand:verified",
                        "reason": entry.get("source", "hand-verified")}
        applied += 1
    if report:
        report.fact("hand-verified overrides applied", applied)
        report.check("every override matched a case", unknown == 0,
                     f"{unknown} override(s) named a case that does not exist",
                     fatal=False)
    return answers


# --- applying ----------------------------------------------------------------
def apply_labels(cases, answers, mandates=None, report=None, dry_run=True):
    """Write the model's subjects onto the votes in `data/final`.

    With `dry_run` (the default) nothing is written and the summary of what
    would change is returned, so the shift can be reviewed before it becomes
    a published number.
    """
    mandates = mandates or config.MANDATE_ORDER
    by_voteid = JsonCache(config.CACHE_DIR / "subject_by_voteid.json")

    per_subject, per_confidence, changed = {}, {}, 0
    key_of = {}
    for key, case in cases.items():
        for vid in case["voteids"]:
            key_of[vid] = key   # vid is a string

    for mandate in mandates:
        path = config.FINAL_DIR / f"ep_votes_{mandate}.json"
        if not path.exists():
            continue
        touched = 0
        # Streamed through a temp file rather than read into a list: mandate 9
        # alone is 318 MB on disk and several times that as Python objects.
        tmp = path.with_suffix(".json.tmp")
        writer = JsonArrayWriter(str(tmp)).__enter__() if not dry_run else None
        try:
            for session in iter_json_array(str(path)):
                vid = session.get("voteid")
                key = key_of.get(str(vid))
                # The guard that makes this step safe: a vote that already has
                # a subject from the evidence chain can never be overwritten
                # here, whatever the model said about its case.
                if key and session.get("subject") == config.FALLBACK_SUBJECT:
                    answer = answers.get(key)
                    if answer and answer.get("subject"):
                        subject = answer["subject"]
                        per_subject[subject] = per_subject.get(subject, 0) + 1
                        conf = answer.get("confidence") or "unknown"
                        per_confidence[conf] = per_confidence.get(conf, 0) + 1
                        touched += 1
                        if not dry_run:
                            session["subject"] = subject
                            by_voteid.set(vid, {
                                "subject": subject,
                                # the model that actually answered, not the
                                # current default - provenance has to survive
                                # changing the default later
                                "via": answer.get("via")
                                       or f"llm:{answer.get('model', MODEL)}:{conf}",
                            })
                if writer:
                    writer.write(session)
        except BaseException:
            if writer:
                writer.__exit__(None, None, None)
                tmp.unlink(missing_ok=True)
            raise
        if writer:
            writer.__exit__(None, None, None)
            os.replace(tmp, path)
        changed += touched
        if report:
            report.fact(f"mandate {mandate}: votes relabelled", touched)

    if not dry_run:
        by_voteid.save()

    summary = {
        "dry_run": dry_run,
        "votes_relabelled": changed,
        "by_subject": dict(sorted(per_subject.items(), key=lambda kv: -kv[1])),
        "by_confidence": per_confidence,
    }
    if report:
        report.fact("votes relabelled", changed)
    return summary
