# Filmklubben VHS-vegg — design QA

## Visuell fasit

- Tett objektvegg: `/var/folders/zt/mr5kc74n24g1ldyrwdy353y80000gn/T/TemporaryItems/NSIRD_screencaptureui_FGn1Dp/Screenshot 2026-08-30 at 13.57.19.png`.
- Åpnet objekt med innmat synlig: `/Users/henrymeen/Desktop/Screenshot 2026-08-30 at 13.24.22.png`.
- Filmklubbens eldre programuttrykk: skjermbildene fra 13.26.01, 13.26.06 og 13.26.11 på brukerens Desktop.
- Siste eksplisitte designvalg overstyrer den lyse bokreferansen: siden skal være svart, svært tett og nesten uten tekst eller navigasjon.

Målet er en oversettelse av Minchis tette bokvegg til reelle VHS-objekter, ikke en bokstavelig kopi. CRT-en og den åpne lederkassetten viderefører Filmklubbens eksisterende VHS-/TV-språk.

## Implementasjon

- Lokal rute: `http://127.0.0.1:4174/default`.
- Desktop, 1280 × 800: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-vhs-wall-desktop-verified.png`.
- Mobil, 390 × 844: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-vhs-wall-mobile-verified-v2.png`.
- Referansene og begge implementerte visninger i samme sammenligningsbilde: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-vhs-comparison-verified.png`.
- Filmbytte under TV-avslag: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-tv-power-off-final.png`.

## Funn

Ingen gjenværende P0-, P1- eller P2-avvik.

- **Hierarki:** Bare «Neste film» og dato står igjen over innholdet. Menyer, instruksjoner, filmtitler, rangeringer og synlige stemmetall er fjernet.
- **Desktop:** Den åpne, tomme leder-VHS-en står til venstre for CRT-en. Samme film skjules i veggen, så den vises ikke dobbelt. Den tette veggen starter rett under og bruker hele bredden.
- **Mobil:** CRT-en er kvadratisk. Lederen er første objekt rett under TV-en, står moderat åpen og er tom fordi kassetten er i TV-en.
- **VHS-bevegelse:** Coveret hengsler fra venstre kant. Kassetten blir liggende inne i etuiet ved hover; skall og kassett er skalert inn så ingenting stikker gjennom plasten.
- **Video:** YouTube-traileren autospiller dempet med `controls=0`, tastatur og pekerinteraksjon avskåret. Den lastes bak en svart TV og vises først når avspilling har startet og YouTubes oppstartsoverlegg har rukket å forsvinne. Videoen fyller CRT-flaten uten letterbox-felt.
- **TV-effekt:** Oppstart bruker Filmklubbens gamle hvite bilderørblink. Ved filmbytte kollapser forrige bilde til en lys, horisontal stripe, skjermen blir svart, og den nye traileren slås deretter på med samme CRT-sekvens.
- **Avstemning:** Et klikk oppdaterer rangeringen. Etuiet og TV-en byttes bare når en ny film faktisk overtar førsteplassen. Pulp Fiction, 2001 og In the Mood for Love er kontrollert som ledere; den tidligere døde In the Mood-traileren er byttet ut.
- **Objekter:** Alle 100 filmene har omslag. VHS-etuiet og kassetten er rasterressurser fra prosjektets eget visuelle språk, ikke tegnede CSS-erstatninger.
- **Tetthet:** Sammenligningsbildet viser samme raske, skannbare rytme som bokreferansen, med mindre mellomrom og uten tekstblokker mellom radene.
- **Tilgjengelighet:** Hver VHS er en ekte knapp med filmtittel, rangering, stemmetall og valgt tilstand tilgjengelig for hjelpemidler. Synlig støy er erstattet av en skjult live-status. Redusert bevegelse støttes.
- **Nettleser:** Responsiv flyt, 100 stemmeknapper, lederbytte og hele av/på-sekvensen er kontrollert i den valgte innebygde nettleseren. Ingen nettleserfeil eller advarsler fra løsningen ble funnet.
- **Kodekvalitet:** 33 tester, TypeScript og produksjonsbygget passerer. ESLint har 0 feil; de 43 eksisterende advarslene ligger i eldre, urørte deler av prosjektet.

## Avgrensning

YouTube bestemmer fortsatt eventuell annonsevisning og kan ikke garanteres annonsefritt fra klientkoden. Stemmene lever foreløpig i den lokale prototypens nettlesertilstand. Delt lagring mellom brukere og produksjonspublisering er ikke gjort eller antydet.

final result: passed
