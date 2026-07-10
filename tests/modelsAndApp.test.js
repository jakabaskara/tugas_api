const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

describe('Mongoose models', () => {
  it('defines schema fields used by the quiz flow', () => {
    const User = require('../src/models/User');
    const Material = require('../src/models/Material');
    const Question = require('../src/models/Question');
    const Attempt = require('../src/models/Attempt');

    assert.deepEqual(User.schema.path('role').enumValues, ['admin', 'user']);
    assert.equal(User.schema.path('role').defaultValue, 'user');
    assert.equal(User.schema.path('username').options.unique, true);
    assert.equal(User.schema.options.timestamps, true);

    assert.deepEqual(Material.schema.path('status').enumValues, ['ready', 'failed']);
    assert.equal(Material.schema.path('uploadedBy').options.ref, 'User');
    assert.equal(Material.schema.options.timestamps, true);

    assert.equal(Question.schema.path('materialId').options.ref, 'Material');
    assert.equal(Question.schema.path('materialId')._index, true);
    assert.deepEqual(Question.schema.path('correctAnswer').enumValues, ['A', 'B', 'C', 'D']);

    assert.equal(Attempt.schema.path('userId').options.ref, 'User');
    assert.equal(Attempt.schema.path('materialId').options.ref, 'Material');
    assert.equal(Attempt.schema.path('questionIds').caster.options.ref, 'Question');
    assert.deepEqual(Attempt.schema.path('status').enumValues, ['in_progress', 'submitted']);
    assert.equal(Attempt.schema.path('score').defaultValue, null);
    assert.equal(Attempt.schema.path('timedOut').defaultValue, false);
  });
});

describe('createApp', () => {
  it('uses MongoStore and exposes session user in locals', async () => {
    process.env.SESSION_SECRET = 'test';

    const originalLoad = Module._load;
    let storeOptions;

    Module._load = function load(request, parent, isMain) {
      if (request === 'connect-mongo') {
        return {
          create(options) {
            storeOptions = options;
            const session = require('express-session');
            return new session.MemoryStore();
          },
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/app')];
    const { createApp } = require('../src/app');
    const config = require('../src/config');
    const app = createApp();
    Module._load = originalLoad;

    app.get('/__set_user', (req, res) => {
      req.session.user = { username: 'budi', role: 'user' };
      res.sendStatus(204);
    });
    app.get('/__current_user', (_req, res) => {
      res.json(res.locals.currentUser);
    });

    const server = app.listen(0);
    try {
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const setResponse = await fetch(`${baseUrl}/__set_user`);
      const cookie = setResponse.headers.get('set-cookie');
      const response = await fetch(`${baseUrl}/__current_user`, {
        headers: { cookie },
      });

      assert.deepEqual(storeOptions, { mongoUrl: config.mongodbUri });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { username: 'budi', role: 'user' });
    } finally {
      Module._load = originalLoad;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
