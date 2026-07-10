# Quiz Materi AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js quiz app where admin uploads a PDF, OpenAI generates 100 MCQs, and users take 10 random questions with a 10-minute timer and +10/−5 scoring.

**Architecture:** Single Express monolith with EJS views, MongoDB (Mongoose), session auth, synchronous PDF→OpenAI generation on upload, and attempt documents for quiz state/history.

**Tech Stack:** Node.js 20+, Express 4, EJS, Mongoose, express-session, bcryptjs, multer, pdf-parse, openai, dotenv, connect-flash, method-override (optional), node:test

**Spec:** `docs/superpowers/specs/2026-07-10-quiz-materi-ai-design.md`

## Global Constraints

- UI: Express + EJS + custom CSS (no React/SPA)
- Generate: synchronous on upload; exactly 100 valid MCQs or material `failed`
- Quiz: 10 random questions; timer 10 minutes total; auto-submit on expiry
- Score: correct +10, wrong/blank −5; score may be negative
- Retakes: unlimited; store every attempt
- Reports: user sees own; admin sees all (optional filters)
- Secrets only in `.env`; never commit API keys
- YAGNI: no manual question editor, no public leaderboard, no async worker

## File structure

```
package.json
.env.example
README.md
.gitignore                    (exists)
uploads/.gitkeep
src/
  server.js                  # listen
  app.js                     # express app export
  config.js                  # env helpers
  db.js                      # mongoose connect
  models/User.js
  models/Material.js
  models/Question.js
  models/Attempt.js
  middleware/auth.js         # requireAuth, requireAdmin
  middleware/flashLocals.js
  routes/auth.js
  routes/materials.js
  routes/quiz.js
  routes/admin.js
  routes/reports.js
  services/scoring.js
  services/questionValidate.js
  services/pdf.js
  services/openaiQuestions.js
  scripts/seedAdmin.js
views/
  partials/head.ejs
  partials/nav.ejs
  partials/flash.ejs
  auth/login.ejs
  auth/register.ejs
  materials/index.ejs
  quiz/take.ejs
  quiz/result.ejs
  reports/me.ejs
  admin/materials.ejs
  admin/upload.ejs
  admin/reports.ejs
public/css/style.css
tests/scoring.test.js
tests/questionValidate.test.js
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `.env.example`, `src/config.js`, `src/app.js`, `src/server.js`, `src/db.js`, `uploads/.gitkeep`, `public/css/style.css` (minimal stub), `views/partials/head.ejs`, `views/partials/nav.ejs`, `views/partials/flash.ejs`
- Modify: none

**Interfaces:**
- Consumes: none
- Produces: `createApp()` → Express app; `connectDb()` → Promise; `config` object with typed env fields

- [ ] **Step 1: Init npm and install dependencies**

```bash
cd /home/jakabaskara/project/kuliah/tugas_api
npm init -y
npm install express ejs mongoose express-session connect-mongo bcryptjs multer pdf-parse openai dotenv connect-flash
npm install -D nodemon
# connect-mongo is required in Task 4 for session store
```

Set `package.json` scripts:

```json
{
  "name": "tugas_api",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "node --test tests/",
    "seed:admin": "node src/scripts/seedAdmin.js"
  }
}
```

- [ ] **Step 2: Write config and DB helpers**

`src/config.js`:

```js
require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tugas_api',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  quizDurationMs: 10 * 60 * 1000,
  questionsPerMaterial: 100,
  questionsPerQuiz: 10,
  maxPdfChars: 60000,
};
```

`src/db.js`:

```js
const mongoose = require('mongoose');
const config = require('./config');

async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongodbUri);
  return mongoose.connection;
}

module.exports = { connectDb };
```

- [ ] **Step 3: Write minimal Express app + server**

`src/app.js` — create Express, set `view engine` ejs, `views` path, static `public`, session (MemoryStore OK for now; switch to `connect-mongo` when DB is up in Task 4), flash, body parsers, mount a health route `GET /health` → `ok`.

`src/server.js`:

```js
const { connectDb } = require('./db');
const { createApp } = require('./app');
const config = require('./config');

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

`.env.example`:

```
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/tugas_api
SESSION_SECRET=change-me
OPENAI_API_KEY=
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

- [ ] **Step 4: Smoke-check server starts (Mongo must be running)**

```bash
cp .env.example .env
# ensure mongod is running locally
node src/server.js
```

Expected: `Listening on http://localhost:3000` and `curl localhost:3000/health` → `ok`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example src uploads/.gitkeep public views
git commit -m "chore: scaffold Express app and config"
```

---

### Task 2: Scoring service (TDD)

**Files:**
- Create: `src/services/scoring.js`, `tests/scoring.test.js`

**Interfaces:**
- Consumes: none
- Produces: `calculateScore(answers, correctAnswers) → { score, correctCount, wrongCount }`
  - `answers`: `Array<'A'|'B'|'C'|'D'|null|undefined>`
  - `correctAnswers`: `Array<'A'|'B'|'C'|'D'>` same length
  - correct → +10; wrong/null/undefined → −5

- [ ] **Step 1: Write failing tests**

`tests/scoring.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateScore } = require('../src/services/scoring');

describe('calculateScore', () => {
  it('scores all correct as 100', () => {
    const correct = Array(10).fill('A');
    const r = calculateScore(correct, correct);
    assert.equal(r.score, 100);
    assert.equal(r.correctCount, 10);
    assert.equal(r.wrongCount, 0);
  });

  it('scores all wrong as -50', () => {
    const correct = Array(10).fill('A');
    const answers = Array(10).fill('B');
    const r = calculateScore(answers, correct);
    assert.equal(r.score, -50);
    assert.equal(r.correctCount, 0);
    assert.equal(r.wrongCount, 10);
  });

  it('treats blank as wrong', () => {
    const r = calculateScore([null, 'A'], ['A', 'A']);
    assert.equal(r.score, 5); // -5 + 10
    assert.equal(r.correctCount, 1);
    assert.equal(r.wrongCount, 1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: fail with `Cannot find module` or `calculateScore is not a function`

- [ ] **Step 3: Implement**

`src/services/scoring.js`:

```js
function calculateScore(answers, correctAnswers) {
  if (answers.length !== correctAnswers.length) {
    throw new Error('answers and correctAnswers length mismatch');
  }
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  for (let i = 0; i < correctAnswers.length; i++) {
    const a = answers[i];
    if (a && a === correctAnswers[i]) {
      score += 10;
      correctCount += 1;
    } else {
      score -= 5;
      wrongCount += 1;
    }
  }
  return { score, correctCount, wrongCount };
}

module.exports = { calculateScore };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/scoring.js tests/scoring.test.js
git commit -m "feat: add quiz scoring (+10/-5)"
```

---

### Task 3: Question validation (TDD)

**Files:**
- Create: `src/services/questionValidate.js`, `tests/questionValidate.test.js`

**Interfaces:**
- Consumes: none
- Produces:
  - `isValidQuestion(q) → boolean`
  - `normalizeQuestions(rawArray) → validQuestion[]` where each has `{ text, options: {A,B,C,D}, correctAnswer }`

- [ ] **Step 1: Write failing tests**

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isValidQuestion, normalizeQuestions } = require('../src/services/questionValidate');

describe('isValidQuestion', () => {
  it('accepts well-formed MCQ', () => {
    assert.equal(
      isValidQuestion({
        text: 'Apa ibu kota Indonesia?',
        options: { A: 'Jakarta', B: 'Bandung', C: 'Surabaya', D: 'Medan' },
        correctAnswer: 'A',
      }),
      true
    );
  });

  it('rejects missing option or bad key', () => {
    assert.equal(
      isValidQuestion({
        text: 'x',
        options: { A: '1', B: '2', C: '3' },
        correctAnswer: 'A',
      }),
      false
    );
    assert.equal(
      isValidQuestion({
        text: 'x',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctAnswer: 'E',
      }),
      false
    );
  });
});

describe('normalizeQuestions', () => {
  it('keeps only valid items', () => {
    const out = normalizeQuestions([
      { text: 'Q1', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctAnswer: 'B' },
      { text: '', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctAnswer: 'A' },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].correctAnswer, 'B');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Implement**

```js
const KEYS = ['A', 'B', 'C', 'D'];

function isValidQuestion(q) {
  if (!q || typeof q.text !== 'string' || !q.text.trim()) return false;
  if (!q.options || typeof q.options !== 'object') return false;
  for (const k of KEYS) {
    if (typeof q.options[k] !== 'string' || !q.options[k].trim()) return false;
  }
  if (!KEYS.includes(q.correctAnswer)) return false;
  return true;
}

function normalizeQuestions(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray
    .map((q) => ({
      text: String(q?.text || '').trim(),
      options: {
        A: String(q?.options?.A || '').trim(),
        B: String(q?.options?.B || '').trim(),
        C: String(q?.options?.C || '').trim(),
        D: String(q?.options?.D || '').trim(),
      },
      correctAnswer: String(q?.correctAnswer || '').trim().toUpperCase(),
    }))
    .filter(isValidQuestion);
}

module.exports = { isValidQuestion, normalizeQuestions };
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/services/questionValidate.js tests/questionValidate.test.js
git commit -m "feat: validate AI question JSON shape"
```

---

### Task 4: Mongoose models + session store

**Files:**
- Create: `src/models/User.js`, `src/models/Material.js`, `src/models/Question.js`, `src/models/Attempt.js`
- Modify: `src/app.js` — use `MongoStore` from `connect-mongo` for sessions

**Interfaces:**
- Consumes: mongoose
- Produces: models `User`, `Material`, `Question`, `Attempt` matching the spec fields

- [ ] **Step 1: Implement models**

`User`: username unique required, passwordHash required, role enum `['admin','user']` default `user`, timestamps.

`Material`: title, filename, uploadedBy ObjectId ref User, status enum `['ready','failed']`, timestamps.

`Question`: materialId ref Material indexed, text, options `{A,B,C,D}`, correctAnswer enum A–D.

`Attempt`: userId, materialId, questionIds [ObjectId], answers [String] (allow null via Mixed or default empty until submit), score Number default null, correctCount/wrongCount Number default 0, status enum `in_progress|submitted`, timedOut Boolean default false, startedAt Date, submittedAt Date, durationSec Number.

- [ ] **Step 2: Wire MongoStore in `createApp`**

```js
const MongoStore = require('connect-mongo');
// session store: MongoStore.create({ mongoUrl: config.mongodbUri })
```

Also set `res.locals.currentUser = req.session.user || null` in a small middleware.

- [ ] **Step 3: Manual check**

```bash
node -e "require('./src/models/User'); require('./src/models/Material'); require('./src/models/Question'); require('./src/models/Attempt'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add src/models src/app.js
git commit -m "feat: add Mongoose models and Mongo session store"
```

---

### Task 5: Auth (register / login / logout)

**Files:**
- Create: `src/middleware/auth.js`, `src/routes/auth.js`, `views/auth/login.ejs`, `views/auth/register.ejs`
- Modify: `src/app.js` — mount `/` auth routes; flash partials

**Interfaces:**
- Consumes: `User` model, bcryptjs
- Produces:
  - `requireAuth(req,res,next)` — redirect `/login` if no session user
  - `requireAdmin(req,res,next)` — redirect `/` or 403 if role !== admin
  - Session shape: `req.session.user = { id, username, role }`

- [ ] **Step 1: Middleware**

```js
function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Silakan login dulu');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    req.flash('error', 'Akses admin saja');
    return res.redirect('/');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
```

- [ ] **Step 2: Auth routes**

- `GET /register` → form
- `POST /register` → hash password, create user role `user`, login session, redirect `/materials`
- `GET /login` → form
- `POST /login` → verify bcrypt, set session, redirect admin → `/admin/materials` else `/materials`
- `POST /logout` → destroy session → `/login`

Reject duplicate username with flash error.

- [ ] **Step 3: Views** — simple centered forms using partials; show flash errors.

- [ ] **Step 4: Manual test**

```bash
npm run dev
# browser: register user, logout, login again
```

Expected: session persists; logout clears access to `/materials` (will  redirect until Task 6/7 pages exist — for now mount a stub `GET /materials` that says "ok authenticated")

Add temporary stub in `src/routes/materials.js`:

```js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.get('/materials', requireAuth, (req, res) => res.send('materials ok'));
module.exports = router;
```

- [ ] **Step 5: Commit**

```bash
git add src/middleware src/routes/auth.js src/routes/materials.js views/auth src/app.js
git commit -m "feat: add session auth register/login/logout"
```

---

### Task 6: Seed admin script

**Files:**
- Create: `src/scripts/seedAdmin.js`

**Interfaces:**
- Consumes: `User`, `config.adminUsername`, `config.adminPassword`
- Produces: upserts one admin user

- [ ] **Step 1: Implement seed**

```js
const bcrypt = require('bcryptjs');
const { connectDb } = require('../db');
const User = require('../models/User');
const config = require('../config');

async function main() {
  await connectDb();
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  const user = await User.findOneAndUpdate(
    { username: config.adminUsername },
    { username: config.adminUsername, passwordHash, role: 'admin' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('Admin ready:', user.username);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run**

```bash
npm run seed:admin
```

Expected: `Admin ready: admin`

- [ ] **Step 3: Manual login as admin**

Login with `.env` credentials → should land on admin redirect target (stub OK).

- [ ] **Step 4: Commit**

```bash
git add src/scripts/seedAdmin.js
git commit -m "feat: seed admin user from env"
```

---

### Task 7: PDF extract + OpenAI question generation

**Files:**
- Create: `src/services/pdf.js`, `src/services/openaiQuestions.js`

**Interfaces:**
- Consumes: `pdf-parse`, `openai`, `normalizeQuestions`, `config`
- Produces:
  - `extractPdfText(buffer) → Promise<string>` (trim; throw if empty)
  - `generateQuestionsFromText(text) → Promise<validQuestion[]>` length exactly `config.questionsPerMaterial` or throw
  - Internally: truncate text to `config.maxPdfChars`; call OpenAI; parse JSON; `normalizeQuestions`; if count < 100, retry once; if still < 100, throw

- [ ] **Step 1: PDF service**

```js
const pdfParse = require('pdf-parse');

async function extractPdfText(buffer) {
  const data = await pdfParse(buffer);
  const text = (data.text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('PDF tidak berisi teks yang bisa dibaca');
  return text;
}

module.exports = { extractPdfText };
```

- [ ] **Step 2: OpenAI service**

Use `openai` SDK with `config.openaiApiKey`. Prompt must require JSON array of 100 objects with `text`, `options.A–D`, `correctAnswer`. Prefer `response_format: { type: 'json_object' }` wrapping `{ "questions": [ ... ] }` for reliability.

Pseudo-flow:

```js
async function generateQuestionsFromText(text) {
  const clipped = text.slice(0, config.maxPdfChars);
  let questions = await callOnce(clipped);
  if (questions.length < config.questionsPerMaterial) {
    questions = await callOnce(clipped);
  }
  if (questions.length < config.questionsPerMaterial) {
    throw new Error(`Hanya mendapat ${questions.length} soal valid dari AI`);
  }
  return questions.slice(0, config.questionsPerMaterial);
}
```

Do not log or commit the API key.

- [ ] **Step 3: Dry-run optional** (only if key present)

```bash
node -e "(async()=>{ const {generateQuestionsFromText}=require('./src/services/openaiQuestions'); const q=await generateQuestionsFromText('Fotosintesis adalah proses tumbuhan membuat makanan.'); console.log(q.length, q[0]); })()"
```

If no key, skip; implement still required.

- [ ] **Step 4: Commit**

```bash
git add src/services/pdf.js src/services/openaiQuestions.js
git commit -m "feat: PDF extract and OpenAI 100-question generator"
```

---

### Task 8: Admin upload + materials list

**Files:**
- Create: `src/routes/admin.js`, `views/admin/upload.ejs`, `views/admin/materials.ejs`
- Modify: `src/app.js` — mount admin routes under `/admin` with `requireAuth` + `requireAdmin`
- Create: multer disk storage to `uploads/`

**Interfaces:**
- Consumes: `extractPdfText`, `generateQuestionsFromText`, `Material`, `Question`
- Produces: routes
  - `GET /admin/materials`
  - `GET /admin/materials/upload`
  - `POST /admin/materials/upload` (multipart: `title`, `pdf`)

- [ ] **Step 1: Upload handler logic**

On POST:
1. Validate title + file mimetype `application/pdf`
2. Create Material early or after success — prefer: create with status TBD then update. Spec: on AI failure save `failed` without questions.
3. Read file buffer from disk, `extractPdfText`
4. `generateQuestionsFromText`
5. `Question.insertMany` with materialId
6. Set material `ready`
7. On any failure after material created: set `failed`, flash error, redirect upload

Show loading copy on upload form: "Proses bisa 1–2 menit (AI generate 100 soal)".

- [ ] **Step 2: Materials list**

Query materials for admin; for each, `Question.countDocuments({ materialId })`. Show status badge.

- [ ] **Step 3: Manual test**

Login as admin, upload a small text-based PDF, wait. Expected: material `ready`, 100 questions in DB.

```bash
mongosh tugas_api --eval 'db.questions.countDocuments()'
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.js views/admin src/app.js
git commit -m "feat: admin PDF upload and AI question bank"
```

---

### Task 9: User materials + quiz flow

**Files:**
- Create: `src/routes/quiz.js`
- Modify: `src/routes/materials.js`, add `views/materials/index.ejs`, `views/quiz/take.ejs`, `views/quiz/result.ejs`
- Modify: `src/app.js` — mount quiz routes

**Interfaces:**
- Consumes: `Material`, `Question`, `Attempt`, `calculateScore`, `config.quizDurationMs`, `config.questionsPerQuiz`
- Produces:
  - `GET /materials` — list `status: ready` only
  - `POST /quiz/:materialId/start` — sample 10, create attempt `in_progress`
  - `GET /quiz/:attemptId` — render questions without correctAnswer
  - `POST /quiz/:attemptId/submit` — score + persist
  - `GET /quiz/:attemptId/result`

- [ ] **Step 1: Start quiz**

```js
const sampled = await Question.aggregate([
  { $match: { materialId: material._id } },
  { $sample: { size: config.questionsPerQuiz } },
]);
if (sampled.length < config.questionsPerQuiz) {
  req.flash('error', 'Soal belum cukup untuk materi ini');
  return res.redirect('/materials');
}
const attempt = await Attempt.create({
  userId: req.session.user.id,
  materialId: material._id,
  questionIds: sampled.map((q) => q._id),
  answers: [],
  score: null,
  status: 'in_progress',
  startedAt: new Date(),
});
res.redirect(`/quiz/${attempt._id}`);
```

- [ ] **Step 2: Take + timer UI**

Pass `endsAt = startedAt + quizDurationMs` as ISO string. Client JS:

```js
const endsAt = new Date(ENDS_AT_ISO).getTime();
const form = document.getElementById('quiz-form');
function tick() {
  const left = Math.max(0, endsAt - Date.now());
  // update mm:ss display
  if (left === 0) form.submit();
  else requestAnimationFrame(() => setTimeout(tick, 250));
}
tick();
```

Render all 10 questions with radio A–D named `answers[i]`.

- [ ] **Step 3: Submit**

- Load attempt; 403 if `userId` !== session user
- If already `submitted`, redirect result
- Build answers array length 10 from body (missing → null)
- Load questions by `questionIds` **in same order**
- `calculateScore(answers, correctAnswers)`
- `timedOut = Date.now() - startedAt > config.quizDurationMs`
- Update attempt fields; redirect result

- [ ] **Step 4: Result view** — big score, correct/wrong counts, link to materials and reports.

- [ ] **Step 5: Manual test** — start quiz, answer some, submit; start again (retake); let timer hit 0 once.

- [ ] **Step 6: Commit**

```bash
git add src/routes/quiz.js src/routes/materials.js views/materials views/quiz src/app.js
git commit -m "feat: user quiz flow with timer and scoring"
```

---

### Task 10: Reports (user + admin)

**Files:**
- Create: `src/routes/reports.js` (or extend admin), `views/reports/me.ejs`, `views/admin/reports.ejs`
- Modify: `src/app.js`, `src/routes/admin.js` for `GET /admin/reports`

**Interfaces:**
- Consumes: `Attempt` with populate `materialId title`, and for admin populate/lookup username
- Produces:
  - `GET /reports/me` — current user attempts `status: submitted` sorted newest first
  - `GET /admin/reports?user=&material=` — all submitted attempts with optional filters

- [ ] **Step 1: User report route + view** — table: materi, skor, benar, salah, tanggal, timeout badge.

- [ ] **Step 2: Admin report** — join user username; filter by username substring or userId and materialId if provided.

- [ ] **Step 3: Manual test** — as user see only own rows; as admin see all; verify filter.

- [ ] **Step 4: Commit**

```bash
git add src/routes/reports.js src/routes/admin.js views/reports views/admin/reports.ejs src/app.js views/partials/nav.ejs
git commit -m "feat: user and admin score reports"
```

---

### Task 11: UI polish + README

**Files:**
- Modify: `public/css/style.css`, all views/partials for consistent layout
- Create: `README.md`

**Interfaces:**
- Consumes: existing pages
- Produces: cohesive visual theme + run docs

- [ ] **Step 1: CSS theme**

Define CSS variables (avoid purple-on-white AI cliché). Example direction: deep teal primary, warm off-white background, dark ink text, clear hierarchy. Style: nav, buttons, forms, tables, sticky quiz timer, score hero on result page. Responsive basics.

- [ ] **Step 2: Nav links**

- User: Materi, Riwayat saya, Logout
- Admin: Materi admin, Upload, Laporan, Logout
- Guest: Login, Register

- [ ] **Step 3: README**

Document: prerequisites (Node, MongoDB, OpenAI key), `.env` setup, `npm install`, `npm run seed:admin`, `npm run dev`, demo flow admin→upload→user quiz→reports. Warn never commit `.env`.

- [ ] **Step 4: Full manual checklist**

1. Seed admin, register user  
2. Admin upload PDF → 100 soal  
3. User 10 random, timer, score +10/−5  
4. Retake creates second attempt  
5. User report own; admin report all  
6. Non-admin cannot open `/admin/*`

- [ ] **Step 5: Commit + push**

```bash
git add public/css/style.css views README.md
git commit -m "style: polish UI and add README"
git push
```

---

## Self-review vs spec

| Spec requirement | Task |
|------------------|------|
| Express + EJS + CSS | 1, 11 |
| MongoDB models | 4 |
| Session auth + roles | 5, 6 |
| Admin PDF upload | 8 |
| AI 100 MCQ sync | 7, 8 |
| 10 random quiz | 9 |
| +10/−5 scoring | 2, 9 |
| 10 min timer + auto-submit | 9 |
| Retake history | 9, 10 |
| User/admin reports | 10 |
| `.env` secrets | 1, 11 |
| Unit tests skor + validate | 2, 3 |

No placeholders left; attempt lifecycle uses `in_progress` → `submitted` consistently; OpenAI helper returns exactly 100 or throws.
