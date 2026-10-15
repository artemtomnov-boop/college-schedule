export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Building {
  id: number;
  name: string;
}

export interface Group {
  id: number;
  name: string;
  building_id: number | null;
}

export interface Teacher {
  id: number;
  full_name: string;
}

export interface Subject {
  id: number;
  name: string;
}

export interface LessonRaw {
  id: number;
  group_id: number;
  teacher_id: number | null;
  subject_id: number;
  building_id: number | null;
  day_of_week: number;
  pair_number: number;
  time_start: string;
  time_end: string;
  room: string | null;
  is_event: boolean;
  groups: { id: number; name: string } | null;
  teachers: { id: number; full_name: string } | null;
  subjects: { id: number; name: string } | null;
  buildings: { id: number; name: string } | null;
}