# Privacy policy outline: health data (Health Connect)

Outline of what the SleepFitLearn privacy policy and the Play Console Health
Connect declaration need to say about health data read on Android. This is a
draft for review, not legal advice. Have it reviewed before publishing.

## 1. What is read, and from where

Read only from **Health Connect** on the user's phone, i.e. data another app
(watch, band, BP monitor, Samsung Health, Google Fit, …) already saved there.
Each type is a separate permission the user can grant or deny.

| Data type | Health Connect permission | Since |
|---|---|---|
| Sleep sessions | `READ_SLEEP` | existing |
| Exercise sessions | `READ_EXERCISE` | existing |
| Weight | `READ_WEIGHT` | existing |
| Heart rate | `READ_HEART_RATE` | new |
| Resting heart rate | `READ_RESTING_HEART_RATE` | new |
| Blood pressure | `READ_BLOOD_PRESSURE` | new |

- Read access only. The app never writes to Health Connect.
- No background-read permission and no history permission. Reads happen when
  the app is open. The first heart rate and BP sync covers the last 30 days.
- Heart rate and BP have their own in-app consent screen. Permission is asked
  only after the user agrees.

## 2. Why (purpose)

- Show the user's own trends next to the entries they log by hand.
- Wellness only. No diagnosis, no medical claims. The app shows "Not a medical
  diagnosis, consult a doctor."

## 3. What is stored

- **Heart rate:** one summary per local day (lowest, average, highest,
  resting, number of readings). Raw samples stay on the phone.
- **Blood pressure:** each reading (systolic, diastolic, time, body position
  and measurement location if present).
- **Source:** the name of the app that wrote each reading (Health Connect's
  `dataOrigin` package).
- Stored in the user's SleepFitLearn account on AWS (DynamoDB, region
  `eu-north-1`), encrypted at rest and sent over HTTPS.

## 4. Sharing

- Never used for advertising, never sold, never sent to third-party analytics.
- **Family (13–17):** if a linked child chooses to share "personal" readings,
  the linked parent sees the child's latest readings (including heart rate and
  BP). The child controls this and can unlink.
- **Internal, aggregate only:** a count of how many users sync from each source
  app (for example "Samsung Health: N users"). No values and no user ids.

## 5. Age

- Under 13: not supported.
- 13–17: health data is off until the parental-consent feature is turned on
  (`minor_data_enabled`). While it is off, heart rate and BP are never asked
  for, read or uploaded.

## 6. User controls

- Turn heart rate and BP syncing off at any time (Habits → Health Connect).
- Revoke access in Health Connect settings (link in the app, plus the Health
  Connect rationale screen).
- "Delete synced heart rate & BP" removes the synced rows from our server.
  The data stays in Health Connect on the phone, and syncing is turned off.
  Manual entries are deleted one by one.
- **Open:** account deletion. There is no in-app account deletion yet. When it
  is built, it must remove `health_metrics` rows (including heart rate and BP)
  with everything else.

## 7. Play Console: Health Connect declaration (per data type)

| Permission | Justification |
|---|---|
| `READ_HEART_RATE` | Show the user's daily heart rate summary (lowest, average, highest) from their own watch or band next to manual entries, for wellness trends. |
| `READ_RESTING_HEART_RATE` | Show the user's daily resting heart rate as part of the same summary. |
| `READ_BLOOD_PRESSURE` | Show blood pressure readings saved by the user's BP monitor or health app next to manual entries, with the source app named. |

Also confirm in the declaration:
- No advertising use.
- No sale or transfer to third parties.
- Data is shared with a linked parent only when a 13–17 user chooses to.
- The privacy policy URL covers all of the above.
- The in-app rationale screen (`HealthPermissionsRationaleActivity`) matches
  the policy text.
