# Incident Response Plan

**EALLsource**

---

## 1. Purpose

This Incident Response Plan ("the Plan") establishes how EALLsource detects, responds to, contains, investigates, recovers from, and documents security incidents affecting its platform, infrastructure, and data — including data and credentials associated with the Amazon Selling Partner API (SP-API).

The Plan exists to:

- Minimize the impact and duration of security incidents.
- Protect seller data, Amazon Information, and internal systems.
- Ensure timely, accurate communication with affected sellers, Amazon, and other stakeholders.
- Preserve evidence needed to investigate root cause and support any required disclosures.
- Create a consistent, repeatable process so that response does not depend on improvisation during a crisis.

This Plan applies to all individuals who operate, maintain, or have administrative access to EALLsource systems, regardless of role or employment status.

---

## 2. Scope

This Plan covers security incidents affecting:

- **Production systems** — the EALLsource web application and all associated services hosted on Vercel.
- **Databases** — the Neon PostgreSQL production database and any backups or snapshots derived from it.
- **Infrastructure** — DNS, domain registration, hosting configuration, environment variables, and CI/CD pipelines (GitHub, Vercel deployments).
- **Seller data** — account information, organization data, sourcing leads, inventory records, and pricing/repricing data belonging to EALLsource customers.
- **Amazon SP-API credentials** — Login with Amazon (LWA) client credentials, application identifiers, and any values used to authenticate EALLsource to Amazon's APIs.
- **OAuth tokens** — seller-authorized SP-API access tokens and refresh tokens stored by EALLsource on behalf of connected seller accounts.
- **Internal administrative systems** — the EALLsource admin console, GitHub source control and CI/CD, Vercel project/team settings, Stripe dashboard, and any other system used to operate the business.

This Plan does not extend to incidents occurring entirely within a third-party provider's infrastructure that do not affect EALLsource systems or data; such events are handled under Section 8 (Communication Plan) as vendor-reported incidents.

---

## 3. Security Incident Definition

A **security incident** is any confirmed or reasonably suspected event that compromises the confidentiality, integrity, or availability of EALLsource systems or data. Examples include, but are not limited to:

- **Unauthorized access** — access to production systems, the database, or an administrative console by a party without authorization.
- **Credential compromise** — exposure or suspected exposure of passwords, API keys, encryption keys, SSH keys, or service-account credentials.
- **Data breach** — unauthorized acquisition, disclosure, or exfiltration of seller data, Amazon Information, or other sensitive data.
- **Malware** — discovery of malicious code in EALLsource's codebase, dependencies, build pipeline, or infrastructure.
- **Ransomware** — any attempt to encrypt, lock, or hold EALLsource systems or data for ransom.
- **Insider threat** — misuse of authorized access by an employee, contractor, or other insider for unauthorized purposes.
- **Lost or exposed secrets** — accidental disclosure of credentials or secrets (e.g., committed to a public repository, pasted into a public forum, or exposed in logs or screenshots).
- **API abuse** — abnormal or unauthorized use of EALLsource's APIs, including abuse of Amazon SP-API access obtained through EALLsource.
- **Denial of service** — an attack or event that degrades or disrupts the availability of EALLsource's application or APIs.
- **Supply-chain compromise** — compromise of a dependency, build tool, CI/CD pipeline, or third-party service (e.g., Vercel, Neon, GitHub, Stripe) that affects EALLsource.

Any EALLsource team member who observes behavior matching, or reasonably resembling, one of these categories must treat it as a suspected incident and initiate Section 6 (Incident Response Process) without waiting for confirmation.

---

## 4. Incident Severity

Every incident is assigned a severity level at the time it is identified, and the level is re-evaluated as new facts emerge. Severity determines response urgency, escalation, and communication obligations.

### Critical
- Confirmed unauthorized access to production data, Amazon SP-API tokens/credentials, or the production database.
- Confirmed data breach involving seller data or Amazon Information.
- Active ransomware, destructive malware, or an attacker with persistent access to production systems.
- Complete loss of production availability with no known recovery path.

### High
- Strong evidence (not yet fully confirmed) of unauthorized access or data exposure.
- Compromise of a credential with the ability to access production systems, the database, or Amazon SP-API (e.g., a leaked LWA client secret or database connection string), even if no exploitation is yet confirmed.
- A vulnerability under active exploitation, or a denial-of-service event materially degrading the platform.
- Loss of availability affecting most or all customers for an extended period.

### Medium
- A vulnerability or misconfiguration discovered that could plausibly lead to unauthorized access or data exposure, but with no evidence of exploitation.
- Suspicious but inconclusive activity (e.g., unusual authentication patterns, anomalous API usage) requiring investigation.
- Partial or degraded availability affecting a subset of customers or a non-critical feature.
- A single seller's Amazon connection behaving unexpectedly in a way that suggests possible credential or token issues, isolated to that account.

### Low
- A security-relevant observation with no plausible path to data exposure or system compromise (e.g., a failed phishing attempt against a team member, a single failed login).
- A minor configuration issue identified and correctable without evidence it was ever exploited.
- A near-miss caught by existing controls (e.g., a secret nearly committed to source control but removed before push).

When in doubt about which level applies, the incident is treated at the **higher** severity until the Incident Commander determines otherwise.

---

## 5. Incident Response Team

EALLsource is a small organization. The roles below define **responsibilities**, not headcount — in practice, one person may hold multiple roles simultaneously. Roles are assigned per-incident by the Founder / Incident Commander at the time response begins.

### Founder / Incident Commander
- Owns the incident end-to-end: declares the incident, assigns severity, and decides when it is resolved.
- Makes final decisions on containment actions, customer communication, and Amazon notification.
- Has authority to take any action necessary to protect seller data and systems, including taking systems offline.
- Approves the post-incident review and any resulting policy or engineering changes.

### Engineering Lead
- Leads technical investigation: identifies the affected code, data, or systems and determines root cause.
- Implements containment and eradication measures (e.g., patching a vulnerability, rotating credentials, disabling a compromised feature).
- Leads recovery: restores systems to a known-good state and verifies integrity before resuming normal operation.

### Infrastructure Lead
- Manages hosting, DNS, database, and CI/CD systems (Vercel, Neon, GitHub) during the incident.
- Executes infrastructure-level containment (e.g., revoking access tokens, rotating environment variables, disabling deployments, restricting database access).
- Preserves infrastructure-level logs and configuration state for the investigation.

### Customer Communications
- Drafts and sends communications to affected sellers in line with Section 8.
- Tracks which customers are affected and ensures they receive accurate, timely updates.
- Coordinates the public-facing support inbox (`support@eallsource.com`) during the incident so customer inquiries are answered consistently.

### Legal / Compliance
- Assesses notification obligations to Amazon, regulators, and affected individuals.
- Reviews external communications for accuracy and compliance before they are sent.
- Maintains records required to demonstrate compliance with Amazon's Acceptable Use Policy and Data Protection Policy and applicable law.

**In a single-founder or very small team, the Founder may fulfill all five roles.** In that case, the Founder must still work through each role's checklist explicitly, in order, rather than treating the incident informally — the structure of this Plan is what prevents steps from being skipped under pressure.

---

## 6. Incident Response Process

The response to any security incident follows seven phases. Phases are sequential but may overlap in practice (e.g., containment can begin while identification is still narrowing scope).

### 6.1 Preparation
Maintained on an ongoing basis, before any incident occurs:
- Keep this Plan current and accessible to anyone who may need it (see Section 12).
- Maintain MFA enforcement on all EALLsource accounts and administrative systems.
- Maintain encrypted storage of all credentials and OAuth tokens (AES-256-GCM at rest, TLS 1.2+ in transit).
- Keep the contact list in Section 13 current.

### 6.2 Detection
An incident is first noticed through one of the sources in Section 7, or reported by a customer, team member, or Amazon. The person who detects a potential incident immediately notifies the Founder / Incident Commander.

### 6.3 Identification
The Incident Commander and Engineering Lead confirm whether a security incident has actually occurred, determine its scope (which systems, data, and accounts are affected), and assign an initial severity level per Section 4. A working timeline is started immediately (see Section 9).

### 6.4 Containment
Take immediate action to stop the incident from continuing or spreading, prioritizing speed over completeness. Examples: revoking a compromised credential, disabling a vulnerable endpoint, rotating an exposed secret, suspending an affected account, or taking a system offline. Containment actions are logged with timestamps as they are taken.

### 6.5 Eradication
Remove the root cause — e.g., patch the vulnerability, remove malicious code, close the misconfiguration, terminate unauthorized access. Eradication is not considered complete until the Engineering Lead confirms the attacker or vulnerability has no remaining path back into the system.

### 6.6 Recovery
Restore affected systems and data to normal, verified operation following Section 10. Systems are returned to production only after integrity is confirmed and monitoring is in place to detect recurrence.

### 6.7 Lessons Learned
Within 10 business days of resolution, conduct the post-incident review described in Section 11 and track resulting action items to completion.

---

## 7. Detection Sources

EALLsource relies on the following sources to detect potential security incidents:

- **Application logs** — Next.js server and API route logs, captured via Vercel.
- **Audit logs** — the EALLsource `AuditLog` table, which records authentication, Amazon connect/disconnect, billing, and administrative actions.
- **Authentication failures** — repeated or anomalous failed login or MFA attempts.
- **Infrastructure alerts** — Vercel deployment and runtime alerts.
- **Cloud provider alerts** — notifications from Vercel or Neon regarding abuse, abnormal usage, or platform-level security events.
- **Database alerts** — Neon PostgreSQL connection, query, and resource alerts.
- **Error monitoring** — unhandled exceptions and elevated error rates surfaced through Vercel logs.
- **User reports** — sellers or team members reporting suspicious activity, unexpected emails, or unexpected account behavior.
- **Amazon notifications** — security or policy notices from Amazon Selling Partner API regarding the EALLsource application or connected seller accounts.

---

## 8. Communication Plan

### Internal communication
The Incident Commander coordinates all internal communication for the duration of the incident. Status updates are shared with everyone holding a role under Section 5 as material facts change, not on a fixed schedule — speed of information-sharing takes priority over formality during an active incident.

### Customer communication
Affected sellers are notified as soon as the facts are sufficiently confirmed to communicate accurately, and in any case without undue delay. Customer Communications drafts the notice; the Incident Commander approves it before it is sent. Notices state, in plain language: what happened, what data or systems were affected, what EALLsource has done in response, and what action (if any) the customer should take. Speculation is avoided — only confirmed facts are communicated, with follow-up updates as the investigation progresses.

### Amazon notification
EALLsource will notify Amazon within 24 hours of confirmation of any security incident affecting Amazon Information, in accordance with applicable agreements.

This applies regardless of whether the incident also requires customer or regulatory notification — the Amazon notification clock starts at confirmation, not at full resolution. The Founder / Incident Commander, with Legal / Compliance, is responsible for ensuring this notification is sent through Amazon's designated security contact channel.

### Regulatory notification when required
Legal / Compliance assesses, for every incident involving personal data, whether notification to a regulator or affected individuals is required under applicable law. Where required, notification is made within the timeframe required by the applicable law or regulation governing the affected individuals.

---

## 9. Evidence Handling

Preserving evidence correctly is what makes root-cause analysis and any required disclosure possible after the fact. As soon as an incident is identified:

- **Log preservation** — export and securely store relevant Vercel application logs, audit logs, and authentication logs covering the suspected incident window before they age out of the platform's retention window.
- **Database snapshots** — take a Neon database snapshot/branch at the time of identification, before any remediation that could alter affected data, so the pre-remediation state is preserved.
- **Timeline creation** — maintain a single, timestamped, append-only timeline of every observation, decision, and action taken during the incident, starting from the moment of detection.
- **Forensic copies** — where a specific system, deployment, or account is implicated, preserve a copy of its relevant state (code revision, environment configuration, account records) separate from the live system before remediation changes it.
- **Access restrictions** — limit access to preserved evidence to the Incident Commander and individuals directly involved in the investigation.
- **Chain of custody** — record who collected each piece of evidence, when, and where it is stored, so its origin can be accounted for if the evidence is later relied upon.

---

## 10. Recovery

Recovery is only considered complete once all applicable steps below are done and verified — not merely attempted:

- **Credential rotation** — rotate all credentials that were exposed, suspected of exposure, or in scope of the incident, including database connection strings, LWA client secret, encryption keys, and admin account passwords.
- **OAuth token revocation** — revoke and re-issue affected Amazon SP-API refresh and access tokens; affected sellers must re-authorize their connection through Amazon's OAuth flow.
- **Password reset** — force a password reset for any user account suspected of compromise, and for all administrative accounts if the scope of compromise is unclear.
- **Infrastructure rebuild** — where a system may have been altered by an attacker (e.g., a compromised deployment or dependency), rebuild from a known-good source rather than attempting to "clean" the existing instance.
- **Database validation** — validate that the database has not been tampered with beyond the scope already identified, using the pre-remediation snapshot from Section 9 as a comparison baseline.
- **Integrity verification** — confirm that restored code, configuration, and data match expected, trusted state before returning systems to production.
- **Monitoring after recovery** — apply heightened monitoring of the affected systems and accounts for a period following recovery (minimum 30 days) to detect any recurrence or residual compromise.

---

## 11. Post-Incident Review

Within 10 business days of resolving any Medium-severity or higher incident, the Incident Commander leads a post-incident review covering:

- **Root cause analysis** — the underlying technical or process cause, not just the immediate trigger.
- **Timeline** — a clean, final version of the timeline built during the incident (Section 9), from detection through recovery.
- **Corrective actions** — specific, assigned, dated action items to prevent recurrence.
- **Policy updates** — any changes this Plan or other internal policies require as a result of the incident.
- **Engineering improvements** — code, architecture, or monitoring changes identified as necessary or beneficial.
- **Customer impact assessment** — a factual accounting of which customers were affected and how, used to confirm that all required customer communications (Section 8) were completed.

The review is documented in writing and retained. Action items are tracked to completion; the review is not considered closed until they are done or formally deferred with a reason.

---

## 12. Testing

- Incident response tabletop exercises are conducted **at least annually**, simulating a realistic scenario (e.g., a leaked credential or a reported data exposure) and walking through this Plan end-to-end.
- This Incident Response Plan is reviewed **every six months**, or immediately following any Critical or High-severity incident, whichever comes first.
- Each tabletop exercise and review is dated and any gaps identified are tracked as action items until resolved.

---

## 13. Contact List

| Role | Contact |
|---|---|
| Security Email | security@eallsource.com |
| Support Email | support@eallsource.com |
| Emergency Contact | _[Founder name and phone number — to be completed]_ |
| Hosting Provider (Vercel) | Vercel Support — https://vercel.com/support |
| Database Provider (Neon) | Neon Support — https://neon.tech/docs/introduction/support |
| Amazon Support (SP-API / Seller Central) | Amazon Selling Partner Support — via Seller Central Developer Console |

> **Action item:** add a dedicated `security@eallsource.com` mailbox (forwarding to the same destination as `support@eallsource.com` is acceptable) and complete the Emergency Contact row before this Plan is considered fully operational.

---

## 14. Document Control

| Field | Value |
|---|---|
| Owner | Founder / Incident Commander, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | _[date of last review — to be completed]_ |
| Next Review Date | 6 months from Approval Date, per Section 12 |

---

## Incident Response Checklist

Use this checklist during a live incident. Work through it in order; do not skip steps under time pressure.

**Detection & Identification**
- [ ] Note the time, source, and nature of the first indication of a possible incident.
- [ ] Notify the Founder / Incident Commander immediately.
- [ ] Confirm whether this is a genuine security incident (Section 3).
- [ ] Assign an initial severity level (Section 4).
- [ ] Start the incident timeline (Section 9) — first entry: detection time and source.

**Containment**
- [ ] Identify and immediately revoke/disable any compromised credential, token, or access path.
- [ ] If production data or systems are actively being accessed without authorization, contain access first, investigate second.
- [ ] Take a Neon database snapshot before any remediation changes the data.
- [ ] Export relevant Vercel application/audit logs before they age out of retention.
- [ ] Log every containment action taken, with timestamp, in the incident timeline.

**Eradication**
- [ ] Identify root cause.
- [ ] Remove/patch the root cause (vulnerability, malicious code, misconfiguration).
- [ ] Confirm with the Engineering Lead that no remaining access path exists.

**Recovery**
- [ ] Rotate all credentials in scope (database, LWA client secret, encryption keys, admin passwords).
- [ ] Revoke and prompt re-authorization of affected Amazon SP-API OAuth tokens.
- [ ] Force password reset for any affected or uncertain accounts.
- [ ] Rebuild from known-good source rather than patching in place, if compromise scope is unclear.
- [ ] Validate database integrity against the pre-incident snapshot.
- [ ] Confirm restored systems match expected, trusted state before resuming normal operation.
- [ ] Apply heightened monitoring for at least 30 days post-recovery.

**Communication**
- [ ] Determine whether Amazon Information was affected. If yes: notify Amazon within 24 hours of confirmation.
- [ ] Determine whether affected sellers must be notified. If yes: draft notice, get Incident Commander approval, send.
- [ ] Determine whether regulatory notification is required (Legal / Compliance). If yes: notify within the legally required timeframe.
- [ ] Keep internal stakeholders (Section 5 roles) updated as facts change.

**Closure**
- [ ] Confirm all checklist items above are complete or explicitly waived with reason.
- [ ] Finalize the incident timeline.
- [ ] Schedule the post-incident review within 10 business days (Section 11).
- [ ] Track corrective actions to completion.
