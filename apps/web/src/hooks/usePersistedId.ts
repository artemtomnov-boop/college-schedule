import { useEffect, useState } from 'react';

/**
 * Хранит числовой id в localStorage.
 * При перезагрузке страницы возвращает сохранённое значение.
 */
export function usePersistedId(key: string) {
  const [id, setId] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (id == null) localStorage.removeItem(key);
      else localStorage.setItem(key, String(id));
    } catch {
      // localStorage может быть заблокирован (приватный режим и т. п.) — молча игнорируем
    }
  }, [key, id]);

  return [id, setId] as const;
}