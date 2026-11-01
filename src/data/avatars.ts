import { Cat, Dog, Bird, Rabbit, Turtle, Snail } from 'lucide-react';

export const AVATARS = [
  { id: 'cat', icon: Cat, color: 'var(--orange)' },
  { id: 'dog', icon: Dog, color: 'var(--blue)' },
  { id: 'bird', icon: Bird, color: 'var(--green)' },
  { id: 'rabbit', icon: Rabbit, color: 'var(--purple)' },
  { id: 'turtle', icon: Turtle, color: 'var(--green-dark)' },
  { id: 'snail', icon: Snail, color: 'var(--red)' }
];

export function getAvatar(id?: string) {
  return AVATARS.find(a => a.id === id) ?? AVATARS[1];
}
