// Local-only leaderboard scoring system.
//
// Tracks all-time high score and weekly high score. Score is computed from
// multiple combat metrics (stage, damage dealt, turns used, combos, HP %, stars).

export interface LeaderboardRunStats {
  stage: number;
  isHardmode: boolean;
  totalDamageDealt: number;
  turnsUsed: number;
  combosTriggered: number;
  endHpPercent: number;
  stars: 1 | 2 | 3;
}

// Composite score formula derived from: stage (base), damage (up to cap), turns (penalty),
// combos (bonus), HP survival (bonus), and star multiplier (final).
export function computeLeaderboardScore(stats: LeaderboardRunStats): number {
  const base = stats.stage * 100 * (stats.isHardmode ? 2 : 1);
  const damageScore = Math.min(stats.totalDamageDealt / 10, 500);
  const turnsScore = Math.max(0, 200 - stats.turnsUsed * 5);
  const combosScore = stats.combosTriggered * 15;
  const hpScore = Math.round(stats.endHpPercent * 300);
  const starMult: Record<number, number> = { 1: 1.0, 2: 1.3, 3: 1.6 };
  const mult = starMult[stats.stars] ?? 1.0;
  return Math.round((base + damageScore + turnsScore + combosScore + hpScore) * mult);
}

// ISO week key "YYYY-WNN" for weekly reset logic.
export function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// Check if the weekly high score has expired (rolled into a new week).
export function checkWeeklyReset(profile: {
  weeklyScoreISO: string | null;
  weeklyHighScore: number;
}): { weeklyScoreISO: string | null; weeklyHighScore: number } {
  const currentWeek = getISOWeek(new Date());
  if (profile.weeklyScoreISO !== currentWeek) {
    return {
      weeklyScoreISO: currentWeek,
      weeklyHighScore: 0,
    };
  }
  return profile;
}
