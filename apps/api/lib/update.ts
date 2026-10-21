import axios from 'axios';
import { parseScheduleFile } from './parser.js';
import { getSupabaseAdmin } from './supabase.js';
import type { ParsedLesson, ParsedSchedule } from '../types/index.js';
import { createHash } from 'node:crypto';

const SCHEDULE_PAGE_URL = 'https://phystech.pro/студенту/расписание/';
const HTTP_TIMEOUT = 55_000;

async function fetchWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[fetch] попытка ${i + 1}/${attempts} провалилась: ${msg}`);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function discoverScheduleUrls(): Promise<
  Array<{ buildingId: number; buildingName: string; url: string }>
> {
  console.log(`[update] Загружаем страницу: ${SCHEDULE_PAGE_URL}`);
  const res = await fetchWithRetry(() =>
    axios.get<string>(SCHEDULE_PAGE_URL, {
      timeout: HTTP_TIMEOUT,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      responseType: 'text',
      maxRedirects: 5,
    })
  );
  console.log(`[update] Страница получена, длина: ${String(res.data).length} символов`);

  const html = res.data as string;
  const hrefs = [...html.matchAll(/href=["']([^"']+\.xlsx)["']/gi)].map((m) => m[1]);
  const unique = [...new Set(hrefs)];
  console.log(`[update] Найдено XLSX-ссылок: ${unique.length}`);

  const result: Array<{ buildingId: number; buildingName: string; url: string }> = [];
  const usedBuildings = new Set<number>();

  for (const raw of unique) {
    const url = raw.startsWith('http') ? raw : new URL(raw, SCHEDULE_PAGE_URL).toString();
    if (!/\/uploads\/\d{4}\/\d{2}\//.test(url)) continue;

    const decoded = decodeURIComponent(url);
    let buildingId: number | null = null;
    if (/№\s*1\b/.test(decoded)) buildingId = 1;
    else if (/№\s*2\b/.test(decoded)) buildingId = 2;

    if (!buildingId || usedBuildings.has(buildingId)) continue;
    usedBuildings.add(buildingId);
    result.push({
      buildingId,
      buildingName: buildingId === 1 ? 'Корпус 1' : 'Корпус 2',
      url,
    });
  }

  return result;
}

async function downloadXlsx(url: string): Promise<Buffer> {
  const safeUrl = encodeURI(decodeURI(url));
  console.log(`[update] Скачиваем: ${safeUrl}`);
  return fetchWithRetry(async () => {
    const signal = AbortSignal.timeout(HTTP_TIMEOUT);
    const res = await fetch(safeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
      },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[update] Получено ${buf.byteLength} байт`);
    return buf;
  });
}

export async function fetchAndParseAll(): Promise<ParsedSchedule[]> {
  const sources = await discoverScheduleUrls();

  if (sources.length === 0) {
    throw new Error('Не удалось найти ссылки на XLSX на странице расписания');
  }
  if (sources.length < 2) {
    console.warn(
      `[update] Найдено только ${sources.length} файлов — возможно, второй корпус недоступен`
    );
  }

  const result: ParsedSchedule[] = [];
  for (const source of sources) {
    console.log(`[update] Обрабатываем ${source.buildingName}`);
    const buf = await downloadXlsx(source.url);
    const lessons = parseScheduleFile(buf);
    console.log(`[update] ${source.buildingName}: распарсено ${lessons.length} занятий`);
    result.push({
      buildingId: source.buildingId,
      buildingName: source.buildingName,
      lessons,
    });
  }
  return result;
}

export async function saveSchedulesToDb(schedules: ParsedSchedule[]): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  for (const s of schedules) {
    const { error } = await supabaseAdmin
      .from('buildings')
      .upsert({ id: s.buildingId, name: s.buildingName }, { onConflict: 'id' });
    if (error) throw new Error(`buildings upsert: ${error.message}`);
  }

  {
    const { error } = await supabaseAdmin.from('lessons').delete().neq('id', 0);
    if (error) throw new Error(`lessons delete: ${error.message}`);
  }

  const allLessons: Array<ParsedLesson & { buildingId: number }> = [];
  for (const s of schedules) {
    for (const l of s.lessons) allLessons.push({ ...l, buildingId: s.buildingId });
  }

  const groupKeys = new Map<string, { name: string; building_id: number }>();
  const teacherKeys = new Map<string, { full_name: string }>();
  const subjectKeys = new Map<string, { name: string }>();

  for (const l of allLessons) {
    groupKeys.set(l.groupName, { name: l.groupName, building_id: l.buildingId });
    if (l.teacherName) teacherKeys.set(l.teacherName, { full_name: l.teacherName });
    subjectKeys.set(l.subjectName, { name: l.subjectName });
  }

  const { data: groupsData, error: groupsErr } = await supabaseAdmin
    .from('groups')
    .upsert([...groupKeys.values()], { onConflict: 'name' })
    .select('id, name');
  if (groupsErr) throw new Error(`groups upsert: ${groupsErr.message}`);

  let teachersData: { id: number; full_name: string }[] = [];
  if (teacherKeys.size > 0) {
    const { data, error } = await supabaseAdmin
      .from('teachers')
      .upsert([...teacherKeys.values()], { onConflict: 'full_name' })
      .select('id, full_name');
    if (error) throw new Error(`teachers upsert: ${error.message}`);
    teachersData = data ?? [];
  }

  const { data: subjectsData, error: subjectsErr } = await supabaseAdmin
    .from('subjects')
    .upsert([...subjectKeys.values()], { onConflict: 'name' })
    .select('id, name');
  if (subjectsErr) throw new Error(`subjects upsert: ${subjectsErr.message}`);

  const groupIdByName = new Map<string, number>();
  for (const g of groupsData ?? []) groupIdByName.set(g.name, g.id);

  const teacherIdByName = new Map<string, number>();
  for (const t of teachersData) teacherIdByName.set(t.full_name, t.id);

  const subjectIdByName = new Map<string, number>();
  for (const s of subjectsData ?? []) subjectIdByName.set(s.name, s.id);

  const lessonRows = allLessons.map((l) => ({
    group_id: groupIdByName.get(l.groupName)!,
    teacher_id: l.teacherName ? teacherIdByName.get(l.teacherName) ?? null : null,
    subject_id: subjectIdByName.get(l.subjectName)!,
    building_id: l.buildingId,
    day_of_week: l.dayOfWeek,
    pair_number: l.pairNumber,
    time_start: l.timeStart,
    time_end: l.timeEnd,
    room: l.room,
    is_event: l.isEvent,
  }));

  if (lessonRows.length > 0) {
    const { error } = await supabaseAdmin.from('lessons').insert(lessonRows);
    if (error) throw new Error(`lessons insert: ${error.message}`);
  }

  console.log(`[update] Записано занятий: ${lessonRows.length}`);
}

/**
 * Вычисляет SHA-256 от байтов всех XLSX-файлов.
 * Если совпадает с сохранённым — расписание не изменилось.
 */
async function computeSchedulesHash(schedules: ParsedSchedule[]): Promise<string> {
  const hash = createHash('sha256');
  // Сортируем по buildingId, чтобы порядок был детерминированным
  const sorted = [...schedules].sort((a, b) => a.buildingId - b.buildingId);
  for (const s of sorted) {
    hash.update(`building:${s.buildingId}\n`);
    // Стабильная сериализация: сортируем занятия
    const lessons = [...s.lessons].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.pairNumber !== b.pairNumber) return a.pairNumber - b.pairNumber;
      return a.groupName.localeCompare(b.groupName);
    });
    for (const l of lessons) {
      hash.update(
        [
          l.groupName,
          l.dayOfWeek,
          l.pairNumber,
          l.timeStart,
          l.timeEnd,
          l.subjectName,
          l.teacherName ?? '',
          l.room ?? '',
          l.isEvent ? '1' : '0',
        ].join('|')
      );
      hash.update('\n');
    }
  }
  return hash.digest('hex');
}

async function getStoredHash(): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('schedule_meta')
    .select('content_hash')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    console.warn(`[update] schedule_meta read: ${error.message}`);
    return null;
  }
  return data?.content_hash ?? null;
}

async function saveStoredHash(hash: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('schedule_meta')
    .upsert({ id: 1, content_hash: hash, updated_at: new Date().toISOString() });
  if (error) throw new Error(`schedule_meta upsert: ${error.message}`);
}

export async function runFullUpdate(): Promise<{
  changed: boolean;
  lessons: number;
}> {
  const schedules = await fetchAndParseAll();
  const newHash = await computeSchedulesHash(schedules);
  const oldHash = await getStoredHash();

  if (oldHash === newHash) {
    const total = schedules.reduce((acc, s) => acc + s.lessons.length, 0);
    console.log(`[update] Хэш не изменился (${newHash.slice(0, 8)}…), пропускаем запись в БД.`);
    return { changed: false, lessons: total };
  }

  console.log(`[update] Расписание изменилось (${oldHash?.slice(0, 8) ?? '—'} → ${newHash.slice(0, 8)}), обновляем БД…`);
  await saveSchedulesToDb(schedules);
  await saveStoredHash(newHash);

  const total = schedules.reduce((acc, s) => acc + s.lessons.length, 0);
  return { changed: true, lessons: total };
}