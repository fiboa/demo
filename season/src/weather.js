/**
 * The weather at a field through one season and the 1991–2020 normal, from the Open-Meteo historical
 * weather API (ERA5 reanalysis): rain and growing degree days, both summed from the start of the season.
 */
import { daily } from '../../shared/openmeteo.js';

export const GDD_BASE = 5; // °C: the usual base for cereals and grass in a temperate climate
const NORMAL_YEARS = [1991, 2020];
const DAY = 86400000;

const isoDay = (date) => date.toISOString().slice(0, 10);

/**
 * Sums from the first day on, stopping at the first missing value (the archive runs a few days behind):
 * { rain: [mm], gdd: [°C·days], temp: [°C] } with one entry per day that has data.
 */
export function cumulative(temp, rain) {
  const out = { rain: [], gdd: [], temp: [] };
  let r = 0;
  let g = 0;
  for (let i = 0; i < temp.length; i++) {
    if (temp[i] == null || rain[i] == null) break;
    r += rain[i];
    g += Math.max(0, temp[i] - GDD_BASE);
    out.rain.push(r);
    out.gdd.push(g);
    out.temp.push(temp[i]);
  }
  return out;
}

/**
 * The normal season: per day of the season the 1991–2020 mean of the running sums and of the temperature.
 * Seasons that start in July take their days from two calendar years; 29 February is dropped.
 */
export function normalSeason(time, temp, rain, startMonth) {
  const seasons = new Map(); // first year of the season -> { temp: [], rain: [] }
  for (let i = 0; i < time.length; i++) {
    const [y, m, d] = time[i].split('-').map(Number);
    if (m === 2 && d === 29) continue;
    const first = m >= startMonth ? y : y - 1;
    if (!seasons.has(first)) seasons.set(first, { temp: [], rain: [] });
    const s = seasons.get(first);
    s.temp.push(temp[i]);
    s.rain.push(rain[i]);
  }
  const full = [...seasons.values()].filter((s) => s.temp.length === 365).map((s) => cumulative(s.temp, s.rain));
  const mean = (key) => Array.from({ length: 365 }, (_, day) => full.reduce((sum, s) => sum + s[key][day], 0) / full.length);
  return { rain: mean('rain'), gdd: mean('gdd'), temp: mean('temp'), years: full.length };
}

/**
 * The weather of the season from `start` (Date, UTC, the 1st of January or July) for 365 days, and its normal.
 * Returns { season: {rain, gdd, temp}, normal: {rain, gdd, temp, years}, days } where `days` is how many days
 * of the season have data yet.
 */
export async function seasonWeather(lon, lat, start, signal) {
  const end = new Date(Math.min(start.getTime() + 364 * DAY, Date.now()));
  const startMonth = start.getUTCMonth() + 1;
  const [now, past] = await Promise.all([
    end < start ? null : daily(lon, lat, isoDay(start), isoDay(end), signal),
    daily(
      lon,
      lat,
      `${NORMAL_YEARS[0] - (startMonth > 1 ? 1 : 0)}-${String(startMonth).padStart(2, '0')}-01`,
      startMonth > 1 ? `${NORMAL_YEARS[1]}-${String(startMonth - 1).padStart(2, '0')}-30` : `${NORMAL_YEARS[1]}-12-31`,
      signal,
    ),
  ]);
  const season = now ? cumulative(now.temp, now.rain) : { rain: [], gdd: [], temp: [] };
  // Skip 29 February in the season too, so its days line up with the normal's.
  if (now) {
    const leap = now.time.findIndex((t) => t.endsWith('-02-29'));
    if (leap >= 0 && leap < season.rain.length) {
      const drop = (a) => a.splice(leap, 1);
      drop(season.temp);
      // The sums keep the day's rain and warmth: merge it into the next day by dropping the earlier sum.
      drop(season.rain);
      drop(season.gdd);
    }
  }
  return { season, normal: normalSeason(past.time, past.temp, past.rain, startMonth), days: season.rain.length };
}
