import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Building, Group, LessonRaw, Teacher } from '../types';

export function useGroups() {
  const [data, setData] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('groups')
      .select('id, name, building_id')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setData(data ?? []);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}

export function useTeachers() {
  const [data, setData] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('teachers')
      .select('id, full_name')
      .order('full_name')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setData(data ?? []);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}

export function useBuildings() {
  const [data, setData] = useState<Building[]>([]);
  useEffect(() => {
    supabase.from('buildings').select('id, name').order('id').then(({ data }) => {
      setData(data ?? []);
    });
  }, []);
  return data;
}

const LESSON_SELECT = `
  id, group_id, teacher_id, subject_id, building_id,
  day_of_week, pair_number, time_start, time_end, room, is_event,
  groups ( id, name ),
  teachers ( id, full_name ),
  subjects ( id, name ),
  buildings ( id, name )
`;

export function useScheduleByGroup(groupId: number | null) {
  const [data, setData] = useState<LessonRaw[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) { setData([]); return; }
    setLoading(true);
    supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('group_id', groupId)
      .order('day_of_week')
      .order('pair_number')
      .then(({ data, error }) => {
        if (error) console.error(error);
        setData((data as unknown as LessonRaw[]) ?? []);
        setLoading(false);
      });
  }, [groupId]);

  return { data, loading };
}

export function useScheduleByTeacher(teacherId: number | null) {
  const [data, setData] = useState<LessonRaw[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!teacherId) { setData([]); return; }
    setLoading(true);
    supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('teacher_id', teacherId)
      .order('day_of_week')
      .order('pair_number')
      .then(({ data, error }) => {
        if (error) console.error(error);
        setData((data as unknown as LessonRaw[]) ?? []);
        setLoading(false);
      });
  }, [teacherId]);

  return { data, loading };
}

export interface ScheduleMeta {
  updatedAt: string | null;
  lastCheckedAt: string | null;
}

export function useScheduleMeta(): ScheduleMeta {
  const [meta, setMeta] = useState<ScheduleMeta>({
    updatedAt: null,
    lastCheckedAt: null,
  });

  useEffect(() => {
    supabase
      .from('schedule_meta')
      .select('updated_at, last_checked_at')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('schedule_meta:', error.message);
          return;
        }
        setMeta({
          updatedAt: data?.updated_at ?? null,
          lastCheckedAt: data?.last_checked_at ?? null,
        });
      });
  }, []);

  return meta;
}