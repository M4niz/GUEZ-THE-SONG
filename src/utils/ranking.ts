import type { Player } from '../components/GameScreens';

export interface Row { id: string; name: string; avatar?: string; score: number; streak: number }

/** Leaderboard order: highest score first. The host doesn't compete, so it is left out. */
export function rankPlayers(players: Player[], scores: Record<string, number>, streaks: Record<string, number>): Row[] {
  return players
    .filter(p => p.id !== 'HOST')
    .map(p => ({ ...p, score: scores[p.id] || 0, streak: streaks[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
}
