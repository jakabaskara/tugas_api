const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;

afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[require.resolve('../src/services/pdf')];
  delete require.cache[require.resolve('../src/services/openaiQuestions')];
});

describe('extractPdfText', () => {
  it('normalizes extracted PDF text', async () => {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'pdf-parse') {
        return async () => ({ text: '  Baris satu\n\nbaris   dua  ' });
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const { extractPdfText } = require('../src/services/pdf');
    const text = await extractPdfText(Buffer.from('pdf'));

    assert.equal(text, 'Baris satu baris dua');
  });

  it('rejects PDFs without readable text', async () => {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'pdf-parse') {
        return async () => ({ text: '   ' });
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const { extractPdfText } = require('../src/services/pdf');

    await assert.rejects(
      extractPdfText(Buffer.from('pdf')),
      /PDF tidak berisi teks yang bisa dibaca/
    );
  });
});

describe('generateQuestionsFromText', () => {
  it('retries once and returns exactly 100 normalized questions', async () => {
    process.env.SESSION_SECRET = 'test';
    process.env.OPENAI_API_KEY = 'test-key';
    const calls = [];

    class FakeOpenAI {
      constructor(options) {
        assert.equal(options.apiKey, 'test-key');
        this.chat = {
          completions: {
            create: async (payload) => {
              calls.push(payload);
              const count = calls.length === 1 ? 99 : 101;
              const questions = Array.from({ length: count }, (_, i) => ({
                text: `Soal ${i + 1}`,
                options: { A: 'a', B: 'b', C: 'c', D: 'd' },
                correctAnswer: i % 2 === 0 ? 'a' : 'B',
              }));
              return {
                choices: [{ message: { content: JSON.stringify({ questions }) } }],
              };
            },
          },
        };
      }
    }

    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'openai') return FakeOpenAI;
      return originalLoad.call(this, request, parent, isMain);
    };

    const { generateQuestionsFromText } = require('../src/services/openaiQuestions');
    const questions = await generateQuestionsFromText('Materi '.repeat(20000));

    assert.equal(calls.length, 2);
    assert.equal(questions.length, 100);
    assert.equal(questions[0].correctAnswer, 'A');
    assert.equal(calls[0].response_format.type, 'json_object');
    assert.equal(calls[0].messages[1].content.match(/Materi /g).length, 8571);
  });

  it('retries once on malformed JSON then returns 100 questions', async () => {
    process.env.SESSION_SECRET = 'test';
    process.env.OPENAI_API_KEY = 'test-key';
    const calls = [];

    class FakeOpenAI {
      constructor() {
        this.chat = {
          completions: {
            create: async () => {
              calls.push(1);
              if (calls.length === 1) {
                return { choices: [{ message: { content: 'not-json' } }] };
              }
              const questions = Array.from({ length: 100 }, (_, i) => ({
                text: `Soal ${i + 1}`,
                options: { A: 'a', B: 'b', C: 'c', D: 'd' },
                correctAnswer: 'A',
              }));
              return {
                choices: [{ message: { content: JSON.stringify({ questions }) } }],
              };
            },
          },
        };
      }
    }

    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'openai') return FakeOpenAI;
      return originalLoad.call(this, request, parent, isMain);
    };

    const { generateQuestionsFromText } = require('../src/services/openaiQuestions');
    const questions = await generateQuestionsFromText('Materi fotosintesis');

    assert.equal(calls.length, 2);
    assert.equal(questions.length, 100);
  });

  it('throws after retry when OpenAI returns invalid JSON twice', async () => {
    process.env.SESSION_SECRET = 'test';
    process.env.OPENAI_API_KEY = 'test-key';
    const calls = [];

    class FakeOpenAI {
      constructor() {
        this.chat = {
          completions: {
            create: async () => {
              calls.push(1);
              return { choices: [{ message: { content: '{bad json' } }] };
            },
          },
        };
      }
    }

    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'openai') return FakeOpenAI;
      return originalLoad.call(this, request, parent, isMain);
    };

    const { generateQuestionsFromText } = require('../src/services/openaiQuestions');

    await assert.rejects(
      generateQuestionsFromText('Materi fotosintesis'),
      /Hanya mendapat 0 soal valid dari AI/
    );
    assert.equal(calls.length, 2);
  });
});
