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

QA_SERVICE fields are required for the optional current-editor case. It pins the exact approved fixtures: Medvediva admin58054/service16/title `QA-Codex-MDV-1026 Доступный редактор`; Kochfit admin25893/service1/title `QA-Codex-PM-1023 Kochfit ретест`. No other service/account is accepted. No fixture is created or field changed; each context closes in `finally`.

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
3. `current own editor read-navigation preserves values`: exact Medvediva component `Admin/Services/ServiceEditPage` uses the visible same-origin `Услуги` link (no Cancel); exact Kochfit component `Admin/Services/ServicesView` uses its existing `Отмена` button. Both require exact fixture title in `#name`, navigate to `/admin/services`, reopen and compare input/textarea values. Fields are never modified. This checks only the current editor/navigation contract, not save/business behavior. A component mismatch is reported as an editor-contract failure, never automatically filed as a product bug.

No runtime PASS is claimed merely by discovering tests or skipping missing authentication. On26Oct two independent admin states were captured after human login in separate robot windows (no existing Chrome/device-cookie export). The guarded run produced **3 admin PASS,1 admin FAIL,2 student SKIP/NOTRUN_AUTH**; student states remain absent and were not replaced with admin states.

This suite does not cover paid checkout, booking/reserve/debit/return, product7/10 meeting audience, real join/media, recordings, mobile/native or the full brand business cycle. Those need their own controlled fixtures and scenarios. Medvediva flow/expiry rules are not applied to Kochfit.

## 26.10 current-editor validation

The published file discovers **6 cases**,3 for each brand. The ordinary Medvediva breadcrumb click remains a regression expectation. An unpublished diagnostic browser-Back draft is kept only in local work; it does not replace or soften that click.

Fresh read-only captures confirmed Medvediva admin58054/service16 as exactly `Admin/Services/ServiceEditPage`, unique `#name`, visible `Услуги` link and no Cancel. Kochfit admin25893/service1 is exactly `Admin/Services/ServicesView`, unique `#name` and visible `Отмена`. Actual brand/user/isProduction=false/noimp/admin guards passed for both. No data field was edited.

Actual runs remain separate:

- **Original6-case run:3 admin PASS,1 admin FAIL,2 student SKIP/NOTRUN_AUTH.** Both mandatory admin-route cases and Kochfit editor Cancel/reopen value comparison passed. Medvediva's ordinary visible breadcrumb click was blocked by an overlapping desktop header div (`hidden h-9 w-2/3 items-center gap-1 md:flex`), not by a stale component expectation or authentication failure.
- **Independent fresh breadcrumb repeat: FAIL again (2/2).** Exact role/test/noimp and editor/title guards passed; all5 hit-test points inside the link resolved to that header div,0/5 to the link. The ordinary click timed out. Screenshots and sanitized facts are local evidence, not repository files. The original regression expectation stays red: no forced click, skip, inverted assertion or `test.fail` annotation.
- **Unpublished diagnostic browser-Back-only attempt:0 PASS,1 FAIL before the contract ran.** Fresh `/profile` navigation timed out after30seconds before editor/history assertions. Therefore Back functionality is **NOTRUN_PREFLIGHT**, not PASS and not evidence of another product defect. It is not combined with the original6-case run to claim4 passes. No further product runs were made. That unexecuted Back case was removed from this published test file and kept only as a local diagnostic draft.

Both independent admin authentication captures remain distinct from business-test results. Student states are absent and never replaced with admin states. All contexts close in `finally`, including navigation failure; no logout, fixtures or server changes are required. Trace/video/screenshots remain off in the suite. Local auth states, raw logs, screenshots and evidence stay outside Git. Syntax/discovery validation and functional outcomes must be reported separately.


## Change-request reason form (27 Oct task)

The Kochfit-only case extends this same read-only suite with an independently authenticated student and a coordinator-provisioned own confirmed session. Configure these additional private values:

```dotenv
KOCHFIT_QA_CHANGE_SESSION_ID=
KOCHFIT_QA_CHANGE_STARTS_AT=
KOCHFIT_QA_CHANGE_SERVICE_TITLE=
```

Use the exact current server ISO time and a QA-prefixed own service title. The test verifies the student session, loads alternatives through the real UI, requires the current confirmed time to be absent from the actual slots response, checks empty and whitespace reasons disable submission and a meaningful reason enables it, then closes the form and verifies the session remained unchanged after a new page GET. It never clicks submit; the existing request guard blocks all writes.

This case does not prove server-side reason validation, persistence, trainer accept/reject, or booking/balance/payment behavior. Those need a separately coordinated business-flow test. A missing independent student state or usable own fixture is NOTRUN_AUTH/NOTRUN_FIXTURE, not a pass. Syntax/discovery alone do not confirm product behavior.


Validation on 27 Oct: syntax and discovery pass (7 cases). The strict Kochfit-only run completed with 2 admin passes and 2 NOTRUN_AUTH skips (independent student deployment and the new form case); no failures. A separately authorized private robot impersonation diagnostic exercised the same form contract against a real own confirmed session: actual alternatives excluded the current time; empty/whitespace disabled submit and meaningful text enabled it; server rejected empty/whitespace reasons with 422 without changing the session; a real submitted request retained the old confirmed time and preserved its reason after reload. This diagnostic is explicitly not a pass of the strict independent-student case and does not relax its impersonation guard. No private auth states, raw logs or screenshots are published.
