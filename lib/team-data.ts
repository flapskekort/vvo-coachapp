/**
 * Client voor de Google Apps Script webapp.
 *
 * Twee soorten schrijfacties, bewust gescheiden:
 * - het plan (wedstrijdgegevens, aanwezigheid, opstelling per periode) gaat als
 *   geheel en met een versiecontrole, want dat maakt normaal één coach vooraf;
 * - gebeurtenissen tijdens de wedstrijd worden per stuk toegevoegd, zonder
 *   versiecontrole. Daardoor kunnen meerdere coaches tegelijk registreren
 *   zonder elkaar te overschrijven.
 */

import type { Gebeurtenis, Opstelling, Speler } from './model';

export type ApiFoutCode =
  | 'GEEN_KOPPELING'
  | 'GEEN_VERBINDING'
  | 'TIME_OUT'
  | 'GEEN_TOEGANG'
  | 'CONFLICT'
  | 'SCHEMA'
  | 'SERVERFOUT'
  | 'ONGELDIG_ANTWOORD';

export type ApiAntwoord<T> =
  | { ok: true; data: T; versie: number }
  | { ok: false; code: ApiFoutCode; melding: string };

export type Koppeling = { endpoint: string; token: string; coach: string };

export type WedstrijdRij = {
  wedstrijd_id: string;
  datum: string;
  tijd: string;
  tegenstander: string;
  thuis_uit: string;
  team_grootte: number;
  status: string;
  versie: number;
  plan_af?: boolean;
  laatst_door?: string;
  laatst_op?: string;
  competitieperiode?: number;
};

export type PlanStand = {
  versie: number;
  planAf: boolean;
  door: string;
  op: string;
};

export type GebeurtenisRij = {
  gebeurtenis_id: string;
  volgnummer: number;
  periode: number;
  tijdstip: string;
  type: string;
  speler_id: string;
  speler_uit: string;
  speler_in: string;
  coach: string;
  omschrijving: string;
  verwijdert?: string;
  formatie?: string;
};

export type SeizoenRij = {
  speler_id: string;
  naam: string;
  rugnummer: number;
  wedstrijden: number;
  periodes: number;
  /** Periodes waarin de speler aanwezig was maar niet op het veld stond. */
  periodes_bank: number;
  wissels_in: number;
  wissels_uit: number;
  wissels_totaal: number;
  doelpunten: number;
};

export type PeriodeTotaal = { periode: number; voor: number; tegen: number };

export type WedstrijdVerloop = {
  wedstrijd_id: string;
  datum: string;
  tegenstander: string;
  thuis: boolean;
  voor: number;
  tegen: number;
  /** Acht getallen: per periode eerst voor, dan tegen. */
  periodes: number[];
  competitieperiode?: number;
};

export type CompetitieperiodeTotaal = {
  competitieperiode: number;
  wedstrijden: number;
  gewonnen: number;
  gelijk: number;
  verloren: number;
  voor: number;
  tegen: number;
};

export type SeizoenData = {
  /** 0 is het hele seizoen, 1 tot en met 4 is alleen die competitieperiode. */
  competitieperiode?: number;
  spelers: SeizoenRij[];
  wedstrijden: number;
  perPeriode?: PeriodeTotaal[];
  verloop?: WedstrijdVerloop[];
  /** Altijd over het hele seizoen, om de periodes naast elkaar te zetten. */
  perCompetitieperiode?: CompetitieperiodeTotaal[];
};

export type WedstrijdData = {
  wedstrijd: WedstrijdRij | null;
  aanwezigheid: { speler_id: string; aanwezig: boolean }[];
  opstellingen: { periode: number; categorie: string; plek: string; speler_id: string }[];
  gebeurtenissen: GebeurtenisRij[];
};

const TIME_OUT_MS = 12000;

const MELDING: Record<ApiFoutCode, string> = {
  GEEN_KOPPELING: 'Nog geen Google Sheet gekoppeld. Vul endpoint en token in bij Instellingen.',
  GEEN_VERBINDING:
    'Geen verbinding. Je wijzigingen staan lokaal opgeslagen en gaan mee zodra je weer bereik hebt.',
  TIME_OUT: 'De sheet reageerde niet binnen twaalf seconden. Probeer het zo nog eens.',
  GEEN_TOEGANG: 'Het token wordt niet geaccepteerd. Controleer Instellingen.',
  CONFLICT:
    'Een andere coach heeft het plan inmiddels gewijzigd. Haal eerst op voordat je opslaat.',
  SCHEMA: 'De opbouw van de sheet klopt niet met wat de app verwacht.',
  SERVERFOUT: 'De sheet gaf een fout terug.',
  ONGELDIG_ANTWOORD: 'Onverwacht antwoord van de sheet.',
};

function fout<T>(code: ApiFoutCode, extra?: string): ApiAntwoord<T> {
  return { ok: false, code, melding: extra ? `${MELDING[code]} (${extra})` : MELDING[code] };
}

async function roepAan<T>(
  koppeling: Koppeling | null,
  actie: string,
  payload: unknown,
  verwachteVersie?: number
): Promise<ApiAntwoord<T>> {
  if (!koppeling?.endpoint || !koppeling?.token) return fout('GEEN_KOPPELING');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIME_OUT_MS);

  try {
    const response = await fetch(koppeling.endpoint, {
      method: 'POST',
      // text/plain voorkomt een preflight, die Apps Script niet beantwoordt.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        actie,
        requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        token: koppeling.token,
        coach: koppeling.coach,
        verwachteVersie,
        payload,
      }),
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) return fout('SERVERFOUT', `HTTP ${response.status}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return fout('ONGELDIG_ANTWOORD');
    }

    const antwoord = body as {
      ok?: boolean;
      data?: T;
      versie?: number;
      error?: { code?: string; message?: string };
    };

    if (antwoord.ok) return { ok: true, data: antwoord.data as T, versie: antwoord.versie ?? 0 };

    const gemeld = (antwoord.error?.code ?? 'SERVERFOUT') as ApiFoutCode;
    const code: ApiFoutCode = gemeld in MELDING ? gemeld : 'SERVERFOUT';
    return { ok: false, code, melding: antwoord.error?.message ?? MELDING[code] };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return fout('TIME_OUT');
    return fout('GEEN_VERBINDING');
  } finally {
    clearTimeout(timer);
  }
}

export function haalSpelers(koppeling: Koppeling | null) {
  return roepAan<{ spelers: Speler[]; wedstrijden: WedstrijdRij[] }>(
    koppeling,
    'bootstrap.get',
    {}
  );
}

export function haalWedstrijd(koppeling: Koppeling | null, wedstrijdId: string) {
  return roepAan<WedstrijdData>(koppeling, 'wedstrijd.get', { wedstrijdId });
}

/** Alleen wat er sinds het laatst bekende volgnummer bij is gekomen. */
export function haalNieuweGebeurtenissen(
  koppeling: Koppeling | null,
  wedstrijdId: string,
  sindsVolgnummer: number
) {
  return roepAan<{ gebeurtenissen: GebeurtenisRij[]; hoogste: number; plan: PlanStand }>(
    koppeling,
    'gebeurtenissen.since',
    { wedstrijdId, sinds: sindsVolgnummer }
  );
}

/** Voegt één gebeurtenis toe. Overschrijft nooit iets van een andere coach. */
export function voegGebeurtenisToe(
  koppeling: Koppeling | null,
  wedstrijdId: string,
  gebeurtenis: Gebeurtenis
) {
  return roepAan<{ volgnummer: number }>(koppeling, 'gebeurtenis.append', {
    wedstrijdId,
    gebeurtenis: {
      gebeurtenis_id: gebeurtenis.id,
      periode: gebeurtenis.periode,
      tijdstip: gebeurtenis.tijdstip,
      type: gebeurtenis.type,
      speler_id: gebeurtenis.spelerId ?? '',
      speler_uit: gebeurtenis.spelerUit ?? '',
      speler_in: gebeurtenis.spelerIn ?? '',
      coach: gebeurtenis.coach ?? '',
      omschrijving: gebeurtenis.omschrijving,
      verwijdert: gebeurtenis.verwijdert ?? '',
      formatie: gebeurtenis.formatie ?? '',
    },
  });
}

/** Verwijdert één gebeurtenis, voor het ongedaan maken van een eigen invoer. */
export function verwijderGebeurtenis(
  koppeling: Koppeling | null,
  wedstrijdId: string,
  gebeurtenisId: string
) {
  return roepAan<{ verwijderd: number }>(koppeling, 'gebeurtenis.remove', {
    wedstrijdId,
    gebeurtenisId,
  });
}

export type PlanSnapshot = {
  wedstrijd: WedstrijdRij;
  aanwezigheid: { speler_id: string; aanwezig: boolean }[];
  opstellingen: { periode: number; categorie: string; plek: string; speler_id: string }[];
};

export function bewaarPlan(
  koppeling: Koppeling | null,
  snapshot: PlanSnapshot,
  verwachteVersie: number
) {
  return roepAan<{ versie: number }>(koppeling, 'plan.save', snapshot, verwachteVersie);
}

export function bewaarSpelers(koppeling: Koppeling | null, spelers: Speler[]) {
  return roepAan<{ aantal: number }>(koppeling, 'spelers.save', { spelers });
}

/** Totalen over alle wedstrijden, berekend in de sheet zelf. */
export function haalSeizoen(koppeling: Koppeling | null, competitieperiode = 0) {
  return roepAan<SeizoenData>(koppeling, 'seizoen.get', { competitieperiode });
}

/** Licht verzoek: alleen het versienummer en wie er als laatste opsloeg. */
export function haalPlanVersie(koppeling: Koppeling | null, wedstrijdId: string) {
  return roepAan<PlanStand>(koppeling, 'plan.versie', { wedstrijdId });
}

/** Verwijdert een geplande wedstrijd. De sheet weigert als er al iets is geregistreerd. */
export function verwijderWedstrijd(koppeling: Koppeling | null, wedstrijdId: string) {
  return roepAan<{ verwijderd: string }>(koppeling, 'wedstrijd.remove', { wedstrijdId });
}

export function controleerKoppeling(koppeling: Koppeling | null) {
  return roepAan<{ schemaOk: boolean; ontbreekt: string[] }>(koppeling, 'schema.check', {});
}

/** Vertaalt het plan naar platte rijen voor de sheet. Gebeurtenissen gaan apart. */
export function maakPlanSnapshot(
  wedstrijd: {
    id: string;
    datum: string;
    tijd: string;
    tegenstander: string;
    thuis: boolean;
    teamGrootte: number;
    status: string;
    planAf: boolean;
    competitieperiode: number;
    aanwezig: Record<string, boolean>;
    opstellingen: Record<number, Opstelling>;
    versie: number;
  },
  positieVan: (id: string) => { categorie: string; plek: string } | undefined
): PlanSnapshot {
  return {
    wedstrijd: {
      wedstrijd_id: wedstrijd.id,
      datum: wedstrijd.datum,
      tijd: wedstrijd.tijd,
      tegenstander: wedstrijd.tegenstander,
      thuis_uit: wedstrijd.thuis ? 'thuis' : 'uit',
      team_grootte: wedstrijd.teamGrootte,
      status: wedstrijd.status,
      versie: wedstrijd.versie,
      plan_af: wedstrijd.planAf,
      competitieperiode: wedstrijd.competitieperiode,
    },
    aanwezigheid: Object.entries(wedstrijd.aanwezig).map(([speler_id, aanwezig]) => ({
      speler_id,
      aanwezig,
    })),
    opstellingen: Object.entries(wedstrijd.opstellingen).flatMap(([periode, opstelling]) =>
      Object.entries(opstelling).map(([positieId, speler_id]) => {
        const pos = positieVan(positieId);
        return {
          periode: Number(periode),
          categorie: pos?.categorie ?? '',
          plek: pos?.plek ?? '',
          speler_id,
        };
      })
    ),
  };
}

export function naarGebeurtenis(r: GebeurtenisRij): Gebeurtenis {
  return {
    id: r.gebeurtenis_id,
    volgnummer: Number(r.volgnummer) || undefined,
    type: r.type as Gebeurtenis['type'],
    periode: Number(r.periode),
    tijdstip: r.tijdstip,
    omschrijving: r.omschrijving,
    spelerId: r.speler_id || undefined,
    spelerUit: r.speler_uit || undefined,
    spelerIn: r.speler_in || undefined,
    coach: r.coach || undefined,
    verwijdert: r.verwijdert || undefined,
    formatie: r.formatie || undefined,
  };
}
