import { useEffect, useState } from 'react';
import { useGroups, useScheduleByGroup } from '../hooks/useData';
import { ScheduleTable } from './ScheduleTable';
import { SearchableSelect } from './SearchableSelect';
import { usePersistedId } from '../hooks/usePersistedId';

export function StudentTab() {
  const { data: groups, loading, error } = useGroups();
  const [groupId, setGroupId] = usePersistedId('schedule.selectedGroupId');
  const { data: lessons, loading: lessonsLoading } = useScheduleByGroup(groupId);

  // Если сохранённой группы больше нет в списке — сбрасываем
  useEffect(() => {
    if (loading || groupId == null) return;
    if (!groups.some((g) => g.id === groupId)) {
      setGroupId(null);
    }
  }, [loading, groups, groupId, setGroupId]);

  if (loading) return <div className="loading">Загрузка групп…</div>;
  if (error) return <div className="error">{error}</div>;

  const options = groups.map((g) => ({ id: g.id, label: g.name }));

  return (
    <>
      <div className="controls">
        <SearchableSelect
          id="group-select"
          label="Группа"
          options={options}
          value={groupId}
          onChange={setGroupId}
          placeholder="Выберите или начните вводить группу"
        />
      </div>

      {!groupId && <div className="empty">Выберите группу, чтобы увидеть расписание</div>}
      {groupId && lessonsLoading && <div className="loading">Загрузка расписания…</div>}
      {groupId && !lessonsLoading && <ScheduleTable lessons={lessons} />}
    </>
  );
}