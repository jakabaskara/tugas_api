# Task 9 Report: User materials + quiz flow

## Status

Implemented.

## Changes

- Replaced the temporary `/materials` stub with a real authenticated ready-material listing.
- Added quiz routes for start, take, submit, and result.
- Mounted quiz routes in the app.
- Added EJS views for materials, quiz taking, and quiz result.
- Used `calculateScore` for scoring and `config.quizDurationMs` / `config.questionsPerQuiz` for quiz behavior.
- Kept `correctAnswer` out of the take view data.
- Added ownership checks for attempt take, submit, and result.
- Allowed retakes by creating a new attempt on every start.

## Tests

- Added focused route tests in `tests/quizFlow.test.js`.
- Updated the auth route test to match the real materials page instead of the old stub.
- `npm test` passes: 25 tests, 0 failures.

## Concerns

- Node emits existing `DEP0044 util.isArray` warnings during multipart/session-related tests.
- Manual browser timer behavior was not exercised beyond route-level tests.

## Review fixes (2026-07-10)

### Finding 1: Gate result until submitted
- `GET /quiz/:attemptId/result` now redirects `in_progress` attempts to `/quiz/:attemptId` instead of rendering the score page.

### Finding 2: Fail on missing questions
- `questionsInAttemptOrder` throws a 400 when any `questionId` cannot be loaded (no silent `.filter(Boolean)` drop).
- Take and submit routes map that error to HTTP 400 via `handleQuizError`.

### Tests
- Added `redirects in_progress result to quiz page`.
- Added `returns 400 when attempt references missing questions` (covers take + submit).

### Verification
- `npm test`: 27 tests, 0 failures.
