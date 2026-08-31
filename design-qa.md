# Filmklubben VHS-vegg — design QA

## Visuell fasit

- Tett objektvegg: `/var/folders/zt/mr5kc74n24g1ldyrwdy353y80000gn/T/TemporaryItems/NSIRD_screencaptureui_FGn1Dp/Screenshot 2026-08-30 at 13.57.19.png`.
- Åpnet objekt med innmat synlig: `/Users/henrymeen/Desktop/Screenshot 2026-08-30 at 13.24.22.png`.
- Filmklubbens eldre programuttrykk: skjermbildene fra 13.26.01, 13.26.06 og 13.26.11 på brukerens Desktop.
- Siste eksplisitte designvalg overstyrer den lyse bokreferansen: siden skal være svart, svært tett og nesten uten tekst eller navigasjon.

Målet er en oversettelse av Minchis tette bokvegg til reelle VHS-objekter, ikke en bokstavelig kopi. CRT-en og den åpne lederplassen viderefører Filmklubbens eksisterende VHS-/TV-språk.

## Implementasjon

- Lokal rute: `http://127.0.0.1:4174/NA`.
- Desktop, 1440 × 1000: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-voting-desktop.png`.
- Mobil, 390 × 844: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-voting-mobile-clean.png`.
- Bokreferansen og den ferdige desktopvisningen i samme sammenligningsbilde: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-voting-comparison-final.png`.
- Filmbytte under TV-avslag: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-tv-power-off-final.png`.

## Funn

Ingen gjenværende P0-, P1- eller P2-avvik.

- **Hierarki:** Bare «Neste film» og dato står igjen over innholdet. Menyer, instruksjoner, filmtitler, rangeringer og synlige stemmetall er fjernet.
- **Desktop:** CRT-en står alene og sentrert. Den store, løsrevne lederkassetten ved siden av TV-en er fjernet. Den åpne lederplassen er nå første objekt i den tette veggen rett under TV-en.
- **Mobil:** CRT-en er kvadratisk. Lederen er første objekt rett under TV-en og beholder kassetten i etuiet.
- **VHS-bevegelse:** Coveret hengsler fra venstre kant. Lederkassetten er forskjøvet 3 % lenger ut enn de andre; skall og kassett er ellers skalert inn i samme fysiske system.
- **Video:** YouTube-traileren autospiller dempet med `controls=0`, tastatur og pekerinteraksjon avskåret. Den lastes bak en svart TV og holdes skjult bak skurring i fire sekunder etter bekreftet avspilling, slik at oppstartsoverlegget rekker å forsvinne. Videoen fyller CRT-flaten uten letterbox-felt.
- **TV-effekt:** Oppstart bruker Filmklubbens gamle hvite bilderørblink. Ved filmbytte kollapser forrige bilde til en lys, horisontal stripe, skjermen blir svart, og den nye traileren slås deretter på med samme CRT-sekvens.
- **Avstemning:** Et klikk lagres delt på serveren og oppdaterer rangeringen med FLIP-bevegelse. Hver nettleserprofil får en anonym, signert enhetsidentitet og kan stemme én gang per film, uavhengig av IP. TV-en byttes bare når en film med minst én stemme faktisk overtar førsteplassen. Duplikatstemme, delt oppdatering fra en annen enhet og uavgjort førsteplass er kontrollert.
- **Program og resultater:** Hver filmkveld har en egen avstemnings-ID og en fast dato i programdataene. Den separate, skrivebeskyttede resultatsiden viser aggregert rangering, stemmer, deltakende enheter og tidligere vinnere uten velgeridentifikatorer.
- **Objekter:** Alle 100 filmene har omslag. VHS-etuiet og kassetten er rasterressurser fra prosjektets eget visuelle språk, ikke tegnede CSS-erstatninger.
- **Tetthet:** Sammenligningsbildet viser samme raske, skannbare rytme som bokreferansen, med mindre mellomrom og uten tekstblokker mellom radene.
- **Tilgjengelighet:** Hver VHS er en ekte knapp med filmtittel, rangering, stemmetall og valgt tilstand tilgjengelig for hjelpemidler. Ingen forklarende eller bekreftende tekst legges oppå det visuelle uttrykket. Redusert bevegelse støttes.
- **Nettleser:** Responsiv flyt, 100 stemmeknapper, lederbytte, polling og hele av/på-sekvensen er kontrollert i den valgte innebygde nettleseren. En helt ny kontrollfane ga ingen feil eller advarsler.
- **Visuell sammenligning:** Det samlede sammenligningsbildet viser samme raske, tette skannerytme som bokreferansen, men med Filmklubbens svarte VHS-/CRT-identitet. Toppfeltet har nå én tydelig hovedgjenstand i stedet for to konkurrerende objekter.

## Avgrensning

YouTube bestemmer fortsatt eventuell annonsevisning og kan ikke garanteres annonsefritt fra klientkoden. Enhetsidentiteten er praktisk, ikke manipulasjonssikker: sletting av informasjonskapsler eller en ny nettleserprofil gir en ny identitet. IP-adresser brukes ikke som stemmeidentitet.

final result: passed
