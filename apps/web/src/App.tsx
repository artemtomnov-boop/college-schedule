import { useState } from 'react';
import { StudentTab } from './components/StudentTab';
import { TeacherTab } from './components/TeacherTab';

type Tab = 'student' | 'teacher';

export default function App() {
  const [tab, setTab] = useState<Tab>('student');

  return (
    <div className="container">
      <h1>Расписание занятий</h1>
      <p className="subtitle">Актуально на текущую неделю · обновляется каждые 4 часа</p>

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