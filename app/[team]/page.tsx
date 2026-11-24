'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { Aanwezigheid, Live, OpstellingScherm, Wisselplan } from '@/components/wedstrijd-schermen';
import { Instellingen, Statistieken, TeamScherm } from '@/components/overige-schermen';
import { Wedstrijden, maakRegels } from '@/components/wedstrijden';
import {
  ALLE_POSITIES,
  KEEPER_POSITIE,
  PRESETS,
  actief,
  formatieVan,
  klokTijd,
  legeWedstrijd,
  leesFormatie,
  nieuwId,
  opVolgorde,
  mogelijkDubbel,
  neemtOver,
  opstellingNu,
  planWijktAf,
  positie,
  stand,
  type WedstrijdVelden,
  verdeelAutomatisch,
  wedstrijdId as maakWedstrijdId,
  type Gebeurtenis,
  type Speler,
  type Wedstrijd,
} from '@/lib/model';
import { opslagVoor } from '@/lib/opslag';
import { teamVan } from '@/lib/teams';
import {
  bewaarPlan,
  bewaarSpelers,
  controleerKoppeling,
  haalNieuweGebeurtenissen,
  haalPlanVersie,
  haalSeizoen,
  haalSpelers,
  haalWedstrijd,
  maakPlanSnapshot,
  naarGebeurtenis,
  verwijderWedstrijd,
  voegGebeurtenisToe,
  type Koppeling,
  type PlanStand,
  type SeizoenData,
  type WedstrijdData,
  type WedstrijdRij,
} from '@/lib/team-data';

const SECTIES = ['Wedstrijd', 'Team', 'Statistieken', 'Instellingen'] as const;
const FASES = ['Aanwezigheid', 'Opstelling', 'Wisselplan', 'Live'] as const;
type Sectie = (typeof SECTIES)[number];
type Fase = (typeof FASES)[number];
type Status = { soort: 'goed' | 'fout' | 'bezig'; tekst: string } | null;

/**
 * Elke seconde pollen is verleidelijk maar duur: de quota's van Apps Script
 * gelden per Google-account, en beide teams draaien onder hetzelfde account.
 * Vijftien seconden is snel genoeg om een wissel van je medecoach te zien
 * voordat je er zelf een doet.
 */
const POLL_MS = 15000;

/**
 * Een verlopen Cloudflare Access-sessie levert de inlogpagina op in plaats van
 * gegevens. Dat komt hier binnen als onleesbaar antwoord of als geweigerde
 * verbinding, terwijl het toestel gewoon online is. Zeker weten kunnen we het
 * niet, dus de melding zegt "mogelijk".
 */
function isSessieProbleem(code: string): boolean {
  return code === 'ONGELDIG_ANTWOORD' || code === 'GEEN_TOEGANG';
}

/**
 * Tijdelijke wedstrijd voor als er nog niets is gekozen. Wordt nooit bewaard
 * en staat nooit in het overzicht. Eerder maakte de app bij het openen een
 * lege wedstrijd met de datum van vandaag, die dan als "Tegenstander onbekend"
 * in de lijst bleef staan.
 */
const CONCEPT_ID = 'concept';

/**
 * Herkent die oude, per ongeluk aangemaakte lege wedstrijden: het oude
 * id-schema, geen tegenstander, niets geregistreerd, geen opstelling en nooit
 * naar de sheet geschreven. Daar zit niets van waarde in.
 */
function isOudeLegeWedstrijd(w: Wedstrijd): boolean {
  const leegPlan = Object.values(w.opstellingen ?? {}).every((o) => Object.keys(o).length === 0);
  return (
    w.id.startsWith('wedstrijd-') &&
    !w.tegenstander &&
    (w.gebeurtenissen ?? []).length === 0 &&
    leegPlan &&
    !w.versie
  );
}

/** Vergelijkt twee plannen op inhoud, los van de volgorde van de sleutels. */
function zelfdePlan(
  a: Record<number, Record<string, unknown>>,
  b: Record<number, Record<string, unknown>>
): boolean {
  const vast = (x: Record<number, Record<string, unknown>>) =>
    JSON.stringify(
      Object.keys(x ?? {})
        .sort()
        .map((k) => [k, Object.entries(x[Number(k)] ?? {}).sort(([p], [q]) => p.localeCompare(q))])
    );
  return vast(a) === vast(b);
}

export default function TeamPagina() {
  const params = useParams<{ team: string }>();
  const team = teamVan(typeof params?.team === 'string' ? params.team : undefined);
  if (!team) notFound();

  return <Coachapp slug={team.slug} naam={team.naam} teamGrootte={team.teamGrootte} />;
}

function Coachapp({
  slug,
  naam: teamNaam,
  teamGrootte,
}: {
  slug: string;
  naam: string;
  teamGrootte: number;
}) {
  const opslag = useMemo(() => opslagVoor(slug), [slug]);

  const [sectie, setSectie] = useState<Sectie>('Wedstrijd');
  const [fase, setFase] = useState<Fase>('Aanwezigheid');
  const [spelers, setSpelers] = useState<Speler[]>([]);
  const [wedstrijd, setWedstrijd] = useState<Wedstrijd>(() =>
    legeWedstrijd(CONCEPT_ID, teamGrootte)
  );
  const [koppeling, setKoppeling] = useState<Koppeling>({ endpoint: '', token: '', coach: '' });
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);
  const [formatieTekst, setFormatieTekst] = useState(PRESETS[teamGrootte]?.[0] ?? '1-2-1-2');
  const [formatieFout, setFormatieFout] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [bezig, setBezig] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [online, setOnline] = useState(true);
  const [planWacht, setPlanWacht] = useState(false);
  const [onverzonden, setOnverzonden] = useState<string[]>([]);
  const [laatstGezien, setLaatstGezien] = useState<string | null>(null);
  const [syncFout, setSyncFout] = useState<{ melding: string; sessie: boolean } | null>(null);
  const [nieuwerePlan, setNieuwerePlan] = useState<PlanStand | null>(null);
  const [seizoen, setSeizoen] = useState<SeizoenData | null>(null);
  const [seizoenStatus, setSeizoenStatus] = useState<string | null>(null);
  const [toonOverzicht, setToonOverzicht] = useState(false);
  const [lokaleWedstrijden, setLokaleWedstrijden] = useState<Wedstrijd[]>([]);
  const [sheetWedstrijden, setSheetWedstrijden] = useState<WedstrijdRij[]>([]);
  /** Uitslag per gespeelde wedstrijd volgens de sheet, inclusief correcties. */
  const [sheetStanden, setSheetStanden] = useState<Record<string, [number, number]>>({});
  const [lijstMelding, setLijstMelding] = useState<string | null>(null);
  /** Gekozen competitieperiode in het overzicht. Leeg tot de coach er zelf een kiest. */
  const [gekozenCp, setGekozenCp] = useState<number | null>(null);
  /** Filter in de seizoensstatistieken: 0 is het hele seizoen. */
  const [seizoenCp, setSeizoenCp] = useState(0);
  const wedstrijdRef = useRef(wedstrijd);
  wedstrijdRef.current = wedstrijd;

  // --- Laden ---

  useEffect(() => {
    const bewaard = opslag.koppeling();
    if (bewaard) {
      setKoppeling({
        endpoint: bewaard.endpoint ?? '',
        token: bewaard.token ?? '',
        coach: bewaard.coach ?? '',
      });
    }
    setSpelers(opslag.spelers());

    // Oude, per ongeluk aangemaakte lege wedstrijden opruimen.
    opslag.alleWedstrijden().forEach((w) => {
      if (isOudeLegeWedstrijd(w)) opslag.verwijderWedstrijd(w.id);
    });

    const id = opslag.huidigeWedstrijdId();
    const vorigeWedstrijd = id ? opslag.wedstrijd(id) : null;
    const huidig = vorigeWedstrijd ?? legeWedstrijd(CONCEPT_ID, teamGrootte);
    setWedstrijd(huidig);
    setFormatieTekst(startFormatie(huidig));
    setPlanWacht(opslag.planWacht());
    setOnverzonden(opslag.onverzonden());
    setLokaleWedstrijden(opslag.alleWedstrijden());
    setGekozenCp(opslag.competitieperiode());
    // Geen wedstrijd gekozen: begin in het overzicht in plaats van in een lege wedstrijd.
    setToonOverzicht(huidig.id === CONCEPT_ID || huidig.status === 'afgerond');
    setGeladen(true);
  }, [opslag, teamGrootte]);

  useEffect(() => {
    if (!geladen || wedstrijd.id === CONCEPT_ID) return;
    opslag.bewaarWedstrijd(wedstrijd);
    opslag.bewaarHuidigeWedstrijdId(wedstrijd.id);
    setLokaleWedstrijden(opslag.alleWedstrijden());
  }, [wedstrijd, geladen, opslag]);

  useEffect(() => {
    if (geladen) opslag.bewaarSpelers(spelers);
  }, [spelers, geladen, opslag]);

  useEffect(() => {
    if (geladen) opslag.bewaarPlanWacht(planWacht);
  }, [planWacht, geladen, opslag]);

  useEffect(() => {
    if (geladen) opslag.bewaarOnverzonden(onverzonden);
  }, [onverzonden, geladen, opslag]);

  useEffect(() => {
    const bij = () => setOnline(navigator.onLine);
    bij();
    window.addEventListener('online', bij);
    window.addEventListener('offline', bij);
    return () => {
      window.removeEventListener('online', bij);
      window.removeEventListener('offline', bij);
    };
  }, []);

  // --- Afgeleide waarden ---

  const periode = wedstrijd.actievePeriode;
  const planOpstelling = useMemo(
    () => wedstrijd.opstellingen[periode] ?? {},
    [wedstrijd.opstellingen, periode]
  );

  const posities = useMemo(() => {
    const gelezen = leesFormatie(formatieTekst, teamGrootte);
    const uitFormatie = gelezen.ok ? gelezen.posities : [];
    const nu = opstellingNu(wedstrijd, periode);
    return ALLE_POSITIES.filter((p) => uitFormatie.includes(p.id) || Boolean(nu[p.id])).map(
      (p) => p.id
    );
  }, [formatieTekst, teamGrootte, wedstrijd, periode]);

  const naam = useCallback(
    (id: string) => spelers.find((s) => s.id === id)?.naam ?? 'Onbekend',
    [spelers]
  );

  function startFormatie(w: Wedstrijd): string {
    const uitOpstelling = formatieVan(w.opstellingen[w.actievePeriode] ?? {});
    const bekend = PRESETS[w.teamGrootte] ?? [];
    return bekend.includes(uitOpstelling) ? uitOpstelling : (bekend[0] ?? '1-2-1-2');
  }

  // --- Het plan bewerken (lokaal, daarna in één keer opslaan) ---

  const pasPlan = useCallback((fn: (w: Wedstrijd) => Wedstrijd) => {
    setWedstrijd(fn);
    setPlanWacht(true);
  }, []);

  const toggleAanwezig = (id: string) =>
    pasPlan((w) => {
      const aanwezig = { ...w.aanwezig, [id]: !w.aanwezig[id] };
      if (aanwezig[id]) return { ...w, aanwezig };
      const opstellingen = Object.fromEntries(
        Object.entries(w.opstellingen).map(([p, o]) => [
          p,
          Object.fromEntries(Object.entries(o).filter(([, spelerId]) => spelerId !== id)),
        ])
      );
      return { ...w, aanwezig, opstellingen };
    });

  const allenAanwezig = () =>
    pasPlan((w) => ({ ...w, aanwezig: Object.fromEntries(spelers.map((s) => [s.id, true])) }));

  const zetOpstelling = (nieuw: Record<string, string>) =>
    pasPlan((w) => ({ ...w, opstellingen: { ...w.opstellingen, [w.actievePeriode]: nieuw } }));

  const kiesPositie = (positieId: string) => {
    const bezetDoor = planOpstelling[positieId];
    if (!geselecteerd) {
      setGeselecteerd(bezetDoor ?? null);
      return;
    }
    const volgend = { ...planOpstelling };
    const oudePositie = Object.keys(volgend).find((p) => volgend[p] === geselecteerd);
    if (oudePositie) delete volgend[oudePositie];
    volgend[positieId] = geselecteerd;
    if (bezetDoor && bezetDoor !== geselecteerd && oudePositie) volgend[oudePositie] = bezetDoor;
    zetOpstelling(volgend);
    setGeselecteerd(null);
  };

  const kiesSpeler = (spelerId: string) => {
    if (!wedstrijd.aanwezig[spelerId]) return;
    if (!geselecteerd || geselecteerd === spelerId) {
      setGeselecteerd(geselecteerd === spelerId ? null : spelerId);
      return;
    }
    const plekVan = (id: string) => Object.keys(planOpstelling).find((k) => planOpstelling[k] === id);
    const plekGekozen = plekVan(geselecteerd);
    const plekDoel = plekVan(spelerId);

    if (plekGekozen && plekDoel) {
      zetOpstelling({ ...planOpstelling, [plekGekozen]: spelerId, [plekDoel]: geselecteerd });
      setGeselecteerd(null);
      return;
    }
    const plek = plekGekozen ?? plekDoel;
    if (plek) {
      zetOpstelling({ ...planOpstelling, [plek]: plekGekozen ? spelerId : geselecteerd });
      setGeselecteerd(null);
      return;
    }
    setGeselecteerd(spelerId);
  };

  const kiesFormatie = (tekst: string) => {
    const gelezen = leesFormatie(tekst, teamGrootte);
    setFormatieTekst(tekst);
    if (!gelezen.ok) {
      setFormatieFout(gelezen.fout);
      return;
    }
    setFormatieFout(null);
    const huidigeKeeper = planOpstelling[KEEPER_POSITIE];
    const rest = ALLE_POSITIES.filter((p) => p.id !== KEEPER_POSITIE)
      .map((p) => planOpstelling[p.id])
      .filter(Boolean);
    const nieuw: Record<string, string> = {};
    gelezen.posities.forEach((positieId, i) => {
      if (positieId === KEEPER_POSITIE) {
        if (huidigeKeeper) nieuw[positieId] = huidigeKeeper;
      } else if (rest[i - 1]) {
        nieuw[positieId] = rest[i - 1];
      }
    });
    zetOpstelling(nieuw);
  };

  const kiesPeriode = (p: number) => {
    if (p < 1 || p > 4) return;
    setGeselecteerd(null);
    setWedstrijd((w) => ({ ...w, actievePeriode: p }));
  };

  const kopieerNaarVolgende = () =>
    pasPlan((w) => {
      const bron = w.opstellingen[w.actievePeriode] ?? {};
      const opstellingen = { ...w.opstellingen };
      for (let p = w.actievePeriode + 1; p <= 4; p++) opstellingen[p] = { ...bron };
      return { ...w, opstellingen };
    });

  const automatischVerdelen = () =>
    pasPlan((w) => {
      const gelezen = leesFormatie(formatieTekst, teamGrootte);
      return gelezen.ok
        ? { ...w, opstellingen: verdeelAutomatisch(w, spelers, gelezen.posities) }
        : w;
    });

  // --- Gebeurtenissen: één voor één toevoegen, nooit overschrijven ---

  const stuurGebeurtenis = useCallback(
    async (g: Gebeurtenis) => {
      const antwoord = await voegGebeurtenisToe(koppeling, wedstrijdRef.current.id, g);
      if (antwoord.ok) {
        setWedstrijd((w) => ({
          ...w,
          gebeurtenissen: w.gebeurtenissen.map((x) =>
            x.id === g.id ? { ...x, volgnummer: antwoord.data.volgnummer } : x
          ),
        }));
        setOnverzonden((ids) => ids.filter((id) => id !== g.id));
      } else {
        setOnverzonden((ids) => (ids.includes(g.id) ? ids : [...ids, g.id]));
        setSyncFout({ melding: antwoord.melding, sessie: isSessieProbleem(antwoord.code) });
      }
    },
    [koppeling]
  );

  const registreer = (kern: Omit<Gebeurtenis, 'id' | 'tijdstip' | 'coach'>) => {
    const g: Gebeurtenis = {
      ...kern,
      id: nieuwId('geb'),
      tijdstip: klokTijd(),
      coach: koppeling.coach || undefined,
    };
    setWedstrijd((w) => ({ ...w, gebeurtenissen: [...w.gebeurtenissen, g] }));
    setOnverzonden((ids) => [...ids, g.id]);
    void stuurGebeurtenis(g);
  };

  const doelpuntVoor = (spelerId: string) =>
    registreer({
      type: 'doelpunt_voor',
      periode,
      spelerId,
      omschrijving: `Doelpunt ${naam(spelerId)}`,
    });

  const doelpuntTegen = () =>
    registreer({ type: 'doelpunt_tegen', periode, omschrijving: 'Doelpunt tegen' });

  const voerWisselUit = (uit: string, erin: string) =>
    registreer({
      type: 'wissel',
      periode,
      spelerUit: uit,
      spelerIn: erin,
      omschrijving: `${naam(uit)} eruit, ${naam(erin)} erin`,
    });

  /** Twee spelers op het veld wisselen van plek. Telt niet als wisselbeurt. */
  const ruilVanPlek = (a: string, b: string) =>
    registreer({
      type: 'positie',
      periode,
      spelerUit: a,
      spelerIn: b,
      omschrijving: `Van plek geruild: ${naam(a)} en ${naam(b)}`,
    });

  const wisselPeriode = (p: number) => {
    if (p < 1 || p > 4) return;
    const vooruit = p > wedstrijd.actievePeriode;
    const alGemeld = actief(wedstrijd.gebeurtenissen).some((g) => g.type === 'periode' && g.periode === p);
    setWedstrijd((w) => ({ ...w, actievePeriode: p, gestart: true }));
    if (vooruit && !alGemeld) {
      registreer({ type: 'periode', periode: p, omschrijving: `Periode ${p} gestart` });
    }
  };

  /**
   * Ongedaan maken haalt je eigen laatste regel weg, niet die van je medecoach.
   * Een gedeelde tijdlijn terugdraaien zou anders werk van een ander wissen.
   */
  const eigenLaatste = useMemo(() => {
    const mijn = opVolgorde(actief(wedstrijd.gebeurtenissen)).filter(
      (g) => (g.coach ?? '') === (koppeling.coach ?? '') && g.type !== 'periode'
    );
    return mijn.length ? mijn[mijn.length - 1] : null;
  }, [wedstrijd.gebeurtenissen, koppeling.coach]);

  /**
   * Haalt een gebeurtenis weg door een nieuwe regel toe te voegen die zegt dat
   * hij niet meer telt. Eerder werd de regel uit de sheet gewist, maar dan zag
   * een andere trainer dat niet: het ophalen vraagt alleen om nieuwe regels.
   * Zo komt de correctie net als een wissel bij iedereen aan.
   */
  const verwijderGebeurtenisMetId = (id: string, omschrijving: string) => {
    const doel = wedstrijd.gebeurtenissen.find((g) => g.id === id);
    if (!doel) return;
    registreer({
      type: 'verwijderd',
      periode: doel.periode,
      verwijdert: id,
      omschrijving,
    });
  };

  const maakOngedaan = () => {
    if (!eigenLaatste) return;
    verwijderGebeurtenisMetId(eigenLaatste.id, `Ongedaan: ${eigenLaatste.omschrijving}`);
  };

  const corrigeerDoelpunt = (id: string) => {
    const doel = wedstrijd.gebeurtenissen.find((g) => g.id === id);
    if (!doel) return;
    const door = doel.coach && doel.coach !== koppeling.coach ? ` (ingevoerd door ${doel.coach})` : '';
    verwijderGebeurtenisMetId(id, `Verwijderd: ${doel.omschrijving}${door}`);
  };

  /** Deze periode laten beginnen met de eindstand van de vorige. Telt niet als wissel. */
  const neemEindstandOver = () =>
    registreer({
      type: 'overname',
      periode,
      omschrijving: `Periode ${periode} gaat verder met de opstelling van periode ${periode - 1}`,
    });

  const terugNaarPlan = () => {
    const overname = actief(wedstrijd.gebeurtenissen).find(
      (g) => g.type === 'overname' && g.periode === periode
    );
    if (overname) verwijderGebeurtenisMetId(overname.id, `Periode ${periode} terug naar het plan`);
  };

  const wisselsDezePeriode = actief(wedstrijd.gebeurtenissen).some(
    (g) => (g.type === 'wissel' || g.type === 'positie') && g.periode === periode
  );
  // Alleen kiezen aan het begin van een periode. Zijn er al wissels of
  // plekruilen gedaan, dan zou omschakelen die op een andere basis zetten.
  const toonOvernameKeuze = planWijktAf(wedstrijd, periode) && !wisselsDezePeriode;

  /**
   * Kijkt of een andere trainer het plan heeft bijgewerkt. Bewust een melding
   * en geen stille overname: zo wordt zichtbaar dat iemand voorwerk heeft
   * gedaan, en overschrijft de app nooit ongevraagd iemands wijzigingen.
   */
  const beoordeelPlanStand = useCallback((stand: PlanStand) => {
    setNieuwerePlan(stand.versie > wedstrijdRef.current.versie ? stand : null);
  }, []);

  const controleerPlan = useCallback(async () => {
    if (!koppeling.endpoint || !koppeling.token) return;
    const antwoord = await haalPlanVersie(koppeling, wedstrijdRef.current.id);
    if (antwoord.ok) beoordeelPlanStand(antwoord.data);
  }, [koppeling, beoordeelPlanStand]);

  // Tijdens de voorbereiding rustiger kijken dan tijdens de wedstrijd.
  useEffect(() => {
    if (fase === 'Live' || !online || !koppeling.endpoint) return;
    void controleerPlan();
    const timer = setInterval(() => void controleerPlan(), 60000);
    return () => clearInterval(timer);
  }, [fase, online, koppeling.endpoint, controleerPlan]);

  // --- Bijblijven bij de andere coach ---

  const hoogsteVolgnummer = useMemo(
    () => wedstrijd.gebeurtenissen.reduce((m, g) => Math.max(m, g.volgnummer ?? 0), 0),
    [wedstrijd.gebeurtenissen]
  );

  const synchroniseer = useCallback(async () => {
    if (!koppeling.endpoint || !koppeling.token) return;

    // Eerst wat hier nog klaarstaat wegschrijven, dan pas ophalen.
    const wachtend = wedstrijdRef.current.gebeurtenissen.filter((g) => !g.volgnummer);
    for (const g of wachtend) await stuurGebeurtenis(g);

    const antwoord = await haalNieuweGebeurtenissen(
      koppeling,
      wedstrijdRef.current.id,
      wedstrijdRef.current.gebeurtenissen.reduce((m, g) => Math.max(m, g.volgnummer ?? 0), 0)
    );
    if (!antwoord.ok) {
      // Stil falen was de reden dat de eerste wedstrijd verwarrend verliep:
      // de app leek te werken terwijl er niets meer doorkwam.
      setSyncFout({ melding: antwoord.melding, sessie: isSessieProbleem(antwoord.code) });
      return;
    }
    setSyncFout(null);

    if (antwoord.data.gebeurtenissen.length) {
      setWedstrijd((w) => {
        const bestaand = new Map(w.gebeurtenissen.map((g) => [g.id, g]));
        antwoord.data.gebeurtenissen.forEach((r) => bestaand.set(r.gebeurtenis_id, naarGebeurtenis(r)));
        return { ...w, gebeurtenissen: opVolgorde([...bestaand.values()]) };
      });
    }
    if (antwoord.data.plan) beoordeelPlanStand(antwoord.data.plan);
    setLaatstGezien(klokTijd());
  }, [koppeling, stuurGebeurtenis, beoordeelPlanStand]);

  useEffect(() => {
    if (fase !== 'Live' || !online || !koppeling.endpoint) return;
    void synchroniseer();
    const timer = setInterval(() => void synchroniseer(), POLL_MS);
    const bijTerugkeer = () => {
      if (document.visibilityState === 'visible') void synchroniseer();
    };
    document.addEventListener('visibilitychange', bijTerugkeer);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', bijTerugkeer);
    };
  }, [fase, online, koppeling.endpoint, synchroniseer]);

  // --- Selectie ---

  const wijzigSpeler = (id: string, veld: 'naam' | 'rugnummer', waarde: string) =>
    setSpelers((lijst) =>
      lijst.map((s) =>
        s.id === id ? { ...s, [veld]: veld === 'rugnummer' ? Number(waarde) || 0 : waarde } : s
      )
    );

  const voegSpelerToe = () =>
    setSpelers((lijst) => [
      ...lijst,
      { id: nieuwId('sp'), naam: '', rugnummer: lijst.length + 1, actief: true },
    ]);

  const verwijderSpeler = (id: string) => {
    setSpelers((lijst) => lijst.filter((s) => s.id !== id));
    pasPlan((w) => ({
      ...w,
      aanwezig: Object.fromEntries(Object.entries(w.aanwezig).filter(([k]) => k !== id)),
      opstellingen: Object.fromEntries(
        Object.entries(w.opstellingen).map(([p, o]) => [
          p,
          Object.fromEntries(Object.entries(o).filter(([, v]) => v !== id)),
        ])
      ),
    }));
  };

  // --- Koppeling ---

  const zetKoppeling = (k: Koppeling) => {
    setKoppeling(k);
    opslag.bewaarKoppeling(k);
  };

  const testVerbinding = async () => {
    setBezig(true);
    setStatus({ soort: 'bezig', tekst: 'Verbinding testen...' });
    const antwoord = await controleerKoppeling(koppeling);
    setStatus(
      antwoord.ok
        ? antwoord.data.schemaOk
          ? { soort: 'goed', tekst: `Verbinding met de sheet van ${teamNaam} werkt.` }
          : {
              soort: 'fout',
              tekst: `Verbinding werkt, maar dit ontbreekt: ${antwoord.data.ontbreekt.join(', ')}`,
            }
        : { soort: 'fout', tekst: antwoord.melding }
    );
    setBezig(false);
  };

  const spelersOphalen = async () => {
    setBezig(true);
    setStatus({ soort: 'bezig', tekst: 'Spelers ophalen...' });
    const antwoord = await haalSpelers(koppeling);
    if (antwoord.ok) {
      setSpelers(antwoord.data.spelers);
      setStatus({ soort: 'goed', tekst: `${antwoord.data.spelers.length} spelers opgehaald.` });
    } else setStatus({ soort: 'fout', tekst: antwoord.melding });
    setBezig(false);
  };

  const seizoenOphalen = async (cp = seizoenCp) => {
    setSeizoenStatus('Bezig met ophalen...');
    const antwoord = await haalSeizoen(koppeling, cp);
    if (antwoord.ok) {
      setSeizoen(antwoord.data);
      setSeizoenStatus(null);
    } else {
      setSeizoenStatus(antwoord.melding);
    }
  };

  function uitSheet(id: string, data: WedstrijdData, versie: number): Wedstrijd {
    const opstellingen: Record<number, Record<string, string>> = { 1: {}, 2: {}, 3: {}, 4: {} };
    data.opstellingen.forEach((r) => {
      const positieId = r.categorie === 'Keeper' ? KEEPER_POSITIE : `${r.categorie}-${r.plek}`;
      if (opstellingen[r.periode]) opstellingen[r.periode][positieId] = r.speler_id;
    });
    const basis = legeWedstrijd(id, teamGrootte);
    return {
      ...basis,
      datum: data.wedstrijd?.datum ?? basis.datum,
      tijd: data.wedstrijd?.tijd ?? '',
      tegenstander: data.wedstrijd?.tegenstander ?? '',
      thuis: data.wedstrijd ? data.wedstrijd.thuis_uit !== 'uit' : true,
      status: (['gepland', 'bezig', 'afgerond'].includes(String(data.wedstrijd?.status))
        ? String(data.wedstrijd?.status)
        : 'gepland') as Wedstrijd['status'],
      opstellingen,
      gebeurtenissen: opVolgorde(data.gebeurtenissen.map(naarGebeurtenis)),
      aanwezig: Object.fromEntries(data.aanwezigheid.map((r) => [r.speler_id, r.aanwezig])),
      versie,
      planAf: Boolean(data.wedstrijd?.plan_af),
      laatstDoor: String(data.wedstrijd?.laatst_door ?? ''),
      competitieperiode: Number(data.wedstrijd?.competitieperiode) || 1,
    };
  }

  const wedstrijdOphalen = async () => {
    setBezig(true);
    setStatus({ soort: 'bezig', tekst: 'Wedstrijd ophalen...' });
    const antwoord = await haalWedstrijd(koppeling, wedstrijd.id);
    if (!antwoord.ok) {
      setStatus({ soort: 'fout', tekst: antwoord.melding });
      setBezig(false);
      return;
    }
    const opgehaald = uitSheet(wedstrijd.id, antwoord.data, antwoord.versie);
    setWedstrijd(opgehaald);
    setFormatieTekst(startFormatie(opgehaald));
    setPlanWacht(false);
    setOnverzonden([]);
    setNieuwerePlan(null);
    setStatus({ soort: 'goed', tekst: 'Wedstrijd opgehaald uit de sheet.' });
    setBezig(false);
  };

  const bewaarPlanMet = useCallback(
    async (doel: Wedstrijd, melding = 'Plan opgeslagen in de sheet.') => {
      setBezig(true);
      setStatus({ soort: 'bezig', tekst: 'Plan opslaan...' });

      const spelersAntwoord = await bewaarSpelers(koppeling, spelers);
      if (!spelersAntwoord.ok && spelersAntwoord.code !== 'GEEN_KOPPELING') {
        setStatus({ soort: 'fout', tekst: spelersAntwoord.melding });
        setBezig(false);
        return;
      }

      const snapshot = maakPlanSnapshot(doel, (id) => {
        const p = positie(id);
        return p ? { categorie: p.categorie, plek: p.plek } : undefined;
      });
      const antwoord = await bewaarPlan(koppeling, snapshot, doel.versie);

      if (antwoord.ok) {
        setWedstrijd((w) => ({ ...w, versie: antwoord.data.versie }));
        setPlanWacht(false);
        setSyncFout(null);
        setNieuwerePlan(null);
        setStatus({ soort: 'goed', tekst: melding });
      } else {
        setSyncFout({ melding: antwoord.melding, sessie: isSessieProbleem(antwoord.code) });
        setStatus({ soort: 'fout', tekst: antwoord.melding });
        if (antwoord.code === 'CONFLICT') void controleerPlan();
      }
      setBezig(false);
    },
    [koppeling, spelers, controleerPlan]
  );

  const planOpslaan = useCallback(() => bewaarPlanMet(wedstrijd), [bewaarPlanMet, wedstrijd]);

  /** Bewuste afronding: slaat op en markeert het plan als klaar voor de wedstrijd. */
  const rondVoorbereidingAf = async () => {
    const af: Wedstrijd = { ...wedstrijd, planAf: true };
    setWedstrijd(af);
    await bewaarPlanMet(af, 'Voorbereiding afgerond. Andere trainers krijgen een melding.');
  };

  // --- Wedstrijden kiezen en afsluiten ---

  const wisselNaar = (nieuw: Wedstrijd) => {
    setWedstrijd(nieuw);
    setFormatieTekst(startFormatie(nieuw));
    setOnverzonden(opslag.onverzonden());
    setGeselecteerd(null);
    setStatus(null);
    setToonOverzicht(false);
    setFase(nieuw.status === 'gepland' ? 'Aanwezigheid' : 'Live');
  };

  const openWedstrijd = async (id: string, lokaal: boolean) => {
    if (id === wedstrijd.id) {
      setToonOverzicht(false);
      return;
    }
    const bestaand = opslag.wedstrijd(id);
    if (bestaand) {
      wisselNaar(bestaand);
      return;
    }
    if (!lokaal) {
      // Staat alleen in de sheet: eerst ophalen voordat je hem kunt gebruiken.
      setBezig(true);
      setLijstMelding(null);
      const antwoord = await haalWedstrijd(koppeling, id);
      setBezig(false);
      if (!antwoord.ok) {
        setLijstMelding(antwoord.melding);
        return;
      }
      wisselNaar(uitSheet(id, antwoord.data, antwoord.versie));
    }
  };

  const planNieuwe = (velden: WedstrijdVelden) => {
    const nieuw = legeWedstrijd(maakWedstrijdId(velden.datum), teamGrootte);
    nieuw.datum = velden.datum;
    nieuw.tijd = velden.tijd;
    nieuw.tegenstander = velden.tegenstander;
    nieuw.thuis = velden.thuis;
    nieuw.competitieperiode = velden.competitieperiode;
    nieuw.aanwezig = Object.fromEntries(spelers.map((s) => [s.id, true]));
    opslag.bewaarWedstrijd(nieuw);
    setPlanWacht(true);
    wisselNaar(nieuw);
  };

  const sluitWedstrijdAf = async () => {
    const afgerond: Wedstrijd = { ...wedstrijd, status: 'afgerond' };
    setWedstrijd(afgerond);
    opslag.bewaarWedstrijd(afgerond);
    setToonOverzicht(true);
    setSectie('Wedstrijd');

    // De uitslag hoort in de sheet te staan, ook als het net even geen bereik heeft.
    const snapshot = maakPlanSnapshot(afgerond, (id) => {
      const p = positie(id);
      return p ? { categorie: p.categorie, plek: p.plek } : undefined;
    });
    const antwoord = await bewaarPlan(koppeling, snapshot, afgerond.versie);
    if (antwoord.ok) {
      setWedstrijd((w) => ({ ...w, versie: antwoord.data.versie }));
      setPlanWacht(false);
    } else {
      setPlanWacht(true);
    }
  };

  const wedstrijdenOphalen = async () => {
    setBezig(true);
    setLijstMelding(null);
    const [antwoord, uitslagen] = await Promise.all([
      haalSpelers(koppeling),
      haalSeizoen(koppeling, 0),
    ]);
    setBezig(false);
    if (antwoord.ok) setSheetWedstrijden(antwoord.data.wedstrijden ?? []);
    else setLijstMelding(antwoord.melding);
    // Lukt het ophalen van de uitslagen niet, dan blijft de lijst bruikbaar:
    // je ziet dan alleen de uitslagen van wedstrijden op dit apparaat.
    if (uitslagen.ok) {
      const per: Record<string, [number, number]> = {};
      (uitslagen.data.verloop ?? []).forEach((v) => {
        per[String(v.wedstrijd_id)] = [Number(v.voor) || 0, Number(v.tegen) || 0];
      });
      setSheetStanden(per);
    }
  };

  /**
   * Past tegenstander, datum, tijd of thuis en uit aan, bijvoorbeeld als de
   * KNVB een ploeg uit de competitie haalt.
   *
   * Werkt altijd vanaf de nieuwste versie in de sheet. Eerder werd de kopie op
   * dit apparaat gebruikt, en als een andere trainer inmiddels had opgeslagen
   * (of het afsluiten langs het veld niet was doorgekomen) weigerde de sheet
   * met "jij schrijft vanaf een oudere versie". Voor een naamswijziging is dat
   * onnodig: de wijziging raakt het plan niet.
   */
  const bewerkWedstrijd = async (id: string, velden: WedstrijdVelden) => {
    setBezig(true);
    setLijstMelding(null);

    const lokaal = id === wedstrijd.id ? wedstrijd : opslag.wedstrijd(id);
    const opgehaald = await haalWedstrijd(koppeling, id);
    if (!opgehaald.ok) {
      setBezig(false);
      setLijstMelding(opgehaald.melding);
      return;
    }

    // Staat de wedstrijd nog niet in de sheet, dan is de kopie hier de enige.
    const bron = opgehaald.data.wedstrijd
      ? uitSheet(id, opgehaald.data, opgehaald.versie)
      : lokaal;
    if (!bron) {
      setBezig(false);
      setLijstMelding('Deze wedstrijd is niet gevonden.');
      return;
    }

    const bijgewerkt: Wedstrijd = { ...bron, ...velden };
    const snapshot = maakPlanSnapshot(bijgewerkt, (pid) => {
      const p = positie(pid);
      return p ? { categorie: p.categorie, plek: p.plek } : undefined;
    });
    const antwoord = await bewaarPlan(koppeling, snapshot, bijgewerkt.versie);
    setBezig(false);
    if (!antwoord.ok) {
      setLijstMelding(antwoord.melding);
      return;
    }
    const nieuweVersie = antwoord.data.versie;

    if (lokaal) {
      // Het plan op dit apparaat mag alleen de nieuwe versie overnemen als het
      // gelijk is aan wat nu in de sheet staat. Anders zou een later opslaan
      // vanaf hier het nieuwere plan overschrijven zonder dat iemand het merkt.
      const planGelijk =
        zelfdePlan(lokaal.opstellingen, bron.opstellingen) &&
        zelfdePlan({ 0: lokaal.aanwezig }, { 0: bron.aanwezig });
      const eigenWijzigingen = id === wedstrijd.id && planWacht;

      const vernieuwd: Wedstrijd = {
        ...lokaal,
        ...velden,
        versie: planGelijk && !eigenWijzigingen ? nieuweVersie : lokaal.versie,
      };
      if (id === wedstrijd.id) setWedstrijd(vernieuwd);
      else opslag.bewaarWedstrijd(vernieuwd);
    }

    setLokaleWedstrijden(opslag.alleWedstrijden());
    void wedstrijdenOphalen();
  };

  const regels = maakRegels(lokaleWedstrijden, sheetWedstrijden, sheetStanden);

  /**
   * Zolang de coach niets heeft gekozen: de periode van de eerstvolgende
   * geplande wedstrijd, anders de laatste periode waarin iets staat.
   */
  const vandaag = new Date().toISOString().slice(0, 10);
  const volgende = [...regels]
    .filter((r) => r.status !== 'afgerond' && r.datum >= vandaag)
    .sort((a, b) => a.datum.localeCompare(b.datum))[0];
  const actieveCp =
    gekozenCp ??
    volgende?.competitieperiode ??
    Math.max(1, ...regels.map((r) => r.competitieperiode));

  const kiesCp = (cp: number) => {
    setGekozenCp(cp);
    opslag.bewaarCompetitieperiode(cp);
  };

  /** Alleen voor geplande wedstrijden. De sheet weigert als er al iets is geregistreerd. */
  const verwijderGeplandeWedstrijd = async (id: string) => {
    setBezig(true);
    setLijstMelding(null);
    const antwoord = await verwijderWedstrijd(koppeling, id);
    setBezig(false);
    if (!antwoord.ok) {
      setLijstMelding(antwoord.melding);
      return;
    }
    opslag.verwijderWedstrijd(id);
    setLokaleWedstrijden(opslag.alleWedstrijden());
    if (id === wedstrijd.id) {
      setWedstrijd(legeWedstrijd(CONCEPT_ID, teamGrootte));
      setToonOverzicht(true);
    }
    void wedstrijdenOphalen();
  };

  // --- Weergave ---

  const [voor, tegen] = stand(wedstrijd.gebeurtenissen);
  const wachtNog = planWacht || onverzonden.length > 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="/" className="terug-knop" aria-label="Terug naar de teamkeuze">
          <span aria-hidden="true">‹</span>
        </a>
        <div className="brand-mark" aria-hidden="true">
          {teamNaam.replace(/[^0-9]/g, '').slice(0, 2) || 'VVO'}
        </div>
        <div>
          <p className="eyebrow">{teamNaam}</p>
          <h1>Wedstrijddag</h1>
        </div>
        <span
          className={`sync-state ${syncFout ? 'fout' : wachtNog ? 'wacht' : ''}`}
          role="status"
        >
          <i aria-hidden="true" />
          {!online
            ? 'Offline'
            : syncFout
              ? 'Niet bijgewerkt'
              : onverzonden.length
              ? `${onverzonden.length} nog te versturen`
              : planWacht
                ? 'Plan niet opgeslagen'
                : fase === 'Live' && laatstGezien
                  ? `Bij om ${laatstGezien}`
                  : 'Bijgewerkt'}
        </span>
      </header>

      {sectie === 'Wedstrijd' && toonOverzicht && (
        <Wedstrijden
          regels={regels}
          competitieperiode={actieveCp}
          onCompetitieperiode={kiesCp}
          actiefId={wedstrijd.id}
          bezig={bezig}
          melding={lijstMelding}
          onOpen={(id, lokaal) => void openWedstrijd(id, lokaal)}
          onNieuw={planNieuwe}
          onVerversen={() => void wedstrijdenOphalen()}
          onBewerk={(id, velden) => void bewerkWedstrijd(id, velden)}
          onVerwijder={(id) => void verwijderGeplandeWedstrijd(id)}
        />
      )}

      {sectie === 'Wedstrijd' && !toonOverzicht && (
        <>
          <section className="match-card">
            <div>
              <span className="status-dot">
                {wedstrijd.datum}
                {wedstrijd.tijd ? ` om ${wedstrijd.tijd}` : ''}
              </span>
              <h2>
                {wedstrijd.tegenstander || 'Tegenstander nog invullen'}{' '}
                <b>
                  {voor} : {tegen}
                </b>
              </h2>
              <p>
                {wedstrijd.thuis ? 'Thuiswedstrijd' : 'Uitwedstrijd'} · {teamGrootte} tegen{' '}
                {teamGrootte}
                {wedstrijd.status === 'afgerond' ? ' · afgesloten' : ''}
              </p>
              {nieuwerePlan && (
                <p className="kaart-melding" role="status">
                  {nieuwerePlan.door ? `${nieuwerePlan.door} heeft` : 'Iemand heeft'}{' '}
                  {nieuwerePlan.planAf ? 'de voorbereiding afgerond' : 'de opstelling bijgewerkt'}
                </p>
              )}
              <button
                type="button"
                className="kaart-link"
                onClick={() => {
                  setToonOverzicht(true);
                  void wedstrijdenOphalen();
                }}
              >
                Andere wedstrijd kiezen
              </button>
            </div>
            <button
              type="button"
              className="primary-action"
              disabled={Boolean(nieuwerePlan) && fase !== 'Live'}
              onClick={() => {
                // Niet aftrappen met een verouderd plan: dan zien trainers
                // verschillende opstellingen terwijl ze dezelfde wissels krijgen.
                if (nieuwerePlan) return;
                setFase('Live');
                if (wedstrijd.status === 'gepland') {
                  setWedstrijd((w) => ({ ...w, status: 'bezig' }));
                  setPlanWacht(true);
                }
                // Aftrap vastleggen. Zonder dit heeft periode 1 geen begintijd
                // en is de duur van de periodes achteraf niet te berekenen.
                if (!actief(wedstrijd.gebeurtenissen).some((g) => g.type === 'periode' && g.periode === 1)) {
                  registreer({ type: 'periode', periode: 1, omschrijving: 'Aftrap, periode 1' });
                }
              }}
            >
              {nieuwerePlan && fase !== 'Live'
                ? 'Eerst opstelling ophalen'
                : fase === 'Live'
                  ? 'Wedstrijd actief'
                  : 'Wedstrijd starten'}
            </button>
          </section>

          <nav className="phase-nav" aria-label="Wedstrijdfasen">
            {FASES.map((item, i) => (
              <button
                key={item}
                type="button"
                onClick={() => setFase(item)}
                aria-current={fase === item ? 'step' : undefined}
                className={fase === item ? 'active' : FASES.indexOf(fase) > i ? 'done' : ''}
              >
                <span aria-hidden="true">{FASES.indexOf(fase) > i ? '✓' : i + 1}</span>
                {item}
              </button>
            ))}
          </nav>

          {fase === 'Aanwezigheid' && (
            <Aanwezigheid
              wedstrijd={wedstrijd}
              spelers={spelers}
              onToggle={toggleAanwezig}
              onAllen={allenAanwezig}
              onVolgende={() => setFase('Opstelling')}
            />
          )}

          {fase === 'Opstelling' && (
            <OpstellingScherm
              wedstrijd={wedstrijd}
              spelers={spelers}
              posities={posities}
              formatieTekst={formatieTekst}
              formatieFout={formatieFout}
              geselecteerd={geselecteerd}
              onFormatie={kiesFormatie}
              onKiesPositie={kiesPositie}
              onKiesSpeler={kiesSpeler}
              onPeriode={kiesPeriode}
              onKopieer={kopieerNaarVolgende}
              onAutomatisch={automatischVerdelen}
              onVolgende={() => setFase('Wisselplan')}
              planWacht={planWacht}
              bezigMetOpslaan={bezig}
              onOpslaan={() => void planOpslaan()}
              nieuwerePlan={nieuwerePlan}
              onPlanOphalen={() => void wedstrijdOphalen()}
            />
          )}

          {fase === 'Wisselplan' && (
            <Wisselplan
              wedstrijd={wedstrijd}
              spelers={spelers}
              onNaarPeriode={(p) => {
                kiesPeriode(p);
                setFase('Opstelling');
              }}
              onAutomatisch={automatischVerdelen}
              onVolgende={() => setFase('Live')}
              planWacht={planWacht}
              bezigMetOpslaan={bezig}
              onOpslaan={() => void planOpslaan()}
              nieuwerePlan={nieuwerePlan}
              onPlanOphalen={() => void wedstrijdOphalen()}
              onAfronden={() => void rondVoorbereidingAf()}
              planAf={wedstrijd.planAf}
            />
          )}

          {fase === 'Live' && (
            <Live
              wedstrijd={wedstrijd}
              spelers={spelers}
              posities={posities}
              onPeriode={wisselPeriode}
              onDoelpuntVoor={doelpuntVoor}
              onDoelpuntTegen={doelpuntTegen}
              onWissel={voerWisselUit}
              onRuil={ruilVanPlek}
              onOngedaan={maakOngedaan}
              kanOngedaan={Boolean(eigenLaatste)}
              onVerversen={() => void synchroniseer()}
              onverzonden={onverzonden}
              afgerond={wedstrijd.status === 'afgerond'}
              onAfsluiten={() => void sluitWedstrijdAf()}
              syncFout={syncFout}
              onOpnieuwInloggen={() => window.location.reload()}
              toonOvernameKeuze={toonOvernameKeuze}
              neemtOver={neemtOver(wedstrijd, periode)}
              onNeemOver={neemEindstandOver}
              onTerugNaarPlan={terugNaarPlan}
              mogelijkDubbel={mogelijkDubbel(wedstrijd.gebeurtenissen)}
              onCorrigeer={corrigeerDoelpunt}
            />
          )}
        </>
      )}

      {sectie === 'Team' && (
        <TeamScherm
          spelers={spelers}
          wedstrijd={wedstrijd}
          onWijzig={wijzigSpeler}
          onToevoegen={voegSpelerToe}
          onVerwijder={verwijderSpeler}
        />
      )}

      {sectie === 'Statistieken' && (
        <Statistieken
          wedstrijd={wedstrijd}
          spelers={spelers}
          seizoen={seizoen}
          seizoenStatus={seizoenStatus}
          onSeizoenOphalen={() => void seizoenOphalen()}
          seizoenCp={seizoenCp}
          onSeizoenCp={(cp) => {
            setSeizoenCp(cp);
            void seizoenOphalen(cp);
          }}
        />
      )}

      {sectie === 'Instellingen' && (
        <Instellingen
          teamNaam={teamNaam}
          wedstrijd={wedstrijd}
          koppeling={koppeling}
          status={status}
          bezig={bezig}
          onKoppeling={zetKoppeling}
          onWedstrijd={(velden) => pasPlan((w) => ({ ...w, ...velden }))}
          onControleer={testVerbinding}
          onOphalen={wedstrijdOphalen}
          onOpslaan={planOpslaan}
          onSpelersOphalen={spelersOphalen}
          onNieuweWedstrijd={() => {
            setSectie('Wedstrijd');
            setToonOverzicht(true);
            void wedstrijdenOphalen();
          }}
        />
      )}

      <nav className="bottom-nav" aria-label="Hoofdnavigatie">
        {SECTIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSectie(item)}
            aria-current={sectie === item ? 'page' : undefined}
            className={sectie === item ? 'active' : ''}
          >
            {item}
          </button>
        ))}
      </nav>
    </main>
  );
}
