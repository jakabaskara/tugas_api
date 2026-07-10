const OpenAI = require('openai');
const config = require('../config');
const { normalizeQuestions } = require('./questionValidate');

function parseQuestions(content) {
  const parsed = JSON.parse(content);
  return normalizeQuestions(parsed.questions);
}

async function callOnce(client, text) {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Buat soal pilihan ganda dalam bahasa Indonesia. Balas hanya JSON valid berbentuk {"questions":[...]}.',
      },
      {
        role: 'user',
        content: [
          `Buat tepat ${config.questionsPerMaterial} soal dari materi berikut.`,
          'Setiap soal wajib punya: text, options dengan kunci A, B, C, D, dan correctAnswer berisi salah satu A/B/C/D.',
          'Jangan sertakan penjelasan, markdown, atau teks selain JSON.',
          '',
          text,
        ].join('\n'),
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI tidak mengembalikan konten soal');
  return parseQuestions(content);
}

async function generateQuestionsFromText(text) {
  if (!config.openaiApiKey) throw new Error('Missing env: OPENAI_API_KEY');

  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const clipped = String(text || '').slice(0, config.maxPdfChars);
  let questions = await callOnce(client, clipped);

  if (questions.length < config.questionsPerMaterial) {
    questions = await callOnce(client, clipped);
  }

  if (questions.length < config.questionsPerMaterial) {
    throw new Error(`Hanya mendapat ${questions.length} soal valid dari AI`);
  }

  return questions.slice(0, config.questionsPerMaterial);
}

module.exports = { generateQuestionsFromText };
