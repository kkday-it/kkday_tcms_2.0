"""Central definition of TCMS human-facing external IDs (KQT-T / KQT-R / KQT-P).

Single source of truth so cases, runs, plans and the import paths all agree.

- Cases use a +50000 offset because they are also imported from Zephyr Scale,
  whose own KQT-T keys top out around 38000 — the offset keeps TCMS-native
  cases from colliding with imported ones.
- Runs and plans are produced only by TCMS itself (no external import shares
  their namespace), so they use the raw id. This also matches the run id that
  the frontend has already been surfacing as "KQT-R{id}".
"""

CASE_PREFIX = "KQT-T"
RUN_PREFIX = "KQT-R"
PLAN_PREFIX = "KQT-P"

CASE_OFFSET = 50000
RUN_OFFSET = 0
PLAN_OFFSET = 0


def case_external_id(case_id: int) -> str:
    return f"{CASE_PREFIX}{CASE_OFFSET + case_id}"


def run_external_id(run_id: int) -> str:
    return f"{RUN_PREFIX}{RUN_OFFSET + run_id}"


def plan_external_id(plan_id: int) -> str:
    return f"{PLAN_PREFIX}{PLAN_OFFSET + plan_id}"
