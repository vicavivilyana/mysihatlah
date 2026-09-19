import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const navigate = useNavigate();
  return (
    <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-sand/85 px-4 py-3 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => (onBack ? onBack() : navigate(-1))}
        aria-label="Back"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-white text-navy transition active:scale-95"
      >
        <ChevronLeft size={21} />
      </button>
      <h1 className="h-section">{title}</h1>
    </header>
  );
}
