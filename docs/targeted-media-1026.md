# Targeted Live synthetic media regression

`tests/targeted-media-1026.spec.js` reuses the existing Live helpers and native Chromium WebRTC stats. It does not run the full smoke, impersonate users, capture a desktop, use physical camera/microphone, or record Playwright video/trace. Chromium audio output is muted. Synthetic audio transport is not human audibility or physical device quality.

## Cases

1. **Remote mute, twice:** independent saved owner and clean guest join a newly created own `QA-AT` internal room. Synthetic camera/microphone are enabled through UI with an explicit completed-toggle check. The receiver must first decode nonzero audio and video. After the owner's UI mute action and a settling interval, inbound audio packets, decoded samples and energy must all stop, while video frames continue. Native PC IDs/state, RTP report IDs/SSRC and monotonically increasing counters prevent replacement/reset/disconnection from masquerading as silence.
2. **Recording availability only:** a separate own live room checks the server's explicit `recording_available` boolean. An unconfigured service is `SKIPPED: BLOCKED_ENV`; start/stop/processing/ready/playback lifecycle has not passed. If configured, only this availability gate passes. This case does not start a recording.

## Required configuration

Use a coordinated exclusive owner session on the exact preapproved origin (pinned by SHA256; its address stays in private configuration). A saved owner state is supplied privately; never export a colleague's browser cookies, commit the state, or substitute a different account to make the test pass.

```sh
BASE_URL="$LIVE_APPROVED_ORIGIN" \
LIVE_MEDIA_RUN_APPROVED=1 \
LIVE_OWNER_STORAGE_STATE=/absolute/private/owner.json \
LIVE_EXPECTED_OWNER_ID=31 \
QA_OUT=/absolute/local/evidence/run-unique \
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
npx playwright test tests/targeted-media-1026.spec.js \
  --output=/absolute/local/evidence/run-unique/screens --reporter=list
```

The test rejects wrong origin, missing approval/configuration, expired/wrong identity, non-test mode, impersonation and missing owner permission. Initial SSR `auth.user=null` is allowed only with the exact profile `user.id`; a contradictory non-null `auth.user.id` is rejected. No login or password entry is attempted.

Only this file is selected. Do not run `npm test` merely to execute these cases. Workers=1/retries=0 come from the existing configuration; other QA sessions still require coordination.

## Durable IDs and cleanup

A unique UUID title is journaled before calling the existing create helper. If the successful create loses its redirect/ID, one owner-list read looks up only that exact title. Zero/multiple matches are an explicit unresolved cleanup error; there is no broad search/delete of other rooms.

Each started own room is finished in `finally` through a separate saved-owner context, with fresh server proof of `finished/0`. An unstarted unpublished draft may remain `draft/0`, as allowed by repository rules; it is never started solely for cleanup. Every outcome is journaled. Cleanup errors fail the test even when the case would otherwise skip. Guest/owner/cleanup contexts are closed.

## Validation and actual runtime

Syntax/discovery and the final targeted runtime are reported separately. Runtime artifacts stay outside Git and contain only allowlisted metadata; signed invites/JWT/cookies are not logged. Earlier draft-adapter runs are not final PASS: one sampled video too early, one exposed a missing completed-camera-toggle wait, and the first recording gate incorrectly expected an unstarted draft to become finished. They remain in the local evidence protocol rather than being hidden.

26.10 final targeted runtime on admin-BWm5KW5R: **1 PASS, 1 SKIPPED/BLOCKED_ENV**, 1.9 minutes. Remote mute passed both strict iterations: audio energy/packets/samples delta0 while remote video decoded51/50new frames. PC/report/SSRC identity and monotonicity checks passed. Recording availability was false; no recording was started and no lifecycle PASS is claimed.

Own rooms467/468 ended finished/0. After the static cleanup review, the only code changes were best-effort unpublish/reverification and a pinned-origin fingerprint instead of publishing the internal origin string. A separate cleanup-only run on the already owned463–468 verified the actual current unpublish route: started rooms finished/unpublished/0, unstarted464 draft/unpublished/0. The media scenario was not repeated merely for this cleanup patch. Syntax and8-case discovery passed on the final files. Redirect-loss recovery and publish-then-start-failure are statically reviewed exceptional paths, not injected runtime tests.

The previous manual synthetic-media result is independent and does not automatically validate this spec or another build.
