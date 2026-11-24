import { TEAMS } from '@/lib/teams';

export default function Keuze() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          VVO
        </div>
        <div>
          <p className="eyebrow">VVO CoachApp</p>
          <h1>Kies je team</h1>
        </div>
      </header>

      <section className="workspace">
        <p className="helper" style={{ textAlign: 'left', marginTop: 0 }}>
          Elk team heeft een eigen adres, een eigen sheet en een eigen selectie. Zet het adres van
          jouw team op je beginscherm, dan open je meteen het goede team.
        </p>
        <div className="selectie-lijst" style={{ marginTop: 16 }}>
          {TEAMS.map((t) => (
            // Bewust een gewone link en geen client-side navigatie: staat er een
            // inlogscherm van Cloudflare Access voor, dan onderschept dat de
            // achtergrondaanvraag en gebeurt er bij het klikken niets.
            <a key={t.slug} href={`/${t.slug}`} className="speler-knop">
              <span className="nr" aria-hidden="true">
                {t.naam.replace(/[^0-9]/g, '').slice(0, 2)}
              </span>
              <span className="wie">
                <strong>{t.naam}</strong>
                <em>{t.teamGrootte} tegen {t.teamGrootte}</em>
              </span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
