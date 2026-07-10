const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const originalLoad = Module._load;

afterEach(() => {
  Module._load = originalLoad;
  [
    '../src/app',
    '../src/routes/auth',
    '../src/routes/materials',
    '../src/routes/quiz',
    '../src/middleware/auth',
  ].forEach((id) => {
    try {
      delete require.cache[require.resolve(id)];
    } catch {
      // Module may not exist yet during the red test.
    }
  });
});

function makeQuestions(materialId = 'ready-1', count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `q${i + 1}`,
    materialId,
    text: `Soal ${i + 1}`,
    options: { A: 'Alpha', B: 'Beta', C: 'Charlie', D: 'Delta' },
    correctAnswer: i % 2 === 0 ? 'A' : 'B',
  }));
}

function mockApp({ materials, questions = makeQuestions(), attempts = [] } = {}) {
  const users = new Map([
    [
      'alice',
      {
        _id: 'user-1',
        username: 'alice',
        role: 'user',
        passwordHash: bcrypt.hashSync('secret123', 10),
      },
    ],
    [
      'bob',
      {
        _id: 'user-2',
        username: 'bob',
        role: 'user',
        passwordHash: bcrypt.hashSync('secret123', 10),
      },
    ],
  ]);
  const materialRows =
    materials ||
    [
      { _id: 'ready-1', title: 'Biologi', filename: 'bio.pdf', status: 'ready', createdAt: new Date('2026-01-02') },
      { _id: 'failed-1', title: 'Kimia', filename: 'kimia.pdf', status: 'failed', createdAt: new Date('2026-01-01') },
    ];

  class User {
    static async findOne(query) {
      return users.get(query.username) || null;
    }
  }

  class Material {
    static find(query = {}) {
      const rows = materialRows.filter((material) =>
        Object.entries(query).every(([key, value]) => material[key] === value)
      );
      return {
        sort: async () => [...rows].sort((a, b) => b.createdAt - a.createdAt),
      };
    }

    static async findById(id) {
      return materialRows.find((material) => String(material._id) === String(id)) || null;
    }
  }

  class Question {
    static async aggregate(pipeline) {
      const match = pipeline.find((step) => step.$match)?.$match || {};
      const size = pipeline.find((step) => step.$sample)?.$sample.size || questions.length;
      return questions.filter((question) => String(question.materialId) === String(match.materialId)).slice(0, size);
    }

    static async find(query) {
      const ids = new Set((query._id && query._id.$in) || []);
      return questions.filter((question) => ids.has(question._id));
    }
  }

  class Attempt {
    static async create(data) {
      const attempt = {
        _id: `attempt-${attempts.length + 1}`,
        save: async function save() {
          return this;
        },
        ...data,
      };
      attempts.push(attempt);
      return attempt;
    }

    static async findById(id) {
      const attempt = attempts.find((row) => String(row._id) === String(id));
      if (attempt && !attempt.save) {
        attempt.save = async function save() {
          return this;
        };
      }
      return attempt || null;
    }
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'connect-mongo') {
      return {
        create() {
          return new session.MemoryStore();
        },
      };
    }
    if (request === '../models/User') return User;
    if (request === '../models/Material') return Material;
    if (request === '../models/Question') return Question;
    if (request === '../models/Attempt') return Attempt;
    return originalLoad.call(this, request, parent, isMain);
  };

  process.env.SESSION_SECRET = 'test';
  const { createApp } = require('../src/app');
  return { app: createApp(), attempts, questions };
}

async function withServer(app, run) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function login(baseUrl, username = 'alice') {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password: 'secret123' }),
  });
  assert.equal(response.status, 302);
  return response.headers.get('set-cookie');
}

async function postForm(baseUrl, path, data, cookie) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
    },
    body: new URLSearchParams(data),
  });
}

describe('user materials and quiz flow', () => {
  it('lists ready materials only', async () => {
    const { app } = mockApp();

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(`${baseUrl}/materials`, { headers: { cookie } });
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /Biologi/);
      assert.doesNotMatch(html, /Kimia/);
    });
  });

  it('starts retakes as separate attempts', async () => {
    const { app, attempts } = mockApp();

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const first = await postForm(baseUrl, '/quiz/ready-1/start', {}, cookie);
      const second = await postForm(baseUrl, '/quiz/ready-1/start', {}, cookie);

      assert.equal(first.status, 302);
      assert.equal(first.headers.get('location'), '/quiz/attempt-1');
      assert.equal(second.headers.get('location'), '/quiz/attempt-2');
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].questionIds.length, 10);
      assert.equal(attempts[0].status, 'in_progress');
    });
  });

  it('renders quiz questions without correct answers', async () => {
    const attempts = [
      {
        _id: 'attempt-1',
        userId: 'user-1',
        materialId: 'ready-1',
        questionIds: makeQuestions().map((question) => question._id),
        answers: [],
        score: null,
        status: 'in_progress',
        startedAt: new Date(),
      },
    ];
    const { app } = mockApp({ attempts });

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(`${baseUrl}/quiz/attempt-1`, { headers: { cookie } });
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /Soal 1/);
      assert.match(html, /quiz-form/);
      assert.doesNotMatch(html, /correctAnswer/);
    });
  });

  it('scores submitted answers and marks timeouts on the server', async () => {
    const attempts = [
      {
        _id: 'attempt-1',
        userId: 'user-1',
        materialId: 'ready-1',
        questionIds: makeQuestions().map((question) => question._id),
        answers: [],
        score: null,
        status: 'in_progress',
        startedAt: new Date(Date.now() - 11 * 60 * 1000),
      },
    ];
    const { app } = mockApp({ attempts });

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await postForm(
        baseUrl,
        '/quiz/attempt-1/submit',
        { 'answers[0]': 'A', 'answers[1]': 'A' },
        cookie
      );

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/quiz/attempt-1/result');
      assert.equal(attempts[0].status, 'submitted');
      assert.equal(attempts[0].score, -35);
      assert.equal(attempts[0].correctCount, 1);
      assert.equal(attempts[0].wrongCount, 9);
      assert.equal(attempts[0].timedOut, true);
      assert.ok(attempts[0].durationSec >= 660);
    });
  });

  it('redirects in_progress result to quiz page', async () => {
    const attempts = [
      {
        _id: 'attempt-1',
        userId: 'user-1',
        materialId: 'ready-1',
        questionIds: makeQuestions().map((question) => question._id),
        answers: [],
        score: null,
        status: 'in_progress',
        startedAt: new Date(),
      },
    ];
    const { app } = mockApp({ attempts });

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(`${baseUrl}/quiz/attempt-1/result`, {
        redirect: 'manual',
        headers: { cookie },
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/quiz/attempt-1');
    });
  });

  it('returns 400 when attempt references missing questions', async () => {
    const attempts = [
      {
        _id: 'attempt-1',
        userId: 'user-1',
        materialId: 'ready-1',
        questionIds: ['q1', 'missing-q'],
        answers: [],
        score: null,
        status: 'in_progress',
        startedAt: new Date(),
      },
    ];
    const { app } = mockApp({ attempts, questions: makeQuestions().slice(0, 1) });

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const take = await fetch(`${baseUrl}/quiz/attempt-1`, { headers: { cookie } });
      const submit = await postForm(baseUrl, '/quiz/attempt-1/submit', { 'answers[0]': 'A' }, cookie);

      assert.equal(take.status, 400);
      assert.equal(submit.status, 400);
    });
  });

  it('rejects attempts owned by another user', async () => {
    const attempts = [
      {
        _id: 'attempt-1',
        userId: 'user-2',
        materialId: 'ready-1',
        questionIds: makeQuestions().map((question) => question._id),
        answers: [],
        score: null,
        status: 'in_progress',
        startedAt: new Date(),
      },
    ];
    const { app } = mockApp({ attempts });

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl, 'alice');
      const response = await postForm(baseUrl, '/quiz/attempt-1/submit', {}, cookie);

      assert.equal(response.status, 403);
    });
  });
});
