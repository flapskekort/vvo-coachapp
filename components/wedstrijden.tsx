'use client';

import { useState } from 'react';
import {
  COMPETITIEPERIODES,
  leesStatus,
  stand,
  type Wedstrijd,
  type WedstrijdStatus,
  type WedstrijdVelden,
} from '@/lib/model';
import type { WedstrijdRij } from '@/lib/team-data';

export type Regel = {
  id: string;
  datum: string;
  tijd: string;
  tegenstander: string;
  thuis: boolean;
  status: WedstrijdStatus;
  /** Waar of deze wedstrijd op dit apparaat staat en dus zonder bereik te openen is. */
  lokaal: boolean;
  stand?: [number, number];
  competitieperiode: number;
};

const VOLGORDE: WedstrijdStatus[] = ['bezig', 'gepland', 'afgerond', 'afgelast'];
const KOP: Record<WedstrijdStatus, string> = {
  bezig: 'Bezig',
  gepland: 'Gepland',
  afgerond: 'Gespeeld',
  afgelast: 'Afgelast',
};

/**
 * Voegt de wedstrijden van dit apparaat samen met die uit de sheet.
 *
 * `standen` is de uitslag per gespeelde wedstrijd zoals de sheet die telt,
 * inclusief correcties achteraf. Die gaat voor: de kopie op een telefoon kent
 * alleen wat op die telefoon is geregistreerd en mist dus correcties en
 * doelpunten die een andere trainer heeft ingevoerd.
 */
export function maakRegels(
  lokaal: Wedstrijd[],
  uitSheet: WedstrijdRij[],
  standen: Record<string, [number, number]> = {}
): Regel[] {
  const per = new Map<string, Regel>();

  uitSheet.forEach((r) => {
    per.set(String(r.wedstrijd_id), {
      id: String(r.wedstrijd_id),
      datum: String(r.datum ?? ''),
      tijd: String(r.tijd ?? ''),
      tegenstander: String(r.tegenstander ?? ''),
      thuis: String(r.thuis_uit) !== 'uit',
      status: leesStatus(r.status),
      lokaal: false,
      competitieperiode: Number(r.competitieperiode) || 1,
      stand: standen[String(r.wedstrijd_id)],
    });
  });

  const versieInSheet = new Map(uitSheet.map((r) => [String(r.wedstrijd_id), Number(r.versie) || 0]));

  // Wat op dit apparaat staat is de versie waarin je werkt: stand en status
  // komen daarvandaan. Datum, tegenstander en competitieperiode komen uit de
  // sheet als die minstens zo nieuw is, zodat een aanpassing door een andere
  // trainer ook hier zichtbaar wordt.
  lokaal.forEach((w) => {
    const sheet = per.get(w.id);
    const sheetNieuwer = sheet && (versieInSheet.get(w.id) ?? 0) >= (w.versie ?? 0);
    per.set(w.id, {
      id: w.id,
      datum: sheetNieuwer ? sheet.datum : w.datum,
      tijd: sheetNieuwer ? sheet.tijd : w.tijd,
      tegenstander: sheetNieuwer ? sheet.tegenstander : w.tegenstander,
      thuis: sheetNieuwer ? sheet.thuis : w.thuis,
      competitieperiode: sheetNieuwer ? sheet.competitieperiode : (w.competitieperiode ?? 1),
      // Afsluiten of afgelasten door een andere trainer gaat voor. Terugzetten
      // van afgelast naar gepland ook, anders blijft deze telefoon hangen.
      status:
        sheet?.status === 'afgerond' || sheet?.status === 'afgelast'
          ? sheet.status
          : w.status === 'afgelast' && sheet
            ? sheet.status
            : w.status,
      lokaal: true,
      stand: standen[w.id] ?? stand(w.gebeurtenissen),
    });
  });

  return [...per.values()].sort(
    (a, b) => b.datum.localeCompare(a.datum) || b.tijd.localeCompare(a.tijd)
  );
}

export function Wedstrijden({
  regels: alleRegels,
  competitieperiode,
  onCompetitieperiode,
  actiefId,
  bezig,
  melding,
  onOpen,
  onNieuw,
  onVerversen,
  onBewerk,
  onVerwijder,
}: {
  regels: Regel[];
  competitieperiode: number;
  onCompetitieperiode: (cp: number) => void;
  actiefId: string;
  bezig: boolean;
  melding: string | null;
  onOpen: (id: string, lokaal: boolean) => void;
  onNieuw: (velden: WedstrijdVelden) => void;
  onVerversen: () => void;
  onBewerk: (id: string, velden: WedstrijdVelden) => void;
  onVerwijder: (id: string) => void;
}) {
  const [toonFormulier, setToonFormulier] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [verwijderId, setVerwijderId] = useState<string | null>(null);
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [tijd, setTijd] = useState('');
  const [tegenstander, setTegenstander] = useState('');
  const [thuis, setThuis] = useState(true);

  const regels = alleRegels.filter((r) => r.competitieperiode === competitieperiode);
  const aantalPer = (cp: number) => alleRegels.filter((r) => r.competitieperiode === cp).length;

  const versturen = () => {
    // Een nieuwe wedstrijd hoort bij de periode die je op dat moment bekijkt.
    onNieuw({ datum, tijd, tegenstander: tegenstander.trim(), thuis, competitieperiode });
    setToonFormulier(false);
    setTegenstander('');
    setTijd('');
  };

  return (
    <section className="workspace page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Wedstrijden</p>
          <h2>Competitieperiode {competitieperiode}</h2>
        </div>
        <button type="button" className="secondary-action" onClick={onVerversen} disabled={bezig}>
          {bezig ? 'Bezig...' : 'Ophalen'}
        </button>
      </div>

      <div className="cp-kiezer" role="tablist" aria-label="Competitieperiode">
        {COMPETITIEPERIODES.map((cp) => (
          <button
            key={cp}
            type="button"
            role="tab"
            aria-selected={cp === competitieperiode}
            className={cp === competitieperiode ? 'active' : ''}
            onClick={() => onCompetitieperiode(cp)}
          >
            <b>CP{cp}</b>
            <em>{aantalPer(cp) ? `${aantalPer(cp)} wedstr.` : 'leeg'}</em>
          </button>
        ))}
      </div>

      {melding && (
        <p className="status-melding fout" role="status">
          {melding}
        </p>
      )}

      {toonFormulier ? (
        <div className="veldenblok nieuwe-wedstrijd">
          <label>
            Tegenstander
            <input
              autoFocus
              value={tegenstander}
              onChange={(e) => setTegenstander(e.target.value)}
              placeholder="RWB O9-3"
            />
          </label>
          <div className="twee">
            <label>
              Datum
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            <label>
              Aanvang
              <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} />
            </label>
          </div>
          <label>
            Thuis of uit
            <select value={thuis ? 'thuis' : 'uit'} onChange={(e) => setThuis(e.target.value === 'thuis')}>
              <option value="thuis">Thuis</option>
              <option value="uit">Uit</option>
            </select>
          </label>
          <div className="knoprij">
            <button
              type="button"
              className="secondary-action"
              onClick={() => setToonFormulier(false)}
            >
              Annuleren
            </button>
            <button type="button" className="primary-action" onClick={versturen}>
              Aanmaken
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="primary-action wide" onClick={() => setToonFormulier(true)}>
          Nieuwe wedstrijd plannen
        </button>
      )}

      {regels.length === 0 && (
        <p className="empty">
          Nog geen wedstrijden in competitieperiode {competitieperiode}. Plan er een, of haal ze
          op uit de gekoppelde sheet.
        </p>
      )}

      {VOLGORDE.map((status) => {
        const groep = regels.filter((r) => r.status === status);
        if (!groep.length) return null;
        return (
          <div key={status} className="wedstrijd-groep">
            <h3 className="subkop">{KOP[status]}</h3>
            {groep.map((r) => (
              <div key={r.id} className="wedstrijd-blok">
              <div className="wedstrijd-rij">
              <button
                type="button"
                onClick={() => onOpen(r.id, r.lokaal)}
                aria-current={r.id === actiefId ? 'true' : undefined}
                className={`wedstrijd-regel ${r.id === actiefId ? 'actief' : ''}`}
              >
                <span className="wanneer">
                  <b>{r.datum ? r.datum.slice(8, 10) : '--'}</b>
                  <i>{r.datum ? maand(r.datum) : ''}</i>
                </span>
                <span className="wie">
                  <strong>{r.tegenstander || 'Tegenstander onbekend'}</strong>
                  <em>
                    {r.thuis ? 'Thuis' : 'Uit'}
                    {r.tijd ? ` · ${r.tijd}` : ''}
                    {r.lokaal ? '' : ' · alleen in de sheet'}
                  </em>
                </span>
                {r.status === 'afgerond' && r.stand ? (
                  <span className="uitslag">
                    {r.stand[0]}-{r.stand[1]}
                  </span>
                ) : r.status === 'afgelast' ? (
                  <span className="merk afgelast">Afgelast</span>
                ) : r.id === actiefId ? (
                  <span className="merk">Actief</span>
                ) : null}
              </button>
              <button
                type="button"
                className="regel-actie"
                onClick={() => {
                  setVerwijderId(null);
                  setBewerkId(bewerkId === r.id ? null : r.id);
                }}
                aria-expanded={bewerkId === r.id}
                aria-label={`${r.tegenstander || 'Wedstrijd'} aanpassen`}
              >
                <span aria-hidden="true">✎</span>
              </button>
              </div>

              {bewerkId === r.id && (
                <WedstrijdBewerken
                  regel={r}
                  bezig={bezig}
                  onAnnuleer={() => setBewerkId(null)}
                  onOpslaan={(velden) => {
                    onBewerk(r.id, velden);
                    setBewerkId(null);
                  }}
                  onVerwijderVraag={
                    r.status === 'gepland' || r.status === 'afgelast'
                      ? () => setVerwijderId(r.id)
                      : undefined
                  }
                />
              )}

              {verwijderId === r.id && (
                <div className="bevestig" role="alertdialog" aria-label="Wedstrijd verwijderen">
                  <strong>Wedstrijd tegen {r.tegenstander || 'onbekend'} verwijderen?</strong>
                  <span>
                    Het plan en de aanwezigheid gaan ook weg. Staat er al iets geregistreerd, dan
                    weigert de sheet en blijft alles staan.
                  </span>
                  <div className="knoprij">
                    <button type="button" className="secondary-action" onClick={() => setVerwijderId(null)}>
                      Annuleren
                    </button>
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => {
                        onVerwijder(r.id);
                        setVerwijderId(null);
                        setBewerkId(null);
                      }}
                    >
                      Verwijderen
                    </button>
                  </div>
                </div>
              )}
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Tegenstander, datum, tijd en thuis of uit aanpassen. Bijvoorbeeld als de
 * KNVB een ploeg uit de competitie haalt en er een andere voor in de plaats komt.
 */
function WedstrijdBewerken({
  regel,
  bezig,
  onAnnuleer,
  onOpslaan,
  onVerwijderVraag,
}: {
  regel: Regel;
  bezig: boolean;
  onAnnuleer: () => void;
  onOpslaan: (velden: WedstrijdVelden) => void;
  onVerwijderVraag?: () => void;
}) {
  const [tegenstander, setTegenstander] = useState(regel.tegenstander);
  const [cp, setCp] = useState(regel.competitieperiode);
  const [datum, setDatum] = useState(regel.datum);
  const [tijd, setTijd] = useState(regel.tijd);
  const [thuis, setThuis] = useState(regel.thuis);
  // Afgelasten kan alleen zolang er nog niet gespeeld is.
  const kanAfgelasten = regel.status === 'gepland' || regel.status === 'afgelast';
  const [afgelast, setAfgelast] = useState(regel.status === 'afgelast');

  return (
    <div className="veldenblok bewerk-wedstrijd">
      <label>
        Tegenstander
        <input value={tegenstander} onChange={(e) => setTegenstander(e.target.value)} />
      </label>
      <div className="twee">
        <label>
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>
        <label>
          Aanvang
          <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} />
        </label>
      </div>
      <label>
        Thuis of uit
        <select value={thuis ? 'thuis' : 'uit'} onChange={(e) => setThuis(e.target.value === 'thuis')}>
          <option value="thuis">Thuis</option>
          <option value="uit">Uit</option>
        </select>
      </label>
      <label>
        Competitieperiode
        <select value={cp} onChange={(e) => setCp(Number(e.target.value))}>
          {COMPETITIEPERIODES.map((n) => (
            <option key={n} value={n}>
              Competitieperiode {n}
            </option>
          ))}
        </select>
      </label>
      {kanAfgelasten && (
        <label className="vinkje">
          <input
            type="checkbox"
            checked={afgelast}
            onChange={(e) => setAfgelast(e.target.checked)}
          />
          Afgelast, wordt niet ingehaald
        </label>
      )}
      {kanAfgelasten && afgelast && (
        <p className="helper">
          Een afgelaste wedstrijd telt niet mee in de statistieken. Wordt hij toch ingehaald,
          haal dan dit vinkje weg of pas de datum aan.
        </p>
      )}
      <div className="knoprij">
        <button type="button" className="secondary-action" onClick={onAnnuleer}>
          Annuleren
        </button>
        <button
          type="button"
          className="primary-action"
          disabled={bezig}
          onClick={() =>
            onOpslaan({
              datum,
              tijd,
              tegenstander: tegenstander.trim(),
              thuis,
              competitieperiode: cp,
              ...(kanAfgelasten ? { status: afgelast ? 'afgelast' : 'gepland' } : {}),
            })
          }
        >
          Opslaan
        </button>
      </div>
      {onVerwijderVraag ? (
        <button type="button" className="link-action verwijder-link" onClick={onVerwijderVraag}>
          Deze wedstrijd verwijderen
        </button>
      ) : (
        <p className="helper">Een gespeelde wedstrijd kun je aanpassen maar niet verwijderen.</p>
      )}
    </div>
  );
}

const MAANDEN = [
  'jan',
  'feb',
  'mrt',
  'apr',
  'mei',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
];

function maand(datum: string): string {
  const n = Number(datum.slice(5, 7));
  return MAANDEN[n - 1] ?? '';
}
