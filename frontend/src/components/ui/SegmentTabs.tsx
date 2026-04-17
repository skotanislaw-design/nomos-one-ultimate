interface Tab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface SegmentTabsProps<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
}

export function SegmentTabs<T extends string>({ tabs, active, onChange, size = 'md' }: SegmentTabsProps<T>) {
  const px = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-[#0d2035]/60 border border-[#1a3a5c]/30 w-fit flex-wrap">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`${px} rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            active === tab.id
              ? 'bg-[#C6A75E] text-[#071220]'
              : 'text-[#7a9ab8] hover:text-[#d4dce8]'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              active === tab.id ? 'bg-[#071220]/30 text-[#071220]' : 'bg-[#0d2035] text-[#5a7a9a]'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
