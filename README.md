# VARDA — Night Sky Console

A self-hosted night-sky application with a retro starship-bridge interface.
Everything is computed locally in your browser — planets, the Moon, twilight,
sidereal time, all of it. No accounts, no API keys, no network calls after the
page loads (fonts are the only external fetch, and the app degrades gracefully
without them).

## Running it

**Easiest:** double-click `index.html`. The app is built with classic scripts
specifically so it works straight off the filesystem.

**Or serve it** (recommended for geolocation support, which browsers restrict
on `file://`):

```
cd varda
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static host works too (a Raspberry Pi, a NAS, GitHub Pages, a folder on
your home server). There is no build step and no dependency to install.

## The three stations

**Tonight** — the "what can I see right now" tool. Set your site (device
location, a city preset, or raw coordinates), set the time or leave it on
*Now*, and scan. You get a whole-sky dome (hold it overhead like a paper
planisphere — horizon at the rim, zenith at center) plus a categorized list:
solar system, bright named stars, constellations, and deep-sky objects. Every
entry shows its compass direction, altitude, and the equipment needed to see
it, from naked eye through large amateur telescope. Objects beyond a
consumer-grade scope are excluded entirely. The equipment chips multi-select
to filter the list, and each section shows fifteen entries at a time with a
"See more" expander. Both sky views have a full-screen button, and everything
below the horizon stays visible — just blurred and dimmed, the way the planet
is politely in your way. **Print list** produces a clean black-on-white observing sheet with the
query time, site coordinates, and azimuth/altitude for every object —
designed to be useful at a dark site under a red flashlight.

**Explorer** — a free-roam chart. Drag to pan, scroll to zoom, click anything
for details. *Local sky* mode shows the sky as oriented from your site at the
chosen time, with the horizon drawn in; *Star chart* mode is a classic
equatorial atlas view (east to the left, as charts are drawn). Toggle
constellation lines, names, deep-sky markers, and coordinate grids.

**Academy** — learn all 88 IAU constellations across two units — the Northern
Sky and the Southern Sky, each with its own progress bar (the equatorial
lessons belong to both). Eleven lessons of eight, each ordered around a region
or season of sky. Study cards show the real star
figure rendered from catalog data, the constellation's history and mythology,
and its key star. Then the examination: three stages per lesson —
**Figure** (lines plus a ghosted illustration), **Lines only**, and finally
**Stars alone**, the same test the real sky gives you. Miss one and it cycles
back around until you get it. Progress is saved in your browser
(localStorage) and the Academy front page tracks your mastery of the whole
sky, from 0 to all 88.

## Accuracy notes

- Sun: Meeus low-precision series (good to well under an arcminute).
- Moon: truncated ELP series from Meeus ch. 47 (a few arcminutes).
- Planets: JPL/Standish Keplerian elements, valid 1800–2050 AD
  (arcminute-level — visually indistinguishable from truth).
- Altitudes include standard atmospheric refraction; azimuths are from true
  north, eastward.
- Star catalog to magnitude ~6 (5,044 stars, 493 with proper names); 164
  deep-sky objects including the complete Messier catalog.

This is an instrument for visual astronomy and learning, not for pointing a
research telescope — but for any eyepiece you own, it will not steer you
wrong.

## Data attribution

Star positions, constellation figures, and deep-sky data are derived from the
[d3-celestial](https://github.com/ofrohn/d3-celestial) datasets,
© Olaf Frohn, BSD-3-Clause license. All lesson text, mythology summaries, and
application code are original to this project.

## Files

```
index.html          app shell
css/varda.css       design system + print stylesheet
js/astro.js         astronomy engine (time, sun, moon, planets, alt-az)
js/catalog.js       visibility + equipment classification
js/render.js        canvas star-chart renderer
js/tonight.js       Tonight view
js/explorer.js      Explorer view
js/learn.js         Academy view
js/app.js           shell, routing, status band, persistence
data/stars.js       star catalog
data/constellations_geo.js   88 constellation figures
data/dsos.js        deep-sky catalog
data/lore.js        constellation lore + curriculum
```
