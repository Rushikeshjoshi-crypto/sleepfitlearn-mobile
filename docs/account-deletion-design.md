# Account deletion: design note

Status: **not built.** The app has a "Delete my account" button in Settings
(`DeleteAccountModal`). It asks the user to type DELETE, then shows "Coming
soon". It makes no backend call and deletes nothing. This note is what has to
be decided and built before that button does anything.

## 1. What has to be removed

All app data lives in DynamoDB (`eu-north-1`) plus the Cognito user pool
`eu-north-1_FL7ZdX3Wc`.

| Where | Key | Action | Notes |
|---|---|---|---|
| Cognito user | `sub` | `AdminUserGlobalSignOut`, then `AdminDeleteUser` | Last step, so a failed run can be retried with the user's id |
| `users` | `id` | Delete the row | Profile, birth year, `parent_user_id`, subscription status fields |
| `sleep_events` | `user_id` + `sk` | Delete all rows | |
| `exercise_events` | `user_id` + `sk` | Delete all rows | |
| `study_sessions` | `user_id` + `sk` | Delete all rows | |
| `exam_logs` | user-scoped | Delete all rows | Check the key layout |
| `health_metrics` | `user_id` + `sk` | Delete all rows | Includes weight, energy, manual HR/BP **and the Health Connect HR/BP rows** (see 2) |
| `historical_weights` | `user_id` + `sk` | Delete all rows | |
| `weekly_checkpoints` | `user_id` + `sk` | Delete all rows | |
| `context_events` | `user_id` + `sk` | Delete all rows | Screen time and routine |
| `routine_tasks` | user-scoped | Delete all rows | |
| `user_custom_activities` | user-scoped | Delete all rows | |
| `subjects` | user-scoped | Delete all rows | Check the key layout |
| `privacy_settings` | user-scoped | Delete the row | Insights consent |
| `connections`, `group_members`, `groups` | social | Remove memberships and connections. Groups the user created: transfer or delete (**decision**) | Check the key layouts |
| `parent_links` | `parent_id` + `link_id` (+ `child_id` index) | Close every link the user is part of (see 3) | Also the `#guard#parent#…` and `#guard#child#…` rows |
| `consent_events` | `link_id` + `sk` | **Keep** (append-only legal record), with ids pseudonymised (**decision**) | Proof of parental consent may have to be kept |
| `payment_transactions`, `payment_disputes` | — | **Keep** for tax and accounting, with personal fields removed (**decision**: how long) | |
| `app_config`, `pricing_plans`, `activity_types` | — | Not user data | Nothing to do |

**How:**
- Every per-user table is queried by `user_id` (paged) and deleted in batches (`BatchWriteItem`, retrying unprocessed items).
- The job must be **idempotent**: running it twice is safe, and a crash halfway can be resumed.

## 2. Heart rate and blood pressure (Health Connect)

- HR and BP rows are normal `health_metrics` rows (`metric_type` `heart_rate`
  or `blood_pressure`, `meta.source = "health_connect"`). Deleting all of the
  user's `health_metrics` rows removes them too. No special case is needed on
  the server.
- The data in **Health Connect on the phone is not ours** and stays there. The
  app should say so in the confirm dialog once deletion is real.
- On the device after deletion:
  - clear the `vitals.*.<userId>` AsyncStorage keys (consent, switch, last sync),
  - optionally revoke this app's Health Connect permissions (`revokeAllPermissions`),
  - sign out.

## 3. Linked parent and child accounts

| Who deletes | What happens |
|---|---|
| A **child** (13–17) | Every active link is closed (`revoked`, `closed_by: child`), with a `link_revoked` consent event. Parents see the link gone. Pending invites to the child's email expire as usual. |
| A **parent** | Every link they made is closed: pending ones `cancelled`, active ones `revoked`. **Linked children's accounts are not touched.** |
| **A parent asks to delete a child's account** | Not supported now. **Decision:** may a parent request it (DPDP gives parents rights over a minor's data)? If yes, it needs its own verified flow. |

## 4. Subscription (payments)

- Cancel any active recurring subscription **first**, at Stripe or Razorpay
  (whichever `users` says), so the user isn't charged after deletion.
- Refund rule for the current period: **decision** (pro-rata or none).
- Keep `payment_transactions` and `payment_disputes` (legal and accounting),
  with personal fields removed or pseudonymised.
- A deletion request while a dispute is open: **decision** (finish the dispute first?).

## 5. Flow (proposal)

1. App: confirm dialog (typed DELETE), then re-enter the password or re-sign-in.
2. `DELETE /account` on a new `sleepfitlearn-account` Lambda. It records a
   deletion request (`requested_at`) and returns 202.
3. **Decision:** grace period (for example 7 days, cancellable by signing in)
   or immediate.
4. Worker, in order: cancel subscription → close family links → delete
   per-user tables → pseudonymise kept records → delete Cognito user.
5. Write an audit record that holds no personal data (request id, timestamps,
   counts per table).

## 6. Play Store: web delete-request link

Google Play requires both:
- deletion inside the app, and
- a **web link** where someone can ask for deletion without the app.

Proposed page, on the final web domain (pending: the sleepfitlearn domain):

- URL: `https://<web-domain>/<locale>/account/delete`
- **Signed in:** the same confirm (type DELETE), then the same `DELETE /account`.
- **Not signed in:** sign in first. If the user can't sign in, the page shows a
  support email to write from the account's email address. It is handled by
  hand within the stated time.
- The page lists what is deleted, what is kept and for how long (payment
  records, consent records), and how long deletion takes.
- This URL goes into Play Console → Data safety → "Delete account URL".

## 7. Open decisions

1. Grace period or immediate deletion?
2. What happens to groups the user created?
3. How long to keep `consent_events` and payment records, and pseudonymise how?
4. Refund rule, and what to do while a dispute is open.
5. May a parent request deletion of a linked child's account?
6. Final web domain for the delete-request page.
