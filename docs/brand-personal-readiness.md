# Brand personal-session readiness: Medvediva / Kochfit

`tests/brand-personal-readiness.spec.js` is an independent **read-only** suite. It does not import or change shared helpers, log in with credentials, impersonate, create/edit services, start meetings, purchase, or use devices/media. All non-GET/HEAD/OPTIONS browser requests are blocked. Trace, screenshots and video are disabled to avoid saving session details; attachments contain allowlisted role/component/build metadata only.

## Configuration

Use local ignored `.env` or shell environment. Never commit storageState, signed invites, credentials or environment values. Each brand and role needs its **own valid independently authenticated state**, not a shared owner session switched with impersonation.

```dotenv
# Comma-separated exact origins explicitly approved for this run; no trailing slash.
BRAND_QA_ALLOWED_ORIGINS=
MEDVEDIVA_BASE_URL=
MEDVEDIVA_ADMIN_STORAGE_STATE=
MEDVEDIVA_ADMIN_USER_ID=
MEDVEDIVA_STUDENT_STORAGE_STATE=
MEDVEDIVA_STUDENT_USER_ID=
MEDVEDIVA_QA_SERVICE_ID=
MEDVEDIVA_QA_SERVICE_TITLE=
KOCHFIT_BASE_URL=
KOCHFIT_ADMIN_STORAGE_STATE=
KOCHFIT_ADMIN_USER_ID=
KOCHFIT_STUDENT_STORAGE_STATE=
KOCHFIT_STUDENT_USER_ID=
KOCHFIT_QA_SERVICE_ID=
KOCHFIT_QA_SERVICE_TITLE=
```

BASE_URL must be an HTTPS origin without path/query/credentials and match the explicit allowlist plus the pinned approved origin fingerprint for the selected brand. The fingerprints enforce the exact preapproved brand/origin pairs without publishing test URLs in this repository. This approval alone is insufficient: **every test** checks the actual host, actual configured user, `isProduction === false`, and no impersonation. Admin cases additionally require an explicit admin permission and an Admin page. Student cases reject admin/owner and require explicit student role evidence (`schoolRbac.role` or server `is_student`). Missing role projection is a ROLE BLOCKED failure, never inferred from a familiar name.

QA_SERVICE fields are optional only for the legacy case: point to an existing own QA-AT/QA-Codex/QA-CL service with the exact expected title. Do not pass a real customer's service. No fixtures are created, so no server cleanup is necessary; each isolated context closes in `finally` even after a failed assertion. Legacy Cancel does not change a field or save anything.

## Commands

```bash
node --check tests/brand-personal-readiness.spec.js
npx playwright test tests/brand-personal-readiness.spec.js --list
npx playwright test tests/brand-personal-readiness.spec.js --output=test-results-brand-personal
# One independently provisioned brand/role at a time:
npx playwright test tests/brand-personal-readiness.spec.js -g 'MEDVEDIVA: mandatory admin'
```

The existing `npm test` explicitly lists other smoke files and does not pick up this suite. `npm run test:all` includes it. Keep workers1 and retries0. Loading this file does not make network requests. Missing required role configuration produces a clearly named `NOTRUN_AUTH` skip; missing optional own service fixture produces `NOTRUN_FIXTURE`. A configured file that is absent, expired/wrong session, wrong origin, production, unknown role or impersonation **fails** the relevant guard. No automatic fallback to another user's state.

## Coverage and expected outcomes

For each brand:

1. Admin `/admin/services` and `/admin/service-sessions` must return200 and their actual modules under the approved role. A known missing404/403 remains a red **DEPLOYMENT BLOCK**, never green business behavior.
2. Independent student `/service-sessions` must return200 and StudentSessions with a confirmed student role. Owner-readable props are not student coverage.
3. The configured own legacy service edit opens with the exact title, Cancel returns to the list, and reopening preserves text/number values. This independent check can work while the personal module is missing; it does **not** mark that module as restored.

No runtime PASS is claimed merely by discovering six tests or by skipping missing authentication. Current authoring validation has no valid brand robot states: functional run is **NOTRUN_AUTH**, discovery/syntax only. Real-device cookies are not exported to manufacture a robot session.

This suite does not cover paid checkout, booking/reserve/debit/return, product7/10 meeting audience, real join/media, recordings, mobile/native or the full brand business cycle. Those need their own controlled fixtures and scenarios. Medvediva flow/expiry rules are not applied to Kochfit.
