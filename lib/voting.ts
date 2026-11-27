// Summarizes committee votes for one application. Recused members do not
// count toward quorum. "Agreement" means every proposed rating is within
// `tolerance` seconds of the median.

export interface VoteLike {
  proposed_rating: number | null;
  recused: boolean;
}

export interface VoteSummary {
  cast: number;
  recused: number;
  quorum: number;
  quorumMet: boolean;
  median: number | null;
  low: number | null;
  high: number | null;
  agreement: boolean;
}

export function summarizeVotes(votes: VoteLike[], quorum: number, tolerance = 3): VoteSummary {
  const ratings = votes
    .filter((v) => !v.recused && typeof v.proposed_rating === "number")
    .map((v) => v.proposed_rating as number)
    .sort((a, b) => a - b);
  const recused = votes.filter((v) => v.recused).length;
  const n = ratings.length;
  let median: number | null = null;
  if (n > 0) {
    median = n % 2 === 1 ? ratings[(n - 1) / 2] : Math.round((ratings[n / 2 - 1] + ratings[n / 2]) / 2);
  }
  return {
    cast: n,
    recused,
    quorum,
    quorumMet: n >= quorum,
    median,
    low: n ? ratings[0] : null,
    high: n ? ratings[n - 1] : null,
    agreement: n > 0 && median !== null && ratings.every((r) => Math.abs(r - median!) <= tolerance),
  };
}
