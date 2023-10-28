### TODO

Install matplotlib :/


### Sources

## Map data

Follows https://observablehq.com/@leonelgalan/us-canada-map

https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json
https://gist.githubusercontent.com/Brideau/2391df60938462571ca9/raw/f5a1f3b47ff671eaf2fb7e7b798bacfc6962606a/canadaprovtopo.json

https://simplemaps.com/data/us-cities
https://simplemaps.com/data/canada-cities

Upload:
  * states-10m.json
  * canadaprovtopo.json
to https://mapshaper.org/

Export to topojson as `data/processed/us-can-joined.json`

Run `trains merge data/processed/us-can-joined.json data/processed/us-can-merged.json`

Run `trains extract-canada data/raw/hsr_data.xlsx data/raw/canadacities.csv data/processed/canada-cities-merged.json`

Run `trains extract-us data/raw/hsr_data.xlsx data/raw/uscities.csv data/processed/us-cities-rename.csv data/processed/us-cities-merged.json`

Put them all into mapshaper, merge, and export to `data/processed/all-almost.json`

