# Bug Fix Log

## 11 February 2026 — 00:42 IST

**Total bugs fixed: 21** (6 TypeScript build errors + 15 security vulnerabilities)

---

### TypeScript Build Errors (6 fixes)

| # | File | Issue |
|---|------|-------|
| 1 | `src/controllers/share.controller.ts` | `clip.title` possibly null — 2 occurrences |
| 2 | `src/scripts/inspect-job.ts` | Job type mismatch between clip/video queue types |
| 3 | `src/services/share-analytics.service.ts` | `null` not assignable to `string \| undefined` for clipTitle |
| 4 | `src/services/share.service.ts` | `PublicClipData` interface didn't allow nullable DB fields (title, duration, aspectRatio) |
| 5 | `src/services/share.service.ts` | `videoTitle` nullable from DB but typed as `string` |
| 6 | `src/services/upload-validation.service.test.ts` | Imported from `vitest` instead of `bun:test` |

---

### Security Vulnerabilities (15 fixes)

#### 🔴 Critical (3)

| # | File | Vulnerability | Fix |
|---|------|---------------|-----|
| 1 | `src/routes/video.routes.ts` | Unauthenticated `/test-upload` endpoint exposed in production | Removed entirely |
| 2 | `src/controllers/credit.controller.ts` | Webhook signature bypass when `NODE_ENV` ≠ production | Always reject invalid/missing signatures when secret is configured |
| 3 | `src/middleware/auth.middleware.ts` | `optionalAuthMiddleware` called `next()` twice, causing double execution of handlers | Removed duplicate `next()` call |

#### 🟠 High (6)

| # | File | Vulnerability | Fix |
|---|------|---------------|-----|
| 4 | `src/controllers/upload.controller.ts` | No ownership check on upload complete — any user could complete any upload | Added `video.userId === user.id` check |
| 5 | `src/controllers/upload.controller.ts` | No ownership check on upload abort — any user could abort/delete another's upload | Added ownership check before delete |
| 6 | `src/controllers/video.controller.ts` | No ownership check on video delete — any authenticated user could delete any video | Added workspace membership / owner check |
| 7 | `src/controllers/video.controller.ts` | No ownership check on getVideoById — any user could fetch any video details | Added workspace membership / owner check |
| 8 | `src/routes/password-reset.routes.ts` | No rate limiting on password reset — brute-force and email spam possible | Added 3 req/15min rate limit |
| 9 | `src/routes/auth.ts` | No rate limiting on auth routes — brute-force login possible | Added 5 req/min rate limit |

#### 🟡 Medium (6)

| # | File | Vulnerability | Fix |
|---|------|---------------|-----|
| 10 | `src/index.ts` | No global API rate limiting | Added 100 req/min global limit on `/api/*` |
| 11 | `src/routes/health.routes.ts` | `/health/detailed` exposed DB/Redis/queue internals without auth | Protected with admin middleware |
| 12 | `src/controllers/uppy-upload.controller.ts` | No ownership check on Uppy multipart complete | Added `video.userId === user.id` check |
| 13 | `src/controllers/admin.controller.ts` | Unbounded query params (limit, page, days) could cause expensive DB queries | Capped: limit ≤ 100, days ≤ 365 |
| 14 | `src/controllers/video.controller.ts` | Error stack traces leaked to client in 500 responses | Removed `details` field from error response |
| 15 | `src/lib/constants.ts` | Vercel preview URL in production CORS origins | Removed `scalereach-f1.vercel.app` |

---

**Files changed:** 17 across both commits  
**Build status:** ✅ Clean (`tsc --noEmit` passes with 0 errors)
