import { getAvatar } from '../data/avatars';

export function Avatar({ id, size = 48 }: { id?: string; size?: number }) {
  const { icon: Icon, color } = getAvatar(id);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
      border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <Icon size={size * 0.55} color={color} />
    </div>
  );
}
