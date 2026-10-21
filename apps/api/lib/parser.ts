import * as XLSX from 'xlsx';
import type { DayOfWeek, ParsedLesson } from '../types/index.js';

const DAY_MAP: Record<string, DayOfWeek> = {
  'пн': 1,
  'понедельник': 1,
  'вт': 2,
  'вторник': 2,
  'ср': 3,
  'среда': 3,
  'чт': 4,
  'четверг': 4,
  'пт': 5,
  'пятница': 5,
  'сб': 6,
  'суббота': 6,
};

/**
 * Парсит один XLSX-файл расписания и возвращает список занятий.
 * Файл имеет структуру:
 *   A          | B              | C     | D..AH
 *   День       | Время занятий  | Пара  | <группы...>
 *   ВТ         | 08:30-10:00    | 1     | <занятия...>
 *   ...        | ...            | ...   | ...
 *   Ср         | Время занятий  | 0     | <группы...>   ← заголовок нового дня
 *   ...
 */
export function parseScheduleFile(buffer: Buffer): ParsedLesson[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (rows.length < 2) return [];

  // Заголовок: группы начиная с колонки D (индекс 3)
  const headerRow = rows[0];
  const groups: string[] = [];
  for (let i = 3; i < headerRow.length; i++) {
    const name = String(headerRow[i] ?? '').trim().replace(/\s*\/\s*/g, '/');
    groups.push(name);
  }

  const lessons: ParsedLesson[] = [];
  let currentDay: DayOfWeek | null = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const dayCell = String(row[0] ?? '').trim();
    const timeCell = String(row[1] ?? '').trim();
    const pairCell = String(row[2] ?? '').trim();

    // Обновляем текущий день, если он указан в колонке A
    if (dayCell) {
      const key = dayCell.trim().toLowerCase();
      if (key in DAY_MAP) currentDay = DAY_MAP[key];
    }

    const pairNum = parseInt(pairCell, 10);
    if (isNaN(pairNum) || pairNum < 0 || pairNum > 7) continue; // заголовки дней и перемены
    if (!currentDay) continue;

    const { start, end } = parseTimeRange(timeCell);
    if (!start || !end) continue;

    for (let g = 0; g < groups.length; g++) {
      const groupName = groups[g];
      if (!groupName) continue;

      const cellVal = String(row[3 + g] ?? '').trim();
      if (!cellVal) continue;

      const parsed = parseCell(cellVal);
      if (!parsed) continue;

      lessons.push({
        groupName,
        dayOfWeek: currentDay,
        pairNumber: pairNum,
        timeStart: start,
        timeEnd: end,
        ...parsed,
      });
    }
  }

  return lessons;
}

function parseTimeRange(s: string): { start: string | null; end: string | null } {
  const m = s.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return { start: null, end: null };
  return { start: m[1], end: m[2] };
}

function looksLikeRoom(s: string): boolean {
  return (
    /^\d/.test(s) ||
    /^(Кабинет|Лаборатория|Аудитория|Актовый зал|Спортивный зал|Спортзал|САЛЮТ)/i.test(s)
  );
}

function looksLikeTeacher(s: string): boolean {
  // Три слова с заглавной буквы: "Иванов Иван Иванович"
  return /^[А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/i.test(s);
}

function parseCell(cell: string): {
  subjectName: string;
  teacherName: string | null;
  room: string | null;
  isEvent: boolean;
} | null {
  const parts = cell
    .replace(/\|/g, '/')
    .split('/')
    .map((p) => p.trim().replace(/^"+|"+$/g, '').trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  if (parts.length === 1) {
    return { subjectName: parts[0], teacherName: null, room: null, isEvent: true };
  }

  const subjectName = parts[0];
  let teacherName: string | null = parts[1] || null;
  let room: string | null = parts[2] || null;

  // Если во второй части аудитория, а в третьей ФИО — меняем местами
  if (teacherName && room && looksLikeRoom(teacherName) && looksLikeTeacher(room)) {
    [teacherName, room] = [room, teacherName];
  }

  return { subjectName, teacherName, room, isEvent: false };
}