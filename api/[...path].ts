type Provider = 'appdeploy' | 'ollama';
type Req = { method?: string; query: { path?: string | string[] }; body?: unknown };
type Res = { status(code: number): Res; json(value: unknown): void; setHeader(name: string, value: string): void; end(): void };
type Input = { level?: string; topic?: string; count?: number; text?: string; messages?: Array<{ role?: string; content?: string }>; provider?: Provider; model?: string };
const LEVELS = ['N5','N4','N3','N2','N1'];
const OLLAMA_MODELS = [
  'kimi-k3.1-pro:cloud','deepseek-v4.1-flash:cloud','deepseek-v4.1-flash:1017-cloud',
  'glm-5.3-flash:cloud','inkling-2-small:cloud','beam:cloud','minimax-m3.1-flash:cloud',
  'muse-spark-open:cloud','clef:cloud','clef:27b-cloud','kimi-k3:cloud',
  'nemotron-3-ultra:cloud','mimo-v2.6-flash:cloud','mimo-v2.6-pro:cloud'
];
const schemas: Record<string, Record<string, unknown>> = {
  chat: {type:'object',properties:{japanese:{type:'string'},reading:{type:'string'},indonesian:{type:'string'},correction:{type:'string'}},required:['japanese','reading','indonesian','correction']},
  flashcards: {type:'object',properties:{cards:{type:'array',items:{type:'object',properties:{word:{type:'string'},reading:{type:'string'},meaning:{type:'string'},example:{type:'string'},exampleId:{type:'string'}},required:['word','reading','meaning','example','exampleId']}}},required:['cards']},
  quiz: {type:'object',properties:{questions:{type:'array',items:{type:'object',properties:{question:{type:'string'},options:{type:'array',items:{type:'string'}},answerIndex:{type:'integer'},explanation:{type:'string'}},required:['question','options','answerIndex','explanation']}}},required:['questions']},
  correct: {type:'object',properties:{isCorrect:{type:'boolean'},corrected:{type:'string'},natural:{type:'string'},explanation:{type:'string'},points:{type:'array',items:{type:'string'}}},required:['isCorrect','corrected','natural','explanation','points']}
};
const lvl=(v:unknown)=>typeof v==='string'&&LEVELS.includes(v)?v:'N5';
const clamp=(v:unknown,d:number,m:number)=>Math.min(Math.max(typeof v==='number'?Math.floor(v):d,1),m);
function makePrompt(route:string,b:Input): {system:string;prompt?:string;messages?:Array<{role:string;content:string}>;temperature:number} {
  const l=lvl(b.level);
  if(route==='chat') {
    const messages=(Array.isArray(b.messages)?b.messages:[]).filter(m=>(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'&&m.content.trim()).slice(-12).map(m=>({role:m.role as string,content:(m.content as string).slice(0,1000)}));
    if(!messages.length||messages[messages.length-1].role!=='user') throw new Error('Pesan tidak boleh kosong.');
    return {system:'Kamu adalah sensei bahasa Jepang yang ramah untuk penutur bahasa Indonesia. Level murid: JLPT '+l+'. Balas dengan bahasa Jepang sederhana sesuai level (1-3 kalimat) lalu ajukan satu pertanyaan lanjutan. Isi: japanese, reading (hiragana), indonesian (terjemahan Indonesia), correction (koreksi singkat atau string kosong).',messages,temperature:0.8};
  }
  if(route==='flashcards') {
    const topic=typeof b.topic==='string'&&b.topic.trim()?b.topic.trim().slice(0,80):'kehidupan sehari-hari';
    return {system:'Kamu pembuat flashcard bahasa Jepang untuk penutur bahasa Indonesia. Gunakan kanji bila lazim di level tersebut.',prompt:'Buat '+clamp(b.count,8,12)+' kartu kosakata JLPT '+l+' bertema: '+topic+'. Tiap kartu: word, reading (hiragana), meaning (arti Indonesia), example (kalimat contoh Jepang), exampleId (terjemahan Indonesia).',temperature:0.7};
  }
  if(route==='quiz') return {system:'Kamu pembuat soal latihan JLPT untuk penutur bahasa Indonesia. Setiap soal pilihan ganda dengan tepat satu jawaban benar.',prompt:'Buat '+clamp(b.count,5,10)+' soal JLPT '+l+' (campuran kosakata, kanji, dan tata bahasa). Tiap soal: question, options (4 pilihan), answerIndex (0-3), explanation (penjelasan singkat bahasa Indonesia).',temperature:0.7};
  const text=typeof b.text==='string'?b.text.trim().slice(0,600):'';
  if(!text) throw new Error('Tulis kalimat bahasa Jepang terlebih dahulu.');
  return {system:'Kamu sensei yang mengoreksi kalimat bahasa Jepang murid Indonesia dengan jelas dan sabar. Penjelasan dalam bahasa Indonesia.',prompt:'Level murid JLPT '+l+'. Koreksi kalimat ini: '+text+'. Isi: isCorrect (boolean), corrected (kalimat yang benar), natural (versi lebih alami), explanation (ringkasan), points (daftar poin tata bahasa yang perlu diperhatikan).',temperature:0.7};
}
async function ollama(route:string,b:Input) {
  const key=process.env.OLLAMA_API_KEY;
  const requestedModel=typeof b.model==='string'?b.model:'';
  const model=OLLAMA_MODELS.includes(requestedModel)?requestedModel:(process.env.OLLAMA_MODEL||OLLAMA_MODELS[0]);
  if(!key) throw new Error('Konfigurasi Ollama Cloud belum lengkap. Isi OLLAMA_API_KEY di Vercel.');
  const base=(process.env.OLLAMA_BASE_URL||'https://ollama.com/api').replace(/\/+$/,'');
  const p=makePrompt(route,b);
  const messages=[{role:'system',content:p.system},...('messages' in p&&p.messages?p.messages:p.prompt?[{role:'user',content:p.prompt}]:[])];
  let response: Response;
  try {
    response=await fetch(base+'/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model,messages,stream:false,format:schemas[route],options:{temperature:p.temperature}})});
  } catch {
    throw new Error('Tidak dapat terhubung ke Ollama Cloud. Periksa koneksi server atau OLLAMA_BASE_URL.');
  }
  const raw=await response.text();
  let payload: any; try { payload=raw?JSON.parse(raw):{}; } catch { payload={}; }
  if(!response.ok) {
    const detail=typeof payload?.error==='string'?payload.error:'';
    if(response.status===401||response.status===403) throw new Error('API Key Ollama tidak valid atau tidak memiliki akses. Periksa OLLAMA_API_KEY di Vercel. '+detail);
    if(response.status===404) throw new Error('Model atau endpoint Ollama tidak ditemukan. Periksa nama model yang dipilih. '+detail);
    if(response.status===429) throw new Error('Batas penggunaan atau kuota Ollama Cloud tercapai. Coba lagi nanti atau periksa akun Ollama. '+detail);
    throw new Error('Ollama Cloud menolak permintaan (HTTP '+response.status+'). '+detail);
  }
  const result=payload as {message?:{content?:string}};
  if(!result.message?.content) throw new Error('Ollama Cloud mengembalikan respons kosong.');
  try { return JSON.parse(result.message.content); } catch { throw new Error('Respons Ollama bukan JSON yang sesuai. Coba model lain atau periksa dukungan structured output model tersebut.'); }
}
async function appdeploy(route:string,body:Input) {
  const base=(process.env.APPDEPLOY_BACKEND_URL||'https://nihongo-sensei-ai-rb0lxt.v2.appdeploy.ai').replace(/\/+$/,'');
  const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const raw=await response.text();
  let data:unknown; try{data=JSON.parse(raw);}catch{data={error:'Backend AppDeploy mengembalikan respons yang tidak valid.'};}
  return {status:response.status,data};
}
export default async function handler(req:Req,res:Res):Promise<void> {
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.status(204).end();return;}
  if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
  const raw=req.query.path,route=Array.isArray(raw)?raw.join('/'):raw;
  if(!route||!['chat','flashcards','quiz','correct'].includes(route)){res.status(404).json({error:'Endpoint tidak ditemukan.'});return;}
  const body=(req.body&&typeof req.body==='object'?req.body:{}) as Input;
  try{
    const provider:Provider=body.provider==='ollama'||body.provider==='appdeploy'?body.provider:process.env.AI_PROVIDER==='ollama'?'ollama':'appdeploy';
    if(provider==='ollama'){res.status(200).json(await ollama(route,body));return;}
    const result=await appdeploy(route,body);res.status(result.status).json(result.data);
  }catch(e){
    const message=e instanceof Error?e.message:'Sensei AI sedang tidak tersedia, silakan coba lagi.';
    const status=message.includes('Pesan tidak boleh kosong')||message.includes('Tulis kalimat')?400:502;
    res.status(status).json({error:message});
  }
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const raw = req.query.path;
  const route = Array.isArray(raw) ? raw.join('/') : raw;
  return handleRoute(route, req, res);
}
