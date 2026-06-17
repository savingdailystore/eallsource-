# Data Protection & Security Controls — EALLsource

**Owner:** EALLsource
**Version:** 1.0
**Last reviewed:** 2026-06-16
**Next review due:** 2026-12-16

This document describes how EALLsource protects Amazon Information in line with the
Amazon Selling Partner API (SP-API) **Data Protection Policy (DPP)** and
**Acceptable Use Policy (AUP)**. It complements the [Incident Response Plan](./INCIDENT_RESPONSE_PLAN.md).

"Amazon Information" = any data obtained via SP-API, including seller inventory
and pricing data and the seller's LWA authorization tokens.

---

## 1. Encryption in Transit

- All network traffic uses **TLS 1.2+ (HTTPS)**. The application is served over
  HTTPS by Vercel; database connections to Neon require TLS (`sslmode=require`).
- Calls to Amazon (LWA token endpoint and SP-API) are made over HTTPS only.
- No Amazon Information is transmitted over unencrypted channels.

## 2. Encryption at Rest

- **Sensitive credentials** (SP-API LWA refresh/access tokens and TOTP MFA
  secrets) are encrypted at the application layer using **AES-256-GCM** (an
  authenticated cipher) before being written to the database. Each value uses a
  unique random 96-bit IV and an authentication tag (`src/lib/encryption.ts`).
- **Database-level encryption at rest** is provided by the managed database
  provider (Neon / AWS), which encrypts stored data and backups.
- Passwords are never stored in plaintext or reversibly — they are hashed with
  **bcrypt** (cost factor 12).

## 3. Key Management

- The AES-256 master key is supplied via the **`ENCRYPTION_KEY`** environment
  variable (64 hex chars / 32 bytes), stored as an encrypted secret in Vercel.
- **Separation of duties:** the key is stored in the hosting platform's secret
  store, separate from the database where the encrypted data lives. Compromise of
  the database alone does not expose the key.
- The key is **never** committed to source control, logged, or exposed to the
  client. Source control is scanned to ensure secrets are not committed.
- The application **refuses to operate without a valid key** — it throws rather
  than falling back to a weak/default key (`getKey()` validates presence and
  length on every use).
- **Key rotation procedure:** to rotate, generate a new 32-byte key, re-encrypt
  stored secrets under the new key, then update `ENCRYPTION_KEY` and redeploy.
  Rotation is performed on suspected compromise and reviewed during the
  semi-annual security review. (For most secrets, rotation can also be achieved
  by re-authorizing sellers, which issues fresh tokens.)

## 4. Access Control (Least Privilege)

- Application access is **role-based**: Owner, Admin, Analyst, Viewer. Users only
  receive the access required for their function.
- Administrative actions (team management, repricing rules, Amazon connection)
  are restricted to Owner/Admin roles and enforced server-side.
- Each seller (tenant) can only access **their own** Amazon Information; tenant
  data is scoped by organization on every query.
- **Multi-factor authentication (TOTP)** is available and enforced at login for
  any account that enables it.
- **Password policy:** minimum 12 characters with uppercase, lowercase, number,
  and special character; bcrypt-hashed; **365-day rotation** enforced via an
  application notice.

## 5. Credential Handling

- SP-API/LWA credentials are encrypted at rest (§2) and only decrypted in memory
  at the moment they are needed to call Amazon.
- Access tokens are short-lived and refreshed automatically from the encrypted
  refresh token; no long-lived plaintext credentials are retained.
- Credentials are never written to logs, error messages, or client responses.

## 6. Data Minimization, Retention & Deletion

- EALLsource requests only the SP-API roles required for its features
  (Inventory and Order Tracking; Pricing) and does **not** request restricted
  (PII) roles.
- Amazon Information is retained only as long as needed to provide the service.
- On seller **disconnection or deletion request**, the seller's stored Amazon
  Information and credentials are deleted. Organization deletion cascades to all
  associated records.

## 7. Logging & Monitoring

- Security-relevant actions (Amazon connect/disconnect, role changes, user
  invites/removals, MFA enable/disable, password changes) are recorded in an
  **audit log** with actor, action, and timestamp.
- Application and infrastructure monitoring is provided via Vercel and Neon
  dashboards and alerts; dependency vulnerabilities are surfaced via automated
  alerts.

## 8. Network Security

- The application runs on managed infrastructure (Vercel + Neon on AWS) that
  provides **firewalls, network segmentation, and intrusion detection/prevention**
  at the infrastructure layer.
- Endpoint anti-malware protection is maintained on developer workstations with
  access to production secrets.

## 9. Incident Response

- A documented [Incident Response Plan](./INCIDENT_RESPONSE_PLAN.md) defines
  roles, requires reviews at least every 6 months, and requires notifying
  **security@amazon.com within 24 hours** of detecting any incident involving
  Amazon Information.

## 10. Sub-processors

Amazon Information is processed only by infrastructure sub-processors acting on
EALLsource's behalf under contract:

| Sub-processor | Purpose | Safeguards |
|---------------|---------|------------|
| Vercel | Application hosting | TLS, encrypted env secrets, platform security |
| Neon (on AWS) | PostgreSQL database | TLS in transit, encryption at rest, backups |

Amazon Information is **not** sold or shared with any third party for their own
use, and one seller's data is never shared with another.
