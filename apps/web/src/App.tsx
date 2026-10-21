import { useState } from 'react';
import { StudentTab } from './components/StudentTab';
import { TeacherTab } from './components/TeacherTab';
import { useScheduleMeta } from './hooks/useData';

type Tab = 'student' | 'teacher';

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('student');
  const { lastCheckedAt } = useScheduleMeta();
  const checkedStr = formatDateTime(lastCheckedAt);

  return (
    <div className="container">
      <h1>Расписание занятий</h1>
      <p className="subtitle">
        Проверяется каждые 20 минут
        {checkedStr && <> · обновлено {checkedStr}</>}
      </p>

      <div className="tabs">
        <button
          className={`tab ${tab === 'student' ? 'active' : ''}`}
          onClick={() => setTab('student')}
        >
          Студенту
        </button>
        <button
          className={`tab ${tab === 'teacher' ? 'active' : ''}`}
          onClick={() => setTab('teacher')}
        >
          Преподавателю
        </button>
      </div>

      {tab === 'student' && <StudentTab />}
      {tab === 'teacher' && <TeacherTab />}
    </div>
  );
}