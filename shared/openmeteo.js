/** Daily weather from the Open-Meteo historical weather API (ERA5 reanalysis, CC BY 4.0, CORS open). */
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Daily mean temperature (°C) and precipitation (mm) at a point from `from` to `to` (ISO dates, UTC):
 * { time: [ISO date], temp: [°C], rain: [mm] }; the last days of the archive can be null.
 */
export async function daily(lon, lat, from, to, signal) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    start_date: from,
    end_date: to,
    daily: 'temperature_2m_mean,precipitation_sum',
    timezone: 'UTC',
  });
  const response = await fetch(`${ARCHIVE}?${params}`, { signal });
  if (!response.ok) throw new Error(`Open-Meteo: ${response.status}`);
  const { daily: d } = await response.json();
  return { time: d.time, temp: d.temperature_2m_mean, rain: d.precipitation_sum };
}
