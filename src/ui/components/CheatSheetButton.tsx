import { useState } from 'react';

// Always-available combo cheat sheet button. Sits in the top-right corner of
// the in-game view. Toggles a small overlay listing the 3 combos.
export default function CheatSheetButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="absolute top-3 right-20 z-10 w-9 h-9 rounded-full text-base font-extrabold flex items-center justify-center"
        style={{
          background: 'linear-gradient(180deg, #fff5d8 0%, #d8c79a 100%)',
          color: '#4a321b',
          border: '2px solid rgba(120,80,30,0.4)',
          boxShadow: '0 3px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
          textShadow: '0 1px 0 rgba(255,255,255,0.4)',
        }}
        title="Combo cheat sheet"
      >
        ?
      </button>
      {open && (
        <div
          className="absolute top-14 right-3 z-20 pb-panel p-3 max-w-[300px] text-[12px] leading-snug pb-pop-in"
          onClick={() => setOpen(false)}
          style={{ color: '#3e2723' }}
        >
          <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold mb-2 text-center" style={{ color: '#6d4c2a' }}>
            ✨ Combo Cheat Sheet ✨
          </div>
          <Row icon="🌽" color="#2e7d32" name="Abundance">
            2+ same crop in a round → +10/20/35/50/70%
          </Row>
          <Row icon="🌈" color="#0277bd" name="Variety">
            3 different types → +10 coins (breaks Loyal)
          </Row>
          <Row icon="🔁" color="#ad1457" name="Loyal">
            Only one crop type per round → +10%/round, max +50%
          </Row>
          <div className="text-[10px] opacity-60 mt-2 italic text-center">tap to dismiss</div>
        </div>
      )}
    </>
  );
}

function Row({ icon, color, name, children }: { icon: string; color: string; name: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="text-xl flex-shrink-0">{icon}</div>
      <div>
        <div className="font-extrabold" style={{ color }}>{name}</div>
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
}
