'use client';

import { useState } from 'react';
import { Veld, VolledigVeld, type Stand } from './veld';
import type { PlanStand } from '@/lib/team-data';
import {
  ALLE_POSITIES,
  PERIODES,
  PRESETS,
  actief,
  bank,
  formatieVan,
  heeftGespeeld,
  opVeld,
  opVeldNu,
  opVolgorde,
  opstellingNu,
  periodesGespeeld,
  positie,
  type Speler,
  type Wedstrijd,
} from '@/lib/model';

const naamOp = (spelers: Speler[]) => (id: string) =>
  spelers.find((s) => s.id === id)?.naam ?? 'Onbekend';

/** Per periode de stand voor en tegen. Elke gebeurtenis heeft al een periodenummer. */
export function PeriodeStanden({
  wedstrijd,
  huidigePeriode,
}: {
  wedstrijd: Wedstrijd;
  huidigePeriode?: number;
}) {
  return (
    <div className="periode-standen" aria-label="Doelpunten per periode">
      {PERIODES.map((p) => {
        const voor = actief(wedstrijd.gebeurtenissen).filter(
          (g) => g.type === 'doelpunt_voor' && g.periode === p
        ).length;
        const tegen = actief(wedstrijd.gebeurtenissen).filter(
          (g) => g.type === 'doelpunt_tegen' && g.periode === p
        ).length;
        return (
          <div key={p} className={p === huidigePeriode ? 'nu' : ''}>
            <em>P{p}</em>
            <b>
              {voor}<span aria-hidden="true">-</span>{tegen}
            </b>
          </div>
        );
      })}
    </div>
  );
}

// --- Aanwezigheid ---

export function Aanwezigheid({
  wedstrijd,
  spelers,
  onToggle,
  onAllen,
  onVolgende,
}: {
  wedstrijd: Wedstrijd;
  spelers: Speler[];
  onToggle: (id: string) => void;
  onAllen: () => void;
  onVolgende: () => void;
}) {
  const aantal = spelers.filter((s) => wedstrijd.aanwezig[s.id]).length;

  return (
    <section className="workspace page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Selectie bevestigen</p>
          <h2>
            Aanwezigheid: {aantal} van {spelers.length}
          </h2>
        </div>
        <button type="button" className="secondary-action" onClick={onAllen}>
          Iedereen aanwezig
        </button>
      </div>

      {spelers.length === 0 ? (
        <p className="empty">
          Nog geen spelers bekend. Voeg ze toe bij Team, of haal ze op uit de gekoppelde sheet.
        </p>
      ) : (
        <div className="attendance-grid">
          {spelers.map((s) => {
            const aanwezig = Boolean(wedstrijd.aanwezig[s.id]);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onToggle(s.id)}
                aria-pressed={aanwezig}
                className={aanwezig ? 'present' : 'absent'}
              >
                <span aria-hidden="true">{s.rugnummer}</span>
                <strong>{s.naam}</strong>
                <em>{aanwezig ? 'Aanwezig' : 'Afwezig'}</em>
              </button>
            );
          })}
        </div>
      )}

      {aantal < wedstrijd.teamGrootte && spelers.length > 0 && (
        <p className="waarschuwing" role="status">
          Er zijn {aantal} spelers aanwezig, je hebt er {wedstrijd.teamGrootte} nodig om compleet
          te starten.
        </p>
      )}

      <button type="button" className="primary-action wide" onClick={onVolgende}>
        Verder naar de opstelling
      </button>
    </section>
  );
}

// --- Opstelling per periode ---

export function OpstellingScherm({
  wedstrijd,
  spelers,
  posities,
  formatieTekst,
  formatieFout,
  geselecteerd,
  onFormatie,
  onKiesPositie,
  onKiesSpeler,
  onPeriode,
  onKopieer,
  onAutomatisch,
  onVolgende,
  planWacht,
  bezigMetOpslaan,
  onOpslaan,
  nieuwerePlan,
  onPlanOphalen,
}: {
  wedstrijd: Wedstrijd;
  spelers: Speler[];
  posities: string[];
  formatieTekst: string;
  formatieFout: string | null;
  geselecteerd: string | null;
  onFormatie: (tekst: string) => void;
  onKiesPositie: (positieId: string) => void;
  onKiesSpeler: (spelerId: string) => void;
  onPeriode: (p: number) => void;
  onKopieer: () => void;
  onAutomatisch: () => void;
  onVolgende: () => void;
  planWacht: boolean;
  bezigMetOpslaan: boolean;
  onOpslaan: () => void;
  nieuwerePlan: PlanStand | null;
  onPlanOphalen: () => void;
}) {
  const naam = naamOp(spelers);
  const [vergroot, setVergroot] = useState(false);
  const [veldStand, setVeldStand] = useState<Stand>('normaal');
  const periode = wedstrijd.actievePeriode;
  const opstelling = wedstrijd.opstellingen[periode] ?? {};
  const bezet = opVeld(wedstrijd, periode).length;

  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Tik een speler, tik daarna een plek</p>
          <h2>Opstelling periode {periode}</h2>
        </div>
        <button type="button" className="secondary-action" onClick={onAutomatisch}>
          Automatisch verdelen
        </button>
      </div>

      {nieuwerePlan && (
        <PlanMelding stand={nieuwerePlan} planWacht={planWacht} onOphalen={onPlanOphalen} />
      )}

      <PeriodeKiezer wedstrijd={wedstrijd} onKies={onPeriode} />

      <div className="formation-row">
        <label className="formation-picker">
          Formatie
          <select
            value={formatieTekst}
            onChange={(e) => onFormatie(e.target.value)}
            aria-label="Kies een formatie"
          >
            {PRESETS[wedstrijd.teamGrootte]?.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <span className="veld-teller">
          {bezet}/{wedstrijd.teamGrootte} opgesteld
        </span>
      </div>

      {formatieFout && (
        <p className="foutmelding" role="alert">
          {formatieFout}
        </p>
      )}

      <Veld
        posities={posities}
        opstelling={opstelling}
        naamVan={naam}
        periodesVan={(id) => periodesGespeeld(wedstrijd, id)}
        geselecteerd={geselecteerd}
        onKies={onKiesPositie}
        formatie={formatieVan(opstelling)}
        onVergroot={() => setVergroot(true)}
      />

      {vergroot && (
        <VolledigVeld
          titel={`Plan periode ${wedstrijd.actievePeriode} · ${formatieVan(opstelling)}`}
          onSluit={() => setVergroot(false)}
          stand={veldStand}
          onStand={setVeldStand}
          posities={posities}
          opstelling={opstelling}
          naamVan={naam}
          periodesVan={(id) => periodesGespeeld(wedstrijd, id)}
          formatie={formatieVan(opstelling)}
        />
      )}

      <SpelerLijst
        wedstrijd={wedstrijd}
        spelers={spelers}
        geselecteerd={geselecteerd}
        onKies={onKiesSpeler}
      />

      <p className="helper" role="status">
        {geselecteerd
          ? `${naam(geselecteerd)} geselecteerd, tik nu een plek op het veld of een andere speler om te ruilen.`
          : 'Tik een speler aan en daarna de plek waar hij moet staan.'}
      </p>

      <div className="knoprij">
        <button type="button" className="secondary-action" onClick={onKopieer}>
          Kopieer naar volgende periodes
        </button>
        <button type="button" className="primary-action" onClick={onVolgende}>
          Naar het wisselplan
        </button>
      </div>

      <OpslaanBalk planWacht={planWacht} bezig={bezigMetOpslaan} onOpslaan={onOpslaan} />
    </section>
  );
}

function PeriodeKiezer({
  wedstrijd,
  onKies,
}: {
  wedstrijd: Wedstrijd;
  onKies: (p: number) => void;
}) {
  return (
    <div className="period-tabs" role="tablist" aria-label="Periode">
      {PERIODES.map((p) => {
        const gevuld = opVeld(wedstrijd, p).length;
        const compleet = gevuld === wedstrijd.teamGrootte;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={wedstrijd.actievePeriode === p}
            onClick={() => onKies(p)}
            className={wedstrijd.actievePeriode === p ? 'active' : compleet ? 'done' : ''}
          >
            <b>Periode {p}</b>
            <em>
              {gevuld}/{wedstrijd.teamGrootte}
            </em>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Volledige selectie onder het veld. Aanwezige spelers zijn aanklikbaar,
 * afwezige staan er grijs bij zodat je ziet wie je mist zonder terug te hoeven
 * naar het aanwezigheidsscherm.
 */
function SpelerLijst({
  wedstrijd,
  spelers,
  geselecteerd,
  onKies,
}: {
  wedstrijd: Wedstrijd;
  spelers: Speler[];
  geselecteerd: string | null;
  onKies: (spelerId: string) => void;
}) {
  const periode = wedstrijd.actievePeriode;
  const veld = new Set(opVeld(wedstrijd, periode));
  const aanwezig = spelers.filter((s) => wedstrijd.aanwezig[s.id]);
  const afwezig = spelers.filter((s) => !wedstrijd.aanwezig[s.id]);
  const opBank = aanwezig.filter((s) => !veld.has(s.id)).length;

  return (
    <div className="selectie">
      <div className="selectie-kop">
        <p className="eyebrow">Selectie</p>
        <span>
          {veld.size} op het veld, {opBank} op de bank
          {afwezig.length ? `, ${afwezig.length} afwezig` : ''}
        </span>
      </div>

      <div className="selectie-lijst">
        {spelers.map((s) => {
          const isAanwezig = Boolean(wedstrijd.aanwezig[s.id]);
          const staatOpVeld = veld.has(s.id);
          const gekozen = geselecteerd === s.id;
          const gespeeld = periodesGespeeld(wedstrijd, s.id);

          return (
            <button
              key={s.id}
              type="button"
              disabled={!isAanwezig}
              onClick={() => onKies(s.id)}
              aria-pressed={gekozen}
              aria-label={
                isAanwezig
                  ? `${s.naam}, ${staatOpVeld ? 'staat opgesteld' : 'op de bank'}, ${gespeeld} van 4 periodes`
                  : `${s.naam}, afwezig`
              }
              className={[
                'speler-knop',
                staatOpVeld ? 'op-veld' : '',
                gekozen ? 'selected' : '',
                isAanwezig ? '' : 'afwezig',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="nr" aria-hidden="true">
                {s.rugnummer}
              </span>
              <span className="wie">
                <strong>{s.naam || 'Naamloos'}</strong>
                <em>
                  {!isAanwezig
                    ? 'Afwezig'
                    : staatOpVeld
                      ? (positie(
                          Object.keys(wedstrijd.opstellingen[periode] ?? {}).find(
                            (k) => (wedstrijd.opstellingen[periode] ?? {})[k] === s.id
                          ) ?? ''
                        )?.label ?? 'Op het veld')
                      : 'Bank'}
                </em>
              </span>
              {isAanwezig && <b className={gespeeld <= 1 ? 'krap' : ''}>{gespeeld}/4</b>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Wisselplan ---

export function Wisselplan({
  wedstrijd,
  spelers,
  onNaarPeriode,
  onAutomatisch,
  onVolgende,
  planWacht,
  bezigMetOpslaan,
  onOpslaan,
  nieuwerePlan,
  onPlanOphalen,
  onAfronden,
  planAf,
}: {
  wedstrijd: Wedstrijd;
  spelers: Speler[];
  onNaarPeriode: (p: number) => void;
  onAutomatisch: () => void;
  onVolgende: () => void;
  planWacht: boolean;
  bezigMetOpslaan: boolean;
  onOpslaan: () => void;
  nieuwerePlan: PlanStand | null;
  onPlanOphalen: () => void;
  onAfronden: () => void;
  planAf: boolean;
}) {
  const naam = naamOp(spelers);
  const aanwezig = spelers.filter((s) => wedstrijd.aanwezig[s.id]);
  const scheef = aanwezig.filter((s) => periodesGespeeld(wedstrijd, s.id) <= 1);

  return (
    <section className="workspace page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Vier periodes</p>
          <h2>Wisselplan</h2>
        </div>
        <button type="button" className="secondary-action" onClick={onAutomatisch}>
          Automatisch verdelen
        </button>
      </div>

      {nieuwerePlan && (
        <PlanMelding stand={nieuwerePlan} planWacht={planWacht} onOphalen={onPlanOphalen} />
      )}

      <div className="periods">
        {PERIODES.map((p) => {
          const veld = opVeld(wedstrijd, p);
          const opBank = aanwezig.filter((s) => !veld.includes(s.id));
          const vorige = p > 1 ? opVeld(wedstrijd, p - 1) : null;
          const erin = vorige ? veld.filter((id) => !vorige.includes(id)) : [];
          const eruit = vorige ? vorige.filter((id) => !veld.includes(id)) : [];

          return (
            <article key={p}>
              <b>Periode {p}</b>
              <span>
                {veld.length ? veld.map(naam).join(', ') : 'Nog niemand opgesteld'}
              </span>
              <em>
                {p === 1
                  ? `Start. Op de bank: ${opBank.map((s) => s.naam).join(', ') || 'niemand'}`
                  : erin.length || eruit.length
                    ? `Wissel: ${eruit.map(naam).join(', ') || 'niemand'} eruit, ${
                        erin.map(naam).join(', ') || 'niemand'
                      } erin`
                    : 'Geen wissels ten opzichte van de vorige periode'}
              </em>
              <button
                type="button"
                className="link-action"
                onClick={() => onNaarPeriode(p)}
                aria-label={`Periode ${p} aanpassen`}
              >
                Aanpassen
              </button>
            </article>
          );
        })}
      </div>

      <h3 className="subkop">Speeltijd</h3>
      <div className="speeltijd">
        {aanwezig.map((s) => {
          const n = periodesGespeeld(wedstrijd, s.id);
          return (
            <div key={s.id} className={n <= 1 ? 'krap' : ''}>
              <span>{s.naam}</span>
              <div className="balkjes" aria-hidden="true">
                {PERIODES.map((p) => (
                  <i key={p} className={heeftGespeeld(wedstrijd, p).has(s.id) ? 'aan' : ''} />
                ))}
              </div>
              <strong>{n}/4</strong>
            </div>
          );
        })}
      </div>

      {scheef.length > 0 && (
        <p className="waarschuwing" role="status">
          {scheef.map((s) => s.naam).join(', ')} {scheef.length === 1 ? 'speelt' : 'spelen'} één
          periode of minder.
        </p>
      )}

      <OpslaanBalk planWacht={planWacht} bezig={bezigMetOpslaan} onOpslaan={onOpslaan} />

      <div className="afronden">
        <p>
          {planAf
            ? 'De voorbereiding is afgerond. Andere trainers zien dat dit plan klaarstaat.'
            : 'Rond de voorbereiding af als de opstelling klaar is. Het plan gaat naar de sheet en de andere trainers krijgen een melding.'}
        </p>
        <button
          type="button"
          className="primary-action wide"
          onClick={onAfronden}
          disabled={bezigMetOpslaan}
        >
          {planAf ? 'Opnieuw afronden en delen' : 'Voorbereiding afronden en delen'}
        </button>
      </div>

      <button type="button" className="secondary-action wide" onClick={onVolgende}>
        Naar het wedstrijdscherm
      </button>
    </section>
  );
}

/**
 * Melding dat een andere trainer het plan heeft bijgewerkt. Bewust met een knop
 * en niet automatisch: zo zie je dat er voorwerk is gedaan, en verdwijnt jouw
 * eigen werk nooit ongemerkt.
 */
function PlanMelding({
  stand,
  planWacht,
  onOphalen,
}: {
  stand: PlanStand;
  planWacht: boolean;
  onOphalen: () => void;
}) {
  return (
    <div className="plan-melding" role="status">
      <strong>
        {stand.door ? `${stand.door} heeft` : 'Een andere trainer heeft'}{' '}
        {stand.planAf ? 'de voorbereiding afgerond' : 'de opstelling bijgewerkt'}
      </strong>
      <span>
        {planWacht
          ? 'Let op: je hebt zelf ook wijzigingen die nog niet zijn opgeslagen. Die vervallen als je ophaalt.'
          : 'Haal op om met dezelfde opstelling te werken.'}
      </span>
      <button type="button" onClick={onOphalen}>
        {planWacht ? 'Ophalen, mijn wijzigingen vervallen' : 'Opstelling ophalen'}
      </button>
    </div>
  );
}

/**
 * Opslaan hoort te staan waar je werkt. Stond eerder alleen in Instellingen,
 * en dat was niet te raden.
 */
function OpslaanBalk({
  planWacht,
  bezig,
  onOpslaan,
}: {
  planWacht: boolean;
  bezig: boolean;
  onOpslaan: () => void;
}) {
  return (
    <div className={`opslaanbalk ${planWacht ? 'wacht' : ''}`}>
      <span>
        {planWacht
          ? 'Wijzigingen staan alleen op dit apparaat'
          : 'Alles is opgeslagen in de sheet'}
      </span>
      <button
        type="button"
        className={planWacht ? 'primary-action' : 'secondary-action'}
        onClick={onOpslaan}
        disabled={bezig}
      >
        {bezig ? 'Bezig...' : planWacht ? 'Nu opslaan' : 'Opnieuw opslaan'}
      </button>
    </div>
  );
}

// --- Live ---

export function Live({
  wedstrijd,
  spelers,
  posities,
  onPeriode,
  onDoelpuntVoor,
  onDoelpuntTegen,
  onWissel,
  onRuil,
  formaties,
  onFormatie,
  onOngedaan,
  kanOngedaan,
  onVerversen,
  onverzonden,
  afgerond,
  onAfsluiten,
  syncFout,
  onOpnieuwInloggen,
  toonOvernameKeuze,
  neemtOver,
  onNeemOver,
  onTerugNaarPlan,
  mogelijkDubbel,
  onCorrigeer,
}: {
  wedstrijd: Wedstrijd;
  spelers: Speler[];
  posities: string[];
  onPeriode: (p: number) => void;
  onDoelpuntVoor: (spelerId: string) => void;
  onDoelpuntTegen: () => void;
  onWissel: (uit: string, erin: string) => void;
  onRuil: (a: string, b: string) => void;
  formaties: string[];
  onFormatie: (formatie: string) => void;
  onOngedaan: () => void;
  kanOngedaan: boolean;
  onVerversen: () => void;
  onverzonden: string[];
  afgerond: boolean;
  onAfsluiten: () => void;
  syncFout: { melding: string; sessie: boolean } | null;
  onOpnieuwInloggen: () => void;
  toonOvernameKeuze: boolean;
  neemtOver: boolean;
  onNeemOver: () => void;
  onTerugNaarPlan: () => void;
  mogelijkDubbel: Set<string>;
  onCorrigeer: (id: string) => void;
}) {
  const [kiezer, setKiezer] = useState<'doelpunt' | 'wissel' | 'formatie' | null>(null);
  const [vergroot, setVergroot] = useState(false);
  const [veldStand, setVeldStand] = useState<Stand>('normaal');
  const [teVerwijderen, setTeVerwijderen] = useState<string | null>(null);
  const [uit, setUit] = useState<string | null>(null);
  /** Eerste speler die is aangetikt om van plek te ruilen. */
  const [ruil, setRuil] = useState<{ speler: string; periode: number } | null>(null);

  const naam = naamOp(spelers);
  const periode = wedstrijd.actievePeriode;
  const opstelling = opstellingNu(wedstrijd, periode);
  const huidigeFormatie = formatieVan(opstelling);
  // Na een formatiewissel tonen we alleen de plekken die nu bezet zijn: de
  // lege plekken uit het plan horen dan niet meer bij de formatie.
  const formatieGewijzigd = actief(wedstrijd.gebeurtenissen).some(
    (g) => g.type === 'formatie' && g.periode === periode
  );
  const veldPosities = formatieGewijzigd
    ? ALLE_POSITIES.filter((p) => opstelling[p.id]).map((p) => p.id)
    : posities;
  // Een keuze uit een andere periode, of van een speler die intussen is
  // gewisseld, telt niet meer.
  const ruilSpeler =
    ruil && ruil.periode === periode && Object.values(opstelling).includes(ruil.speler)
      ? ruil.speler
      : null;

  /**
   * Tik een speler, dan een tweede: ze ruilen van plek. Nog een keer op
   * dezelfde speler tikken heft de keuze op. Een lege plek doet niets.
   */
  const kiesPlek = (positieId: string) => {
    if (afgerond) return;
    const speler = opstelling[positieId];
    if (!speler) return;
    if (!ruilSpeler) {
      setRuil({ speler, periode });
      return;
    }
    if (ruilSpeler !== speler) onRuil(ruilSpeler, speler);
    setRuil(null);
  };
  const [voor, tegen] = [
    actief(wedstrijd.gebeurtenissen).filter((g) => g.type === 'doelpunt_voor').length,
    actief(wedstrijd.gebeurtenissen).filter((g) => g.type === 'doelpunt_tegen').length,
  ];
  const veld = opVeldNu(wedstrijd, periode);
  const banklijst = bank(wedstrijd, spelers, periode);

  return (
    <section className="workspace live-panel">
      {syncFout && (
        <div className="sync-banner" role="alert">
          <strong>Niet bijgewerkt</strong>
          <span>
            {syncFout.sessie
              ? 'Mogelijk is je sessie verlopen. Wat je invoert blijft bewaard en gaat mee zodra de verbinding er weer is.'
              : syncFout.melding}
          </span>
          <span className="banner-knoppen">
            <button type="button" onClick={onVerversen}>
              Opnieuw proberen
            </button>
            {syncFout.sessie && (
              <button type="button" onClick={onOpnieuwInloggen}>
                Opnieuw inloggen
              </button>
            )}
          </span>
        </div>
      )}

      <div className="live-score">
        <p className="eyebrow">{afgerond ? 'Afgesloten' : `Periode ${periode} van 4`}</p>
        <strong>
          {voor} <span aria-hidden="true">–</span> {tegen}
        </strong>
        <small>
          {wedstrijd.thuis ? 'Thuis' : 'Uit'} tegen {wedstrijd.tegenstander || 'onbekend'}
        </small>
        <PeriodeStanden wedstrijd={wedstrijd} huidigePeriode={periode} />
      </div>

      <div className="period-controls">
        <button
          type="button"
          onClick={() => onPeriode(periode - 1)}
          disabled={periode <= 1}
          aria-label="Terug naar de vorige periode"
        >
          Vorige
        </button>
        <span>Periode {periode}</span>
        <button
          type="button"
          onClick={() => onPeriode(periode + 1)}
          disabled={periode >= 4}
          aria-label="Verder naar de volgende periode"
        >
          Volgende
        </button>
      </div>

      <div className={`live-actions ${afgerond ? '' : 'vier'}`}>
        <button type="button" onClick={() => setKiezer(kiezer === 'doelpunt' ? null : 'doelpunt')}>
          <span aria-hidden="true">⚽</span>
          <strong>Doelpunt voor</strong>
        </button>
        <button type="button" onClick={onDoelpuntTegen}>
          <span aria-hidden="true">＋</span>
          <strong>Doelpunt tegen</strong>
        </button>
        <button
          type="button"
          onClick={() => {
            setUit(null);
            setKiezer(kiezer === 'wissel' ? null : 'wissel');
          }}
        >
          <span aria-hidden="true">↔</span>
          <strong>Wissel</strong>
        </button>
        {!afgerond && (
          <button
            type="button"
            onClick={() => setKiezer(kiezer === 'formatie' ? null : 'formatie')}
          >
            <span aria-hidden="true">▦</span>
            <strong>Formatie</strong>
          </button>
        )}
      </div>

      {kiezer === 'formatie' && (
        <div className="chooser" role="group" aria-label="Formatie wijzigen">
          <p>
            Nu {huidigeFormatie}. Kies de nieuwe formatie. Iedereen schuift mee, dit telt niet als
            wissel.
          </p>
          {formaties.map((f) => (
            <button
              key={f}
              type="button"
              className={f === huidigeFormatie ? 'huidig' : ''}
              disabled={f === huidigeFormatie}
              onClick={() => {
                onFormatie(f);
                setRuil(null);
                setKiezer(null);
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {kiezer === 'doelpunt' && (
        <div className="chooser" role="group" aria-label="Kies de doelpuntenmaker">
          <p>Wie scoorde?</p>
          {veld.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onDoelpuntVoor(id);
                setKiezer(null);
              }}
            >
              {naam(id)}
            </button>
          ))}
        </div>
      )}

      {kiezer === 'wissel' && (
        <div className="chooser" role="group" aria-label="Wissel uitvoeren">
          {!uit ? (
            <>
              <p>Wie gaat eruit?</p>
              {veld.length ? (
                veld.map((id) => (
                  <button key={id} type="button" onClick={() => setUit(id)}>
                    {naam(id)}
                  </button>
                ))
              ) : (
                <span className="empty">Er staat nog niemand opgesteld.</span>
              )}
            </>
          ) : (
            <>
              <p>{naam(uit)} eruit. Wie komt erin?</p>
              {banklijst.length ? (
                banklijst.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onWissel(uit, s.id);
                      setUit(null);
                      setKiezer(null);
                    }}
                  >
                    {s.naam} <b>{periodesGespeeld(wedstrijd, s.id)}/4</b>
                  </button>
                ))
              ) : (
                <span className="empty">Niemand op de bank.</span>
              )}
            </>
          )}
        </div>
      )}

      {toonOvernameKeuze && !afgerond && (
        <div className={`overname-keuze ${neemtOver ? 'gekozen' : ''}`} role="group" aria-label="Startopstelling van deze periode">
          <strong>Waar begint periode {periode} mee?</strong>
          <span>
            Het plan wijkt af van hoe periode {periode - 1} eindigde. Kies waarmee je verdergaat. Dit
            telt niet als wisselbeurt.
          </span>
          <div className="overname-knoppen">
            <button
              type="button"
              className={neemtOver ? 'actief' : ''}
              aria-pressed={neemtOver}
              onClick={neemtOver ? undefined : onNeemOver}
            >
              Doorgaan met huidige opstelling
            </button>
            <button
              type="button"
              className={!neemtOver ? 'actief' : ''}
              aria-pressed={!neemtOver}
              onClick={neemtOver ? onTerugNaarPlan : undefined}
            >
              Volgens het plan
            </button>
          </div>
        </div>
      )}

      <Veld
        posities={veldPosities}
        opstelling={opstelling}
        naamVan={naam}
        periodesVan={(id) => periodesGespeeld(wedstrijd, id)}
        geselecteerd={ruilSpeler}
        onKies={kiesPlek}
        formatie={huidigeFormatie}
        onVergroot={() => setVergroot(true)}
      />
      {!afgerond && (
        <p className="helper" role="status">
          {ruilSpeler
            ? `${naam(ruilSpeler)} gekozen. Tik de speler met wie ${naam(ruilSpeler)} van plek ruilt, of nog een keer op ${naam(ruilSpeler)} om te annuleren.`
            : 'Tik twee spelers op het veld om ze van plek te laten ruilen. Dit telt niet als wissel.'}
        </p>
      )}

      {vergroot && (
        <VolledigVeld
          titel={`Periode ${periode} · ${huidigeFormatie}`}
          onSluit={() => setVergroot(false)}
          stand={veldStand}
          onStand={setVeldStand}
          posities={veldPosities}
          opstelling={opstelling}
          naamVan={naam}
          periodesVan={(id) => periodesGespeeld(wedstrijd, id)}
          formatie={huidigeFormatie}
        />
      )}

      <div className="timeline">
        <div className="section-heading">
          <h3>Tijdlijn</h3>
          <span className="tijdlijn-knoppen">
            <button type="button" onClick={onVerversen}>
              Verversen
            </button>
            <button type="button" onClick={onOngedaan} disabled={!kanOngedaan}>
              Mijn laatste ongedaan
            </button>
          </span>
        </div>
        {mogelijkDubbel.size > 0 && (
          <p className="dubbel-melding" role="status">
            Mogelijk is een doelpunt twee keer ingevoerd door verschillende trainers. Controleer de
            gemarkeerde regels en verwijder de dubbele.
          </p>
        )}
        {wedstrijd.gebeurtenissen.length ? (
          opVolgorde(wedstrijd.gebeurtenissen)
            .reverse()
            .map((g) => {
              const weg = !actief(wedstrijd.gebeurtenissen).some((a) => a.id === g.id);
              const isDoelpunt = g.type === 'doelpunt_voor' || g.type === 'doelpunt_tegen';
              const dubbel = mogelijkDubbel.has(g.id);
              const klassen = [
                onverzonden.includes(g.id) ? 'wacht' : '',
                g.type === 'verwijderd' ? 'correctie' : '',
                weg && g.type !== 'verwijderd' ? 'weg' : '',
                dubbel ? 'dubbel' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={g.id} className={klassen}>
                  <time>{g.tijdstip}</time>
                  <span>
                    <b>P{g.periode}</b> {g.omschrijving}
                    {g.coach ? <em> · {g.coach}</em> : null}
                    {dubbel ? <mark> mogelijk dubbel</mark> : null}
                    {onverzonden.includes(g.id) ? <i title="Nog niet verzonden"> ○</i> : null}
                  </span>
                  {isDoelpunt && !weg && (
                    <button
                      type="button"
                      className="verwijder-knop"
                      onClick={() => setTeVerwijderen(g.id)}
                      aria-label={`${g.omschrijving} verwijderen`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })
        ) : (
          <p className="empty">Nog geen gebeurtenissen geregistreerd.</p>
        )}

        {teVerwijderen && (() => {
          const doel = wedstrijd.gebeurtenissen.find((g) => g.id === teVerwijderen);
          if (!doel) return null;
          return (
            <div className="bevestig" role="alertdialog" aria-label="Doelpunt verwijderen">
              <strong>{doel.omschrijving} verwijderen?</strong>
              <span>
                Ingevoerd om {doel.tijdstip}
                {doel.coach ? ` door ${doel.coach}` : ''}. De uitslag wordt aangepast, en de
                correctie komt ook bij de andere trainers aan.
              </span>
              <div className="knoprij">
                <button type="button" className="secondary-action" onClick={() => setTeVerwijderen(null)}>
                  Annuleren
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    onCorrigeer(doel.id);
                    setTeVerwijderen(null);
                  }}
                >
                  Verwijderen
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {!afgerond && (
        <button type="button" className="secondary-action wide" onClick={onAfsluiten}>
          Wedstrijd afsluiten
        </button>
      )}
    </section>
  );
}
