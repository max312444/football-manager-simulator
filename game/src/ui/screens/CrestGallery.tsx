// 개발용: 엠블럼 전체 보기 (http://localhost:5179/?crests)
import { clubs, clubKo } from '../../data/db';
import { CREST_STYLES } from '../crests/styles';
import { Crest } from '../components/Crest';

export function CrestGallery() {
  const ids = [...new Set([...Object.keys(CREST_STYLES), ...clubs.keys()])];
  return (
    <div className="h-full overflow-auto bg-ink-950 p-8">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-6">
        {ids.map((id) => (
          <div key={id} className="flex flex-col items-center gap-2">
            <Crest clubId={id} size={72} />
            <div className="flex items-center gap-2"><Crest clubId={id} size={24} /><Crest clubId={id} size={16} /></div>
            <div className="text-center text-[12px] text-mid">{clubKo(id)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
