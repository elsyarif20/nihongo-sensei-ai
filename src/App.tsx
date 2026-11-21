import { useState } from 'react';
import { api } from '@appdeploy/client';
import {
  MessageCircle,
  Layers,
  ListChecks,
  PenLine,
  Send,
  Loader2,
} from 'lucide-react';

type Tab = 'chat' | 'cards' | 'quiz' | 'fix';
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const ERR = 'Terjadi kesalahan. Silakan coba lagi.';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const { data } = await api.post(url, body);
  return data as T;
}

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}

function ErrorText({ text }: { text: string }) {
  return text ? (
    <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{text}</p>
  ) : null;
}

const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50';
const btnGhost =
  'rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-100';
const card = 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  reading?: string;
  translation?: string;
  correction?: string;
}

function Chat({ level }: { level: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: t }];
    setMsgs(next);
    setInput('');
    setErr('');
    setBusy(true);
    try {
      const r = await post<{
        japanese: string;
        reading: string;
        indonesian: string;
        correction: string;
      }>('/api/chat', {
        level,
        messages: next.map(m => ({ role: m.role, content: m.content })),
      });
      setMsgs([
        ...next,
        {
          role: 'assistant',
          content: r.japanese,
          reading: r.reading,
          translation: r.indonesian,
          correction: r.correction,
        },
      ]);
    } catch {
      setErr(ERR);
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="space-y-3">
        {msgs.length === 0 && (
          <div className={card}>
            <p className="text-sm text-stone-600">
              Ngobrol dengan sensei dalam bahasa Jepang. Coba mulai dengan:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                'こんにちは、はじめまして。',
                '今日は天気がいいですね。',
                'おすすめの食べ物は何ですか。',
              ].map(s => (
                <button key={s} className={btnGhost} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
            }
          >
            <div
              className={
                'max-w-[85%] rounded-2xl px-4 py-3 ' +
                (m.role === 'user'
                  ? 'bg-rose-600 text-white'
                  : 'border border-stone-200 bg-white')
              }
            >
              <p className="text-base">{m.content}</p>
              {m.reading && (
                <p className="mt-1 text-xs text-stone-500">{m.reading}</p>
              )}
              {m.translation && (
                <p className="mt-1 text-sm text-stone-700">{m.translation}</p>
              )}
              {m.correction && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  Koreksi: {m.correction}
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner /> Sensei sedang mengetik...
          </div>
        )}
      </div>
      <ErrorText text={err} />
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          placeholder="Tulis dalam bahasa Jepang..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
        />
        <button
          className={btn}
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          aria-label="Kirim"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface FlashCard {
  word: string;
  reading: string;
  meaning: string;
  example: string;
  exampleId: string;
}

function Cards({ level }: { level: string }) {
  const [topic, setTopic] = useState('');
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [stats, setStats] = useState(() =>
    load('jp_stats', { known: 0, again: 0 })
  );

  async function generate() {
    setBusy(true);
    setErr('');
    try {
      const r = await post<{ cards: FlashCard[] }>('/api/flashcards', {
        level,
        topic,
        count: 8,
      });
      setCards(r.cards);
      setI(0);
      setFlip(false);
    } catch {
      setErr(ERR);
    }
    setBusy(false);
  }

  function mark(known: boolean) {
    const next = {
      known: stats.known + (known ? 1 : 0),
      again: stats.again + (known ? 0 : 1),
    };
    setStats(next);
    save('jp_stats', next);
    setFlip(false);
    setI(i + 1);
  }

  const c = cards[i];
  return (
    <div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          placeholder="Tema (mis. makanan, sekolah, perjalanan)"
          value={topic}
          onChange={e => setTopic(e.target.value)}
        />
        <button className={btn} onClick={generate} disabled={busy}>
          {busy ? <Spinner /> : <Layers className="h-4 w-4" />} Buat kartu
        </button>
      </div>
      <ErrorText text={err} />
      {c && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-stone-500">
            Kartu {i + 1} dari {cards.length}
          </p>
          <button
            className={card + ' w-full min-h-[200px] text-center'}
            onClick={() => setFlip(!flip)}
          >
            {!flip ? (
              <span className="text-5xl">{c.word}</span>
            ) : (
              <span className="block space-y-2">
                <span className="block text-sm text-stone-500">
                  {c.reading}
                </span>
                <span className="block text-xl font-semibold">{c.meaning}</span>
                <span className="block text-sm">{c.example}</span>
                <span className="block text-xs text-stone-500">
                  {c.exampleId}
                </span>
              </span>
            )}
          </button>
          <p className="mt-2 text-center text-xs text-stone-500">
            Ketuk kartu untuk membalik
          </p>
          {flip && (
            <div className="mt-3 flex justify-center gap-3">
              <button className={btnGhost} onClick={() => mark(false)}>
                Ulangi
              </button>
              <button className={btn} onClick={() => mark(true)}>
                Hafal
              </button>
            </div>
          )}
        </div>
      )}
      {cards.length > 0 && !c && (
        <div className={card + ' mt-4 text-center'}>
          <p className="font-medium">Semua kartu selesai!</p>
          <p className="mt-1 text-sm text-stone-600">
            Total hafal: {stats.known} | Perlu diulang: {stats.again}
          </p>
        </div>
      )}
    </div>
  );
}

interface Question {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

function Quiz({ level }: { level: string }) {
  const [qs, setQs] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [best, setBest] = useState<number>(() => load('jp_best', 0));

  async function start() {
    setBusy(true);
    setErr('');
    try {
      const r = await post<{ questions: Question[] }>('/api/quiz', {
        level,
        count: 5,
      });
      setQs(r.questions);
      setI(0);
      setPicked(null);
      setScore(0);
    } catch {
      setErr(ERR);
    }
    setBusy(false);
  }

  function pick(n: number) {
    if (picked !== null) return;
    setPicked(n);
    if (n === qs[i].answerIndex) setScore(score + 1);
  }

  function next() {
    const last = i + 1 >= qs.length;
    if (last && score > best) {
      setBest(score);
      save('jp_best', score);
    }
    setPicked(null);
    setI(i + 1);
  }

  const q = qs[i];
  return (
    <div>
      <button className={btn} onClick={start} disabled={busy}>
        {busy ? <Spinner /> : <ListChecks className="h-4 w-4" />} Mulai kuis{' '}
        {level}
      </button>
      <ErrorText text={err} />
      {q && (
        <div className={card + ' mt-4'}>
          <p className="text-xs text-stone-500">
            Soal {i + 1} dari {qs.length}
          </p>
          <p className="mt-2 text-lg">{q.question}</p>
          <div className="mt-3 space-y-2">
            {q.options.map((o, n) => {
              let cls = 'w-full rounded-xl border px-3 py-2 text-left text-sm ';
              if (picked === null) cls += 'border-stone-300 hover:bg-stone-100';
              else if (n === q.answerIndex)
                cls += 'border-green-500 bg-green-50';
              else if (n === picked) cls += 'border-red-400 bg-red-50';
              else cls += 'border-stone-200 opacity-60';
              return (
                <button key={n} className={cls} onClick={() => pick(n)}>
                  {o}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <div className="mt-3">
              <p className="rounded-lg bg-stone-50 p-3 text-sm">
                {q.explanation}
              </p>
              <button className={btn + ' mt-3'} onClick={next}>
                {i + 1 >= qs.length ? 'Lihat hasil' : 'Soal berikutnya'}
              </button>
            </div>
          )}
        </div>
      )}
      {qs.length > 0 && !q && (
        <div className={card + ' mt-4 text-center'}>
          <p className="text-lg font-semibold">
            Skor: {score} / {qs.length}
          </p>
          <p className="mt-1 text-sm text-stone-600">Skor terbaik: {best}</p>
        </div>
      )}
    </div>
  );
}

interface Fix {
  isCorrect: boolean;
  corrected: string;
  natural: string;
  explanation: string;
  points: string[];
}

function Correct({ level }: { level: string }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState<Fix | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!text.trim()) {
      setErr('Tulis kalimat bahasa Jepang terlebih dahulu.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      setRes(await post<Fix>('/api/correct', { level, text }));
    } catch {
      setErr(ERR);
    }
    setBusy(false);
  }

  return (
    <div>
      <textarea
        className="h-28 w-full rounded-xl border border-stone-300 bg-white p-3 text-sm"
        placeholder="Tulis kalimat bahasa Jepang yang ingin dikoreksi..."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <button className={btn + ' mt-2'} onClick={submit} disabled={busy}>
        {busy ? <Spinner /> : <PenLine className="h-4 w-4" />} Koreksi
      </button>
      <ErrorText text={err} />
      {res && (
        <div className={card + ' mt-4 space-y-2'}>
          <p
            className={
              'text-sm font-medium ' +
              (res.isCorrect ? 'text-green-700' : 'text-amber-700')
            }
          >
            {res.isCorrect
              ? 'Kalimat sudah benar'
              : 'Ada yang perlu diperbaiki'}
          </p>
          <p className="text-lg">{res.corrected}</p>
          <p className="text-sm text-stone-600">Lebih alami: {res.natural}</p>
          <p className="text-sm">{res.explanation}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
            {res.points.map((p, n) => (
              <li key={n}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: typeof MessageCircle }[] = [
  { id: 'chat', label: 'Tutor', icon: MessageCircle },
  { id: 'cards', label: 'Kartu', icon: Layers },
  { id: 'quiz', label: 'Kuis', icon: ListChecks },
  { id: 'fix', label: 'Koreksi', icon: PenLine },
];

function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [level, setLevel] = useState<string>(() => load('jp_level', 'N5'));

  function changeLevel(v: string) {
    setLevel(v);
    save('jp_level', v);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="flex items-center justify-between p-4">
        <h1 className="text-xl font-bold">
          日本語 <span className="text-rose-600">Sensei AI</span>
        </h1>
        <select
          className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm"
          value={level}
          onChange={e => changeLevel(e.target.value)}
          aria-label="Level JLPT"
        >
          {LEVELS.map(l => (
            <option key={l} value={l}>
              JLPT {l}
            </option>
          ))}
        </select>
      </header>
      <nav className="grid grid-cols-4 gap-2 px-4">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium ' +
                (tab === t.id
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-stone-600 border border-stone-200')
              }
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </nav>
      <main className="flex-1 p-4">
        {tab === 'chat' && <Chat level={level} />}
        {tab === 'cards' && <Cards level={level} />}
        {tab === 'quiz' && <Quiz level={level} />}
        {tab === 'fix' && <Correct level={level} />}
      </main>
    </div>
  );
}

export default App;
