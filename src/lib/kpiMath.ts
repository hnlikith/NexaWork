/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
export interface KpiEntryInput {
  label: string;
  weight: number;
  score: number;
}

export interface KraMetricsInput {
  ownership: number;
  quality: number;
  initiative: number;
}

export interface BehavioralMetricsInput {
  attendance: number;
  discipline: number;
  communication: number;
}

function toPercentFromRating(rating: number): number {
  if (!rating) return 0;
  return parseFloat(((rating / 5) * 100).toFixed(2));
}

export function calculateWeightedKpi(entries: KpiEntryInput[]): number {
  const validEntries = entries.filter((entry) => entry.weight > 0);
  const totalWeight = validEntries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = validEntries.reduce(
    (sum, entry) => sum + (entry.score * entry.weight),
    0
  );

  return parseFloat((weightedSum / totalWeight).toFixed(2));
}

export function calculateKraScore(metrics: KraMetricsInput): number {
  const values = [metrics.ownership, metrics.quality, metrics.initiative]
    .filter((value) => value > 0)
    .map(toPercentFromRating);

  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return parseFloat(average.toFixed(2));
}

export function calculateBehavioralScore(metrics: BehavioralMetricsInput): number {
  const values = [
    Math.max(0, Math.min(100, metrics.attendance || 0)),
    toPercentFromRating(metrics.discipline),
    toPercentFromRating(metrics.communication),
  ];

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return parseFloat(average.toFixed(2));
}

export function calculateFinalKpiScore(
  kpiScore: number,
  kraScore: number,
  behavioralScore: number
): number {
  return parseFloat(((kpiScore * 0.4) + (kraScore * 0.4) + (behavioralScore * 0.2)).toFixed(2));
}

export function getKpiRating(finalScore: number): {
  label: string;
  incentiveHint: string;
} {
  if (finalScore >= 90) return { label: "Outstanding", incentiveHint: "100% × incentive" };
  if (finalScore >= 75) return { label: "Exceeds", incentiveHint: "80–90% × incentive" };
  if (finalScore >= 60) return { label: "Meets", incentiveHint: "60–70% × incentive" };
  if (finalScore >= 40) return { label: "Needs Improvement", incentiveHint: "30–50% × incentive" };
  return { label: "Poor", incentiveHint: "0%" };
}
