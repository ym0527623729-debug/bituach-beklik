# Working on Bituach BeClick

- This is the owner's private insurance CRM. Keep the repository and hosted Site private unless explicitly instructed otherwise.
- Do not commit customer data, local databases, uploads, backups, credentials, logs, or generated builds.
- Production uses Sites authentication, D1 (`DB`), and R2 (`BUCKET`). A raw Worker deployment without the Sites authentication gateway is not an equivalent deployment.
- Preserve server-side agency isolation and permissions on every operation and download. Never trust browser-provided identity headers on an unprotected origin.
- Append database migrations; never rewrite a migration already applied in production. Preserve existing customer data and documents on releases.
- The local running service is actively used by the owner. Do not stop it or clear its database as part of checks. Use an isolated local database for integration tests.
- `npm run typecheck`, `npm test`, and `npm run build` are the release checks. `npm run release:package` produces the deployment archive and provenance manifest.
- UI changes should preserve Hebrew RTL layout and the original BeClick client-card style.
- Policy form: car policies require third-party/comprehensive coverage and a registration number. Product, insured-family selection, notes, coverages, deductible, insured amount, and renewal-day override are omitted from the policy UI. Previously saved values remain intact.
- Payment frequency is automatic for known branches: health/life/pension monthly; vehicle/home/business/travel annual. Unknown branches can choose monthly or annual.
- A successful GitHub build prepares a release; it does not by itself publish a Site. Follow `docs/DEPLOYMENT.md` and verify the returned deployed URL before claiming publication.
