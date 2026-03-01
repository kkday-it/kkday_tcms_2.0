"""Initial schema - all tables

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-01

此 migration 建立所有資料表，供 PostgreSQL 全新部署使用。
現有 SQLite 部署請執行：
    alembic stamp 43b3c73328ee
以標記資料庫已是最新狀態，不需重新建表。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # ── users ────────────────────────────────────────────────────────────────
    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("username", sa.String(), unique=True, index=True, nullable=False),
            sa.Column("full_name", sa.String(), nullable=True),
            sa.Column("email", sa.String(), unique=True, index=True, nullable=False),
            sa.Column("role", sa.String(), server_default="QA"),
            sa.Column("hashed_password", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
            sa.Column("force_change_password", sa.Boolean(), server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        )

    # ── projects ─────────────────────────────────────────────────────────────
    if "projects" not in existing_tables:
        op.create_table(
            "projects",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("name", sa.String(), index=True, nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        )

    # ── test_plan_folders ────────────────────────────────────────────────────
    if "test_plan_folders" not in existing_tables:
        op.create_table(
            "test_plan_folders",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("test_plan_folders.id", ondelete="CASCADE"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # ── test_suites ──────────────────────────────────────────────────────────
    if "test_suites" not in existing_tables:
        op.create_table(
            "test_suites",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("parent_suite_id", sa.Integer(), sa.ForeignKey("test_suites.id"), nullable=True),
            sa.Column("name", sa.String(), index=True, nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("preconditions", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        )

    # ── test_cases ───────────────────────────────────────────────────────────
    if "test_cases" not in existing_tables:
        op.create_table(
            "test_cases",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("suite_id", sa.Integer(), sa.ForeignKey("test_suites.id"), nullable=False),
            sa.Column("title", sa.String(), index=True, nullable=False),
            sa.Column("status", sa.String(), server_default="Active"),
            sa.Column("lifecycle_status", sa.String(), server_default="Draft"),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("severity", sa.String(), server_default="Normal"),
            sa.Column("priority", sa.String(), server_default="Not Set"),
            sa.Column("type", sa.String(), nullable=True),
            sa.Column("layer", sa.String(), nullable=True),
            sa.Column("behavior", sa.String(), server_default="Not Set"),
            sa.Column("automation_status", sa.String(), server_default="Manual"),
            sa.Column("is_flaky", sa.Boolean(), server_default=sa.false()),
            sa.Column("muted", sa.Boolean(), server_default=sa.false()),
            sa.Column("preconditions", sa.String(), nullable=True),
            sa.Column("postconditions", sa.String(), nullable=True),
            sa.Column("default_owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("external_id", sa.String(), index=True, nullable=True),
            sa.Column("tags", sa.String(), nullable=True),
            sa.Column("labels", sa.String(), nullable=True),
            sa.Column("jira_keys", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        )

    # ── test_steps ───────────────────────────────────────────────────────────
    if "test_steps" not in existing_tables:
        op.create_table(
            "test_steps",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("test_case_id", sa.Integer(), sa.ForeignKey("test_cases.id"), nullable=False),
            sa.Column("order", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("data", sa.String(), nullable=True),
            sa.Column("expected_result", sa.String(), nullable=True),
        )

    # ── test_cases_history ───────────────────────────────────────────────────
    if "test_cases_history" not in existing_tables:
        op.create_table(
            "test_cases_history",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("case_id", sa.Integer(), sa.ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("changed_fields", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # ── test_run_folders ─────────────────────────────────────────────────────
    if "test_run_folders" not in existing_tables:
        op.create_table(
            "test_run_folders",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("name", sa.String(), index=True, nullable=False),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("test_run_folders.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        )

    # ── test_plans ───────────────────────────────────────────────────────────
    if "test_plans" not in existing_tables:
        op.create_table(
            "test_plans",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("title", sa.String(), index=True, nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("status", sa.String(), server_default="Draft"),
            sa.Column("folder_id", sa.Integer(), sa.ForeignKey("test_plan_folders.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        )

    # ── test_runs ────────────────────────────────────────────────────────────
    if "test_runs" not in existing_tables:
        op.create_table(
            "test_runs",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("folder_id", sa.Integer(), sa.ForeignKey("test_run_folders.id"), nullable=True),
            sa.Column("test_plan_id", sa.Integer(), sa.ForeignKey("test_plans.id"), nullable=True),
            sa.Column("title", sa.String(), index=True, nullable=False),
            sa.Column("run_type", sa.String(), server_default="Feature Test"),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("status", sa.String(), server_default="Pending"),
            sa.Column("assignee_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )

    # ── test_results ─────────────────────────────────────────────────────────
    if "test_results" not in existing_tables:
        op.create_table(
            "test_results",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("run_id", sa.Integer(), sa.ForeignKey("test_runs.id"), nullable=False),
            sa.Column("case_id", sa.Integer(), sa.ForeignKey("test_cases.id"), nullable=False),
            sa.Column("status", sa.String(), server_default="Untested"),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("comment", sa.String(), nullable=True),
            sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("jira_bug_id", sa.String(), nullable=True),
            sa.Column("attachment_url", sa.String(), nullable=True),
            sa.Column("assignee_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        )

    # ── test_step_results ────────────────────────────────────────────────────
    if "test_step_results" not in existing_tables:
        op.create_table(
            "test_step_results",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("test_result_id", sa.Integer(), sa.ForeignKey("test_results.id"), nullable=False),
            sa.Column("test_step_id", sa.Integer(), sa.ForeignKey("test_steps.id"), nullable=False),
            sa.Column("status", sa.String(), server_default="Untested"),
            sa.Column("actual_result", sa.String(), nullable=True),
        )

    # ── association tables ────────────────────────────────────────────────────
    if "test_run_assignees" not in existing_tables:
        op.create_table(
            "test_run_assignees",
            sa.Column("test_run_id", sa.Integer(), sa.ForeignKey("test_runs.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        )

    if "plan_runs" not in existing_tables:
        op.create_table(
            "plan_runs",
            sa.Column("plan_id", sa.Integer(), sa.ForeignKey("test_plans.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("run_id", sa.Integer(), sa.ForeignKey("test_runs.id", ondelete="CASCADE"), primary_key=True),
        )

    if "plan_cases" not in existing_tables:
        op.create_table(
            "plan_cases",
            sa.Column("plan_id", sa.Integer(), sa.ForeignKey("test_plans.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("case_id", sa.Integer(), sa.ForeignKey("test_cases.id", ondelete="CASCADE"), primary_key=True),
        )


def downgrade() -> None:
    # 依反向相依順序刪除
    for table in [
        "plan_cases", "plan_runs", "test_run_assignees",
        "test_step_results", "test_results", "test_runs",
        "test_plans", "test_run_folders", "test_cases_history",
        "test_steps", "test_cases", "test_suites",
        "test_plan_folders", "projects", "users",
    ]:
        op.drop_table(table)
