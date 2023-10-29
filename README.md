# Modeling a Hypothetical North American Train Network

This is a visualization of [Walter Ogozaly's](https://twitter.com/walterogozaly) automation of [Alon Levy's](https://www.pedestrianobservations.com) network model for potential high speed rail ROI in North America.

WARNING: This is *very very rough* and a reflection of one long plane ride's worth of work on building the interface. So please don't judge my skills too harshly. :-)

## Setup

I built this withe node 19. Install dependencies with

```
npm i
```

There are also some python scripts for data processing, whose dependencies you can install with

```
poetry install
```

## Building the data

See `instructions.md`

## Building the site

```
npm run dev
```

## License

CC-BY 4.0

Note that data sources include:
  - SimpleMaps for city data
    - US: https://simplemaps.com/data/us-cities
    - Canada: https://simplemaps.com/data/canada-cities

And others listed for now in `instructions.md`.