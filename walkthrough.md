# Security Summary

**Reviewed Files**: 9
**Issues Resolved**: 4

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Cloud Sync Payload & Timestamp Validation | `firestore.rules` | 33 | Firestore rules checked key names on `/users/{userId}` but did not validate per-field string types, payload size bounds, or server timestamps (`request.time`). | Medium | Fixed | Added `isBoundedString()` checks for every allowed key, upper-bounded `clientUpdatedAt`, and enforced `serverUpdatedAt == request.time` on `create` and `update`. |
| Shared-Browser Account Isolation | `src/cloud/sync.ts` | 290 | Signing in as a different user on the same browser could merge or upload leftover `localStorage` data from a prior session into the new account. | High | Fixed | Tracked `foco_cloud_owner_uid_v1`, automatically wiping previous user keys whenever a different UID signs in, and verifying `auth.currentUser?.uid === currentUid` before every cloud write. |
| Unsafe SVG Data URI Acceptance | `src/utils/focoStorage.ts`, `src/components/ProfileView.tsx` | 77, 104 | Profile photo sanitization accepted any `data:image/*` prefix, which included `data:image/svg+xml`. | Medium | Fixed | Restricted accepted profile images to raster formats (`png`, `jpeg`, `jpg`, `webp`, `gif`) with strict base64 format and 240 KB length limits. |
| Weak Signup Password Check & Unverified Notice | `src/cloud/CloudGate.tsx`, `src/cloud/AccountSection.tsx` | 18, 25 | Account creation accepted 6-character passwords without confirmation or verification prompts. | Low | Fixed | Enforced 8+ characters with letters and numbers plus password confirmation on signup, dispatched verification emails on signup, and added verification status controls in Profile. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Firestore Access Control | `firestore.rules` | Default-deny catch-all rule (`allow read, write: if false`), `list` disabled on `/users/{userId}`, strict owner UID match (`request.auth.uid == userId`), and strict allowlisted field keys. |
| Cloud Data Hydration | `src/cloud/sync.ts` | Rejects prototype keys (`Object.create(null)` + `hasOwnProperty`), validates JSON parseability and max lengths per key, and re-sanitizes remote profile payloads before saving locally. |
| Referrer Leakage | `index.html` | Configured `<meta name="referrer" content="strict-origin-when-cross-origin" />`. |
| Dependencies | `package-lock.json` | Ran `npm audit --omit=dev`; the only flagged advisory is in transitive Node-only `@grpc/grpc-js` inside `firebase` (unused in browser WebChannel builds and no non-breaking upgrade available). |

## PoC Verification

### 1. Cross-Account Data Leakage on Shared Browser

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Account Boundary on Local Storage Sync |
| Impact | High |
| Affected File | `src/cloud/sync.ts:290` |
| Test Scenario | User A leaves private journal/vice data in `localStorage`, then User B signs into a different Firebase UID in the same browser. |

#### How It Was Fixed
`syncWithCloud(uid)` records the active UID under `foco_cloud_owner_uid_v1`. Before syncing a new UID, any keys belonging to a different UID are wiped from `localStorage`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | User B completes sign-in and triggers `syncWithCloud(userB.uid)` | Entry point receives `userB.uid` |
| 2 | `getStoredOwnerUid()` returns `userA.uid`, which differs from `userB.uid` at `src/cloud/sync.ts:291` | Mismatch detected |
| 3 | `wipeLocalSyncedKeys()` removes all 16 synced Foco keys and `META_MODIFIED_AT` before reading or pushing to `/users/{userB.uid}` | **Handled Safely** |

#### Conclusion
**Fix Verified** - Data from a previous account on the same device can no longer be merged or uploaded into another user's cloud backup.

---

### 2. Oversized or Non-String Cloud Backup Injection

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unbounded Database Map Values & Forged Timestamps |
| Impact | Medium |
| Affected File | `firestore.rules:33` |
| Test Scenario | Authenticated client sends `{ data: { foco_minimal_theme_v1: { nested: "obj" } }, clientUpdatedAt: 999999999999999 }` to `/users/{uid}`. |

#### How It Was Fixed
`isValidUserBackup(payload)` requires `serverUpdatedAt == request.time`, bounds `clientUpdatedAt <= 4102444800000`, and verifies every key inside `payload.data` via `isBoundedString()`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Client issues `setDoc` on `/users/{uid}` | Request reaches Firestore `allow create/update` |
| 2 | `isValidUserBackup(incoming())` checks `serverUpdatedAt == request.time`, `clientUpdatedAt <= 4102444800000`, and `isBoundedString(payload.data, 'foco_minimal_theme_v1', 16)` | Non-string value and missing server timestamp fail validation |
| 3 | Write operation is rejected by Firestore rules | **Handled Safely** |

#### Conclusion
**Fix Verified** - Only well-typed, size-bounded string entries accompanied by a server timestamp can be written to `/users/{userId}`.

---

### 3. SVG Data URI Injection in Profile Photo

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe Image Data URI Handling |
| Impact | Medium |
| Affected File | `src/utils/focoStorage.ts:74`, `src/components/ProfileView.tsx:104` |
| Test Scenario | `sanitizeProfile({ name: 'Tester', photoDataUrl: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+', updatedAt: 100 })` |

#### How It Was Fixed
Replaced generic `startsWith('data:image/')` checks with `isSafeRasterImageDataUrl()`, permitting only base64 raster formats (`png`, `jpeg`, `jpg`, `webp`, `gif`) up to 240,000 characters.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | SVG data URI enters `sanitizeProfile()` (local or remote hydration) | Input reaches `isSafeRasterImageDataUrl(rawPhoto)` |
| 2 | `SAFE_RASTER_IMAGE_DATA_URL_RE` rejects `image/svg+xml` at `src/utils/focoStorage.ts:71` | Check returns `false` |
| 3 | `sanitizeProfile()` sets `photoDataUrl` to `null` | **Handled Safely** |

#### Conclusion
**Fix Verified** - Verified by unit test in `tests/app.test.ts` that SVG and `javascript:` URIs are stripped to `null`.
