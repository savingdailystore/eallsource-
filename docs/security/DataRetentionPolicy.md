# Data Retention Policy

**EALLsource**

---

## 1. Purpose

This Data Retention Policy defines how long EALLsource retains different categories of data, how data is deleted on request or account closure, and how data is securely destroyed. It supports the Amazon SP-API Data Protection Policy requirement to retain Amazon Information only as long as necessary to provide the service, and to delete it when no longer required.

---

## 2. Scope

This policy applies to all data EALLsource stores in its Neon PostgreSQL database, in Vercel logs, and in backups derived from those systems.

---

## 3. Seller Data

- Seller account data, organization records, sourcing leads, inventory, and pricing data are retained for as long as the account is active, because they are required to provide the service.
- When an account is closed (Section 8) or a deletion request is received (Section 7), seller data is deleted within 30 days.

---

## 4. OAuth Tokens

- Amazon SP-API OAuth refresh and access tokens are stored encrypted with AES-256-GCM and retained only while the seller's connection is active.
- When a seller disconnects their Amazon account, the stored tokens are deactivated and removed.
- Tokens are also revoked and removed on account closure and as part of incident recovery ([IncidentResponsePlan.md](IncidentResponsePlan.md), Section 10).
- Amazon Information derived from SP-API is not retained beyond the period necessary to provide the service.

---

## 5. Audit Logs

- Records in the `AuditLog` table (authentication, Amazon connect/disconnect, billing, administrative actions) are retained for **12 months** to support security investigations and accountability.
- Audit logs relevant to an active incident are preserved beyond their normal retention period as evidence ([IncidentResponsePlan.md](IncidentResponsePlan.md), Section 9) until the incident is closed.

---

## 6. Application Logs

- Vercel application and request logs are retained according to the Vercel plan's log-retention window.
- Application logs are operational data and are not relied upon as a long-term record; security-relevant events are captured separately in the audit log.
- Logs never contain secrets or OAuth tokens.

---

## 7. Database Backups

- Neon point-in-time recovery and backups are retained according to the Neon plan's backup-retention window (see [BackupAndRecoveryPolicy.md](BackupAndRecoveryPolicy.md)).
- Because backups may contain copies of data that has since been deleted from the live database, deleted data may persist in backups until those backups age out of their retention window. This is disclosed here for transparency; backups are encrypted at rest and access-controlled.

---

## 8. Deletion Requests

- A data deletion request may be submitted by a user via `support@eallsource.com`.
- Upon verifying the requester's identity and authority over the account, EALLsource deletes the associated personal and seller data from the live database within **30 days**.
- The requester is informed when deletion is complete, and that residual copies in encrypted backups will expire on the normal backup-retention schedule.

---

## 9. Account Closure

- When an organization closes its account, EALLsource revokes and removes its Amazon OAuth tokens immediately and deletes its seller data from the live database within **30 days**.
- Billing records required for legitimate financial and tax purposes may be retained for the period required by applicable law, separate from operational seller data.

---

## 10. Secure Destruction

- Data deletion in the live system is performed via database deletion. For EALLsource's cloud-hosted stack, secure destruction relies on the providers' (Neon, Vercel) media-sanitization and deletion practices.
- Cryptographic protection provides defense in depth: because Restricted secrets are stored encrypted with AES-256-GCM, destruction or rotation of the encryption key renders associated encrypted values unrecoverable.

---

## 11. Retention Schedule

| Data category | Retention period | Trigger for deletion |
|---|---|---|
| Seller account & organization data | Life of account | Account closure or deletion request → deleted within 30 days |
| Sourcing leads, inventory, pricing data | Life of account | Account closure or deletion request → deleted within 30 days |
| Amazon SP-API OAuth tokens | While connection active | Disconnect, account closure, or incident → removed immediately |
| Audit logs (`AuditLog`) | 12 months | Aged out after 12 months (longer if held as incident evidence) |
| Application logs (Vercel) | Per Vercel plan retention window | Aged out automatically by provider |
| Database backups (Neon) | Per Neon plan retention window | Aged out automatically by provider |
| Billing records | As required by applicable law | Aged out after legal retention period |

---

## Future Improvements

- Automated, scheduled deletion jobs to enforce retention windows programmatically rather than on request.
- A self-service account-deletion flow in the application UI.
- Documented confirmation from each provider of their media-sanitization practices, retained for vendor reviews.

---

## Document Control

| Field | Value |
|---|---|
| Owner | Founder, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | _[to be completed]_ |
| Next Review Date | 12 months from Approval Date |
