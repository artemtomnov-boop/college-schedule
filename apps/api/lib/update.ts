import axios from 'axios';
import { parseScheduleFile } from './parser.js';
import { getSupabaseAdmin } from './supabase.js';
import type { ParsedLesson, ParsedSchedule } from '../types/index.js';

const SCHEDULE_PAGE_URL = 'https://phystech.pro/студенту/расписание/';

/**
 * Скачиваем страницу расписания и находим ссылки на XLSX-файлы.
 * Корпус определяем по «№1» / «№2» в URL.
 * Имена файлов содержат дату и меняются каждую неделю — поэтому
 * динамическое обнаружение критично.
 */
async function discoverScheduleUrls(): Promise<
  Array<{ buildingId: number; buildingName: string; url: string }>
> {
  const res = await axios.get<string>(SCHEDULE_PAGE_URL, {
    timeout: 30_000,
    headers: { 'User-Agent': 'Mozilla/5.0 schedule-app' },
    responseType: 'text',
  });
  const html = res.data as string;

  const hrefs = [...html.matchAll(/href=["']([^"']+\.xlsx)["']/gi)].map(
    (m) => m[1]
  );
  const unique = [...new Set(hrefs)];

  const result: Array<{ buildingId: number; buildingName: string; url: string }> = [];
  const usedBuildings = new Set<number>();

  for (const raw of unique) {
    const url = raw.startsWith('http')
      ? raw
      : new URL(raw, SCHEDULE_PAGE_URL).toString();
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
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    headers: { 'User-Agent': 'Mozilla/5.0 schedule-app' },
  });
  return Buffer.from(res.data);
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
    console.log(`[update] Скачиваем ${source.buildingName}: ${source.url}`);
    const buf = await downloadXlsx(source.url);
    const lessons = parseScheduleFile(buf);
    console.log(
      `[update] ${source.buildingName}: распарсено ${lessons.length} занятий`
    );
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

export async function runFullUpdate(): Promise<void> {
  const schedules = await fetchAndParseAll();
  await saveSchedulesToDb(schedules);
}