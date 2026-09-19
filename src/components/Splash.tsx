import { Logo, Wordmark } from './Brand';

export default function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-sand">
      <Logo size={64} />
      <Wordmark className="text-2xl" />
    </div>
  );
}
