import { router, json, error, ai } from '@appdeploy/sdk';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];

function lvl(v: unknown): string {
  return typeof v === 'string' && LEVELS.includes(v) ? v : 'N5';
}

function clampCount(v: unknown, def: number, max: number): number {
  const n = typeof v === 'number' ? Math.floor(v) : def;
  return Math.min(Math.max(n, 1), max);
}

async function askJson(
  system: string,
  prompt: string,
  schema: Record<string, unknown>
) {
  const res = await ai.generate({
    system,
    prompt,
    schema,
    thinkingMode: 'NONE',
    maxTokens: 4000,
    temperature: 0.7,
  });
  return JSON.parse(res.text);
}

const AI_ERROR = 'Sensei AI sedang tidak tersedia, silakan coba lagi.';

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  'POST /api/chat': [
    async ({ body }) => {
      const b = (body ?? {}) as {
        level?: string;
        messages?: Array<{ role?: string; content?: string }>;
      };
      const msgs = (b.messages ?? [])
        .filter(
          m =>
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim()
        )
        .slice(-12)
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: (m.content as string).slice(0, 1000),
        }));
      if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user') {
        return error('Pesan tidak boleh kosong.', 400);
      }
      const system =
        'Kamu adalah sensei bahasa Jepang yang ramah untuk penutur bahasa Indonesia. Level murid: JLPT ' +
        lvl(b.level) +
        '. Balas dengan bahasa Jepang sederhana sesuai level (1-3 kalimat) lalu ajukan satu pertanyaan lanjutan. ' +
        'Isi: japanese (balasanmu), reading (hiragana), indonesian (terjemahan Indonesia), ' +
        'correction (jika kalimat murid salah, koreksi singkat dalam bahasa Indonesia; jika benar, string kosong).';
      try {
        const res = await ai.generate({
          system,
          messages: msgs,
          schema: {
            type: 'object',
            properties: {
              japanese: { type: 'string' },
              reading: { type: 'string' },
              indonesian: { type: 'string' },
              correction: { type: 'string' },
            },
            required: ['japanese', 'reading', 'indonesian', 'correction'],
          },
          thinkingMode: 'NONE',
          maxTokens: 1200,
          temperature: 0.8,
        });
        return json(JSON.parse(res.text));
      } catch {
        return error(AI_ERROR, 502);
      }
    },
  ],

  'POST /api/flashcards': [
    async ({ body }) => {
      const b = (body ?? {}) as {
        level?: string;
        topic?: string;
        count?: number;
      };
      const topic =
        typeof b.topic === 'string' && b.topic.trim()
          ? b.topic.trim().slice(0, 80)
          : 'kehidupan sehari-hari';
      const count = clampCount(b.count, 8, 12);
      try {
        const data = await askJson(
          'Kamu pembuat flashcard bahasa Jepang untuk penutur bahasa Indonesia. Gunakan kanji bila lazim di level tersebut.',
          'Buat ' +
            count +
            ' kartu kosakata JLPT ' +
            lvl(b.level) +
            ' bertema: ' +
            topic +
            '. Tiap kartu: word (Jepang), reading (hiragana), meaning (arti Indonesia), example (kalimat contoh Jepang), exampleId (terjemahan Indonesia).',
          {
            type: 'object',
            properties: {
              cards: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    word: { type: 'string' },
                    reading: { type: 'string' },
                    meaning: { type: 'string' },
                    example: { type: 'string' },
                    exampleId: { type: 'string' },
                  },
                  required: [
                    'word',
                    'reading',
                    'meaning',
                    'example',
                    'exampleId',
                  ],
                },
              },
            },
            required: ['cards'],
          }
        );
        return json(data);
      } catch {
        return error(AI_ERROR, 502);
      }
    },
  ],

  'POST /api/quiz': [
    async ({ body }) => {
      const b = (body ?? {}) as { level?: string; count?: number };
      const count = clampCount(b.count, 5, 10);
      try {
        const data = await askJson(
          'Kamu pembuat soal latihan JLPT untuk penutur bahasa Indonesia. Setiap soal pilihan ganda dengan tepat satu jawaban benar.',
          'Buat ' +
            count +
            ' soal JLPT ' +
            lvl(b.level) +
            ' (campuran kosakata, kanji, dan tata bahasa). Tiap soal: question, options (4 pilihan), answerIndex (0-3), explanation (penjelasan singkat bahasa Indonesia).',
          {
            type: 'object',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    question: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    answerIndex: { type: 'integer' },
                    explanation: { type: 'string' },
                  },
                  required: [
                    'question',
                    'options',
                    'answerIndex',
                    'explanation',
                  ],
                },
              },
            },
            required: ['questions'],
          }
        );
        return json(data);
      } catch {
        return error(AI_ERROR, 502);
      }
    },
  ],

  'POST /api/correct': [
    async ({ body }) => {
      const b = (body ?? {}) as { level?: string; text?: string };
      const text =
        typeof b.text === 'string' ? b.text.trim().slice(0, 600) : '';
      if (!text) {
        return error('Tulis kalimat bahasa Jepang terlebih dahulu.', 400);
      }
      try {
        const data = await askJson(
          'Kamu sensei yang mengoreksi kalimat bahasa Jepang murid Indonesia dengan jelas dan sabar. Penjelasan dalam bahasa Indonesia.',
          'Level murid JLPT ' +
            lvl(b.level) +
            '. Koreksi kalimat ini: ' +            text +
            '. Isi: isCorrect (boolean), corrected (kalimat yang benar), natural (versi lebih alami), explanation (ringkasan), points (daftar poin tata bahasa yang perlu diperhatikan).',
          {
            type: 'object',
            properties: {
              isCorrect: { type: 'boolean' },
              corrected: { type: 'string' },
              natural: { type: 'string' },
              explanation: { type: 'string' },
              points: { type: 'array', items: { type: 'string' } },
            },
            required: [
              'isCorrect',
              'corrected',
              'natural',
              'explanation',
              'points',
            ],
          }
        );
        return json(data);
      } catch {
        return error(AI_ERROR, 502);
      }
    },
  ],
});
