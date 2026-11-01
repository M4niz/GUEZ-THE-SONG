import type { Player } from '../components/GameScreens';

export interface Row { id: string; name: string; avatar?: string; score: number; streak: number }

/** Leaderboard order: highest score first (the host plays too). */
export function rankPlayers(players: Player[], scores: Record<string, number>, streaks: Record<string, number>): Row[] {
  return players
    .map(p => ({ ...p, score: scores[p.id] || 0, streak: streaks[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
}
