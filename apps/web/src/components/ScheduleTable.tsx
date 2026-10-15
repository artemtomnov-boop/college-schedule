import type { LessonRaw } from '../types';

const DAY_NAMES: Record<number, string> = {
  0: 'Воскресенье',
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
};

interface Props {
  lessons: LessonRaw[];
  /** Показывать ли группу в каждой паре (для вкладки преподавателя) */
  showGroup?: boolean;
}

export function ScheduleTable({ lessons, showGroup }: Props) {
  if (lessons.length === 0) {
    return <div className="schedule"><div className="empty">Нет пар</div></div>;
  }

  const byDay = new Map<number, LessonRaw[]>();
  for (const l of lessons) {
    const arr = byDay.get(l.day_of_week) ?? [];
    arr.push(l);
    byDay.set(l.day_of_week, arr);
  }

  const sortedDays = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <div className="schedule">
      {sortedDays.map((day) => {
        const dayLessons = (byDay.get(day) ?? []).sort((a, b) => a.pair_number - b.pair_number);
        return (
          <div className="schedule-day" key={day}>
            <div className="day-header">{DAY_NAMES[day] ?? `День ${day}`}</div>
            {dayLessons.map((l) => (
              <div className="lesson" key={l.id}>
                <div className="lesson-time">
                  <strong>{l.pair_number === 0 ? '0 пара' : `${l.pair_number} пара`}</strong>
                  {l.time_start.slice(0, 5)}–{l.time_end.slice(0, 5)}
                </div>
                <div className="lesson-body">
                  <div className="lesson-subject">
                    {l.subjects?.name ?? '—'}
                    {!showGroup && l.buildings?.name && (
                      <span className="building-tag">{l.buildings.name}</span>
                    )}
                  </div>
                  <div className="lesson-meta">
                    {showGroup && l.groups?.name && <>{l.groups.name}</>}
                    {showGroup && l.buildings?.name && <><span className="dot">•</span>{l.buildings.name}</>}
                    {l.teachers?.full_name && (
                      <>
                        <span className="dot">•</span>
                        {l.teachers.full_name}
                      </>
                    )}
                    {l.room && (
                      <>
                        <span className="dot">•</span>
                        {l.room}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}