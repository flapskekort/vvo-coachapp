'use client';

import { useEffect } from 'react';
import { ALLE_POSITIES, type Categorie, type Opstelling, type Positie } from '@/lib/model';

export type Stand = 'normaal' | 'verdedigen' | 'aanvallen';

export const STANDEN: { id: Stand; label: string }[] = [
  { id: 'normaal', label: 'Normaal' },
  { id: 'verdedigen', label: 'Verdedigen' },
  { id: 'aanvallen', label: 'Aanvallen' },
];

/**
 * Hoogte per linie in elke stand. Kleiner getal is dichter bij het doel van de
 * tegenstander. Bij verdedigen zakt het blok en wordt het compact, bij
 * aanvallen schuift het op en trekt het uit elkaar.
 */
const HOOGTE: Record<Stand, Record<Categorie, number>> = {
  normaal: { Keeper: 88, Verdediger: 69, Middenvelder: 46, Aanvaller: 21 },
  verdedigen: { Keeper: 89, Verdediger: 75, Middenvelder: 62, Aanvaller: 47 },
  aanvallen: { Keeper: 82, Verdediger: 54, Middenvelder: 33, Aanvaller: 13 },
};

/** Breedte rond het midden: onder 1 is compacter, boven 1 is breder. */
const BREEDTE: Record<Stand, number> = { normaal: 1, verdedigen: 0.78, aanvallen: 1.15 };

/**
 * Dezelfde spelers, andere plek op het veld. Alleen weergave: er verandert
 * niets aan de opstelling, de speeltijd of de wisselbeurten.
 */
function verplaats(pos: Positie, stand: Stand): { x: number; y: number } {
  const x = 50 + (pos.x - 50) * BREEDTE[stand];
  return { x: Math.min(92, Math.max(8, x)), y: HOOGTE[stand][pos.categorie] };
}

type Props = {
  posities: string[];
  opstelling: Opstelling;
  naamVan: (id: string) => string;
  periodesVan: (id: string) => number;
  geselecteerd: string | null;
  onKies: (positieId: string) => void;
  formatie: string;
  stand?: Stand;
  onVergroot?: () => void;
};

export function Veld({
  posities,
  opstelling,
  naamVan,
  periodesVan,
  geselecteerd,
  onKies,
  formatie,
  stand = 'normaal',
  onVergroot,
}: Props) {
  const actief: Positie[] = ALLE_POSITIES.filter((p) => posities.includes(p.id));

  return (
    <div className="pitch" role="group" aria-label={`Opstelling in formatie ${formatie}`}>
      <div className="halfway" />
      <div className="centre-circle" />
      <div className="goal top" />
      <div className="goal bottom" />

      {onVergroot && (
        <button
          type="button"
          className="vergroot-knop"
          onClick={onVergroot}
          aria-label="Opstelling schermvullend tonen"
        >
          <span aria-hidden="true">⤢</span>
        </button>
      )}

      {actief.map((pos) => {
        const spelerId = opstelling[pos.id];
        const bezet = Boolean(spelerId);
        const isGeselecteerd = bezet && geselecteerd === spelerId;
        const { x, y } = verplaats(pos, stand);

        return (
          <button
            key={pos.id}
            type="button"
            onClick={() => onKies(pos.id)}
            aria-pressed={isGeselecteerd}
            aria-label={
              bezet
                ? `${pos.label}: ${naamVan(spelerId)}, ${periodesVan(spelerId)} van 4 periodes`
                : `${pos.label}: nog leeg`
            }
            className={`player cat-${pos.categorie.toLowerCase()} ${
              isGeselecteerd ? 'selected' : ''
            } ${bezet ? '' : 'empty'}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span aria-hidden="true">{bezet ? naamVan(spelerId).charAt(0) : '+'}</span>
            <strong>
              {bezet ? (
                <>
                  {naamVan(spelerId)} <b>{periodesVan(spelerId)}/4</b>
                </>
              ) : (
                pos.label
              )}
            </strong>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Het veld schermvullend, met de drie standen. Bedoeld om in de kleedkamer of
 * de rust te laten zien hoe het team staat bij verdedigen en aanvallen.
 */
export function VolledigVeld({
  titel,
  onSluit,
  ...veld
}: Omit<Props, 'onVergroot' | 'stand' | 'onKies' | 'geselecteerd'> & {
  titel: string;
  onSluit: () => void;
  stand: Stand;
  onStand: (s: Stand) => void;
}) {
  const { stand, onStand, ...rest } = veld;

  // Escape sluit, en de pagina eronder scrolt niet mee zolang dit open is.
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSluit();
    };
    const vorige = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', toets);
    return () => {
      document.body.style.overflow = vorige;
      window.removeEventListener('keydown', toets);
    };
  }, [onSluit]);

  return (
    <div className="volledig-veld" role="dialog" aria-modal="true" aria-label={titel}>
      <div className="volledig-kop">
        <strong>{titel}</strong>
        <button type="button" className="sluit-knop" onClick={onSluit} aria-label="Terug naar normale grootte">
          <span aria-hidden="true">⤡</span> Verkleinen
        </button>
      </div>

      <div className="stand-kiezer" role="tablist" aria-label="Positionering">
        {STANDEN.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={stand === s.id}
            className={stand === s.id ? 'active' : ''}
            onClick={() => onStand(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="volledig-veld-kader">
        <Veld {...rest} stand={stand} geselecteerd={null} onKies={() => undefined} />
      </div>
    </div>
  );
}
