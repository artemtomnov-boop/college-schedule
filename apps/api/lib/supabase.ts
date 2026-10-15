import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Ленивая инициализация Supabase-клиента.
 * Создаётся только при первом вызове — чтобы модуль можно было импортировать
 * в скриптах, которым Supabase не нужен (например, test-parser).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Не заданы SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
        'Создай apps/api/.env с этими переменными.'
    );
  }

  _client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return _client;
}