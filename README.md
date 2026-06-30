# The Explosion Rockets

Repository van **The Explosion Rockets** — echte Nederlandse rock-'n-roll & rockabilly sinds 1959.

De **bandwebsite** staat in de **repo-root** en wordt via GitHub Pages (branch `main`) gepubliceerd op:

- **https://explosionrockets.com** (eigen domein)
- https://tduijghuisen.github.io/ER-Setlist-Maker/ (GitHub Pages-URL)

## Wat zit erin
Een zelfstandige one-page bandwebsite in **pop-art / comic-book stijl** (Lichtenstein,
Ben-Day dots, primaire kleuren, knalbubbels). Open `index.html` in de browser.

- Comic-ontwerp: krantpapier-crème, comic-rood/geel/blauw, dikke zwarte kaders, harde
  offset-schaduwen, halftone-dots en echte starburst-vormen (`clip-path`).
- Vaste achtergrondvideo, tweetalig (NL/EN) via de schakelaar.
- Zes bandleden, klikbare tour-agenda met flyers, ingesloten YouTube-video's en Spotify-speler.
- Geverifieerde info: sinds 1959 (Vught / The Jet Black Robbers), Andy Tielman Award,
  Bad Nauheim, 9 albums, jubileumalbum "The Sun Sessions" (Sun Studio, Memphis).

## Structuur
- `index.html` — de volledige site (inline CSS + JS, geen build-stap).
- `assets/` — afbeeldingen, stickers, iconen, albumart, achtergrondvideo's, flyers (`assets/shows/`).
- `data/shows.json` — de tour-agenda (beheerd via `/admin`).
- `admin/` — eenvoudige CMS om de agenda en flyers bij te werken (commit via de GitHub API).
- `CNAME` — koppelt het eigen domein `explosionrockets.com` aan GitHub Pages.

> De voormalige **Setlist Maker**-app stond op de repo-root en is verwijderd; ze blijft bewaard in de git-historie.
