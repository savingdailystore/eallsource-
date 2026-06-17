# Incident Response Plan — EALLsource

**Owner:** EALLsource
**Document version:** 1.0
**Effective date:** 2026-06-16
**Last reviewed:** 2026-06-16
**Next review due:** 2026-12-16 (reviewed at least every 6 months)

This plan governs how EALLsource detects, responds to, and reports security
incidents, with specific procedures for incidents involving **Amazon Information**
obtained through the Selling Partner API (SP-API), in accordance with the Amazon
Acceptable Use Policy (AUP) and Data Protection Policy (DPP).

---

## 1. Purpose & Scope

This plan applies to all systems, personnel, and third-party services that store,
process, or transmit Amazon Information, including:

- The EALLsource web application (Next.js, hosted on Vercel)
- The application database (Neon PostgreSQL, AWS us-east-1)
- Amazon SP-API credentials and tokens (LWA refresh/access tokens), which are
  encrypted at rest with AES-256-GCM and transmitted only over TLS
- Any developer workstations or accounts with access to the above

"Amazon Information" means any data obtained through SP-API, including seller
inventory data, order data, and the seller's authorization tokens.

---

## 2. Roles & Responsibilities

| Role | Responsibility | Assigned to |
|------|----------------|-------------|
| **Incident Response Lead (IRL)** | Owns the response, makes containment decisions, coordinates notifications | EALLsource Owner |
| **Technical Responder** | Investigates, contains, eradicates, and recovers affected systems | EALLsource Owner / engineering |
| **Communications/Notification Owner** | Sends required notifications to Amazon, affected sellers, and authorities within required timeframes | EALLsource Owner |

> A single individual may hold multiple roles. Contact details and a current
> on-call assignment are maintained in the internal security contact list.
> **Primary security contact:** savingdailystore@gmail.com

---

## 3. Incident Severity Classification

| Severity | Definition | Examples |
|----------|------------|----------|
| **Critical** | Confirmed unauthorized access to, or exposure of, Amazon Information | Token leak, database breach, exposed credentials |
| **High** | Likely exposure or loss of integrity of Amazon Information | Compromised admin account, malware on a system with data access |
| **Medium** | Security weakness with potential to lead to exposure | Misconfigured access control, unpatched vulnerability |
| **Low** | Minor issue with no data-exposure risk | Failed login spikes, non-sensitive misconfiguration |

---

## 4. Detection & Analysis

Sources of detection include application logs, Vercel and Neon monitoring/alerts,
dependency vulnerability alerts (e.g., GitHub Dependabot), and reports from
personnel or external parties.

On detection, the IRL:
1. Records the date/time of detection (starts the 24-hour notification clock).
2. Assigns a severity level.
3. Determines whether **Amazon Information** is or may be involved.
4. Opens an incident record (timeline, affected systems, evidence).

---

## 5. Containment, Eradication & Recovery

1. **Contain** — isolate affected systems; revoke/rotate compromised credentials
   (including SP-API LWA tokens via re-authorization and Amazon application
   credential rotation); disable affected accounts.
2. **Eradicate** — remove the root cause (patch, fix misconfiguration, remove
   malicious access).
3. **Recover** — restore from known-good state, re-enable services, and verify
   integrity before resuming normal operation.
4. **Preserve evidence** — retain logs and artifacts needed for investigation and
   reporting.

---

## 6. Notification Procedures (24-Hour Requirement)

If an incident involves Amazon Information, the Communications/Notification Owner
**notifies Amazon Security at security@amazon.com within 24 hours of detection.**
The notification includes, to the extent known: nature of the incident, data
involved, time of detection, and containment actions taken. EALLsource continues
to cooperate with Amazon and provides updates as the investigation progresses.

Additional notifications, as applicable and within required timeframes:
- **Affected sellers** whose data may have been impacted.
- **Regulatory authorities and data subjects** where required by applicable law.

A current notification contact list (Amazon Security, hosting providers, legal)
is maintained internally.

---

## 7. Post-Incident Review

Within 5 business days of resolving a Critical or High incident, the IRL conducts
a post-incident review documenting: timeline, root cause, impact, response
effectiveness, and corrective actions. Corrective actions are tracked to
completion.

---

## 8. Plan Maintenance & Review

- This plan is **reviewed and updated at least every 6 months**, and after any
  Critical/High incident or material change to systems handling Amazon Information.
- Each review updates the "Last reviewed" and "Next review due" dates above.
- Personnel with data access are made aware of this plan and their responsibilities.

---

## 9. Data Protection Controls (Summary)

- **Encryption in transit:** all traffic over TLS (HTTPS).
- **Encryption at rest:** SP-API tokens encrypted with AES-256-GCM; database
  encryption provided by the managed database provider (Neon/AWS).
- **Access control:** least-privilege; application access is role-based
  (Owner/Admin/Analyst/Viewer); credentials are never logged or exposed client-side.
- **Secret management:** application and Amazon credentials stored as environment
  secrets, never committed to source control.
- **Data retention/deletion:** Amazon Information is retained only as long as
  needed to provide the service and deleted upon seller disconnection or request,
  consistent with the Amazon DPP.
