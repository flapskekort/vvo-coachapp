/**
 * Datamodel voor de coachapp.
 *
 * Kern van het model: een positie is een combinatie van een categorie
 * (keeper, verdediger, middenvelder, aanvaller) en een plek (links, midden,
 * rechts). De coordinaten op het veld worden daaruit afgeleid, niet per
 * formatie met de hand ingevoerd. Daardoor blijft de betekenis van een
 * positie gelijk als je van formatie wisselt.
 */

export type Categorie = 'Keeper' | 'Verdediger' | 'Middenvelder' | 'Aanvaller';
export type Plek = 'goal' | 'links' | 'midden' | 'rechts';

export type Positie = {
  id: string;
  categorie: Categorie;
  plek: Plek;
  label: string;
  x: number;
  y: number;
};

export const LINIES: Categorie[] = ['Verdediger', 'Middenvelder', 'Aanvaller'];
export const PLEKKEN: Plek[] = ['links', 'midden', 'rechts'];
export const PERIODES = [1, 2, 3, 4] as const;
export type Periode = (typeof PERIODES)[number];

const KOLOM_X: Record<Plek, number> = { goal: 50, links: 20, midden: 50, rechts: 80 };
const RIJ_Y: Record<Categorie, number> = {
  Keeper: 88,
  Verdediger: 69,
  Middenvelder: 46,
  Aanvaller: 21,
};

const LABELS: Record<Categorie, Record<Plek, string>> = {
  Keeper: { goal: 'Keeper', links: 'Keeper', midden: 'Keeper', rechts: 'Keeper' },
  Verdediger: {
    goal: '',
    links: 'Linksachter',
    midden: 'Centrale verdediger',
    rechts: 'Rechtsachter',
  },
  Middenvelder: {
    goal: '',
    links: 'Linksmidden',
    midden: 'Centrale middenvelder',
    rechts: 'Rechtsmidden',
  },
  Aanvaller: { goal: '', links: 'Linksbuiten', midden: 'Spits', rechts: 'Rechtsbuiten' },
};

export const KEEPER_POSITIE = 'keeper';

export const ALLE_POSITIES: Positie[] = [
  {
    id: KEEPER_POSITIE,
    categorie: 'Keeper',
    plek: 'goal',
    label: 'Keeper',
    x: KOLOM_X.goal,
    y: RIJ_Y.Keeper,
  },
  ...LINIES.flatMap((categorie) =>
    PLEKKEN.map((plek) => ({
      id: `${categorie}-${plek}`,
      categorie,
      plek,
      label: LABELS[categorie][plek],
      x: KOLOM_X[plek],
      y: RIJ_Y[categorie],
    }))
  ),
];

export function positie(id: string): Positie | undefined {
  return ALLE_POSITIES.find((p) => p.id === id);
}

/** Bij 1 speler staat hij centraal, bij 2 aan de zijkanten, bij 3 op alle plekken. */
const VERDELING: Record<number, Plek[]> = {
  0: [],
  1: ['midden'],
  2: ['links', 'rechts'],
  3: ['links', 'midden', 'rechts'],
};

export const PRESETS: Record<number, string[]> = {
  6: ['1-2-1-2', '1-2-2-1', '1-1-3-1', '1-1-2-2', '1-3-1-1'],
  8: ['1-3-3-1', '1-2-3-2', '1-3-1-3', '1-3-2-2', '1-2-2-3'],
};

export type FormatieResultaat =
  | { ok: true; linies: number[]; posities: string[] }
  | { ok: false; fout: string };

export function leesFormatie(tekst: string, teamGrootte: number): FormatieResultaat {
  const delen = String(tekst)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);

  let linies: number[];
  if (delen.length === 4 && delen[0] === 1) linies = delen.slice(1);
  else if (delen.length === 3) linies = delen;
  else
    return {
      ok: false,
      fout: 'Geef drie linies op: verdediging, middenveld en aanval. Bijvoorbeeld 1-2-1-2 of 2-1-2.',
    };

  if (linies.some((n) => n > 3))
    return { ok: false, fout: 'Per linie zijn er drie plekken: links, midden en rechts.' };

  const totaal = linies.reduce((a, b) => a + b, 0) + 1;
  if (totaal !== teamGrootte)
    return {
      ok: false,
      fout: `Deze formatie telt ${totaal} spelers inclusief keeper, dit team speelt met ${teamGrootte}.`,
    };

  const posities = [KEEPER_POSITIE];
  LINIES.forEach((categorie, i) => {
    VERDELING[linies[i]].forEach((plek) => posities.push(`${categorie}-${plek}`));
  });

  return { ok: true, linies, posities };
}

/** Leidt de formatienotatie af uit een opstelling, zodat het scherm meeloopt met de hand gemaakte wijzigingen. */
export function formatieVan(opstelling: Opstelling): string {
  return [1, ...LINIES.map((c) => PLEKKEN.filter((p) => opstelling[`${c}-${p}`]).length)].join(
    '-'
  );
}

// --- Wedstrijdgegevens ---

export type Speler = { id: string; naam: string; rugnummer: number; actief: boolean };

export type GebeurtenisType =
  | 'doelpunt_voor'
  | 'doelpunt_tegen'
  | 'wissel'
  | 'periode'
  /** Deze periode begint met de eindstand van de vorige, niet met het plan. */
  | 'overname'
  /** Twee spelers op het veld ruilen van plek. Telt niet als wissel:
   *  spelerUit en spelerIn zijn hier de twee spelers die ruilen. */
  | 'positie'
  /** Markeert een andere gebeurtenis als verwijderd. Zelf een gebeurtenis, zodat
   *  het net als een wissel automatisch bij andere trainers aankomt. */
  | 'verwijderd';

export type Gebeurtenis = {
  id: string;
  /** Toegekend door de sheet bij het toevoegen. Bepaalt de volgorde tussen coaches. */
  volgnummer?: number;
  type: GebeurtenisType;
  periode: number;
  tijdstip: string;
  omschrijving: string;
  spelerId?: string;
  spelerUit?: string;
  spelerIn?: string;
  /** Wie deze regel heeft vastgelegd, zodat je op de tijdlijn ziet wie wat deed. */
  coach?: string;
  /** Bij type 'verwijderd': het id van de gebeurtenis die wordt weggehaald. */
  verwijdert?: string;
};

/** positieId naar spelerId */
export type Opstelling = Record<string, string>;

export type WedstrijdStatus = 'gepland' | 'bezig' | 'afgerond';

export type Wedstrijd = {
  id: string;
  status: WedstrijdStatus;
  datum: string;
  tijd: string;
  tegenstander: string;
  thuis: boolean;
  verzamelen: string;
  teamGrootte: number;
  aanwezig: Record<string, boolean>;
  /** Het plan: wie hoort er in welke periode te starten. */
  opstellingen: Record<number, Opstelling>;
  /** Append-only logboek. Meerdere coaches schrijven hier tegelijk in. */
  gebeurtenissen: Gebeurtenis[];
  actievePeriode: number;
  gestart: boolean;
  versie: number;
  /** Waar zodra een trainer de voorbereiding bewust heeft afgerond. */
  planAf: boolean;
  /** Wie het plan als laatste opsloeg, voor de melding bij andere trainers. */
  laatstDoor: string;
  /** Competitieperiode van de KNVB (1 tot en met 4), los van de vier periodes binnen een wedstrijd. */
  competitieperiode: number;
};

export const COMPETITIEPERIODES = [1, 2, 3, 4] as const;

/** De velden die je bij het plannen of aanpassen van een wedstrijd invult. */
export type WedstrijdVelden = {
  datum: string;
  tijd: string;
  tegenstander: string;
  thuis: boolean;
  competitieperiode: number;
};

export function legeWedstrijd(id: string, teamGrootte = 6): Wedstrijd {
  return {
    id,
    status: 'gepland',
    datum: new Date().toISOString().slice(0, 10),
    tijd: '',
    tegenstander: '',
    thuis: true,
    verzamelen: '',
    teamGrootte,
    aanwezig: {},
    opstellingen: { 1: {}, 2: {}, 3: {}, 4: {} },
    gebeurtenissen: [],
    actievePeriode: 1,
    gestart: false,
    versie: 0,
    planAf: false,
    laatstDoor: '',
    competitieperiode: 1,
  };
}

// --- Afgeleide waarden. Nooit apart bewaren, altijd hieruit berekenen. ---

/**
 * Gebeurtenissen zonder de weggehaalde. Er wordt nooit iets echt verwijderd:
 * een correctie is een nieuwe regel die zegt welke eerdere niet meer telt.
 * Zo komt een correctie bij elke trainer aan, en zie je achteraf wie wat deed.
 */
export function actief(gebeurtenissen: Gebeurtenis[]): Gebeurtenis[] {
  const weg = new Set(
    gebeurtenissen.filter((g) => g.type === 'verwijderd' && g.verwijdert).map((g) => g.verwijdert)
  );
  return gebeurtenissen.filter((g) => g.type !== 'verwijderd' && !weg.has(g.id));
}

export function stand(gebeurtenissen: Gebeurtenis[]): [number, number] {
  const a = actief(gebeurtenissen);
  return [
    a.filter((g) => g.type === 'doelpunt_voor').length,
    a.filter((g) => g.type === 'doelpunt_tegen').length,
  ];
}

/** De geplande opstelling van een periode, zoals vrijdagavond bedacht. */
export function opVeld(wedstrijd: Wedstrijd, periode: number): string[] {
  return Object.values(wedstrijd.opstellingen[periode] ?? {});
}

/**
 * Zet de gebeurtenissen op volgorde. De sheet kent een volgnummer toe, dus
 * twee coaches die tegelijk iets vastleggen komen in dezelfde volgorde terecht.
 * Wat nog niet verzonden is, staat achteraan.
 */
export function opVolgorde(gebeurtenissen: Gebeurtenis[]): Gebeurtenis[] {
  return [...gebeurtenissen].sort((a, b) => {
    const va = a.volgnummer ?? Number.MAX_SAFE_INTEGER;
    const vb = b.volgnummer ?? Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    return a.tijdstip.localeCompare(b.tijdstip) || a.id.localeCompare(b.id);
  });
}

/** Wissels en plekruilen samen, in volgorde. Samen bepalen ze wie waar staat. */
function veranderingenIn(wedstrijd: Wedstrijd, periode: number): Gebeurtenis[] {
  return opVolgorde(actief(wedstrijd.gebeurtenissen)).filter(
    (g) => (g.type === 'wissel' || g.type === 'positie') && g.periode === periode
  );
}

function wisselsIn(wedstrijd: Wedstrijd, periode: number): Gebeurtenis[] {
  return opVolgorde(actief(wedstrijd.gebeurtenissen)).filter(
    (g) => g.type === 'wissel' && g.periode === periode
  );
}

/**
 * De werkelijke opstelling: het plan met alle wissels erop toegepast.
 * Hieruit volgt dat twee coaches nooit een opstelling van elkaar overschrijven,
 * ze voegen allebei alleen gebeurtenissen toe.
 */
/** Is voor deze periode gekozen om door te gaan met de eindstand van de vorige? */
export function neemtOver(wedstrijd: Wedstrijd, periode: number): boolean {
  return (
    periode > 1 &&
    actief(wedstrijd.gebeurtenissen).some((g) => g.type === 'overname' && g.periode === periode)
  );
}

/**
 * Waar een periode mee begint: het plan, of de eindstand van de vorige periode
 * als daarvoor is gekozen. Dat laatste scheelt bij doorwisselen alle
 * correcties in de pauze, en die tellen dan ook niet als wisselbeurt.
 */
export function beginOpstelling(wedstrijd: Wedstrijd, periode: number): Opstelling {
  if (neemtOver(wedstrijd, periode)) return opstellingNu(wedstrijd, periode - 1);
  return { ...(wedstrijd.opstellingen[periode] ?? {}) };
}

/**
 * De werkelijke opstelling: het begin van de periode met alle wissels erop.
 * Twee coaches overschrijven hierdoor nooit elkaars opstelling, ze voegen
 * allebei alleen gebeurtenissen toe.
 */
export function opstellingNu(wedstrijd: Wedstrijd, periode: number): Opstelling {
  const stand = beginOpstelling(wedstrijd, periode);
  const plekVan = (id: string) => Object.keys(stand).find((k) => stand[k] === id);
  veranderingenIn(wedstrijd, periode).forEach((g) => {
    if (!g.spelerUit || !g.spelerIn) return;
    const plek = plekVan(g.spelerUit);
    if (!plek) return;
    if (g.type === 'wissel') {
      stand[plek] = g.spelerIn;
      return;
    }
    // Plekruil: alleen als beide spelers nog op het veld staan. Heeft een
    // andere trainer intussen een van de twee gewisseld, dan vervalt de ruil.
    const andere = plekVan(g.spelerIn);
    if (!andere) return;
    stand[plek] = g.spelerIn;
    stand[andere] = g.spelerUit;
  });
  return stand;
}

/** Zijn plan en eindstand van de vorige periode verschillend? Alleen dan heeft de keuze zin. */
export function planWijktAf(wedstrijd: Wedstrijd, periode: number): boolean {
  if (periode <= 1) return false;
  const plan = wedstrijd.opstellingen[periode] ?? {};
  const eind = opstellingNu(wedstrijd, periode - 1);
  const sleutels = new Set([...Object.keys(plan), ...Object.keys(eind)]);
  for (const k of sleutels) if (plan[k] !== eind[k]) return true;
  return false;
}

export function opVeldNu(wedstrijd: Wedstrijd, periode: number): string[] {
  return Object.values(opstellingNu(wedstrijd, periode));
}

/**
 * Iedereen die deze periode op het veld heeft gestaan, inclusief wie er
 * tussentijds af is gegaan. Volledig afgeleid, dus niets om bij te houden.
 */
export function heeftGespeeld(wedstrijd: Wedstrijd, periode: number): Set<string> {
  const set = new Set(Object.values(beginOpstelling(wedstrijd, periode)));
  wisselsIn(wedstrijd, periode).forEach((g) => {
    if (g.spelerUit) set.add(g.spelerUit);
    if (g.spelerIn) set.add(g.spelerIn);
  });
  return set;
}

/**
 * Het getal dat langs de lijn telt: in hoeveel van de vier periodes stond deze
 * speler op het veld. Niet het aantal wisselbeurten, want dat zegt niets over
 * gespeelde tijd.
 */
export function periodesGespeeld(wedstrijd: Wedstrijd, spelerId: string): number {
  return PERIODES.filter((p) => heeftGespeeld(wedstrijd, p).has(spelerId)).length;
}

export function bank(wedstrijd: Wedstrijd, spelers: Speler[], periode: number): Speler[] {
  const veld = new Set(opVeldNu(wedstrijd, periode));
  return spelers.filter((s) => wedstrijd.aanwezig[s.id] && !veld.has(s.id));
}

export function aanwezigeSpelers(wedstrijd: Wedstrijd, spelers: Speler[]): Speler[] {
  return spelers.filter((s) => wedstrijd.aanwezig[s.id]);
}

/**
 * Verdeelt de aanwezige spelers zo gelijk mogelijk over vier periodes.
 * De keeper van periode 1 blijft keeper, dat is bij deze leeftijd gebruikelijk
 * en het scheelt onrust. Alle andere spelers rouleren op wie tot dan toe het
 * minst heeft gespeeld.
 */
export function verdeelAutomatisch(
  wedstrijd: Wedstrijd,
  spelers: Speler[],
  posities: string[]
): Record<number, Opstelling> {
  const beschikbaar = aanwezigeSpelers(wedstrijd, spelers);
  if (beschikbaar.length === 0) return wedstrijd.opstellingen;

  const veldPosities = posities.filter((p) => p !== KEEPER_POSITIE);
  const vasteKeeper = wedstrijd.opstellingen[1]?.[KEEPER_POSITIE];
  const keeper = beschikbaar.find((s) => s.id === vasteKeeper) ?? beschikbaar[0];

  const teller: Record<string, number> = Object.fromEntries(beschikbaar.map((s) => [s.id, 0]));
  const resultaat: Record<number, Opstelling> = {};

  for (const p of PERIODES) {
    const opstelling: Opstelling = {};
    if (posities.includes(KEEPER_POSITIE)) opstelling[KEEPER_POSITIE] = keeper.id;

    const kandidaten = beschikbaar
      .filter((s) => s.id !== keeper.id)
      .sort((a, b) => teller[a.id] - teller[b.id] || a.rugnummer - b.rugnummer);

    veldPosities.forEach((positieId, i) => {
      const speler = kandidaten[i];
      if (speler) {
        opstelling[positieId] = speler.id;
        teller[speler.id] += 1;
      }
    });

    resultaat[p] = opstelling;
  }

  return resultaat;
}

/** Leesbaar en uniek genoeg voor een wedstrijd-id. */
export function wedstrijdId(datum: string): string {
  return `w-${datum}-${Math.random().toString(36).slice(2, 6)}`;
}

export function nieuwId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export function klokTijd(): string {
  return new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Twee doelpunten van hetzelfde soort, in dezelfde periode, vlak na elkaar en
 * door verschillende trainers: waarschijnlijk hetzelfde doelpunt twee keer
 * ingevoerd. Geeft de ids terug van alle betrokken doelpunten.
 */
export function mogelijkDubbel(gebeurtenissen: Gebeurtenis[], binnenMinuten = 3): Set<string> {
  const doelpunten = opVolgorde(actief(gebeurtenissen)).filter(
    (g) => g.type === 'doelpunt_voor' || g.type === 'doelpunt_tegen'
  );
  const minuten = (t: string) => {
    const [u, m] = t.split(':').map(Number);
    return Number.isFinite(u) && Number.isFinite(m) ? u * 60 + m : NaN;
  };
  const gemarkeerd = new Set<string>();
  for (let i = 0; i < doelpunten.length; i++) {
    for (let j = i + 1; j < doelpunten.length; j++) {
      const a = doelpunten[i];
      const b = doelpunten[j];
      if (a.type !== b.type || a.periode !== b.periode) continue;
      if ((a.coach ?? '') === (b.coach ?? '')) continue;
      const verschil = Math.abs(minuten(a.tijdstip) - minuten(b.tijdstip));
      if (Number.isFinite(verschil) && verschil <= binnenMinuten) {
        gemarkeerd.add(a.id);
        gemarkeerd.add(b.id);
      }
    }
  }
  return gemarkeerd;
}
