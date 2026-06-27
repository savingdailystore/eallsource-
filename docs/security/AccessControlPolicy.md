# Access Control Policy

**EALLsource**

---

## 1. Purpose

This Access Control Policy defines how access to EALLsource systems, data, and credentials is granted, managed, and revoked. It exists to ensure that access is limited to what is necessary, that it is removed when no longer needed, and that privileged and automated access are controlled and accountable. It supports the Amazon SP-API requirement that seller data and credentials be accessible only to authorized parties.

This policy reflects EALLsource's current size — a small team in which the founder holds most administrative access. It describes how that access is controlled today and identifies improvements under **Future Improvements**.

---

## 2. Principle of Least Privilege

Access is granted on a need-to-have basis. Each person and each automated process receives the minimum access required to perform its function, and no more. Broad or standing administrative access is avoided except where the platform offers no finer-grained alternative. Restricted data (Amazon tokens, encryption keys, database credentials) is accessible only to those who operate production systems.

---

## 3. User Provisioning

- New team-member access is granted explicitly by the founder, per system, based on role.
- Access to third-party providers (Vercel, Neon, GitHub, Stripe) is granted by inviting the individual's own named account — never by sharing credentials.
- MFA must be enabled before access to any administrative system is considered active.
- The minimum role that satisfies the person's responsibilities is selected at provisioning time.

---

## 4. User Deprovisioning

- When a person leaves or no longer requires access, their access is revoked promptly — target same business day, and immediately for any departure under adverse circumstances.
- Deprovisioning includes removing the individual from Vercel, Neon, GitHub, and Stripe, and disabling their EALLsource application account.
- Any shared secret the departing person had access to (e.g., if a credential was ever exposed to them) is rotated per [InformationSecurityPolicy.md](InformationSecurityPolicy.md), Section 8.

---

## 5. Administrative Access

- Administrative access to production (Vercel project settings, Neon database, GitHub repository administration, Stripe dashboard, EALLsource admin console) is limited to the founder and any explicitly designated operators.
- The EALLsource admin console is gated by role and restricted to the owner account(s) defined in application code.
- Administrative actions within the application are recorded in the `AuditLog` table.

---

## 6. Role-Based Access

EALLsource's application enforces role-based access control. Roles are scoped to an organization (tenant), so users can only access data belonging to their own organization:

| Role | Access |
|---|---|
| **OWNER** | Full access within their organization, including billing and Amazon connection management. |
| **Member** (non-owner) | Access to operational features within their organization, without billing or connection-management rights. |
| **Platform admin** | EALLsource operators only; cross-organization administrative access via the admin console. |

Authorization is enforced server-side on every API route; client-side checks are never relied upon for access control.

---

## 7. Service Accounts

- Automated processes (e.g., scheduled scan jobs, Stripe webhooks, Amazon SP-API calls) run with scoped credentials, not personal accounts.
- Service credentials are stored only as environment variables in Vercel and are never embedded in source code.
- Each integration uses the narrowest scope the provider allows.

---

## 8. API Credentials

- **Amazon SP-API:** the Login with Amazon (LWA) client ID and client secret authenticate the EALLsource application to Amazon. Per-seller OAuth refresh and access tokens are obtained through Amazon's authorization flow and are encrypted (AES-256-GCM) before storage.
- **Stripe:** secret keys are stored as environment variables and are scoped to the appropriate mode (test vs. live).
- API credentials are rotated when exposure is suspected and as part of incident recovery ([IncidentResponsePlan.md](IncidentResponsePlan.md), Section 10).

---

## 9. Secret Management

- All production secrets — database connection strings, the encryption key, LWA client secret, Stripe keys, Amazon webhook/SP-API values — are stored as Vercel environment variables.
- Secrets are never committed to GitHub. GitHub push protection and code review guard against accidental commits.
- Local development uses a `.env` file that is excluded from source control.
- A change to an environment-variable value requires a redeploy to take effect; this is accounted for during credential rotation.

---

## 10. Session Management

- Application sessions use signed JWTs issued by NextAuth, transmitted over HTTPS with secure, HTTP-only cookies.
- Sessions carry only the identifiers and role/plan needed for authorization.
- Authentication-related actions are auditable, and suspected session compromise triggers a forced password reset under [IncidentResponsePlan.md](IncidentResponsePlan.md).

---

## 11. Quarterly Access Review

At least once per quarter, the founder reviews:

- Who has access to Vercel, Neon, GitHub, and Stripe, and at what privilege level.
- Whether each access is still required, removing any that is not.
- Application owner/admin accounts, confirming they are still appropriate.

Each review is dated and any changes made are noted. Given the current team size this is a lightweight review, but it is performed and recorded so it can be demonstrated during a vendor security review.

---

## Future Improvements

- Single sign-on (SSO) across provider accounts once team size justifies it.
- Time-bound or just-in-time elevation for administrative actions.
- A formally documented access register listing every account and its privilege level, maintained outside this policy.
- Automated alerting on new privileged-access grants.

---

## Document Control

| Field | Value |
|---|---|
| Owner | Founder, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | _[to be completed]_ |
| Next Review Date | 12 months from Approval Date |
