"""Static configuration for the European Parliament network pipeline.

Everything that decides *what the numbers mean* lives here: mandate date ranges,
the canonical subject vocabulary, and the political-group id normalisation.
Keeping them in one auditable place is deliberate -- these are the knobs that
silently change published conclusions if they drift.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# --- filesystem layout -------------------------------------------------------
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"           # decompressed Parltrack dumps
FINAL_DIR = DATA_DIR / "final"       # votes with a resolved subject
CACHE_DIR = DATA_DIR / "cache"       # remote lookups, kept between runs
REPORT_DIR = DATA_DIR / "reports"    # one JSON + Markdown report per run

WEB_ROOT = REPO_ROOT / "2025" / "web"
WEB_DATA_DIR = WEB_ROOT / "public" / "data"

# The 2025 outputs, used to seed caches and as the regression baseline.
BASELINE_ENRICHED_DIR = REPO_ROOT / "2025" / "data" / "final_enriched"
BASELINE_CACHE_DIR = REPO_ROOT / "2025" / "data"

RAW_VOTES = RAW_DIR / "ep_votes.json"
RAW_MEPS = RAW_DIR / "ep_meps.json"

# --- mandates ----------------------------------------------------------------
# Parliamentary terms, inclusive of both endpoints.
MANDATES = {
    "6": ("2004-07-01", "2009-06-30"),
    "7": ("2009-07-01", "2014-06-30"),
    "8": ("2014-07-01", "2019-06-30"),
    "9": ("2019-07-01", "2024-06-30"),
    "10": ("2024-07-01", "2029-06-30"),
}
MANDATE_ORDER = ["6", "7", "8", "9", "10"]
CURRENT_MANDATE = "10"

# --- votes -------------------------------------------------------------------
# The only vote-type keys the Parltrack dump uses. Anything else is a hard error
# rather than a silently mis-weighted vote.
VOTE_WEIGHTS = {"+": 1, "-": -1, "0": 0}

# An MEP must have cast more than this share of a network's votes to appear in
# it at all. Abstentions count towards the share: they are excluded from the
# agreement measure (you cannot agree by abstaining) but they are still
# attendance, and testing turnout on the abstention-stripped count dropped MEPs
# who voted in 60-78% of divisions. Turnout and agreement are separate
# questions - see `network.edges_from_matrix`.
PARTICIPATION_THRESHOLD = 0.5

# Warning line, not a filter. An MEP admitted on turnout is still *positioned*
# using yes/no votes alone, so a habitual abstainer can clear the threshold on a
# thin slice of usable votes - Paul van BUITENEN attended 70% of term 6 but
# abstained on 93% of what he cast, leaving 286 votes to place him with. Below
# this share the run says so rather than publishing a coordinate that looks as
# confident as everyone else's.
MIN_AGREEMENT_BASIS_SHARE = 0.20

# --- political groups --------------------------------------------------------
# Parltrack writes some groups as full names and uses "NA" for non-attached.
GROUP_ID_MAP = {
    "NA": "NonAttached",
    "Patriots for Europe Group": "PfE",
    "Europe of Sovereign Nations Group": "ESN",
}

# --- subjects ----------------------------------------------------------------
FALLBACK_SUBJECT = "Others"

# Raw committee / policy-area labels (from OEIL and the EP Open Data API) mapped
# onto the canonical vocabulary shown on the site. Transcribed verbatim from
# 2025/main.ipynb so the 2026 run keeps the 2025 meaning.
SUBJECT_MAPPING = {
    'Environment, Climate and Food Safety': 'Environment, Climate and Food Safety',
    'Foreign Affairs': 'Foreign Affairs',
    'Budgetary Control': 'Budgetary Control',
    'Budgets': 'Budgets',
    'Economic and Monetary Affairs': 'Economic and Monetary Affairs',
    'Employment and Social Affairs': 'Employment and Social Affairs',
    'Civil Liberties, Justice and Home Affairs': 'Civil Liberties, Justice and Home Affairs',
    'Agriculture and Rural Development': 'Agriculture and Rural Development',
    'Industry, Research and Energy': 'Industry, Research and Energy',
    'Transport and Tourism': 'Transport and Tourism',
    'Constitutional Affairs': 'Constitutional Affairs',
    'International Trade': 'International Trade',
    'Women’s Rights and Gender Equality': 'Women’s Rights and Gender Equality',
    'Internal Market and Consumer Protection': 'Internal Market and Consumer Protection',
    'Fisheries': 'Fisheries',
    'Culture and Education': 'Culture and Education',
    'Regional Development': 'Regional Development',
    'Petitions': 'Petitions',
    'Public Health': 'Public Health',
    'External relations of the Union': 'Foreign Affairs',
    'Development': 'Foreign Affairs',
    'International Cooperation and Development': 'Foreign Affairs',
    'External Relations': 'Foreign Affairs',
    'European Civil Protection and Humanitarian Aid Operations (ECHO)': 'Foreign Affairs',
    'Neighbourhood and Enlargement Negotiations': 'Foreign Affairs',
    'Budgetary Conciliation Committee': 'Budgets',
    'Parliament Delegation to Concilations Committee': 'Budgets',
    'Budget': 'Budgets',
    'Special committee on EU policy challenges and budgetary resources after 2013': 'Budgets',
    'Economic, social and territorial cohesion': 'Regional Development',
    'Special committee on financial crimes, tax evasion and tax avoidance': 'Economic and Monetary Affairs',
    'Taxation and Customs Union': 'Economic and Monetary Affairs',
    'Economic and monetary system': 'Economic and Monetary Affairs',
    'Special committee on tax rulings (TAX2)': 'Economic and Monetary Affairs',
    'Financial Stability, Financial Services and Capital Markets Union': 'Economic and Monetary Affairs',
    'Special committee on tax rulings (TAXE)': 'Economic and Monetary Affairs',
    'Economic and Financial Affairs': 'Economic and Monetary Affairs',
    'Special committee on the financial, economic and social crisis': 'Economic and Monetary Affairs',
    'Inquiry committee on the Equitable Life Assurance Society': 'Economic and Monetary Affairs',
    'Employment, Social Affairs and Inclusion': 'Employment and Social Affairs',
    'Social policy, social charter and protocol (1)': 'Employment and Social Affairs',
    'Area of freedom, security and justice': 'Civil Liberties, Justice and Home Affairs',
    'Justice and Consumers': 'Civil Liberties, Justice and Home Affairs',
    'Migration and Home Affairs': 'Civil Liberties, Justice and Home Affairs',
    'Climate Action': 'Environment, Climate and Food Safety',
    'Environment': 'Environment, Climate and Food Safety',
    "Special committee on the Union's authorisation procedure for pesticides": 'Environment, Climate and Food Safety',
    'Climate Change': 'Environment, Climate and Food Safety',
    'Committee of inquiry on emission measurements in the automotive sector': 'Environment, Climate and Food Safety',
    'Health and Food Safety': 'Public Health',
    'Special Committee on Beating Cancer': 'Public Health',
    'COVID-19 pandemic: lessons learned and recommendations for the future': 'Public Health',
    'Communications Networks, Content and Technology': 'Industry, Research and Energy',
    'Research and Innovation': 'Industry, Research and Energy',
    'Special Committee on Artificial Intelligence in a Digital Age': 'Industry, Research and Energy',
    'Internal market, single market': 'Internal Market and Consumer Protection',
    'Internal Market, Industry, Entrepreneurship and SMEs': 'Internal Market and Consumer Protection',
    'Mobility and Transport': 'Transport and Tourism',
    'Energy and Transport': 'Transport and Tourism',
    'Maritime Affairs and Fisheries': 'Fisheries',
    'Education, Youth, Sport and Culture': 'Culture and Education',
    'State and evolution of the Union': 'Constitutional Affairs',
    'European citizenship': 'Constitutional Affairs',
    'Regional and Urban Policy': 'Regional Development',
    'Structural Reform Support': 'Regional Development',
    'Trade': 'International Trade',
    'Special committee on terrorism': 'Security and Defence',
    'Special committee on organised crime, corruption and money laundering': 'Security and Defence',
    'Temporary committee on use of European countries by the CIA': 'Security and Defence',
    'Special Committee on foreign interference and disinformation, and on strengthening integrity in the EP': 'Security and Defence',
    'Special Committee on Foreign Interference in all Democratic Processes in the European Union, including Disinformation': 'Security and Defence',
    'Legal Affairs': 'Legal Affairs',
    'Legal Service': 'Legal Affairs',
    'Other': 'Others',
    'Community policies': 'Others',
    'Secretariat-General': 'Others',
    'Environmental policy (1)': 'Environment, Climate and Food Safety',
    'Agricultural policy and economies  (1)': 'Agriculture and Rural Development',
    'Institutions of the Union (1)': 'Constitutional Affairs',
    'Industrial policy (1)': 'Industry, Research and Energy',
    'Information and communications in general (1)': 'Industry, Research and Energy',
    'Energy policy (1)': 'Industry, Research and Energy',
    'Research and technological development and space (1)': 'Industry, Research and Energy',
    'Transport policy in general (1)': 'Transport and Tourism',
    'Treaties in general (1)': 'Constitutional Affairs',
    "Citizen's rights (1)": 'Civil Liberties, Justice and Home Affairs',
    'Employment policy, action to combat unemployment (1)': 'Employment and Social Affairs',
    'Budget of the Union (1)': 'Budgets',
    'Police, judicial and customs cooperation in general (1)': 'Civil Liberties, Justice and Home Affairs',
    'Enterprise policy, inter-company cooperation (1)': 'Industry, Research and Energy',
    'Common foreign and security policy (CFSP) (1)': 'Foreign Affairs',
    'Fisheries policy (1)': 'Fisheries',
    'Security and Defence': 'Security and Defence',

    # Seen in live OEIL responses but absent from the 2025 table, so these were
    # falling through to "Others".
    'European External Action Service': 'Foreign Affairs',
    # JUDGEMENT CALL: the housing special committee (created in term 10) has no
    # obvious home among the 22. Filed under social affairs because its remit is
    # affordable and social housing; change here if you'd rather it sat under
    # Regional Development.
    'Special committee on the Housing Crisis in the European Union': 'Employment and Social Affairs',
}

# Votes about the House's own business - the order of the agenda, the sitting
# calendar, a group's request to add or drop an item. They are real votes, but
# not about a policy area, so no OEIL label maps to them and they never come
# out of SUBJECT_MAPPING. The `classify` step assigns this name so they stop
# sitting in "Others", which is the absence of a subject rather than one.
PROCEDURE_SUBJECT = "Parliamentary Procedure"

CANONICAL_SUBJECTS = sorted(set(SUBJECT_MAPPING.values()) | {PROCEDURE_SUBJECT})

# --- subjects that did not exist for the whole period ------------------------
# ENVI was the "Committee on the Environment, Public Health and Food Safety"
# until 2024. A separate public health committee (SANT) exists only from term
# 10, so a distinct "Public Health" subject in terms 6-9 is an anachronism: it
# describes a committee that was not there. Those votes belong with ENVI, which
# is where the Parliament actually handled them.
#
# Keyed by mandate so the current term keeps the split that now genuinely
# exists. Applied when votes are written, not when subjects are resolved, since
# only the writer knows the mandate.
SUBJECT_MERGES = {
    "6": {"Public Health": "Environment, Climate and Food Safety"},
    "7": {"Public Health": "Environment, Climate and Food Safety"},
    "8": {"Public Health": "Environment, Climate and Food Safety"},
    "9": {"Public Health": "Environment, Climate and Food Safety"},
}

# A per-subject network needs enough votes for a position to mean anything.
# Below this, pairwise agreement is mostly sampling noise - at 12 votes the
# standard error on an agreement rate is about 14 points, which is wider than
# the differences the layout is drawing. Such a network is not merely weak, it
# is indistinguishable from a strong one once it is on screen, so it is not
# published at all.
MIN_SUBJECT_VOTES = 50

# A per-subject network re-applies PARTICIPATION_THRESHOLD to that subject's
# votes alone, and for a subject whose votes are lumpy that share is a poor
# measure of whether someone took part. Term 10's 176 women's rights votes fall
# on five sitting days, so missing one day costs 20-30 points of share at a
# stroke: Klara Dobrev cast 75 of them, 43%, and was cut - as were both PPE and
# both S&D Hungarians, leaving a "Hungary" network that was Fidesz plus one and
# reported 99.2% agreement because the opposition had been deleted from it.
#
# So an MEP also enters a subject network by casting enough votes outright.
# Both conditions are needed. The absolute floor alone is far too loose on a
# large subject - 30 of Foreign Affairs' 1049 votes is 4%, a position drawn from
# a single sitting - and the share floor alone is what fails on a lumpy one.
# Together they mean: a sample big enough to measure agreement from, drawn from
# enough of the policy area to be about the policy area.
MIN_SUBJECT_PARTICIPATION_VOTES = 30
MIN_SUBJECT_PARTICIPATION_SHARE = 0.25


def subject_for_mandate(subject, mandate):
    """The subject as it should be recorded for this particular term."""
    return SUBJECT_MERGES.get(str(mandate), {}).get(subject, subject)


def _normalise_label(text):
    """Fold the typographic variants that stop an exact match.

    OEIL sends a curly apostrophe (U+2019); parts of the table above were typed
    with the ASCII one (U+0027). They never compared equal, so e.g. the
    pesticides special committee silently fell through to "Others".
    """
    return (
        str(text)
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u00a0", " ")
        .strip()
    )


# Lookup table keyed on the normalised form, so either apostrophe resolves.
_NORMALISED_MAPPING = {_normalise_label(k): v for k, v in SUBJECT_MAPPING.items()}


def canonical_subject(raw):
    """Map a raw committee/policy label onto the canonical vocabulary."""
    if not raw:
        return FALLBACK_SUBJECT
    return _NORMALISED_MAPPING.get(_normalise_label(raw), FALLBACK_SUBJECT)
