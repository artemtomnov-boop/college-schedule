import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runFullUpdate } from '../../lib/update';

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'];
    const querySecret = req.query.secret;
    const ok = auth === `Bearer ${secret}` || querySecret === secret;
    if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await runFullUpdate();
    return res.status(200).json({ ok: true, at: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/update]', message);
    return res.status(500).json({ ok: false, error: message });
  }
}