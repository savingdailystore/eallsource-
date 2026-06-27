# Secure Development Policy

**EALLsource**

---

## 1. Purpose

This Secure Development Policy defines how EALLsource builds, reviews, and deploys software securely. It ensures that security is considered throughout the development lifecycle and that changes reach production through a controlled, verifiable process. It supports the integrity of systems handling Amazon Information.

---

## 2. Scope

This policy applies to all development of the EALLsource Next.js application and its supporting configuration, carried out in the GitHub repository and deployed through Vercel.

---

## 3. Secure SDLC

EALLsource follows a lightweight but disciplined secure development lifecycle appropriate to its size:

1. Changes are made on a branch, not directly on the default branch.
2. Code is verified locally (type-check and build) before being proposed.
3. Changes are reviewed before merge.
4. Merges to the default branch deploy to production through Vercel.
5. Security-relevant changes (authentication, authorization, credential handling, Amazon/Stripe integration) receive additional scrutiny.

Security considerations — least privilege, input validation, correct authorization, and safe handling of secrets — are part of design and review, not an afterthought.

---

## 4. Code Review

- Changes are reviewed before reaching production, with particular attention to authentication, authorization, handling of Restricted data, and changes to the Amazon SP-API and Stripe integrations.
- Reviews check that server-side authorization is enforced on new or modified API routes and that no secrets are introduced into source code.
- For a solo founder, "review" means a deliberate self-review against this policy's checklist prior to deployment; as the team grows, peer review on pull requests becomes the standard. This distinction is stated honestly rather than implying a multi-reviewer process that does not yet exist.

---

## 5. Dependency Scanning

- GitHub Dependabot and `npm audit` are used to detect vulnerable dependencies, per [VulnerabilityManagementPolicy.md](VulnerabilityManagementPolicy.md).
- New dependencies are added deliberately and kept to what is necessary, reducing supply-chain exposure.

---

## 6. Secrets Management

- Secrets are never committed to the repository. They are stored as Vercel environment variables and, for local development, in a git-ignored `.env` file.
- GitHub secret-scanning push protection is relied upon to catch accidental secret commits, alongside reviewer diligence.
- The application encryption key, database connection string, LWA client secret, and Stripe keys are treated as Restricted (see [InformationSecurityPolicy.md](InformationSecurityPolicy.md)).

---

## 7. CI/CD

- Continuous integration and deployment run through GitHub and Vercel.
- Each push/merge triggers a Vercel build; a failed build does not deploy.
- Production deploys are tied to specific commits, providing traceability from running production back to source (and enabling rollback per [BackupAndRecoveryPolicy.md](BackupAndRecoveryPolicy.md), Section 5).

---

## 8. Branch Protection

- The default (`main`) branch is protected.
- Direct destructive history rewrites are prevented, and changes flow through the standard branch-and-merge process.
- Branch protection preserves an auditable history of what changed, when, and by whom.

---

## 9. Testing

- Every change is verified with TypeScript type-checking (`tsc --noEmit`) and a full production build (`next build`) before deployment; neither may fail.
- Behavioral verification is performed for changes to critical flows (authentication, billing/Stripe webhooks, Amazon OAuth, repricing) — including reviewing production logs after deployment to confirm correct behavior.
- Regressions discovered in production are corrected through the same controlled process.

---

## 10. Production Deployment

- Production deployment occurs by merging to the default branch, which Vercel builds and promotes.
- Environment-variable changes require an explicit redeploy to take effect; this is accounted for when rotating credentials or changing configuration.
- Deployments are monitored immediately after release using Vercel logs to detect errors introduced by the change.

---

## 11. Security Verification

Before and after deploying security-relevant changes, the following are verified:

- Authorization is enforced server-side on affected routes.
- No secret values are present in code, logs, or client-visible output.
- Restricted data remains encrypted at rest (AES-256-GCM) and in transit (TLS).
- Authentication and session handling behave as expected.
- Post-deployment logs show no new authentication, authorization, or integration errors.

Any security regression discovered is treated as an incident under [IncidentResponsePlan.md](IncidentResponsePlan.md) if it resulted in actual exposure.

---

## Future Improvements

- Automated test suite (unit/integration) run as a required CI gate, beyond type-check and build.
- Required pull-request reviews enforced by branch-protection rules once a second engineer is onboarded.
- Static analysis (SAST) and automated secret-scanning enforced in CI.
- A pre-deployment security checklist enforced mechanically rather than by convention.

---

## Document Control

| Field | Value |
|---|---|
| Owner | Founder, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | _[to be completed]_ |
| Next Review Date | 12 months from Approval Date |
