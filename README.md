# VVO CoachApp

Opstelling, wisselschema en live registratie voor de jeugdteams JO9-4 en JO11-4 van VV Oosterhout.

- Opstelling en wisselplan per wedstrijd in vier periodes
- Live registratie van wissels, plekruilen en doelpunten door meerdere trainers tegelijk
- Opslag per team in een Google Sheet via een Apps Script-webapp (`google-apps-script/Code.gs`)
- Statistieken per seizoen en per competitieperiode (CP1 tot en met CP4)

## Bouwen en publiceren

    pnpm install
    pnpm build
    npx wrangler deploy -c dist/server/wrangler.json --message "<versie>"

De app draait op Cloudflare Workers achter Cloudflare Access. Wat er per versie veranderd is, staat in `VERSIE.txt`. De eerste inrichting staat in `STAPPENPLAN.md`.

## Beveiliging

Het token en de webapp-URL van de sheets staan nooit in deze repository. Het token staat in de scripteigenschappen van Apps Script, de koppeling wordt per telefoon in de app ingevoerd.
