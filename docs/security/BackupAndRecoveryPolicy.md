# Backup and Recovery Policy

**EALLsource**

---

## 1. Purpose

This Backup and Recovery Policy defines how EALLsource backs up its critical data and code, the objectives for restoring service after data loss, and how backups and recovery procedures are verified. It supports business continuity ([BusinessContinuityPlan.md](BusinessContinuityPlan.md)) and incident recovery ([IncidentResponsePlan.md](IncidentResponsePlan.md)).

---

## 2. Scope

This policy covers the systems whose loss would interrupt EALLsource or lose customer data: the Neon PostgreSQL database, the GitHub source repository, and the Vercel deployment configuration.

---

## 3. Neon Database Backups

- The Neon PostgreSQL database is the system of record for all seller data and is the highest backup priority.
- EALLsource relies on Neon's managed backup and **point-in-time recovery (PITR)** capability, retained according to the Neon plan's retention window.
- Neon's branching feature is used to create a snapshot prior to risky operations (e.g., migrations or incident remediation), preserving a known-good state that can be restored or compared against ([IncidentResponsePlan.md](IncidentResponsePlan.md), Section 9).
- Backups are encrypted at rest by the provider and access-controlled to the founder's Neon account.

---

## 4. GitHub Source Code

- All application source code, infrastructure configuration, database schema/migrations, and these security policies are version-controlled in a private GitHub repository.
- GitHub serves as the durable, distributed backup of the codebase; full commit history is retained.
- The repository can be cloned to a new environment to reconstruct the application at any committed revision.
- Branch protection on the default branch protects history from accidental or unauthorized destructive changes (see [SecureDevelopmentPolicy.md](SecureDevelopmentPolicy.md)).

---

## 5. Vercel Deployments

- Vercel retains a history of immutable deployments. Each production deployment corresponds to a specific Git commit and can be re-promoted, enabling near-instant rollback to a previous known-good build.
- Production environment variables (the application's configuration and secrets) are stored in Vercel. These are **not** captured in code backups by design; the current set of required environment variables is documented separately so the application can be reconfigured if the Vercel project is lost.

---

## 6. Recovery Objectives

These objectives reflect EALLsource's current managed-platform stack and are targets, not contractual guarantees:

| Objective | Target | Basis |
|---|---|---|
| **RPO** (Recovery Point Objective) — max acceptable data loss | Near-zero to minutes, for the database | Neon point-in-time recovery |
| **RTO** (Recovery Time Objective) — max acceptable downtime | Application: minutes (redeploy/rollback on Vercel). Database: bounded by Neon restore time. | Managed-platform recovery |

The database is the binding constraint on RTO; application code and hosting can be restored quickly from GitHub and Vercel.

---

## 7. Restore Testing

- Restore capability is validated periodically (at least annually) by exercising a Neon branch/PITR restore into a non-production branch and confirming the restored data is complete and queryable.
- A Vercel rollback is exercised by promoting a prior deployment in a controlled manner to confirm the rollback path works.
- Restore tests are dated and any issues found are tracked to resolution.

---

## 8. Disaster Recovery

In the event of loss of a major component, recovery proceeds as follows:

- **Loss of the Vercel project/app:** redeploy from the GitHub repository to a new Vercel project and restore environment variables from the documented configuration.
- **Loss or corruption of the database:** restore from Neon point-in-time recovery to the most recent known-good point.
- **Loss of the GitHub repository:** restore from a local clone (every developer machine and the deployed build chain hold a full copy of history).
- Disaster recovery is coordinated under the [BusinessContinuityPlan.md](BusinessContinuityPlan.md), and any disaster involving a security compromise is also handled under the [IncidentResponsePlan.md](IncidentResponsePlan.md).

---

## 9. Backup Verification

- The existence and recency of Neon backups/PITR are confirmed during the periodic restore test.
- The integrity of restored data is verified by spot-checking key tables (users, organizations, subscriptions, Amazon credentials) for completeness and consistency.
- Verification results are recorded so backup health can be demonstrated during a vendor security review.

---

## Future Improvements

- Automated, scheduled export of the database to independent, encrypted off-platform storage, to remove single-provider dependency on Neon.
- Automated documentation/export of the required Vercel environment-variable inventory.
- Scheduled, automated restore-verification rather than manual periodic testing.

---

## Document Control

| Field | Value |
|---|---|
| Owner | Founder, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | _[to be completed]_ |
| Next Review Date | 12 months from Approval Date |
