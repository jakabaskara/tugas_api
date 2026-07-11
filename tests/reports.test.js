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
    '../src/routes/reports',
    '../src/routes/admin',
    '../src/middleware/auth',
  ].forEach((id) => {
    try {
      delete require.cache[require.resolve(id)];
    } catch {
      // Route may not exist yet during the red test.
    }
  });
});

function chainRows(rows) {
  return {
    populate() {
      return this;
    },
    sort() {
      return Promise.resolve([...rows].sort((a, b) => b.submittedAt - a.submittedAt));
    },
  };
}

function mockApp() {
  const users = [
    {
      _id: 'user-1',
      username: 'alice',
      role: 'user',
      passwordHash: bcrypt.hashSync('secret123', 10),
    },
    {
      _id: 'user-2',
      username: 'bob',
      role: 'user',
      passwordHash: bcrypt.hashSync('secret123', 10),
    },
    {
      _id: 'admin-id',
      username: 'admin',
      role: 'admin',
      passwordHash: bcrypt.hashSync('secret123', 10),
    },
  ];
  const materials = [
    {
      _id: '000000000000000000000101',
      title: 'Biologi',
      filename: 'bio.pdf',
      status: 'ready',
      createdAt: new Date('2026-01-01'),
    },
    {
      _id: '000000000000000000000102',
      title: 'Fisika',
      filename: 'fisika.pdf',
      status: 'ready',
      createdAt: new Date('2026-01-02'),
    },
  ];
  const attempts = [
    {
      _id: 'attempt-1',
      userId: users[0],
      materialId: materials[0],
      score: 80,
      correctCount: 8,
      wrongCount: 2,
      status: 'submitted',
      timedOut: false,
      submittedAt: new Date('2026-03-01T10:00:00Z'),
    },
    {
      _id: 'attempt-2',
      userId: users[1],
      materialId: materials[1],
      score: 60,
      correctCount: 6,
      wrongCount: 4,
      status: 'submitted',
      timedOut: true,
      submittedAt: new Date('2026-03-02T10:00:00Z'),
    },
    {
      _id: 'attempt-3',
      userId: users[0],
      materialId: materials[1],
      score: null,
      correctCount: 0,
      wrongCount: 0,
      status: 'in_progress',
      timedOut: false,
      submittedAt: null,
    },
  ];

  class User {
    static async findOne(query) {
      return users.find((user) => user.username === query.username) || null;
    }

    static async find(query = {}) {
      if (!query.username) return users;
      const regex = query.username.$regex;
      return users.filter((user) => regex.test(user.username));
    }
  }

  class Material {
    static find(query = {}) {
      const rows = materials.filter((material) =>
        Object.entries(query).every(([key, value]) => material[key] === value)
      );
      return { sort: async () => [...rows].sort((a, b) => b.createdAt - a.createdAt) };
    }
  }

  class Question {
    static async countDocuments() {
      return 0;
    }
  }

  class Attempt {
    static find(query = {}) {
      const rows = attempts.filter((attempt) =>
        Object.entries(query).every(([key, value]) => {
          if (key === 'userId' && value.$in) return value.$in.some((id) => String(id) === String(attempt.userId._id));
          if (key === 'userId') return String(attempt.userId._id) === String(value);
          if (key === 'materialId') return String(attempt.materialId._id) === String(value);
          return attempt[key] === value;
        })
      );
      return chainRows(rows);
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
  return { app: createApp() };
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

async function login(baseUrl, username) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password: 'secret123' }),
  });

  assert.equal(response.status, 302);
  return response.headers.get('set-cookie');
}

describe('reports routes', () => {
  it('shows only the current user submitted attempts newest first', async () => {
    const { app } = mockApp();

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl, 'alice');
      const response = await fetch(`${baseUrl}/reports/me`, { headers: { cookie } });
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /Biologi/);
      assert.match(html, /80/);
      assert.match(html, /8/);
      assert.match(html, /2/);
      assert.doesNotMatch(html, /Fisika/);
      assert.doesNotMatch(html, /60/);
    });
  });

  it('shows all submitted attempts to admins with filters', async () => {
    const { app } = mockApp();

    await withServer(app, async (baseUrl) => {
      const cookie = await login(baseUrl, 'admin');
      const all = await fetch(`${baseUrl}/admin/reports`, { headers: { cookie } });
      const allHtml = await all.text();
      const filtered = await fetch(`${baseUrl}/admin/reports?user=bob&material=000000000000000000000102`, {
        headers: { cookie },
      });
      const filteredHtml = await filtered.text();

      assert.equal(all.status, 200);
      assert.match(allHtml, /alice/);
      assert.match(allHtml, /bob/);
      assert.match(allHtml, /Biologi/);
      assert.match(allHtml, /Fisika/);
      assert.equal(filtered.status, 200);
      assert.doesNotMatch(filteredHtml, /alice/);
      assert.match(filteredHtml, /bob/);
      assert.doesNotMatch(filteredHtml, /Biologi/);
      assert.match(filteredHtml, /Fisika/);
    });
  });
});
