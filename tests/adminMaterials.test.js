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
    '../src/routes/admin',
    '../src/middleware/auth',
  ].forEach((id) => {
    try {
      delete require.cache[require.resolve(id)];
    } catch {
      // Module may not exist yet during the red test.
    }
  });
});

function questions(count = 100) {
  return Array.from({ length: count }, (_, i) => ({
    text: `Soal ${i + 1}`,
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
    correctAnswer: 'A',
  }));
}

function mockApp({
  generatedQuestions = questions(),
  generateError = null,
  materials = [],
  savedQuestions = [],
} = {}) {
  const users = new Map([
    [
      'admin',
      {
        _id: 'admin-id',
        username: 'admin',
        role: 'admin',
        passwordHash: bcrypt.hashSync('secret123', 10),
      },
    ],
  ]);

  class Material {
    constructor(data) {
      Object.assign(this, data);
      this._id = `material-${materials.length + 1}`;
      this.createdAt = new Date();
    }

    async save() {
      const index = materials.findIndex((material) => material._id === this._id);
      if (index === -1) {
        materials.push(this);
      } else {
        materials[index] = this;
      }
      return this;
    }

    static find() {
      return {
        sort: async () => [...materials].sort((a, b) => b.createdAt - a.createdAt),
      };
    }
  }

  class Question {
    static async insertMany(items) {
      savedQuestions.push(...items);
      return items;
    }

    static async countDocuments(query) {
      return savedQuestions.filter((q) => String(q.materialId) === String(query.materialId)).length;
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
    if (request === '../models/User') {
      return class User {
        static async findOne(query) {
          return users.get(query.username) || null;
        }
      };
    }
    if (request === '../models/Material') return Material;
    if (request === '../models/Question') return Question;
    if (request === '../services/pdf') {
      return { extractPdfText: async () => 'Materi fotosintesis' };
    }
    if (request === '../services/openaiQuestions') {
      return {
        generateQuestionsFromText: async () => {
          if (generateError) throw generateError;
          return generatedQuestions;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  process.env.SESSION_SECRET = 'test';
  const { createApp } = require('../src/app');
  return { app: createApp(), materials, savedQuestions };
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

async function loginAdmin(baseUrl) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'admin', password: 'secret123' }),
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/materials');
  return response.headers.get('set-cookie');
}

async function uploadPdf(baseUrl, cookie, title = 'Biologi') {
  const form = new FormData();
  form.set('title', title);
  form.set('pdf', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'materi.pdf');

  return fetch(`${baseUrl}/admin/materials/upload`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie },
    body: form,
  });
}

describe('admin materials routes', () => {
  it('shows the admin materials list to admins', async () => {
    const { app } = mockApp({
      materials: [{ _id: 'm1', title: 'Biologi', filename: 'bio.pdf', status: 'ready', createdAt: new Date() }],
      savedQuestions: [{ materialId: 'm1' }, { materialId: 'm1' }],
    });

    await withServer(app, async (baseUrl) => {
      const cookie = await loginAdmin(baseUrl);
      const response = await fetch(`${baseUrl}/admin/materials`, { headers: { cookie } });
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /Biologi/);
      assert.match(html, /ready/);
      assert.match(html, /2 soal/);
    });
  });

  it('uploads a PDF, creates a ready material, and saves generated questions', async () => {
    const { app, materials, savedQuestions } = mockApp();

    await withServer(app, async (baseUrl) => {
      const cookie = await loginAdmin(baseUrl);
      const response = await uploadPdf(baseUrl, cookie);

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/admin/materials');
      assert.equal(materials.length, 1);
      assert.equal(materials[0].title, 'Biologi');
      assert.equal(materials[0].status, 'ready');
      assert.equal(savedQuestions.length, 100);
      assert.equal(String(savedQuestions[0].materialId), String(materials[0]._id));
    });
  });

  it('marks the material failed when AI generation fails', async () => {
    const { app, materials, savedQuestions } = mockApp({ generateError: new Error('AI down') });

    await withServer(app, async (baseUrl) => {
      const cookie = await loginAdmin(baseUrl);
      const response = await uploadPdf(baseUrl, cookie);

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/admin/materials/upload');
      assert.equal(materials.length, 1);
      assert.equal(materials[0].status, 'failed');
      assert.equal(savedQuestions.length, 0);
    });
  });
});
