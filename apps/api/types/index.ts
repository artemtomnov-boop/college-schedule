export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6;

export interface ParsedLesson {
  groupName: string;
  teacherName: string | null;
  subjectName: string;
  dayOfWeek: DayOfWeek;
  pairNumber: number;
  timeStart: string; // "08:30"
  timeEnd: string;   // "10:00"
  room: string | null;
  isEvent: boolean;
}

export interface ParsedSchedule {
  buildingId: number; // 1 или 2
  buildingName: string; // "Корпус 1" / "Корпус 2"
  lessons: ParsedLesson[];
}