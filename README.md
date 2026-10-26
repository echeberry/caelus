# Caelus: a sky-dome plotter for celestial navigation

Caelus draws where the Sun, Moon and stars rise, climb and set, one path per day, on a dome of the sky above your own horizon. You can type in observations, import them from Excel or Google Sheets, watch the Sun and Moon move with a sky clock, and test your own predictions in the **Make prediction** tab.

**Live program:** (add your link here once the page is published, for example `https://YOUR-USERNAME.github.io/caelus/`)

## What it does

- Plots rise azimuth, highest altitude and set azimuth for the Sun, Moon and stars, color coded, on one dome.
- Sets the dome for any location: search a city or enter coordinates, with time zones.
- Loads data by hand, from Excel or Google Sheets files, from pasted cells or CSV, or computes Sun and Moon tables for a date range.
- Corkscrew view joins each day to the next to show the drift in declination.
- Sky clock plays the Sun and Moon across the dome through a day, or day by day at the same clock time.
- Local apparent noon from two equal-altitude sights, with longitude and latitude.
- Compares observed values with computed ones and summarizes the change per day.
- Make prediction tab: pin where the Sun will be at high noon, or where the Moon is at high tide, then check the answer and print a labelled report.
- Declutter tools: Sun and Moon on/off, thin out entries, date range, label modes, select and deselect rows.
- Works on a phone, follows dark mode, and saves your log in your browser.

## Run it yourself

Keep all the files in one folder and open `index.html` in a browser. There is nothing to install and no server. Reading Excel files loads the SheetJS library from the internet the first time; everything else works offline.

## Files

| File | What is in it |
|---|---|
| `index.html` | The page structure: dome, controls, log, tabs. |
| `style.css` | Look and layout, including light and dark themes. |
| `app.js` | All the behavior, in the sections listed below. |
| `cities.js` | City table from GeoNames (about 6,800 cities). |
| `flammarion.jpg` | The header engraving. |

### Map of `app.js`

| Line | Section |
|---|---|
| 25 | saving the log in the browser |
| 30 | angle, time and formatting helpers |
| 62 | Sun position (Meeus ch. 25, NOAA method) |
| 105 | Moon position (Meeus ch. 47) |
| 188 | city search |
| 208 | app state and starter data |
| 236 | drawing the sky dome |
| 519 | legend and Sun/Moon filter |
| 530 | observation log table and trends |
| 584 | location controls |
| 616 | add-an-observation form |
| 650 | CSV copy and import |
| 670 | messages and Undo |
| 677 | buttons, sliders, Sun and Moon data tools |
| 897 | sky clock (Sun and Moon moving) |
| 949 | save dome image (PNG) |
| 990 | local apparent noon from equal altitudes |
| 1028 | import from Excel, Google Sheets or CSV |
| 1210 | Make prediction tab (Sun and Moon-and-tides games) |
| 1245 | prediction rounds: noon Sun, high-tide Moon |
| 1291 | prediction globe drawing |
| 1608 | printable and savable prediction report |

## How it was made

Built by prompting an AI assistant (Claude, from Anthropic) to write the code, as a "vibe coding" project for a celestial navigation journal, fall 2026. The prompts are listed in the journal summary that goes with it.

## Accuracy

Computed values are good to about 0.05 degrees in altitude and azimuth and about 2 minutes in time. They are for checking your sights, not for replacing the Nautical Almanac.

## Credits

- Sun and Moon positions: Jean Meeus, *Astronomical Algorithms*, 2nd ed. (Willmann-Bell, 1998), chapters 25 and 47.
- City data: GeoNames (geonames.org), CC BY 4.0.
- Excel reading: SheetJS, Apache 2.0.
- Header image: Flammarion engraving, from Camille Flammarion, *L'atmosphere: meteorologie populaire* (Paris, 1888), public domain. The colored version is commonly credited to Hugo Heikenwaelder (1998, CC BY-SA).
