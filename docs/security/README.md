# EALLsource Security Documentation

This directory contains EALLsource's security policies and plans. They describe EALLsource's actual security posture as a small, cloud-native SaaS company and are intended to support vendor security reviews and Amazon Selling Partner API (SP-API) application requirements.

Each document distinguishes between controls that are **in place today** and planned controls, which are listed under a clearly labeled **Future Improvements** section rather than represented as already implemented.

## Documents

| Document | Covers |
|---|---|
| [InformationSecurityPolicy.md](InformationSecurityPolicy.md) | Overarching security policy: classification, auth, MFA, encryption, logging, vendors, compliance. |
| [AccessControlPolicy.md](AccessControlPolicy.md) | Least privilege, provisioning/deprovisioning, admin & role-based access, secrets, sessions, quarterly review. |
| [DataRetentionPolicy.md](DataRetentionPolicy.md) | Retention periods and deletion for seller data, OAuth tokens, logs, and backups. |
| [BackupAndRecoveryPolicy.md](BackupAndRecoveryPolicy.md) | Neon, GitHub, and Vercel backups; recovery objectives; restore testing; disaster recovery. |
| [VulnerabilityManagementPolicy.md](VulnerabilityManagementPolicy.md) | Dependency updates, CVE monitoring, Dependabot, patch timelines, responsible disclosure. |
| [SecureDevelopmentPolicy.md](SecureDevelopmentPolicy.md) | Secure SDLC, code review, CI/CD, branch protection, deployment, security verification. |
| [IncidentResponsePlan.md](IncidentResponsePlan.md) | Detecting, responding to, and recovering from security incidents, including Amazon notification. |
| [BusinessContinuityPlan.md](BusinessContinuityPlan.md) | Critical systems, recovery priorities, vendor dependencies, disaster scenarios. |
| [SecureDevelopmentAudit.md](SecureDevelopmentAudit.md) | Code-level security audit (Version 2.1, post-remediation re-audit with NF-1 resolved) — findings, severities, SP-API readiness, score (86/100). |
| [SecurityRemediationReport.md](SecurityRemediationReport.md) | What was fixed from the Round 1 audit, how, and with what tests — read alongside the audit above. |

## Technology context

These policies are grounded in EALLsource's actual stack:

- **Next.js** application **hosted on Vercel** (edge, CI/CD, deployments)
- **Neon PostgreSQL** database (system of record, point-in-time recovery)
- **Amazon SP-API** via Login with Amazon OAuth (non-PII roles)
- **GitHub** for source control, branch protection, and Dependabot
- **AES-256-GCM** encryption for credentials and OAuth tokens at rest; **TLS 1.2+** in transit
- **MFA** enforced on administrative and provider accounts

## Status

Most documents are at **Version 1.0** and carry placeholder approval/review dates in their Document Control sections, to be completed on formal approval by the owner. `SecureDevelopmentAudit.md` is at **Version 2.1** following an independent post-remediation re-audit (Round 2) that verified the fixes in `SecurityRemediationReport.md`, found one new finding (NF-1, Medium — raw error text in `ScanJob.error`), and has since had that finding fixed and independently re-verified within the same document.
