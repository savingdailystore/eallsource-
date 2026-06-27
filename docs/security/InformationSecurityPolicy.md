# Information Security Policy

**EALLsource**

---

## 1. Purpose

This Information Security Policy defines how EALLsource protects the confidentiality, integrity, and availability of its systems and data — including seller data and Amazon Selling Partner API (SP-API) information. It establishes the baseline security expectations that all other EALLsource security policies build upon, and supports EALLsource's obligations under the Amazon SP-API Data Protection Policy and Acceptable Use Policy.

This policy is intended to be realistic for EALLsource's current size and stack. Controls that are not yet in place are identified under **Future Improvements** rather than represented as existing.

---

## 2. Scope

This policy applies to:

- All EALLsource production systems, infrastructure, and data.
- All individuals with access to EALLsource systems (the founder, any employees, and contractors).
- All third-party services used to operate EALLsource: Vercel, Neon PostgreSQL, GitHub, Stripe, and the Amazon SP-API / Login with Amazon platform.

It covers the full technology stack: a Next.js application deployed on Vercel, a Neon PostgreSQL database, Amazon SP-API OAuth integration, and source control and CI/CD on GitHub.

---

## 3. Information Classification

EALLsource classifies information into the following tiers:

| Classification | Definition | Examples |
|---|---|---|
| **Restricted** | Data whose exposure would directly harm sellers or breach Amazon obligations. | Amazon SP-API OAuth refresh/access tokens, LWA client secret, encryption keys, database connection strings, user password hashes. |
| **Confidential** | Business and customer data that is not public but is not a credential. | Seller account details, organization data, sourcing leads, inventory and pricing data, billing records. |
| **Internal** | Operational data intended for the team only. | Application logs, audit logs, internal documentation. |
| **Public** | Information intended for public release. | Marketing site content, Privacy Policy, Terms of Service. |

Restricted data must always be encrypted at rest and in transit, and access must be limited to the minimum necessary (see [AccessControlPolicy.md](AccessControlPolicy.md)).

---

## 4. Acceptable Use

- EALLsource systems and credentials are used only for legitimate business purposes.
- Amazon SP-API access is used solely to provide the EALLsource service to the authorizing seller, consistent with the Amazon Acceptable Use Policy. SP-API data is never used for any other purpose, sold, or shared except as described in the published Privacy Policy.
- Credentials are never shared between individuals, committed to source control, or pasted into public or third-party systems.
- Personal devices used to access production systems must have full-disk encryption and a screen lock enabled.

---

## 5. Authentication

- All access to administrative systems (Vercel, Neon, GitHub, Stripe, the EALLsource admin console) requires individual user accounts. Shared logins are not permitted.
- Authentication to the EALLsource application uses NextAuth with credential-based sign-in over HTTPS; passwords are stored only as bcrypt hashes, never in plaintext.

---

## 6. Multi-Factor Authentication (MFA)

- MFA (TOTP) is enforced for EALLsource application accounts where enabled, and is required for all administrative accounts.
- MFA is enabled on all third-party provider accounts that support it: Vercel, GitHub, Neon, and Stripe.
- Disabling MFA on any administrative account is prohibited.

---

## 7. Password Policy

- Application passwords must be at least 12 characters and include a mix of character types; they are hashed with bcrypt before storage.
- Provider account passwords (Vercel, GitHub, Neon, Stripe) must be unique, generated and stored in a password manager, and not reused across services.
- Passwords suspected of compromise are reset immediately and treated as a security incident under [IncidentResponsePlan.md](IncidentResponsePlan.md).

---

## 8. Encryption

- **In transit:** all traffic to EALLsource and between EALLsource and its providers uses TLS 1.2 or higher. HTTP is redirected to HTTPS at the edge.
- **At rest:** Amazon SP-API tokens and other Restricted secrets are encrypted with **AES-256-GCM** before being written to the database. The Neon database itself is also encrypted at rest by the provider.
- **Key management:** the application encryption key is stored as a Vercel environment variable (a 32-byte/256-bit key), never committed to source control, and rotated if exposure is suspected.

---

## 9. Logging

- Application and API activity is logged through Vercel.
- Security-relevant actions — authentication, Amazon connect/disconnect, billing changes, and administrative actions — are recorded in the application's `AuditLog` table.
- Logs are reviewed when investigating suspected incidents and are preserved as evidence per [IncidentResponsePlan.md](IncidentResponsePlan.md), Section 9.
- Secrets and tokens are never written to logs.

---

## 10. Vendor Management

EALLsource depends on a small set of trusted infrastructure vendors. For each, EALLsource relies on the vendor's published security posture and certifications:

| Vendor | Role | Reliance |
|---|---|---|
| Vercel | Hosting, edge, CI/CD | Platform security, TLS, environment variable encryption. |
| Neon | PostgreSQL database | Encryption at rest, backups, access controls. |
| GitHub | Source control, CI/CD | Repository security, branch protection, Dependabot. |
| Stripe | Payments | PCI-compliant payment processing; EALLsource does not store card data. |
| Amazon (SP-API / LWA) | Seller integration | OAuth authorization and API access. |

Before adopting a new vendor that would process Restricted or Confidential data, EALLsource reviews the vendor's security documentation and data-handling practices.

---

## 11. Asset Management

- EALLsource's primary assets are software and cloud services rather than physical hardware.
- Production assets (Vercel project, Neon database, GitHub repository, domain/DNS, Stripe account) are inventoried and owned by the founder.
- Personal devices used for development and administration are kept patched, encrypted, and screen-locked.

---

## 12. Secure Configuration

- Production secrets are stored as environment variables in Vercel, never in source control.
- The GitHub repository is private with branch protection on the default branch (see [SecureDevelopmentPolicy.md](SecureDevelopmentPolicy.md)).
- The application enforces HTTPS, secure session cookies, and CSRF protection on the Amazon OAuth flow.
- Default or example credentials are never used in production.

---

## 13. Compliance

- EALLsource operates in accordance with the Amazon SP-API Data Protection Policy and Acceptable Use Policy.
- Security incidents affecting Amazon Information are reported to Amazon within 24 hours of confirmation, per [IncidentResponsePlan.md](IncidentResponsePlan.md), Section 8.
- This policy set is designed to support vendor security reviews and Amazon's application-publishing requirements.

---

## 14. Annual Review

This policy is reviewed at least annually, and after any Critical or High-severity incident, by the founder. Updates are versioned in the Document Control section below.

---

## Future Improvements

The following are not yet implemented and represent EALLsource's planned security roadmap:

- Centralized log aggregation and alerting beyond Vercel's built-in logging.
- Formal vendor risk assessments documented per vendor.
- A formal asset inventory document maintained separately from this policy.
- Automated secret-scanning enforcement in CI (currently relies on GitHub push protection and reviewer diligence).

---

## Document Control

| Field | Value |
|---|---|
| Owner | Founder, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | _[to be completed]_ |
| Next Review Date | 12 months from Approval Date |
