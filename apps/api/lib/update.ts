import axios from 'axios';
import { parseScheduleFile } from './parser.js';
import { getSupabaseAdmin } from './supabase.js';
import type { ParsedLesson, ParsedSchedule } from '../types/index.js';

export const SCHEDULE_SOURCES = [
  {
    buildingId: 1,
    buildingName: 'Корпус 1',
    url: 'https://phystech.pro/wp-content/uploads/2026/10/%D1%81-13.10-%D0%A1%D1%82%D1%80%D1%83%D0%BA%D1%82%D1%83%D1%80%D0%BD%D0%BE%D0%B5-%D0%BF%D0%BE%D0%B4%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5-%E2%84%961-1.xlsx',
  },
  {
    buildingId: 2,
    buildingName: 'Корпус 2',
    url: 'https://phystech.pro/wp-content/uploads/2026/10/12.10.26-%D0%A1%D1%82%D1%80%D1%83%D0%BA%D1%82%D1%83%D1%80%D0%BD%D0%BE%D0%B5-%D0%BF%D0%BE%D0%B4%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5-%E2%84%962.-1.xlsx',
  },
];

async function downloadXlsx(url: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    headers: { 'User-Agent': 'Mozilla/5.0 schedule-app' },
  });
  return Buffer.from(res.data);
}

export async function fetchAndParseAll(): Promise<ParsedSchedule[]> {
  const result: ParsedSchedule[] = [];
  for (const source of SCHEDULE_SOURCES) {
    console.log(`[update] Скачиваем ${source.buildingName}: ${source.url}`);
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

/**
 * Полная перезагрузка расписания в Supabase.
 * Порядок:
 *   1. upsert корпусов
 *   2.  все lessons (пересобираемудалить с нуля)
 *   3. upsert групп, преподавателей, предметов -> получить id
 *   4. вставить lessons с резолвом id
 */
export async function saveSchedulesToDb(schedules: ParsedSchedule[]): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
    // 1. Корпуса
  for (const s of schedules) {
    const { error } = await supabaseAdmin
      .from('buildings')
      .upsert({ id: s.buildingId, name: s.buildingName }, { onConflict: 'id' });
    if (error) throw new Error(`buildings upsert: ${error.message}`);
  }

  // 2. Удаляем все lessons (перезапись)
  {
    const { error } = await supabaseAdmin.from('lessons').delete().neq('id', 0);
    if (error) throw new Error(`lessons delete: ${error.message}`);
  }

  // Собираем уникальные сущности
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

  // 3a. Группы
  const groupRows = [...groupKeys.values()];
  const { data: groupsData, error: groupsErr } = await supabaseAdmin
    .from('groups')
    .upsert(groupRows, { onConflict: 'name' })
    .select('id, name');
  if (groupsErr) throw new Error(`groups upsert: ${groupsErr.message}`);

  // 3b. Преподаватели
  const teacherRows = [...teacherKeys.values()];
  let teachersData: { id: number; full_name: string }[] = [];
  if (teacherRows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('teachers')
      .upsert(teacherRows, { onConflict: 'full_name' })
      .select('id, full_name');
    if (error) throw new Error(`teachers upsert: ${error.message}`);
    teachersData = data ?? [];
  }

  // 3c. Предметы
  const subjectRows = [...subjectKeys.values()];
  const { data: subjectsData, error: subjectsErr } = await supabaseAdmin
    .from('subjects')
    .upsert(subjectRows, { onConflict: 'name' })
    .select('id, name');
  if (subjectsErr) throw new Error(`subjects upsert: ${subjectsErr.message}`);

  // Индексы name -> id
  const groupIdByName = new Map<string, number>();
  for (const g of groupsData ?? []) groupIdByName.set(g.name, g.id);

  const teacherIdByName = new Map<string, number>();
  for (const t of teachersData) teacherIdByName.set(t.full_name, t.id);

  const subjectIdByName = new Map<string, number>();
  for (const s of subjectsData ?? []) subjectIdByName.set(s.name, s.id);

  // 4. Lessons
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