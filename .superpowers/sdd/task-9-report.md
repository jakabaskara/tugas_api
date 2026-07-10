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
