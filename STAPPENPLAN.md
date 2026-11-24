# VVO CoachApp: van niets tot online

Eén doorlopend stappenplan. Vervangt de eerdere losse documenten.

Alles gebeurt met het Gmail-account van de trainers. Log daar eerst mee in, of gebruik een apart browserprofiel. Werk je met meerdere Google-accounts, let dan bij elke stap op met welk account je bezig bent: een sheet onder het verkeerde account werkt later niet.

Reken op ongeveer twee uur voor deel A tot en met D. Deel E doe je erna, op je gemak.

**Wat je nodig hebt:** je Google-account, een Cloudflare-account (gratis, maak je aan in stap 12), en je laptop met Node 22 of hoger.

---

## Deel A: de twee sheets (stap 1 tot 6)

Je doet dit twee keer: één keer voor JO9-4, één keer voor JO11-4. De JO9-sheet heb je al, maar het script daarin is verouderd, dus die doe je ook opnieuw. Het is minder werk om met een schone sheet te beginnen dan om kolommen met de hand bij te werken.

### Stap 1: sheet aanmaken

1. Ga naar `sheets.google.com` en maak een lege spreadsheet.
2. Noem hem `JO9-4 coachdata`.
3. Laat hem privé. Niet delen, niet op "iedereen met de link" zetten. Het script wordt straks de enige toegangsweg.

### Stap 2: het script erin

1. Open de sheet in een browser op je laptop. In de mobiele app bestaat het menu Extensies niet.
2. **Extensies** > **Apps Script**. Dit staat tussen Tools en Help.
3. Verwijder de voorbeeldcode en plak de volledige inhoud van `google-apps-script/Code.gs` uit het pakket.
4. Ctrl+S om op te slaan. Geef het project een naam, bijvoorbeeld `JO9-4 backend`.

Ga niet via `script.google.com` een los project aanmaken. Dan hangt het script niet aan je sheet en werkt het niet.

### Stap 3: tabbladen maken en toestemming geven

1. Kies bovenin bij de functiekiezer **setup** en klik **Uitvoeren**.
2. Google vraagt om toestemming:
   - **Machtigingen controleren**, kies het Gmail-account van de trainers.
   - Bij "Google heeft deze app niet geverifieerd": klik **Geavanceerd**, daarna **Ga naar JO9-4 backend (onveilig)**. Dat "onveilig" betekent alleen dat Google jouw eigen script niet heeft beoordeeld.
   - **Toestaan**.
3. Blijft het scherm hangen na Toestaan? Sluit het venster en klik opnieuw op Uitvoeren. De toestemming is dan meestal al geregistreerd.

### Stap 4: token opschrijven

Kijk in het paneel **Uitvoeringslogboek**. Daar staat een regel als `Token: 3f2a91c4-...`.

**Kopieer dat token nu meteen** naar je wachtwoordmanager, met de teamnaam in de titel. Je krijgt er straks twee en die moet je niet door elkaar halen.

Later nog eens nodig? Draai de functie **toonToken**.

### Stap 5: controleren

Kijk onderin de sheet of er zes tabbladen staan: Spelers, Wedstrijden, Aanwezigheid, Opstellingen, Gebeurtenissen en Wijzigingslog. Het standaard `Blad1` mag je weghalen.

### Stap 6: publiceren als webapp

1. Rechtsboven: **Implementeren** > **Nieuwe implementatie**.
2. Tandwiel bij "Selecteer type" > **Web-app**.
3. Omschrijving: `v1`. Uitvoeren als: **Ikzelf**. Wie heeft toegang: **Iedereen**.
4. **Implementeren**, en kopieer de **web-app-URL**. Die eindigt op `/exec`. Ook deze naar je wachtwoordmanager, bij het bijbehorende token.
5. Test hem: plak de URL in een browsertabblad. Je hoort te lezen:

       {"ok":true,"data":{"status":"actief","schemaOk":true},"versie":0}

   Zie je een Google-inlogscherm, dan staat de toegang niet op Iedereen. Staat er `"schemaOk":false`, dan is stap 3 niet goed gegaan.

Over die instelling Iedereen: dat is nodig omdat de app vanuit een browser praat zonder Google-inlog. Het token is je slot op de deur. Wie zowel de URL als het token heeft, komt bij je gegevens. Stuur ze dus nooit samen in één appje.

### Nu nog een keer, voor JO11-4

Herhaal stap 1 tot en met 6 met een tweede sheet, `JO11-4 coachdata`. Je hebt daarna twee URL's en twee tokens.

**Let op bij wijzigingen later:** pas je ooit de code aan, dan is het niet genoeg om op te slaan. Ga naar **Implementeren** > **Implementatie beheren** > potlood > bij Versie kies je **Nieuw** > **Implementeren**. Sla je dat over, dan blijft de oude code draaien terwijl je denkt dat je de nieuwe test. De URL blijft hetzelfde.

---

## Deel B: lokaal testen (stap 7 tot 11)

### Stap 7: het pakket klaarzetten

Pak het zip-bestand uit, bijvoorbeeld naar je map Downloads.

Open Terminal en ga naar die map. Handige truc: typ `cd ` met een spatie erachter, sleep dan de projectmap vanuit Finder het venster in, en druk op Enter.

Controleer met `ls` dat je `package.json` ziet staan.

### Stap 8: installeren en starten

    pnpm install
    pnpm dev

De eerste duurt een paar minuten. Daarna verschijnt een adres als `http://localhost:3000`.

Typ de commando's over of kopieer alleen de tekst zelf, zonder de regels met backticks eromheen.

### Stap 9: koppelen

1. Open het adres. Je komt op het teamkeuzescherm.
2. Klik **JO9-4**. Je zit nu op `/jo9-4`.
3. Onderin: **Instellingen**. Vul in:
   - Jouw naam als coach: `Filip`
   - Webapp-URL: de `/exec`-URL van de JO9-sheet
   - Token: het token van de JO9-sheet
4. **Verbinding testen**. Je hoort te lezen dat de verbinding werkt.
5. Ga terug (pijltje linksboven) naar de teamkeuze, klik **JO11-4**, en vul daar de gegevens van de JO11-sheet in.

De twee teams hebben gescheiden opslag, dus je overschrijft niets.

| Melding | Wat er aan de hand is |
| --- | --- |
| Het token wordt niet geaccepteerd | Verkeerd geplakt, of het token van het andere team |
| Nog geen Google Sheet gekoppeld | Een van de velden is leeg |
| Geen verbinding | Geen internet, of de URL mist `/exec` |
| De sheet reageerde niet binnen twaalf seconden | Apps Script is traag bij de eerste aanroep, probeer nog eens |
| De opbouw van de sheet klopt niet | Draai `setup` opnieuw |

### Stap 10: je selectie invoeren

Per team:

1. **Team**: voeg je spelers toe met rugnummer en voornaam. Gebruik geen achternamen.
2. **Instellingen** > **Opslaan in sheet**.
3. Controleer in de sheet dat het tabblad Spelers gevuld is.

### Stap 11: een testwedstrijd doorlopen

1. **Wedstrijd** > **Nieuwe wedstrijd plannen**: tegenstander, datum, tijd, thuis of uit.
2. **Aanwezigheid**: iedereen aanwezig.
3. **Opstelling**: kies je formatie, klik **Automatisch verdelen**, loop de vier periodes langs.
4. **Wisselplan**: controleer de speeltijd. Iedereen hoort op 2/4 of 3/4 te staan, de keeper op 4/4.
5. **Live**: registreer een doelpunt en een wissel, ga naar de volgende periode.
6. **Wedstrijd afsluiten**. Je komt terug in het overzicht, met de uitslag erbij.
7. **Instellingen** > **Wedstrijd ophalen**, en kijk of het scherm er nog hetzelfde uitziet.

Wil je het samenwerken testen: open hetzelfde adres in een incognitovenster, vul daar dezelfde URL en token in maar een andere coachnaam, en registreer vanuit beide vensters iets. Binnen vijftien seconden hoort de een de invoer van de ander te zien. Een gewoon tweede tabblad werkt niet, dat deelt dezelfde lokale opslag.

---

## Deel C: online zetten (stap 12 tot 14)

Je hebt hiervoor alleen een gratis Cloudflare-account nodig. Geen webruimte, geen domeinnaam, geen creditcard. Je krijgt een adres van de vorm `https://vvo-coachapp.<jouw-subdomein>.workers.dev`.

### Stap 12: Cloudflare-account

1. Ga naar `dash.cloudflare.com/sign-up`.
2. Meld je aan met het Gmail-account van de trainers en bevestig je e-mailadres.
3. Sla het toevoegen van een domein over, dat heb je niet nodig.

### Stap 13: publiceren

In Terminal, in de projectmap:

    npx wrangler login

Er opent een browservenster waarin je de toegang goedkeurt.

    pnpm build
    npx wrangler deploy -c dist/server/wrangler.json

Aan het eind toont wrangler het adres. Open dat en controleer of je het teamkeuzescherm ziet.

Krijg je "You need to register a workers.dev subdomain": kies er eenmalig een in het dashboard onder Workers, en deploy opnieuw.

Elke volgende keer dat je iets wijzigt zijn het alleen de laatste twee regels.

### Stap 14: opnieuw koppelen

De app op het nieuwe adres kent je sheets nog niet: endpoint en token staan per apparaat opgeslagen, niet in de code. Herhaal stap 9 en 10 op het nieuwe adres.

**Test hier meteen "Verbinding testen".** Dit is de stap met de meeste kans op een tegenvaller. Werkt het lokaal wel en online niet, zie dan onderaan bij "Als het misgaat".

---

## Deel D: afschermen (stap 15)

Sla dit niet over. Vanaf nu staan er namen van kinderen achter een openbaar adres.

Cloudflare Zero Trust Access is gratis tot vijftig gebruikers en zet een inlog met e-mailcode voor de app.

1. In het Cloudflare-dashboard: **Zero Trust** in het linkermenu. De eerste keer kies je een teamnaam en het gratis plan.
2. **Access** > **Applications** > **Add an application** > **Self-hosted**.
3. Naam: `VVO CoachApp`. Domein: `vvo-coachapp.<jouw-subdomein>.workers.dev`.
4. Bij **Policies**: actie **Allow**, voorwaarde **Emails**, met de adressen van jezelf en de andere trainers.
5. Opslaan.

Controleer het zelf: open het adres in een incognitovenster. Je hoort een inlogscherm te krijgen, geen app. Een trainer toevoegen is later een adres bijzetten in de policy.

---

## Deel E: klaar voor gebruik (stap 16 en 17)

### Stap 16: op de telefoons

Per team, op elke telefoon die hem gaat gebruiken:

- iPhone: open het teamadres (`.../jo9-4`) in Safari, deelknop, **Zet op beginscherm**.
- Android: openen in Chrome, menu, **Toevoegen aan startscherm**.

Doe dit twee keer met de twee teamadressen. Dan heb je twee iconen die niets delen, en zit je nooit per ongeluk in het verkeerde team.

Elke coach vult op zijn eigen telefoon eenmalig zijn eigen naam, de URL en het token in.

### Stap 17: het ritme op wedstrijddag

Vrijdagavond thuis, met wifi:

1. Wedstrijd plannen of de geplande wedstrijd openen.
2. Aanwezigheid bijwerken na de afmeldingen.
3. Opstelling en wisselplan maken, **Opslaan in sheet**.

Zaterdag op het veld:

4. De app werkt door zonder bereik. Rechtsboven staat of je bij bent: Bijgewerkt, Niet opgeslagen of Offline.
5. Registreer wissels en doelpunten in het Live-scherm. Werk je met twee coaches, verdeel dat dan vooraf.
6. Na afloop: **Wedstrijd afsluiten**.
7. Thuis of in de kantine met wifi: controleer dat alles is weggeschreven.

---

## Als het misgaat

**Online mislukt "Verbinding testen", lokaal werkte het wel.** Waarschijnlijk weigert de browser het verzoek naar `script.google.com` vanaf een ander domein. Open de developer tools, tabblad Netwerk, klik nog eens op testen en kijk wat er bij het verzoek staat. Staat er iets over CORS, dan is de oplossing een klein doorgeefluik in de Worker. Meld het, dat is een overzichtelijke aanpassing.

**CONFLICT bij opslaan.** Een andere coach, of jijzelf op een tweede apparaat, heeft het plan gewijzigd. Klik eerst **Wedstrijd ophalen** en breng je wijzigingen opnieuw aan. De app schrijft bewust niet zomaar overheen. Dit kan alleen bij het plan, niet bij wissels en doelpunten: die worden alleen toegevoegd en botsen nooit.

**Twee coaches zien elkaars invoer niet.** Kijk in de sheet in het tabblad Gebeurtenissen. Staan de regels van beiden daar, dan werkt het schrijven en zit het probleem in het ophalen. Staan ze er niet, dan is bij een van de twee de URL of het token niet goed.

**Wijziging in het Apps Script doet niets.** Je hebt geen nieuwe versie geïmplementeerd. Zie de opmerking aan het eind van deel A.

**Het wordt traag met vier coaches tegelijk.** De app haalt elke vijftien seconden nieuwe regels op, en de quota's van Apps Script gelden per Google-account, dus beide teams tellen bij elkaar op. Zet `POLL_MS` in `app/[team]/page.tsx` op `30000` en publiceer opnieuw. Een halve minuut is langs de lijn nog steeds prima.

---

## Over privacy

Wat er in de app is geregeld: geen spelersnamen in de broncode, geen deelbare metadata met club- of teamnaam, zoekmachines wordt gevraagd niet te indexeren, en endpoint en token zitten niet in de gepubliceerde code.

Wat jij regelt: alleen voornamen en rugnummers, de afscherming uit deel D, en een korte afstemming met de vereniging voordat je dit met andere trainers deelt. Je verwerkt gegevens van andermans kinderen, en een melding vooraf is veel makkelijker dan uitleg achteraf.

Eén ding om bewust te kiezen: de clubafkorting zit in het adres. Dat maakt de app niet vindbaar, maar wie het adres ziet weet wel om welke club het gaat. Wil je dat niet, verander dan `name` in `package.json` in iets neutraals als `coach-app` en publiceer opnieuw. Je krijgt dan een nieuw adres.
