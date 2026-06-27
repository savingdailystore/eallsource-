# Business Continuity Plan

**EALLsource**

---

## 1. Purpose

This Business Continuity Plan (BCP) defines how EALLsource maintains or restores its service in the face of significant disruption — a major outage, loss of a critical vendor, or a disaster affecting the founder's ability to operate. It complements the [IncidentResponsePlan.md](IncidentResponsePlan.md) (which addresses security incidents) and the [BackupAndRecoveryPolicy.md](BackupAndRecoveryPolicy.md) (which addresses data and code recovery).

---

## 2. Scope

This plan covers continuity of the EALLsource SaaS platform and the vendor services it depends on. It is written for EALLsource's current reality as a small, cloud-native operation with no physical infrastructure of its own.

---

## 3. Critical Systems

The systems whose disruption would directly interrupt EALLsource, in order of criticality:

| System | Function | Impact if lost |
|---|---|---|
| Neon PostgreSQL | System of record for all seller data | Total service interruption; potential data loss |
| Vercel | Application hosting, edge, CI/CD | Application unreachable |
| Amazon SP-API / LWA | Seller integration | Sellers cannot connect or sync; core feature unavailable |
| GitHub | Source code, deployment pipeline | Cannot deploy changes; codebase still recoverable from clones |
| Stripe | Subscription billing | Billing interrupted; application otherwise functional |
| DNS (Vercel) + domain | Routing to the application and email forwarding | Site and `@eallsource.com` email unreachable |

---

## 4. Recovery Priorities

In a disruption affecting multiple systems, recovery is prioritized as:

1. **Database (Neon)** — restore the system of record first; everything depends on it.
2. **Application hosting (Vercel)** — restore reachability and the running application.
3. **Amazon SP-API connectivity** — restore the core seller-facing integration.
4. **DNS and email** — restore routing and the support/security contact channels.
5. **Billing (Stripe)** — restore last; its interruption does not prevent sellers from using the product.

---

## 5. Vendor Dependencies

- EALLsource depends on third-party providers (Neon, Vercel, GitHub, Stripe, Amazon) that maintain their own resilience and continuity programs. For provider-side outages, EALLsource's primary recourse is to monitor the provider's status page and communicate with affected customers.
- To limit single-vendor risk, the codebase is portable: it is a standard Next.js application that can be redeployed to alternative hosting, and the database is standard PostgreSQL that can be migrated to another provider if necessary.
- Prolonged loss of a provider triggers evaluation of the migration paths noted in Section 8.

---

## 6. Communication

- During a continuity event, customers are kept informed through the support channel (`support@eallsource.com`) and direct notification, consistent with the customer-communication approach in [IncidentResponsePlan.md](IncidentResponsePlan.md), Section 8.
- Status updates state what is affected, what is being done, and the expected path to restoration, using confirmed facts only.
- If the event is also a security incident, the Incident Response Plan's communication obligations — including Amazon notification within 24 hours of confirmation — apply.

---

## 7. Manual Operations

- During an outage of an automated component, essential customer-facing functions can be handled manually for a limited period: support and billing questions are answered by email, and account or plan changes can be made directly in the relevant provider dashboard (e.g., Stripe) by the founder.
- Scheduled background jobs (e.g., sourcing scans) are non-essential during an outage and resume automatically once the platform recovers; no manual intervention is required to preserve data integrity.

---

## 8. Disaster Scenarios

| Scenario | Response |
|---|---|
| **Vercel outage** | Monitor Vercel status; if prolonged, redeploy the application to alternative hosting from GitHub and repoint DNS. |
| **Neon outage or data corruption** | Restore via Neon point-in-time recovery; if the provider is lost, migrate the PostgreSQL database to an alternative provider. |
| **GitHub unavailable** | Continue operating the already-deployed application; restore the repository from a local clone; defer non-urgent deployments. |
| **Amazon SP-API disruption** | Communicate to sellers; queue/retry affected operations; no action restores Amazon's platform, so focus on customer communication. |
| **Stripe disruption** | Billing pauses; product remains usable; reconcile billing once restored. |
| **Loss of founder availability** | A documented runbook and access-recovery plan (see Future Improvements) enables a designated backup to access critical systems. This is the largest current single point of failure and is acknowledged honestly. |
| **DNS/domain loss** | Recover the domain through the registrar; restore DNS records (including the ImprovMX MX/SPF records) in Vercel DNS. |

---

## 9. Annual Testing

- This plan is tested at least annually, typically in conjunction with the incident-response tabletop exercise ([IncidentResponsePlan.md](IncidentResponsePlan.md), Section 12), by walking through one or more disaster scenarios from Section 8.
- Testing confirms that backups restore (Section cross-reference: [BackupAndRecoveryPolicy.md](BackupAndRecoveryPolicy.md), Section 7), that the application can be redeployed, and that the contact and communication paths work.
- The plan is reviewed and updated at least annually, and tests are dated with any gaps tracked to resolution.

---

## Future Improvements

- A documented "break-glass" access-recovery procedure so a trusted second party can operate critical systems if the founder is unavailable — the highest-priority continuity gap today.
- Pre-validated, scripted migration paths for hosting and database to reduce recovery time if a primary vendor is lost.
- A public status page for customer communication during outages.
- Independent off-platform database backups (see [BackupAndRecoveryPolicy.md](BackupAndRecoveryPolicy.md), Future Improvements).

---

## Document Control

| Field | Value |
|---|---|
| Owner | Founder, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | _[to be completed]_ |
| Next Review Date | 12 months from Approval Date |
