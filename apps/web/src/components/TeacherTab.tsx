import { useState } from 'react';
import { useScheduleByTeacher, useTeachers } from '../hooks/useData';
import { ScheduleTable } from './ScheduleTable';
import { SearchableSelect } from './SearchableSelect';

export function TeacherTab() {
  const { data: teachers, loading, error } = useTeachers();
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const { data: lessons, loading: lessonsLoading } = useScheduleByTeacher(teacherId);

  if (loading) return <div className="loading">Загрузка преподавателей…</div>;
  if (error) return <div className="error">{error}</div>;

  const options = teachers.map((t) => ({ id: t.id, label: t.full_name }));

  return (
    <>
      <div className="controls">
        <SearchableSelect
          id="teacher-select"
          label="Преподаватель"
          options={options}
          value={teacherId}
          onChange={setTeacherId}
          placeholder="Выберите или начните вводить ФИО"
        />
      </div>

      {!teacherId && <div className="empty">Выберите преподавателя, чтобы увидеть его пары</div>}
      {teacherId && lessonsLoading && <div className="loading">Загрузка расписания…</div>}
      {teacherId && !lessonsLoading && <ScheduleTable lessons={lessons} showGroup />}
    </>
  );
}