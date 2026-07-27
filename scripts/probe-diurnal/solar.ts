// S5a Unit 0 probe — solar geometry. NOAA sunrise/sunset equations.
//
// The Felber model is anchored on sunrise/sunset hours, not on clock noon, so these have to be
// right or the whole daytime sine is phase-shifted. Returns LOCAL decimal hours (site tz offset
// applied by the caller via `utcOffsetHours`), because Eq 1a-1c are written in local hours.

const RAD = Math.PI / 180;

/** Day of year, 1-based, for an ISO YYYY-MM-DD. */
export function dayOfYear(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  return Math.round((cur - start) / 86400000) + 1;
}

/**
 * Solar declination + equation of time (NOAA low-precision, ample for sunrise/sunset).
 * Returns { declDeg, eqTimeMin }.
 */
function solarPosition(iso: string): { declDeg: number; eqTimeMin: number } {
  const n = dayOfYear(iso);
  // Fractional year, radians.
  const g = ((2 * Math.PI) / 365) * (n - 1 + 0.5);
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const declRad =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return { declDeg: declRad / RAD, eqTimeMin };
}

export interface SunTimes {
  /** Local decimal hour of sunrise. */
  sunrise: number;
  /** Local decimal hour of sunset. */
  sunset: number;
  /** Hours between sunrise and sunset. */
  daylength: number;
  /** True when the sun never rises or never sets (polar) — the model is undefined there. */
  degenerate: boolean;
}

/**
 * Sunrise/sunset in LOCAL decimal hours for a site.
 * `utcOffsetHours` is the site's UTC offset on that date (e.g. -7 for PDT, +6 for Bhutan).
 */
export function sunTimes(iso: string, latDeg: number, lonDeg: number, utcOffsetHours: number): SunTimes {
  const { declDeg, eqTimeMin } = solarPosition(iso);
  const zenith = 90.833; // refraction + solar disc radius
  const cosH =
    (Math.cos(zenith * RAD) - Math.sin(latDeg * RAD) * Math.sin(declDeg * RAD)) /
    (Math.cos(latDeg * RAD) * Math.cos(declDeg * RAD));

  if (cosH > 1 || cosH < -1) {
    // Polar day/night — no sunrise/sunset. None of the probe sites hit this; guard anyway.
    return { sunrise: 6, sunset: 18, daylength: 12, degenerate: true };
  }

  const haDeg = Math.acos(cosH) / RAD; // hour angle at sunrise, degrees
  // NOAA: minutes UTC. 720 = solar noon in minutes; 4 min per degree of longitude.
  const sunriseUtcMin = 720 + 4 * (-haDeg - lonDeg) - eqTimeMin;
  const sunsetUtcMin = 720 + 4 * (haDeg - lonDeg) - eqTimeMin;

  const sunrise = sunriseUtcMin / 60 + utcOffsetHours;
  const sunset = sunsetUtcMin / 60 + utcOffsetHours;
  return { sunrise, sunset, daylength: sunset - sunrise, degenerate: false };
}
