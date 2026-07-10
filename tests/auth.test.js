const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const originalLoad = Module._load;

afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/auth')];
  delete require.cache[require.resolve('../src/routes/materials')];
  delete require.cache[require.resolve('../src/middleware/auth')];
});

function mockAppWithUsers(users = new Map()) {
  Module._load = function load(request, parent, isMain) {
    if (request === 'connect-mongo') {
      return {
        create() {
          return new session.MemoryStore();
        },
      };
    }
    if (request === '../models/User') {
      return class User {
        constructor(data) {
          Object.assign(this, data);
          this._id = data._id || `${users.size + 1}`;
        }

        static async findOne(query) {
          return users.get(query.username) || null;
        }

        async save() {
          if (users.has(this.username)) {
            const err = new Error('duplicate key');
            err.code = 11000;
            throw err;
          }
          users.set(this.username, this);
          return this;
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const { createApp } = require('../src/app');
  return createApp();
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

function postForm(baseUrl, path, data, cookie) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(data),
  });
}

describe('auth middleware', () => {
  it('redirects guests and lets authenticated users through', () => {
    const { requireAuth } = require('../src/middleware/auth');
    const flashes = [];
    const guestRes = {
      redirectTo: null,
      redirect(path) {
        this.redirectTo = path;
      },
    };

    requireAuth(
      { session: {}, flash: (type, message) => flashes.push([type, message]) },
      guestRes,
      () => assert.fail('guest should not continue')
    );

    assert.deepEqual(flashes, [['error', 'Silakan login dulu']]);
    assert.equal(guestRes.redirectTo, '/login');

    let continued = false;
    requireAuth({ session: { user: { id: '1' } } }, {}, () => {
      continued = true;
    });
    assert.equal(continued, true);
  });

  it('redirects non-admin users', () => {
    const { requireAdmin } = require('../src/middleware/auth');
    const flashes = [];
    const res = {
      redirectTo: null,
      redirect(path) {
        this.redirectTo = path;
      },
    };

    requireAdmin(
      {
        session: { user: { role: 'user' } },
        flash: (type, message) => flashes.push([type, message]),
      },
      res,
      () => assert.fail('non-admin should not continue')
    );

    assert.deepEqual(flashes, [['error', 'Akses admin saja']]);
    assert.equal(res.redirectTo, '/');
  });
});

describe('auth routes', () => {
  it('registers a user, stores the session shape, and protects materials', async () => {
    const users = new Map();
    const app = mockAppWithUsers(users);

    await withServer(app, async (baseUrl) => {
      const response = await postForm(baseUrl, '/register', {
        username: 'alice',
        password: 'secret123',
      });
      const cookie = response.headers.get('set-cookie');

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/materials');
      assert.ok(cookie);
      assert.equal(users.get('alice').role, 'user');
      assert.notEqual(users.get('alice').passwordHash, 'secret123');
      assert.equal(await bcrypt.compare('secret123', users.get('alice').passwordHash), true);

      const materials = await fetch(`${baseUrl}/materials`, { headers: { cookie } });
      assert.equal(materials.status, 200);
      assert.equal(await materials.text(), 'materials ok');
    });
  });

  it('logs in admins to admin materials and logout clears materials access', async () => {
    const users = new Map();
    users.set('admin', {
      _id: 'admin-id',
      username: 'admin',
      role: 'admin',
      passwordHash: await bcrypt.hash('secret123', 10),
    });
    const app = mockAppWithUsers(users);

    await withServer(app, async (baseUrl) => {
      const login = await postForm(baseUrl, '/login', {
        username: 'admin',
        password: 'secret123',
      });
      const cookie = login.headers.get('set-cookie');

      assert.equal(login.status, 302);
      assert.equal(login.headers.get('location'), '/admin/materials');
      assert.ok(cookie);

      const logout = await postForm(baseUrl, '/logout', {}, cookie);
      assert.equal(logout.status, 302);
      assert.equal(logout.headers.get('location'), '/login');

      const materials = await fetch(`${baseUrl}/materials`, {
        redirect: 'manual',
        headers: { cookie: logout.headers.get('set-cookie') || cookie },
      });
      assert.equal(materials.status, 302);
      assert.equal(materials.headers.get('location'), '/login');
    });
  });
});
