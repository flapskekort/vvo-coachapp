/**
 * Teams. Eén codebase, per team een eigen adres, eigen sheet en eigen
 * lokale opslag. Een team toevoegen is één regel hieronder.
 */

export type TeamConfig = {
  slug: string;
  naam: string;
  teamGrootte: number;
};

export const TEAMS: TeamConfig[] = [
  { slug: 'jo9-4', naam: 'JO9-4', teamGrootte: 6 },
  { slug: 'jo11-4', naam: 'JO11-4', teamGrootte: 8 },
];

export function teamVan(slug: string | undefined): TeamConfig | undefined {
  return TEAMS.find((t) => t.slug === slug);
}
