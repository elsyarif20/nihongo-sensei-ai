import { handleRoute } from '../lib/api-handler';

type Req = { method?: string; query: { path?: string | string[] }; body?: unknown };
type Res = { status(code: number): Res; json(value: unknown): void; setHeader(name: string, value: string): void; end(): void };

export default async function handler(req: Req, res: Res): Promise<void> {
  return handleRoute('correct', req, res);
}
