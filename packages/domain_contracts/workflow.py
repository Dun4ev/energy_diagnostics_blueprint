"""Frozen transition policy. Persistence/authentication belong to stage04."""

from .models import CaseState, Permission, PlanState, Role

CASE_TRANSITIONS = {
    CaseState.DETECTED: {CaseState.UNDER_REVIEW},
    CaseState.UNDER_REVIEW: {CaseState.AWAITING_EVIDENCE},
    CaseState.AWAITING_EVIDENCE: {
        CaseState.CONFIRMED,
        CaseState.NOT_CONFIRMED,
        CaseState.SENSOR_ISSUE,
    },
    CaseState.CONFIRMED: {CaseState.REMEDIATION_PLANNED},
    CaseState.NOT_CONFIRMED: {CaseState.VERIFICATION},
    CaseState.SENSOR_ISSUE: {CaseState.VERIFICATION},
    CaseState.REMEDIATION_PLANNED: {CaseState.VERIFICATION},
    CaseState.VERIFICATION: {CaseState.CLOSED, CaseState.UNDER_REVIEW},
    CaseState.CLOSED: set(),
}
PLAN_TRANSITIONS = {
    PlanState.DRAFT: {PlanState.SUBMITTED, PlanState.CANCELLED},
    PlanState.SUBMITTED: {
        PlanState.APPROVED,
        PlanState.REJECTED,
        PlanState.CANCELLED,
        PlanState.SUPERSEDED,
    },
    PlanState.REJECTED: {PlanState.DRAFT, PlanState.CANCELLED, PlanState.SUPERSEDED},
    PlanState.APPROVED: {PlanState.IN_PROGRESS, PlanState.CANCELLED, PlanState.SUPERSEDED},
    PlanState.IN_PROGRESS: {
        PlanState.AWAITING_VERIFICATION,
        PlanState.CANCELLED,
        PlanState.SUPERSEDED,
    },
    PlanState.AWAITING_VERIFICATION: {
        PlanState.COMPLETED,
        PlanState.IN_PROGRESS,
        PlanState.CANCELLED,
        PlanState.SUPERSEDED,
    },
    PlanState.COMPLETED: set(),
    PlanState.CANCELLED: set(),
    PlanState.SUPERSEDED: set(),
}
ROLE_PERMISSIONS = {
    Role.VIEWER: {Permission.READ},
    Role.ENGINEER: {
        Permission.READ,
        Permission.CASE_REVIEW,
        Permission.PLAN_EDIT,
        Permission.EVIDENCE_ADD,
        Permission.DEMO_ADVANCE,
    },
    Role.APPROVER: {Permission.READ, Permission.PLAN_APPROVE, Permission.CASE_CLOSE},
    Role.TECHNICIAN: {Permission.READ, Permission.STEP_RESULT, Permission.EVIDENCE_ADD},
    Role.ADMIN: {Permission.READ, Permission.ADMIN_USERS},
}
# case.confirm is an explicit server-side grant, never implicit in admin/engineer.
CASE_PERMISSION = {state: Permission.CASE_REVIEW for state in CaseState}
CASE_PERMISSION[CaseState.CONFIRMED] = Permission.CASE_CONFIRM
CASE_PERMISSION[CaseState.CLOSED] = Permission.CASE_CLOSE
PLAN_PERMISSION = {state: Permission.PLAN_EDIT for state in PlanState}
for state in [
    PlanState.APPROVED,
    PlanState.REJECTED,
    PlanState.COMPLETED,
    PlanState.CANCELLED,
    PlanState.SUPERSEDED,
]:
    PLAN_PERMISSION[state] = Permission.PLAN_APPROVE
for state in [PlanState.IN_PROGRESS, PlanState.AWAITING_VERIFICATION]:
    PLAN_PERMISSION[state] = Permission.STEP_RESULT
