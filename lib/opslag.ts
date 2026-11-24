/**
 * Lokale opslag, gescheiden per team. Twee teams in dezelfde browser delen
 * daardoor niets: eigen selectie, eigen koppeling, eigen wedstrijden.
 */

import type { Speler, Wedstrijd } from './model';
import type { Koppeling } from './team-data';

const BASIS = 'jo-coach';

function lees<T>(sleutel: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const ruw = window.localStorage.getItem(sleutel);
    return ruw ? (JSON.parse(ruw) as T) : null;
  } catch {
    return null;
  }
}

function schrijf(sleutel: string, waarde: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(sleutel, JSON.stringify(waarde));
    return true;
  } catch {
    // Privemodus of vol geheugen. De app werkt door, alleen zonder bewaren.
    return false;
  }
}

/**
 * Wedstrijden die al op een telefoon stonden voordat er competitieperiodes
 * bestonden, hebben dat veld niet. Die horen bij de eerste periode. Zonder
 * deze aanvulling zou opslaan een lege waarde naar de sheet sturen.
 */
function metStandaard(w: Wedstrijd | null): Wedstrijd | null {
  if (!w) return null;
  return { ...w, competitieperiode: w.competitieperiode ?? 1 };
}

export function opslagVoor(team: string) {
  const p = `${BASIS}:${team}`;
  return {
    koppeling: () => lees<Koppeling>(`${p}:koppeling`),
    bewaarKoppeling: (k: Koppeling) => schrijf(`${p}:koppeling`, k),

    spelers: () => lees<Speler[]>(`${p}:spelers`) ?? [],
    bewaarSpelers: (s: Speler[]) => schrijf(`${p}:spelers`, s),

    wedstrijd: (id: string) => metStandaard(lees<Wedstrijd>(`${p}:wedstrijd:${id}`)),
    bewaarWedstrijd: (w: Wedstrijd) => schrijf(`${p}:wedstrijd:${w.id}`, w),

    huidigeWedstrijdId: () => lees<string>(`${p}:huidige-wedstrijd`),
    bewaarHuidigeWedstrijdId: (id: string) => schrijf(`${p}:huidige-wedstrijd`, id),

    /** Alle wedstrijden die op dit apparaat staan. */
    alleWedstrijden: (): Wedstrijd[] => {
      if (typeof window === 'undefined') return [];
      const uit: Wedstrijd[] = [];
      const prefix = `${p}:wedstrijd:`;
      for (let i = 0; i < window.localStorage.length; i++) {
        const sleutel = window.localStorage.key(i);
        if (!sleutel?.startsWith(prefix)) continue;
        const w = metStandaard(lees<Wedstrijd>(sleutel));
        if (w) uit.push(w);
      }
      return uit;
    },

    verwijderWedstrijd: (id: string) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(`${p}:wedstrijd:${id}`);
      } catch {
        // niets aan te doen, de app werkt door
      }
    },

    /** Gebeurtenissen die nog niet naar de sheet zijn gestuurd. */
    onverzonden: () => lees<string[]>(`${p}:onverzonden`) ?? [],
    bewaarOnverzonden: (ids: string[]) => schrijf(`${p}:onverzonden`, ids),

    /** Waar of het plan nog moet worden opgeslagen. */
    planWacht: () => lees<boolean>(`${p}:plan-wacht`) ?? false,
    bewaarPlanWacht: (wacht: boolean) => schrijf(`${p}:plan-wacht`, wacht),

    /** Welke competitieperiode het wedstrijdoverzicht laat zien. */
    competitieperiode: () => lees<number>(`${p}:competitieperiode`),
    bewaarCompetitieperiode: (cp: number) => schrijf(`${p}:competitieperiode`, cp),
  };
}

export type Opslag = ReturnType<typeof opslagVoor>;
