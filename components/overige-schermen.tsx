'use client';

import { useState } from 'react';
import {
  PERIODES,
  actief,
  heeftGespeeld,
  periodesGespeeld,
  type Speler,
  type Wedstrijd,
} from '@/lib/model';
import { PeriodeStanden } from './wedstrijd-schermen';
import type { Koppeling, SeizoenData } from '@/lib/team-data';

export function TeamScherm({
  spelers,
  wedstrijd,
  onWijzig,
  onToevoegen,
  onVerwijder,
}: {
  spelers: Speler[];
  wedstrijd: Wedstrijd;
  onWijzig: (id: string, veld: 'naam' | 'rugnummer', waarde: string) => void;
  onToevoegen: () => void;
  onVerwijder: (id: string) => void;
}) {
  return (
    <section className="workspace page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Selectie</p>
          <h2>{spelers.length} spelers</h2>
        </div>
        <button type="button" className="secondary-action" onClick={onToevoegen}>
          Speler toevoegen
        </button>
      </div>

      {spelers.length === 0 && (
        <p className="empty">
          Nog geen spelers. Voeg ze hier toe of haal ze op uit de gekoppelde sheet bij
          Instellingen.
        </p>
      )}

      <div className="roster">
        {spelers.map((s) => (
          <div key={s.id}>
            <input
              className="nummer"
              inputMode="numeric"
              value={s.rugnummer}
              onChange={(e) => onWijzig(s.id, 'rugnummer', e.target.value.replace(/\D/g, ''))}
              aria-label={`Rugnummer van ${s.naam}`}
            />
            <input
              value={s.naam}
              onChange={(e) => onWijzig(s.id, 'naam', e.target.value)}
              aria-label="Naam"
            />
            <em>{periodesGespeeld(wedstrijd, s.id)}/4</em>
            <button
              type="button"
              onClick={() => onVerwijder(s.id)}
              aria-label={`${s.naam} uit de selectie verwijderen`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <p className="helper">
        Namen worden alleen op dit apparaat en in je eigen sheet bewaard.
      </p>
    </section>
  );
}

export function Statistieken({
  wedstrijd,
  spelers,
  seizoen,
  seizoenStatus,
  onSeizoenOphalen,
  seizoenCp,
  onSeizoenCp,
}: {
  wedstrijd: Wedstrijd;
  spelers: Speler[];
  seizoen: SeizoenData | null;
  seizoenStatus: string | null;
  onSeizoenOphalen: () => void;
  seizoenCp: number;
  onSeizoenCp: (cp: number) => void;
}) {
  const [weergave, setWeergave] = useState<'wedstrijd' | 'seizoen'>('wedstrijd');

  return (
    <section className="workspace page-panel">
      <div className="stat-schakelaar" role="tablist" aria-label="Periode van de cijfers">
        <button
          type="button"
          role="tab"
          aria-selected={weergave === 'wedstrijd'}
          className={weergave === 'wedstrijd' ? 'active' : ''}
          onClick={() => setWeergave('wedstrijd')}
        >
          Deze wedstrijd
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={weergave === 'seizoen'}
          className={weergave === 'seizoen' ? 'active' : ''}
          onClick={() => {
            setWeergave('seizoen');
            if (!seizoen) onSeizoenOphalen();
          }}
        >
          Hele seizoen
        </button>
      </div>

      {weergave === 'wedstrijd' ? (
        <WedstrijdCijfers wedstrijd={wedstrijd} spelers={spelers} />
      ) : (
        <SeizoenCijfers
          seizoen={seizoen}
          status={seizoenStatus}
          onOphalen={onSeizoenOphalen}
          cp={seizoenCp}
          onCp={onSeizoenCp}
        />
      )}
    </section>
  );
}

function WedstrijdCijfers({ wedstrijd, spelers }: { wedstrijd: Wedstrijd; spelers: Speler[] }) {
  const doelpunten = actief(wedstrijd.gebeurtenissen).filter((g) => g.type === 'doelpunt_voor');
  const tegen = actief(wedstrijd.gebeurtenissen).filter((g) => g.type === 'doelpunt_tegen').length;

  const perSpeler = doelpunten.reduce<Record<string, number>>((acc, g) => {
    if (g.spelerId) acc[g.spelerId] = (acc[g.spelerId] ?? 0) + 1;
    return acc;
  }, {});

  const aanwezig = spelers.filter((s) => wedstrijd.aanwezig[s.id]);

  return (
    <>
      <p className="eyebrow">{wedstrijd.tegenstander || 'Wedstrijd'}</p>

      <div className="stat-grid">
        <article>
          <span>Voor</span>
          <strong>{doelpunten.length}</strong>
        </article>
        <article>
          <span>Tegen</span>
          <strong>{tegen}</strong>
        </article>
        <article>
          <span>Wissels</span>
          <strong>{actief(wedstrijd.gebeurtenissen).filter((g) => g.type === 'wissel').length}</strong>
        </article>
      </div>

      <h3 className="subkop">Doelpunten per periode</h3>
      <PeriodeStanden wedstrijd={wedstrijd} />

      <h3 className="subkop">Speeltijd</h3>
      <div className="speeltijd">
        {aanwezig.map((s) => (
          <div key={s.id} className={periodesGespeeld(wedstrijd, s.id) <= 1 ? 'krap' : ''}>
            <span>{s.naam}</span>
            <div className="balkjes" aria-hidden="true">
              {PERIODES.map((p) => (
                <i key={p} className={heeftGespeeld(wedstrijd, p).has(s.id) ? 'aan' : ''} />
              ))}
            </div>
            <strong>{periodesGespeeld(wedstrijd, s.id)}/4</strong>
          </div>
        ))}
      </div>

      <h3 className="subkop">Doelpunten</h3>
      <div className="ranking">
        {Object.keys(perSpeler).length ? (
          Object.entries(perSpeler)
            .sort((a, b) => b[1] - a[1])
            .map(([id, aantal], i) => (
              <div key={id}>
                <b>{i + 1}</b>
                <span>{spelers.find((s) => s.id === id)?.naam ?? 'Onbekend'}</span>
                <strong>{aantal}</strong>
              </div>
            ))
        ) : (
          <p className="empty">Nog geen doelpunten geregistreerd.</p>
        )}
      </div>
    </>
  );
}

/** Doelpuntenverloop over de vier periodes, opgeteld over alle wedstrijden. */
function PeriodeVerloop({
  perPeriode,
}: {
  perPeriode: { periode: number; voor: number; tegen: number }[];
}) {
  const hoogste = Math.max(1, ...perPeriode.flatMap((p) => [p.voor, p.tegen]));

  return (
    <div className="periode-verloop">
      {perPeriode.map((p) => (
        <div key={p.periode}>
          <div className="staven" aria-hidden="true">
            <span className="voor" style={{ height: `${(p.voor / hoogste) * 100}%` }} />
            <span className="tegen" style={{ height: `${(p.tegen / hoogste) * 100}%` }} />
          </div>
          <b>
            {p.voor}<i>-</i>{p.tegen}
          </b>
          <em>P{p.periode}</em>
        </div>
      ))}
    </div>
  );
}

function SeizoenCijfers({
  seizoen,
  status,
  onOphalen,
  cp,
  onCp,
}: {
  seizoen: SeizoenData | null;
  status: string | null;
  onOphalen: () => void;
  cp: number;
  onCp: (cp: number) => void;
}) {
  const [sortering, setSortering] = useState<'doelpunten' | 'wissels' | 'bank' | 'naam'>(
    'doelpunten'
  );

  if (!seizoen) {
    return (
      <>
        <p className="empty">
          {status ?? 'Nog niet opgehaald. De cijfers komen uit de sheet, dus je hebt bereik nodig.'}
        </p>
        <button type="button" className="primary-action wide" onClick={onOphalen}>
          Seizoen ophalen
        </button>
      </>
    );
  }

  const gesorteerd = [...seizoen.spelers].sort((a, b) => {
    if (sortering === 'naam') return a.naam.localeCompare(b.naam);
    if (sortering === 'wissels') return b.wissels_totaal - a.wissels_totaal || a.naam.localeCompare(b.naam);
    if (sortering === 'bank')
      return (b.periodes_bank ?? 0) - (a.periodes_bank ?? 0) || a.naam.localeCompare(b.naam);
    return b.doelpunten - a.doelpunten || a.naam.localeCompare(b.naam);
  });

  const totaalDoelpunten = seizoen.spelers.reduce((n, s) => n + s.doelpunten, 0);
  const totaalWissels = seizoen.spelers.reduce((n, s) => n + s.wissels_totaal, 0);
  const gespeeldePeriodes = (seizoen.perCompetitieperiode ?? []).filter((r) => r.wedstrijden > 0);

  return (
    <>
      <div className="cp-filter" role="tablist" aria-label="Cijfers over">
        {[0, 1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={cp === n}
            className={cp === n ? 'active' : ''}
            onClick={() => onCp(n)}
          >
            {n === 0 ? 'Alles' : `CP${n}`}
          </button>
        ))}
      </div>

      <p className="eyebrow">
        {cp ? `Competitieperiode ${cp}` : 'Hele seizoen'} · {seizoen.wedstrijden} wedstrijden
      </p>

      {gespeeldePeriodes.length > 1 && (
        <>
          <h3 className="subkop">Per competitieperiode</h3>
          <div className="cp-vergelijk" role="table" aria-label="Resultaten per competitieperiode">
            <div className="kop" role="row">
              <span role="columnheader">Periode</span>
              <b role="columnheader" title="Gespeeld">Gs</b>
              <b role="columnheader" title="Gewonnen, gelijk, verloren">W-G-V</b>
              <b role="columnheader" title="Doelpunten voor en tegen">Dp</b>
              <b role="columnheader" title="Gemiddeld saldo per wedstrijd">Gem</b>
            </div>
            {gespeeldePeriodes.map((r) => {
              const gem = (r.voor - r.tegen) / r.wedstrijden;
              return (
                <div key={r.competitieperiode} role="row" className={cp === r.competitieperiode ? 'nu' : ''}>
                  <span role="cell">CP{r.competitieperiode}</span>
                  <b role="cell">{r.wedstrijden}</b>
                  <b role="cell">
                    {r.gewonnen}-{r.gelijk}-{r.verloren}
                  </b>
                  <b role="cell">
                    {r.voor}-{r.tegen}
                  </b>
                  <b role="cell" className={gem > 0 ? 'plus' : gem < 0 ? 'min' : ''}>
                    {gem > 0 ? '+' : ''}
                    {gem.toFixed(1).replace('.', ',')}
                  </b>
                </div>
              );
            })}
          </div>
          <p className="helper">
            Gem is het gemiddelde doelsaldo per wedstrijd, zodat periodes met een verschillend
            aantal wedstrijden eerlijk naast elkaar staan.
          </p>
        </>
      )}

      <div className="stat-grid">
        <article>
          <span>Doelpunten</span>
          <strong>{totaalDoelpunten}</strong>
        </article>
        <article>
          <span>Wisselbeurten</span>
          <strong>{totaalWissels}</strong>
        </article>
        <article>
          <span>Spelers</span>
          <strong>{seizoen.spelers.length}</strong>
        </article>
      </div>

      {seizoen.perPeriode && seizoen.perPeriode.length > 0 && (
        <>
          <h3 className="subkop">Wanneer vallen de doelpunten</h3>
          <PeriodeVerloop perPeriode={seizoen.perPeriode} />
        </>
      )}

      {seizoen.verloop && seizoen.verloop.length > 0 && (
        <>
          <h3 className="subkop">Verloop van de uitslagen</h3>
          <div className="uitslagen">
            {seizoen.verloop.map((w) => (
              <div key={w.wedstrijd_id}>
                <span className="wanneer">{w.datum.slice(8, 10)}-{w.datum.slice(5, 7)}</span>
                <span className="teg">
                  {w.tegenstander || 'onbekend'} <em>{w.thuis ? 'thuis' : 'uit'}</em>
                </span>
                <span className="blokjes" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => {
                    const v = w.periodes[i * 2] ?? 0;
                    const t = w.periodes[i * 2 + 1] ?? 0;
                    const saldo = v - t;
                    return (
                      <i
                        key={i}
                        className={saldo > 0 ? 'plus' : saldo < 0 ? 'min' : ''}
                        title={`Periode ${i + 1}: ${v}-${t}`}
                      >
                        {v}-{t}
                      </i>
                    );
                  })}
                </span>
                <strong className={w.voor > w.tegen ? 'winst' : w.voor < w.tegen ? 'verlies' : ''}>
                  {w.voor}-{w.tegen}
                </strong>
              </div>
            ))}
          </div>
          <p className="helper">
            Per wedstrijd de vier periodes, groen waar je won en rood waar je verloor. Voor
            diepere analyses: draai bouwAnalyse in het Apps Script van de sheet.
          </p>
        </>
      )}

      <div className="sorteer-rij">
        <span>Sorteer op</span>
        {(
          [
            ['doelpunten', 'Doelpunten'],
            ['wissels', 'Wisselbeurten'],
            ['bank', 'Bankbeurten'],
            ['naam', 'Naam'],
          ] as const
        ).map(([waarde, label]) => (
          <button
            key={waarde}
            type="button"
            aria-pressed={sortering === waarde}
            className={sortering === waarde ? 'active' : ''}
            onClick={() => setSortering(waarde)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="seizoen-tabel" role="table" aria-label="Totalen per speler">
        <div className="kop" role="row">
          <span role="columnheader">Speler</span>
          <b role="columnheader" title="Wedstrijden">
            Wed
          </b>
          <b role="columnheader" title="Periodes op het veld">
            Per
          </b>
          <b role="columnheader" title="Periodes op de bank">
            Bank
          </b>
          <b role="columnheader" title="Wisselbeurten: erin plus eruit">
            Wis
          </b>
          <b role="columnheader" title="Doelpunten">
            Dp
          </b>
        </div>
        {gesorteerd.map((s) => (
          <div key={s.speler_id} role="row">
            <span role="cell">
              <i aria-hidden="true">{s.rugnummer || '-'}</i>
              {s.naam}
            </span>
            <b role="cell">{s.wedstrijden}</b>
            <b role="cell">{s.periodes}</b>
            <b role="cell" className={s.periodes_bank > s.periodes ? 'veel-bank' : ''}>
              {s.periodes_bank ?? 0}
            </b>
            <b role="cell" title={`${s.wissels_in} erin, ${s.wissels_uit} eruit`}>
              {s.wissels_totaal}
            </b>
            <b role="cell" className={s.doelpunten ? 'raak' : ''}>
              {s.doelpunten}
            </b>
          </div>
        ))}
      </div>

      <p className="helper">
        Per is het aantal periodes op het veld, Bank het aantal periodes waarin een speler wel
        aanwezig was maar niet speelde. Wis telt erin komen en eruit gaan samen. Rood bij Bank
        betekent dat een speler vaker op de bank zat dan op het veld stond.
      </p>

      <button type="button" className="secondary-action wide" onClick={onOphalen}>
        Opnieuw ophalen
      </button>
    </>
  );
}

export function Instellingen({
  teamNaam,
  wedstrijd,
  koppeling,
  status,
  bezig,
  onKoppeling,
  onWedstrijd,
  onControleer,
  onOphalen,
  onOpslaan,
  onSpelersOphalen,
  onNieuweWedstrijd,
}: {
  teamNaam: string;
  wedstrijd: Wedstrijd;
  koppeling: Koppeling;
  status: { soort: 'goed' | 'fout' | 'bezig'; tekst: string } | null;
  bezig: boolean;
  onKoppeling: (k: Koppeling) => void;
  onWedstrijd: (velden: Partial<Wedstrijd>) => void;
  onControleer: () => void;
  onOphalen: () => void;
  onOpslaan: () => void;
  onSpelersOphalen: () => void;
  onNieuweWedstrijd: () => void;
}) {
  const [toonToken, setToonToken] = useState(false);

  return (
    <section className="workspace page-panel">
      <p className="eyebrow">{teamNaam}</p>
      <h2>Gegevens en koppeling</h2>

      <div className="veldenblok">
        <label>
          Tegenstander
          <input
            value={wedstrijd.tegenstander}
            onChange={(e) => onWedstrijd({ tegenstander: e.target.value })}
          />
        </label>
        <div className="twee">
          <label>
            Datum
            <input
              type="date"
              value={wedstrijd.datum}
              onChange={(e) => onWedstrijd({ datum: e.target.value })}
            />
          </label>
          <label>
            Aanvang
            <input
              type="time"
              value={wedstrijd.tijd}
              onChange={(e) => onWedstrijd({ tijd: e.target.value })}
            />
          </label>
        </div>
        <div className="twee">
          <label>
            Thuis of uit
            <select
              value={wedstrijd.thuis ? 'thuis' : 'uit'}
              onChange={(e) => onWedstrijd({ thuis: e.target.value === 'thuis' })}
            >
              <option value="thuis">Thuis</option>
              <option value="uit">Uit</option>
            </select>
          </label>
        </div>
        <button type="button" className="secondary-action wide" onClick={onNieuweWedstrijd}>
          Nieuwe wedstrijd beginnen
        </button>
      </div>

      <h3 className="subkop">Google Sheet</h3>
      <div className="veldenblok">
        <label>
          Jouw naam als coach
          <input
            value={koppeling.coach}
            onChange={(e) => onKoppeling({ ...koppeling, coach: e.target.value })}
            placeholder="Filip"
            autoComplete="off"
          />
        </label>
        <label>
          Webapp-URL
          <input
            value={koppeling.endpoint}
            onChange={(e) => onKoppeling({ ...koppeling, endpoint: e.target.value })}
            placeholder="https://script.google.com/macros/s/.../exec"
            inputMode="url"
            autoComplete="off"
          />
        </label>
        <label>
          Token
          <span className="token-rij">
            <input
              value={koppeling.token}
              onChange={(e) => onKoppeling({ ...koppeling, token: e.target.value })}
              type={toonToken ? 'text' : 'password'}
              autoComplete="off"
            />
            <button type="button" onClick={() => setToonToken(!toonToken)}>
              {toonToken ? 'Verberg' : 'Toon'}
            </button>
          </span>
        </label>
      </div>

      <div className="knoprij">
        <button type="button" className="secondary-action" onClick={onControleer} disabled={bezig}>
          Verbinding testen
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={onSpelersOphalen}
          disabled={bezig}
        >
          Spelers ophalen
        </button>
      </div>
      <div className="knoprij">
        <button type="button" className="secondary-action" onClick={onOphalen} disabled={bezig}>
          Wedstrijd ophalen
        </button>
        <button type="button" className="primary-action" onClick={onOpslaan} disabled={bezig}>
          {bezig ? 'Bezig...' : 'Opslaan in sheet'}
        </button>
      </div>

      {status && (
        <p className={`status-melding ${status.soort}`} role="status">
          {status.tekst}
        </p>
      )}

      <div className="settings-row">
        <span>Wedstrijd-id</span>
        <strong>{wedstrijd.id}</strong>
      </div>
      <div className="settings-row">
        <span>Versie in sheet</span>
        <strong>{wedstrijd.versie || 'nog niet opgeslagen'}</strong>
      </div>

      <p className="helper">
        Deze app schrijft uitsluitend naar de sheet waarvan jij de webapp-URL invult. Endpoint en
        token blijven op dit apparaat en zitten niet in de gepubliceerde code. Je naam verschijnt
        op de tijdlijn, zodat medecoaches zien wie wat heeft vastgelegd.
      </p>
    </section>
  );
}
