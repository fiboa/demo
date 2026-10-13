# fiboa demos

Web demos and dashboards built on the [Fields of the World harmonized field data](https://source.coop/ftw/harmonized-field-data):
small, working examples of what open field boundaries make possible. Published at **https://fiboa.org/demo/**.

| Demo | What it shows |
|---|---|
| [`nl_raster`](nl_raster/) | Disappearing Dutch farmland: 18 editions of the Dutch parcel register (BRP) on one 2 m Cloud-Optimized GeoTIFF, read in the browser with OpenLayers. |

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/demo/
npm test         # data consistency and unit tests
npm run build    # static site in dist/
```

Every push to `main` is tested, built and deployed to GitHub Pages by `.github/workflows/pages.yml`.

## Add a demo

1. Create a directory `<name>/` with an `index.html` and its code under `<name>/src/`.
2. Add `<name>` to the `demos` list in `vite.config.js`.
3. Link it from the landing page `index.html` and from the table above.

Shared tokens and page frame live in `shared/base.css`. Data that a demo precomputes lives in `<name>/data/`,
and the script that produces it in `scripts/<name>/`.

## Data scripts

Precomputation runs in Python with [pixi](https://pixi.sh) (`pixi.toml`), close to the data:

```bash
pixi run test                                   # pytest for the scripts
pixi run python scripts/nl_raster/stats.py --help
```

## License

Code: Apache-2.0. Data derived from the catalog keeps the license of its source (CC0 for the Dutch BRP).
