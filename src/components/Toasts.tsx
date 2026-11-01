import { Avatar } from './Avatar';

export interface Toast {
  id: number;
  name: string;
  avatar?: string;
}

/** Bottom-left stack: "[avatar] name left" */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          <Avatar id={t.avatar} size={32} />
          <span><strong>{t.name}</strong> left</span>
        </div>
      ))}
    </div>
  );
}
