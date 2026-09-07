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
# Roll-call votes newer than the Parltrack dump, fetched from the EP directly by
# `pipeline.rcv`. Kept beside the dump rather than merged into it, so the
# upstream artefact stays exactly as downloaded and the provenance of every vote
# is visible. `build_votes` reads both, the dump first.
RAW_VOTES_EXTRA = RAW_DIR / "ep_votes_recent.json"
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


# --- OEIL subject codes ------------------------------------------------------
# A procedure with no committee responsible - every plenary resolution - used to
# fall through to the *first* top-level heading of its OEIL subject tree, which
# was then read as if it were a committee name. Heading 4 is called "Economic,
# social and territorial cohesion" and SUBJECT_MAPPING sends that to Regional
# Development, so any resolution touching social policy, health, children's or
# women's rights was filed as regional development. The Gaza resolution
# (2025/2852) carries 4.10.03 and 4.10.09 alongside 6.10.04/08/09, and heading 4
# sorts first, so its 41 term-10 votes became "Regional Development" - 57% of
# that subject's votes.
#
# The tree itself is fine; only the "first heading wins" reading was wrong. These
# tables read it properly, at the level where the taxonomy actually carries
# meaning. Second level is enough almost everywhere.
OEIL_CODE_SUBJECTS = {
    "1.10": "Civil Liberties, Justice and Home Affairs",
    "1.20": "Civil Liberties, Justice and Home Affairs",
    "2.10": "Internal Market and Consumer Protection",
    "2.20": "Civil Liberties, Justice and Home Affairs",
    "2.40": "Internal Market and Consumer Protection",
    "2.50": "Economic and Monetary Affairs",
    "2.60": "Economic and Monetary Affairs",
    "2.70": "Economic and Monetary Affairs",
    "2.80": "Internal Market and Consumer Protection",
    "3.10": "Agriculture and Rural Development",
    "3.15": "Fisheries",
    "3.20": "Transport and Tourism",
    "3.30": "Industry, Research and Energy",
    "3.40": "Industry, Research and Energy",
    "3.45": "Internal Market and Consumer Protection",
    "3.50": "Industry, Research and Energy",
    "3.60": "Industry, Research and Energy",
    "3.70": "Environment, Climate and Food Safety",
    "4.10": "Employment and Social Affairs",
    "4.15": "Employment and Social Affairs",
    "4.20": "Public Health",
    "4.40": "Culture and Education",
    "4.45": "Culture and Education",
    "4.50": "Transport and Tourism",
    "4.60": "Internal Market and Consumer Protection",
    "4.70": "Regional Development",
    "5.03": "Economic and Monetary Affairs",
    "5.05": "Economic and Monetary Affairs",
    "5.10": "Economic and Monetary Affairs",
    "5.20": "Economic and Monetary Affairs",
    "6.10": "Foreign Affairs",
    "6.20": "International Trade",
    "6.30": "Foreign Affairs",
    "6.40": "Foreign Affairs",
    "6.50": "Foreign Affairs",
    "7.10": "Civil Liberties, Justice and Home Affairs",
    "7.30": "Civil Liberties, Justice and Home Affairs",
    "7.40": "Civil Liberties, Justice and Home Affairs",
    "8.10": "Constitutional Affairs",
    "8.20": "Foreign Affairs",
    "8.30": "Constitutional Affairs",
    "8.40": "Constitutional Affairs",
    "8.50": "Legal Affairs",
    "8.60": "Economic and Monetary Affairs",
    "8.70": "Budgets",
}

# Where the second level is too coarse, because the committee that actually
# handles the file is not the one the parent code suggests. Learned from OEIL:
# which committee takes a file carrying each third-level code, counted over the
# 6522 vote-bearing procedures harvested, restricted to those where OEIL
# names exactly one committee responsible. Only codes with n >= 5 and >= 60%
# agreement are kept; anything thinner falls through to OEIL_CODE_SUBJECTS.
#
# The third level really is the level that carries the answer: 8.70.03
# "Budgetary control and discharge" goes to CONT while its parent 8.70 "Budget
# of the Union" goes to BUDG, and 3.10.09 "Plant health legislation, organic
# farming" goes to ENVI while its parent 3.10 goes to AGRI.
#
# Measured five-fold on held-out procedures, this table over the second-level
# one above reproduces the committee OEIL names 78.9% of the time, against
# 55.2% for the second-level table alone. It is consulted only for procedures
# with no committee at all - every plenary resolution - where there is nothing
# better to go on. n and agreement are recorded per row so the table can be
# audited rather than trusted.
OEIL_CODE_SUBJECTS_SPECIFIC = {
    "1.20.01": "Constitutional Affairs",                                    # n=5 80% Political rights, right to vote and to sta
    "1.20.03": "Petitions",                                                 # n=17 94% Right of petition
    "1.20.04": "Petitions",                                                 # n=21 76% European Ombudsman
    "1.20.09": "Civil Liberties, Justice and Home Affairs",                 # n=91 75% Protection of privacy and data protection
    "2.10.02": "Internal Market and Consumer Protection",                   # n=14 64% Public procurement
    "2.50.02": "Economic and Monetary Affairs",                             # n=18 100% Savings
    "2.50.03": "Economic and Monetary Affairs",                             # n=116 92% Securities and financial markets, stock ex
    "2.50.04": "Economic and Monetary Affairs",                             # n=94 84% Banks and credit
    "2.50.05": "Economic and Monetary Affairs",                             # n=43 88% Insurance, pension funds
    "2.50.08": "Economic and Monetary Affairs",                             # n=91 92% Financial services, financial reporting an
    "2.50.10": "Economic and Monetary Affairs",                             # n=93 91% Financial supervision
    "2.60.04": "Legal Affairs",                                             # n=5 100% Economic concentration, mergers, takeover 
    "2.70.01": "Economic and Monetary Affairs",                             # n=15 100% Direct taxation
    "2.70.02": "Economic and Monetary Affairs",                             # n=82 72% Indirect taxation, VAT, excise duties
    "3.10.01": "Agriculture and Rural Development",                         # n=37 81% Agricultural structures and holdings, farm
    "3.10.01.02": "Agriculture and Rural Development",                      # n=22 73% Rural development, European Agricultural F
    "3.10.02": "Agriculture and Rural Development",                         # n=15 73% Processed products, agri-foodstuffs
    "3.10.03": "Agriculture and Rural Development",                         # n=63 71% Marketing and trade of agricultural produc
    "3.10.04": "Agriculture and Rural Development",                         # n=30 67% Livestock farming
    "3.10.04.02": "Agriculture and Rural Development",                      # n=17 71% Animal protection
    "3.10.05": "Agriculture and Rural Development",                         # n=22 73% Livestock products, in general
    "3.10.05.02": "Agriculture and Rural Development",                      # n=8 88% Milk and dairy products
    "3.10.06": "Agriculture and Rural Development",                         # n=95 61% Crop products in general, floriculture
    "3.10.06.01": "Agriculture and Rural Development",                      # n=11 73% Fruit, citrus fruits
    "3.10.06.02": "Agriculture and Rural Development",                      # n=9 89% Vegetables
    "3.10.06.03": "Agriculture and Rural Development",                      # n=8 62% Cereals, rice
    "3.10.06.06": "Agriculture and Rural Development",                      # n=5 100% Oleaginous plants
    "3.10.08": "Environment, Climate and Food Safety",                      # n=36 67% Animal health requirements, veterinary leg
    "3.10.08.01": "Environment, Climate and Food Safety",                   # n=11 82% Feedingstuffs, animal nutrition
    "3.10.09": "Environment, Climate and Food Safety",                      # n=110 77% Plant health legislation, organic farming,
    "3.10.09.04": "Agriculture and Rural Development",                      # n=7 100% Organic farming
    "3.10.09.06": "Environment, Climate and Food Safety",                   # n=70 94% Agro-genetics, GMOs
    "3.10.10": "Environment, Climate and Food Safety",                      # n=48 73% Foodstuffs, foodstuffs legislation
    "3.10.12": "Agriculture and Rural Development",                         # n=8 88% Agrimonetary policy, compensatory amounts
    "3.10.13": "Agriculture and Rural Development",                         # n=6 83% European Agricultural Guidance and Guarant
    "3.10.14": "Agriculture and Rural Development",                         # n=20 90% Support for producers and premiums
    "3.10.30": "Agriculture and Rural Development",                         # n=9 100% Agricultural statistics
    "3.15.01": "Fisheries",                                                 # n=76 95% Fish stocks, conservation of fishery resou
    "3.15.02": "Fisheries",                                                 # n=17 71% Aquaculture
    "3.15.03": "Fisheries",                                                 # n=6 100% Fishing fleets, safety of fishing vessels
    "3.15.04": "Fisheries",                                                 # n=58 97% Management of fisheries, fisheries, fishin
    "3.15.05": "Fisheries",                                                 # n=16 81% Fish catches, import tariff quotas
    "3.15.06": "Fisheries",                                                 # n=24 71% Fishing industry and statistics, fishery p
    "3.15.07": "Fisheries",                                                 # n=27 96% Fisheries inspectorate, surveillance of fi
    "3.15.08": "Fisheries",                                                 # n=9 78% Fishing enterprises, fishermen, working co
    "3.15.15": "Fisheries",                                                 # n=91 93% Fisheries agreements and cooperation
    "3.15.15.02": "Fisheries",                                              # n=29 97% Fisheries agreements with African countrie
    "3.15.15.03": "Fisheries",                                              # n=17 100% Fisheries agreements with Indian Ocean cou
    "3.15.15.06": "Fisheries",                                              # n=14 64% Fisheries agreements with Pacific countrie
    "3.20.01.01": "Transport and Tourism",                                  # n=16 69% Air safety
    "3.20.02": "Transport and Tourism",                                     # n=32 94% Rail transport: passengers and freight
    "3.20.02.01": "Transport and Tourism",                                  # n=11 100% Railway safety
    "3.20.03": "Transport and Tourism",                                     # n=42 71% Maritime transport: passengers and freight
    "3.20.03.01": "Transport and Tourism",                                  # n=14 71% Maritime safety
    "3.20.04": "Transport and Tourism",                                     # n=19 84% Inland waterway transport
    "3.20.05": "Transport and Tourism",                                     # n=64 62% Road transport: passengers and freight
    "3.20.07": "Transport and Tourism",                                     # n=10 100% Combined transport, multimodal transport
    "3.20.09": "Transport and Tourism",                                     # n=7 86% Ports policy
    "3.20.10": "Transport and Tourism",                                     # n=24 62% Transport undertakings, transport industry
    "3.20.11": "Transport and Tourism",                                     # n=27 93% Trans-European transport networks
    "3.20.15": "Transport and Tourism",                                     # n=75 80% Transport agreements and cooperation
    "3.20.15.02": "Transport and Tourism",                                  # n=38 87% Air transport agreements and cooperation
    "3.20.15.04": "Transport and Tourism",                                  # n=8 100% Road transport agreements and cooperation
    "3.20.15.08": "Transport and Tourism",                                  # n=5 80% Rail transport agreements and cooperation
    "3.20.20": "Transport and Tourism",                                     # n=7 71% Transport statistics
    "3.30.01": "Culture and Education",                                     # n=25 64% Audiovisual industry and services
    "3.30.01.02": "Culture and Education",                                  # n=5 100% Programmes and actions in audiovisual sect
    "3.30.02": "Culture and Education",                                     # n=11 73% Television, cable, digital, mobile
    "3.30.03": "Industry, Research and Energy",                             # n=21 71% Telecommunications, data transmission, tel
    "3.30.03.06": "Industry, Research and Energy",                          # n=16 81% Communications by satellite
    "3.30.05": "Industry, Research and Energy",                             # n=24 67% Electronic and mobile communications, pers
    "3.30.07": "Industry, Research and Energy",                             # n=19 63% Cybersecurity, cyberspace policy
    "3.30.20": "Industry, Research and Energy",                             # n=8 88% Trans-European communications networks
    "3.40.01": "Environment, Climate and Food Safety",                      # n=21 67% Chemical industry, fertilizers, plastics
    "3.40.02": "Budgets",                                                   # n=12 75% Iron and steel industry, metallurgical ind
    "3.40.04": "Budgets",                                                   # n=8 62% Shipbuilding, nautical industry
    "3.40.05": "Industry, Research and Energy",                             # n=14 64% Aeronautical industry, aerospace industry
    "3.40.17": "Budgets",                                                   # n=12 75% Manufactured goods
    "3.40.18": "Budgets",                                                   # n=11 82% Services sector
    "3.45.01": "Legal Affairs",                                             # n=43 86% Company law
    "3.45.04": "Economic and Monetary Affairs",                             # n=33 100% Company taxation
    "3.50.01": "Industry, Research and Energy",                             # n=36 83% European research area and policy
    "3.50.01.05": "Industry, Research and Energy",                          # n=18 78% Research specific areas
    "3.50.02": "Industry, Research and Energy",                             # n=23 87% Framework programme and research programme
    "3.50.02.01": "Industry, Research and Energy",                          # n=8 100% EC, EU framework programme
    "3.50.02.02": "Industry, Research and Energy",                          # n=6 100% Euratom framework programme, research and 
    "3.50.04": "Industry, Research and Energy",                             # n=38 76% Innovation
    "3.50.08": "Industry, Research and Energy",                             # n=13 62% New technologies; biotechnology
    "3.50.15": "Legal Affairs",                                             # n=35 86% Intellectual property, copyright
    "3.50.16": "Legal Affairs",                                             # n=23 83% Industrial property, European patent, Comm
    "3.50.20": "Industry, Research and Energy",                             # n=55 96% Scientific and technological cooperation a
    "3.60.03": "Industry, Research and Energy",                             # n=23 78% Gas, electricity, natural gas, biogas
    "3.60.04": "Industry, Research and Energy",                             # n=17 88% Nuclear energy, industry and safety
    "3.60.05": "Industry, Research and Energy",                             # n=35 74% Alternative and renewable energies
    "3.60.06": "Industry, Research and Energy",                             # n=12 83% Trans-European energy networks
    "3.60.08": "Industry, Research and Energy",                             # n=26 77% Energy efficiency
    "3.60.10": "Industry, Research and Energy",                             # n=14 93% Security of energy supply
    "3.60.15": "Industry, Research and Energy",                             # n=19 89% Cooperation and agreements for energy
    "3.70.02": "Environment, Climate and Food Safety",                      # n=84 70% Atmospheric pollution, motor vehicle pollu
    "3.70.03": "Environment, Climate and Food Safety",                      # n=73 73% Climate policy, climate change, ozone laye
    "3.70.04": "Environment, Climate and Food Safety",                      # n=21 71% Water control and management, pollution of
    "3.70.06": "Environment, Climate and Food Safety",                      # n=9 100% Soil pollution, deterioration
    "3.70.09": "Environment, Climate and Food Safety",                      # n=8 100% Transfrontier pollution
    "3.70.11": "Budgets",                                                   # n=55 78% Natural disasters, Solidarity Fund
    "3.70.12": "Environment, Climate and Food Safety",                      # n=30 80% Waste management, domestic waste, packagin
    "3.70.13": "Environment, Climate and Food Safety",                      # n=52 79% Dangerous substances, toxic and radioactiv
    "3.70.16": "Legal Affairs",                                             # n=10 60% Law and environment, liability
    "3.70.18": "Environment, Climate and Food Safety",                      # n=66 89% International and regional environment pro
    "4.10.02": "Legal Affairs",                                             # n=39 79% Family policy, family law, parental leave
    "4.10.04": "Women’s Rights and Gender Equality",                        # n=49 84% Gender equality
    "4.10.05": "Employment and Social Affairs",                             # n=33 73% Social inclusion, poverty, minimum income
    "4.10.09": "Women’s Rights and Gender Equality",                        # n=43 93% Women condition and rights
    "4.10.10": "Employment and Social Affairs",                             # n=31 74% Social protection, social security
    "4.10.11": "Employment and Social Affairs",                             # n=8 62% Retirement, pensions
    "4.10.13": "Culture and Education",                                     # n=16 94% Sport
    "4.10.14": "Employment and Social Affairs",                             # n=7 71% Demography
    "4.15.02": "Employment and Social Affairs",                             # n=44 75% Employment: guidelines, actions, Funds
    "4.15.04": "Employment and Social Affairs",                             # n=44 75% Workforce, occupational mobility, job conv
    "4.15.05": "Budgets",                                                   # n=126 94% Industrial restructuring, job losses, redu
    "4.15.10": "Employment and Social Affairs",                             # n=11 91% Worker information, participation, trade u
    "4.15.12": "Employment and Social Affairs",                             # n=32 62% Workers protection and rights, labour law
    "4.15.14": "Employment and Social Affairs",                             # n=6 100% Social dialogue, social partners
    "4.15.15": "Employment and Social Affairs",                             # n=31 61% Health and safety at work, occupational me
    "4.20.02": "Environment, Climate and Food Safety",                      # n=16 75% Medical research
    "4.20.02.06": "Environment, Climate and Food Safety",                   # n=7 86% Clinical practice and experiments
    "4.20.03": "Civil Liberties, Justice and Home Affairs",                 # n=12 75% Drug addiction, alcoholism, smoking
    "4.20.05": "Environment, Climate and Food Safety",                      # n=29 86% Health legislation and policy
    "4.40.01": "Culture and Education",                                     # n=39 74% European area for education, training and 
    "4.40.03": "Culture and Education",                                     # n=10 60% Primary and secondary school, European Sch
    "4.40.04": "Culture and Education",                                     # n=9 100% Universities, higher education
    "4.40.08": "Culture and Education",                                     # n=6 100% Language learning, regional and local lang
    "4.40.20": "Culture and Education",                                     # n=9 89% Cooperation and agreements in the fields o
    "4.45.02": "Culture and Education",                                     # n=26 96% Cultural programmes and actions, assistanc
    "4.45.06": "Culture and Education",                                     # n=17 76% Heritage and culture protection, movement 
    "4.45.08": "Culture and Education",                                     # n=12 75% Cultural and artistic activities, books an
    "4.45.10": "Legal Affairs",                                             # n=5 100% Literary and artistic property
    "4.60.04": "Environment, Climate and Food Safety",                      # n=64 78% Consumer health
    "4.60.04.02": "Internal Market and Consumer Protection",                # n=10 60% Consumer security
    "4.60.04.04": "Environment, Climate and Food Safety",                   # n=52 85% Food safety
    "4.70.01": "Regional Development",                                      # n=34 74% Structural funds, investment funds in gene
    "4.70.02": "Regional Development",                                      # n=53 100% Cohesion policy, Cohesion Fund (CF)
    "4.70.05": "Regional Development",                                      # n=32 72% Regional cooperation, cross-border coopera
    "4.70.07": "Regional Development",                                      # n=19 100% European Regional Development Fund (ERDF)
    "5.10.01": "Economic and Monetary Affairs",                             # n=63 79% Convergence of economic policies,  public 
    "5.20.01": "Economic and Monetary Affairs",                             # n=17 82% Coordination of monetary policies, Europea
    "5.20.02": "Economic and Monetary Affairs",                             # n=37 70% Single currency, euro, euro area
    "5.20.03": "Economic and Monetary Affairs",                             # n=26 100% European Central Bank (ECB), ESCB
    "6.10.02": "Foreign Affairs",                                           # n=45 80% Common security and defence policy (CSDP);
    "6.10.03": "Foreign Affairs",                                           # n=15 73% Armaments control, non-proliferation nucle
    "6.10.04": "Foreign Affairs",                                           # n=8 88% Third-country political situation, local a
    "6.10.05": "Foreign Affairs",                                           # n=21 67% Peace preservation, humanitarian and rescu
    "6.10.08": "Foreign Affairs",                                           # n=34 62% Fundamental freedoms, human rights, democr
    "6.10.09": "Foreign Affairs",                                           # n=36 100% Human rights situation in the world
    "6.20.01": "International Trade",                                       # n=48 85% Agreements and relations in the context of
    "6.20.04": "International Trade",                                       # n=71 75% Union Customs Code, tariffs, preferential 
    "6.20.05": "International Trade",                                       # n=40 80% Multilateral and plurilateral economic and
    "6.20.06": "International Trade",                                       # n=12 83% Foreign direct investment (FDI)
    "6.20.07": "International Trade",                                       # n=23 96% Macro-financial assistance to third countr
    "6.30.01": "International Trade",                                       # n=15 87% Generalised scheme of tariff preferences (
    "6.30.02": "Foreign Affairs",                                           # n=34 79% Financial and technical cooperation and as
    "6.40.04": "Foreign Affairs",                                           # n=33 70% Relations with the Commonwealth of Indepen
    "6.40.04.02": "Foreign Affairs",                                        # n=8 75% Relations with Russian Federation
    "6.40.04.06": "Foreign Affairs",                                        # n=13 69% Relations with central Asian countries
    "6.40.05": "Foreign Affairs",                                           # n=35 69% Relations with the Mediterranean and south
    "6.40.05.02": "Foreign Affairs",                                        # n=11 91% Relations with the countries of the Great 
    "6.40.05.04": "International Trade",                                    # n=8 62% Relations with the countries of the Mashre
    "6.40.05.06": "Foreign Affairs",                                        # n=13 69% Relations with the countries of the Middle
    "6.40.07": "Foreign Affairs",                                           # n=10 70% Relations with African countries
    "6.40.08": "Foreign Affairs",                                           # n=30 80% Relations with Asian countries
    "6.40.09": "Civil Liberties, Justice and Home Affairs",                 # n=10 90% Relations with Oceanian countries
    "6.40.11": "Foreign Affairs",                                           # n=17 71% Relations with industrialised countries
    "6.40.15": "Foreign Affairs",                                           # n=50 64% European neighbourhood policy
    "7.10.02": "Civil Liberties, Justice and Home Affairs",                 # n=26 88% Schengen area, Schengen acquis
    "7.10.04": "Civil Liberties, Justice and Home Affairs",                 # n=124 98% External borders crossing and controls, vi
    "7.10.06": "Civil Liberties, Justice and Home Affairs",                 # n=74 76% Asylum, refugees, displaced persons; Asylu
    "7.10.08": "Civil Liberties, Justice and Home Affairs",                 # n=50 80% Migration policy
    "7.30.05": "Civil Liberties, Justice and Home Affairs",                 # n=48 96% Police cooperation
    "7.30.05.01": "Civil Liberties, Justice and Home Affairs",              # n=22 100% Europol, CEPOL
    "7.30.09": "Civil Liberties, Justice and Home Affairs",                 # n=15 67% Public security
    "7.30.20": "Civil Liberties, Justice and Home Affairs",                 # n=46 87% Action to combat terrorism
    "7.30.30": "Civil Liberties, Justice and Home Affairs",                 # n=124 69% Action to combat crime
    "7.30.30.04": "Civil Liberties, Justice and Home Affairs",              # n=21 95% Action to combat drugs and drug-traffickin
    "7.30.30.08": "Civil Liberties, Justice and Home Affairs",              # n=14 64% Capital outflow, money laundering
    "7.30.30.10": "Civil Liberties, Justice and Home Affairs",              # n=8 75% Action against counterfeiting
    "7.40.02": "Legal Affairs",                                             # n=87 77% Judicial cooperation in civil and commerci
    "7.40.04": "Civil Liberties, Justice and Home Affairs",                 # n=65 94% Judicial cooperation in criminal matters
    "8.20.01": "Foreign Affairs",                                           # n=54 85% Candidate countries
    "8.30.10": "Civil Liberties, Justice and Home Affairs",                 # n=15 73% Principles common to the Member States, EU
    "8.40.01": "Constitutional Affairs",                                    # n=99 66% European Parliament
    "8.40.01.01": "Constitutional Affairs",                                 # n=13 100% Elections, direct universal suffrage
    "8.40.01.03": "Legal Affairs",                                          # n=8 100% Members' immunity
    "8.40.01.06": "Petitions",                                              # n=14 79% Committees, interparliamentary delegations
    "8.40.01.08": "Constitutional Affairs",                                 # n=29 100% Business of Parliament, procedure, sitting
    "8.40.02": "Constitutional Affairs",                                    # n=5 60% Council of the Union
    "8.40.11": "Constitutional Affairs",                                    # n=8 75% Relations with Member State governments an
    "8.70.01": "Budgets",                                                   # n=43 81% Financing of the budget, own resources
    "8.70.02": "Budgets",                                                   # n=24 83% Financial regulations
    "8.70.03": "Budgetary Control",                                         # n=791 98% Budgetary control and discharge, implement
    "8.70.03.02": "Budgetary Control",                                      # n=53 100% 2017 discharge
    "8.70.03.03": "Budgetary Control",                                      # n=52 100% 2013 discharge
    "8.70.03.04": "Budgetary Control",                                      # n=53 100% 2014 discharge
    "8.70.03.05": "Budgetary Control",                                      # n=51 100% 2015 discharge
    "8.70.03.06": "Budgetary Control",                                      # n=52 100% 2016 discharge
    "8.70.03.07": "Budgetary Control",                                      # n=229 100% Previous discharges
    "8.70.03.08": "Budgetary Control",                                      # n=51 100% 2018 discharge
    "8.70.03.09": "Budgetary Control",                                      # n=52 100% 2019 discharge
    "8.70.03.10": "Budgetary Control",                                      # n=51 100% 2020 discharge
    "8.70.03.11": "Budgetary Control",                                      # n=54 100% 2021 discharge
    "8.70.03.12": "Budgetary Control",                                      # n=55 100% 2022 discharge
    "8.70.03.13": "Budgetary Control",                                      # n=8 100% 2023 discharge
    "8.70.04": "Budgetary Control",                                         # n=37 76% Protecting financial interests of the EU a
    "8.70.48": "Budgets",                                                   # n=7 100% 2026 budget
    "8.70.49": "Budgets",                                                   # n=12 100% 2025 budget
    "8.70.50": "Budgets",                                                   # n=20 100% 2020 budget
    "8.70.51": "Budgets",                                                   # n=19 100% 2021 budget
    "8.70.52": "Budgets",                                                   # n=15 100% 2022 budget
    "8.70.53": "Budgets",                                                   # n=14 100% 2023 budget
    "8.70.54": "Budgets",                                                   # n=17 94% 2024 budget
    "8.70.55": "Budgets",                                                   # n=30 100% 2015 budget
    "8.70.56": "Budgets",                                                   # n=23 100% 2016 budget
    "8.70.57": "Budgets",                                                   # n=22 100% 2017 budget
    "8.70.58": "Budgets",                                                   # n=20 100% 2018 budget
    "8.70.59": "Budgets",                                                   # n=12 100% 2019 budget
    "8.70.60": "Budgets",                                                   # n=100 99% Previous annual budgets
    "8.70.70": "Budgets",                                                   # n=14 100% Flexibility instrument
    "3.30.08": "Culture and Education",                                     # hand-set: too few procedures to learn from
    "3.30.16": "Culture and Education",                                     # hand-set: too few procedures to learn from
}

# 8.40 is "Institutions of the Union". On a resolution it describes the vehicle
# (which body is acting), not the topic, so it is dropped whenever the procedure
# carries any topical code as well. The decision setting up the housing
# committee (2024/3000) carries 4.10.12 and 8.40.01.06; only the first is about
# housing.
OEIL_PROCEDURAL_CODE_PREFIXES = ("8.40",)

# Tie-break when a procedure's codes support two subjects equally. A resolution
# carrying both a heading-6 code and a social one is a foreign-policy text that
# mentions a social theme - Iran (women), Cambodia (labour rights), Gaza
# (children) and the deported Ukrainian children are all this shape - so
# external relations outranks the domestic areas. Trade outranks the rest of
# heading 6 because INTA, not AFET, holds commercial policy.
SUBJECT_TIE_BREAK = [
    "International Trade",
    "Foreign Affairs",
    "Public Health",
    "Women’s Rights and Gender Equality",
    "Environment, Climate and Food Safety",
    "Agriculture and Rural Development",
    "Fisheries",
    "Employment and Social Affairs",
    "Civil Liberties, Justice and Home Affairs",
    "Regional Development",
    "Culture and Education",
    "Transport and Tourism",
    "Industry, Research and Energy",
    "Internal Market and Consumer Protection",
    "Economic and Monetary Affairs",
    "Budgets",
    "Legal Affairs",
    "Constitutional Affairs",
]

# Committee abbreviation -> official name. `committee_names.json` is populated
# lazily and was missing AFCO, SEDE, JURI, CULT, TRAN, DEVE, PETI and SANT, so a
# document's own authoring committee could not be resolved and the lookup fell
# through in silence. These are stable and public; pinning them means the
# committee route cannot fail for want of a cache entry.
COMMITTEE_NAMES = {
    "AFET": "Foreign Affairs",
    "DEVE": "Development",
    "INTA": "International Trade",
    "BUDG": "Budgets",
    "CONT": "Budgetary Control",
    "ECON": "Economic and Monetary Affairs",
    "EMPL": "Employment and Social Affairs",
    "ENVI": "Environment, Climate and Food Safety",
    "ITRE": "Industry, Research and Energy",
    "IMCO": "Internal Market and Consumer Protection",
    "TRAN": "Transport and Tourism",
    "REGI": "Regional Development",
    "AGRI": "Agriculture and Rural Development",
    "PECH": "Fisheries",
    "CULT": "Culture and Education",
    "JURI": "Legal Affairs",
    "LIBE": "Civil Liberties, Justice and Home Affairs",
    "AFCO": "Constitutional Affairs",
    "FEMM": "Women’s Rights and Gender Equality",
    "PETI": "Petitions",
    "SEDE": "Security and Defence",
    "SANT": "Public Health",
    "DROI": "Foreign Affairs",
    "HOUS": "Employment and Social Affairs",
}

# The labels that really are committees. Anything else `fetch_subject` returns -
# a Commission directorate-general, a top-level heading - is a guess, and must
# lose to the subject codes.
COMMITTEE_LABELS = frozenset(COMMITTEE_NAMES.values()) | {
    "Human Rights",
    "Environment, Public Health and Food Safety",
}


def _oeil_leaf_codes(codes):
    """The deepest codes only: drop any code that another code extends."""
    plain = [str(c) for c in codes if c]
    return [c for c in plain if not any(o != c and o.startswith(c + ".") for o in plain)]


def subject_from_oeil_codes(codes):
    """Canonical subject from a procedure's OEIL subject codes, or None.

    Counts the leaf codes supporting each subject and takes the most supported,
    breaking ties with SUBJECT_TIE_BREAK.
    """
    leaves = _oeil_leaf_codes(codes)
    topical = [c for c in leaves if not c.startswith(OEIL_PROCEDURAL_CODE_PREFIXES)]
    if topical:
        leaves = topical
    scores = {}
    for code in leaves:
        parts = code.split(".")
        # Walk from the code's own depth down to the second level and take the
        # most specific entry that exists. A quarter of all leaf codes are four
        # deep - "8.70.03.07 Previous discharges" is one - and stopping at three
        # sent every discharge file to its 8.70 parent, "Budget of the Union",
        # and so to Budgets rather than Budgetary Control.
        subject = None
        for depth in range(len(parts), 1, -1):
            subject = OEIL_CODE_SUBJECTS_SPECIFIC.get(".".join(parts[:depth]))
            if subject:
                break
        if subject is None:
            subject = OEIL_CODE_SUBJECTS.get(".".join(parts[:2]))
        if subject:
            scores[subject] = scores.get(subject, 0) + 1
    if not scores:
        return None
    best = max(scores.values())
    tied = [s for s, n in scores.items() if n == best]
    if len(tied) == 1:
        return tied[0]
    return sorted(
        tied,
        key=lambda s: SUBJECT_TIE_BREAK.index(s) if s in SUBJECT_TIE_BREAK else 99,
    )[0]
