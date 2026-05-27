// =========================================================
//  Shared constants and helpers
// =========================================================

export const STATES = ['Iowa', 'Kansas', 'Texas'];

// State FIPS codes used in the county CSV (STATEFP column)
export const STATE_FP = {
  Iowa:    '19',
  Kansas:  '20',
  Texas:   '48',
};

export const FP_TO_STATE = Object.fromEntries(
  Object.entries(STATE_FP).map(([s, fp]) => [fp, s])
);

export const STATE_COLORS = {
  Iowa:   '#E0A82E',
  Kansas: '#6FA34B',
  Texas:  '#C85A4D',
};

export const STATE_COLORS_DARK = {
  Iowa:   '#B8861C',
  Kansas: '#4F7E32',
  Texas:  '#9A3A2F',
};

export const STATE_CROP = {
  Iowa:   'Corn',
  Kansas: 'Wheat',
  Texas:  'Cotton',
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// =========================================================
//  Temperature-unit toggle — site-wide °C / °F switch
// =========================================================
// The colour scales always operate on the underlying Celsius values
// (so a given colour stays anchored to a given physical temperature).
// Only the displayed labels — axis ticks, tooltips, captions, inline
// numbers — convert at render time.
export const TempUnit = {
  current: 'C',          // 'C' or 'F'

  set(unit) {
    if (unit !== 'C' && unit !== 'F') return;
    if (this.current === unit) return;
    this.current = unit;

    // Update every inline temperature span in the HTML (Scene captions,
    // Takeaway cards, etc.). Three flavours:
    //   <span class="temp"       data-c="27">27 °C</span>   → absolute value
    //   <span class="temp-delta" data-c="17">17 °C</span>   → temperature difference
    //   <span class="unit-text">°C</span>                   → bare unit label
    document.querySelectorAll('.temp[data-c]').forEach(el => {
      const decimals = el.dataset.decimals !== undefined ? +el.dataset.decimals : undefined;
      el.textContent = TempUnit.formatAbs(+el.dataset.c, decimals);
    });
    document.querySelectorAll('.temp-delta[data-c]').forEach(el => {
      el.textContent = TempUnit.formatDelta(+el.dataset.c);
    });
    document.querySelectorAll('.unit-text').forEach(el => {
      el.textContent = TempUnit.unitLabel();
    });

    document.dispatchEvent(new CustomEvent('tempunitchange', { detail: { unit } }));
  },

  // Convert absolute Celsius → Fahrenheit (with +32 offset)
  cToF(c) { return c * 9 / 5 + 32; },

  // Format an ABSOLUTE temperature (use this for axis ticks, tooltips, etc.)
  formatAbs(c, decimals) {
    if (!Number.isFinite(c)) return '—';
    if (decimals === undefined) decimals = Math.abs(c) >= 10 ? 0 : 1;
    if (this.current === 'F') {
      return TempUnit.cToF(c).toFixed(decimals) + '°F';
    }
    return c.toFixed(decimals) + '°C';
  },

  // Format a TEMPERATURE DIFFERENCE (no +32 offset — 1°C diff = 1.8°F diff)
  formatDelta(c) {
    if (!Number.isFinite(c)) return '—';
    if (this.current === 'F') {
      return (c * 9 / 5).toFixed(0) + '°F';
    }
    return c.toFixed(0) + '°C';
  },

  // Convenience: label for an LST axis ("°C" or "°F")
  unitLabel() {
    return this.current === 'F' ? '°F' : '°C';
  },
};

// Variable metadata — used everywhere.
// fmt is a function, not a string, so re-rendering picks up the current unit.
export const VARIABLES = {
  NDVI: {
    label: 'Vegetation Index (NDVI)',
    short: 'NDVI',
    unit:  '',
    fmt:   d => d3.format('.2f')(d),
    interp: d3.interpolateYlGn,     // green ramp
    legendStops: [0, 0.2, 0.4, 0.6, 0.8],
  },
  LST_Day: {
    get label() { return `Land Surface Temp — Day (${TempUnit.unitLabel()})`; },
    short: 'LST Day',
    get unit() { return TempUnit.unitLabel(); },
    fmt:   d => TempUnit.formatAbs(d, 1),
    interp: d3.interpolateYlOrRd,
    legendStops: [-5, 5, 15, 25, 35, 45],
  },
  LST_Night: {
    get label() { return `Land Surface Temp — Night (${TempUnit.unitLabel()})`; },
    short: 'LST Night',
    get unit() { return TempUnit.unitLabel(); },
    fmt:   d => TempUnit.formatAbs(d, 1),
    interp: d3.interpolatePuBu,
    legendStops: [-15, -10, -5, 0, 5, 10, 15, 20, 25],
  },
  Precipitation: {
    label: 'Precipitation (mm)',
    short: 'Precip',
    unit:  'mm',
    fmt:   d => d3.format('.0f')(d) + ' mm',
    interp: d3.interpolateBlues,
    legendStops: [0, 25, 50, 75, 100, 125],
  },
};

// ---------- DOM helpers ----------
export const $ = sel => document.querySelector(sel);
export const $$ = sel => Array.from(document.querySelectorAll(sel));

// ---------- Tooltip ----------
const tipEl = document.getElementById('tooltip');

export function showTip(html, event) {
  tipEl.innerHTML = html;
  tipEl.classList.add('visible');
  moveTip(event);
}
export function moveTip(event) {
  const pad = 14;
  const { innerWidth: w, innerHeight: h } = window;
  const rect = tipEl.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + rect.width  > w - 8) x = event.clientX - rect.width - pad;
  if (y + rect.height > h - 8) y = event.clientY - rect.height - pad;
  tipEl.style.left = x + 'px';
  tipEl.style.top  = y + 'px';
}
export function hideTip() {
  tipEl.classList.remove('visible');
}

// ---------- Color scale builder ----------
export function colorScaleFor(varKey, domain) {
  const v = VARIABLES[varKey];
  return d3.scaleSequential(v.interp).domain(domain).clamp(true);
}

// Compute robust [min, max] across the full county dataset
// for a given variable so the scale stays stable as months change
export function globalExtent(countyData, varKey) {
  const values = countyData.map(d => d[varKey]).filter(v => Number.isFinite(v));
  return d3.extent(values);
}

// Pick a county-boundary stroke that contrasts against the fill underneath.
// Light fills get a dark stroke; dark fills get a light stroke — so the
// county outline is always visible regardless of where the data lands on
// the colour ramp. Uses CIE-Lab L (perceptual lightness, 0–100).
export function adaptiveStroke(fillColor) {
  if (!fillColor) return 'rgba(0,0,0,0.35)';
  const lab = d3.lab(d3.color(fillColor));
  return lab.l > 62 ? 'rgba(28,28,28,0.55)' : 'rgba(255,255,255,0.78)';
}

// Pick a text fill + halo stroke that stays legible on any fill background.
// Returns {fill, stroke} suitable for SVG <text> with paint-order: stroke.
// Lab L > 60 → dark fill on light background. L ≤ 60 → light fill on dark.
export function textOnBg(fillColor) {
  if (!fillColor) return { fill: '#1A1A1A', stroke: 'rgba(255,255,255,0.85)' };
  const lab = d3.lab(d3.color(fillColor));
  if (lab.l > 60) {
    return { fill: '#1A1A1A', stroke: 'rgba(255,255,255,0.85)' };
  }
  return   { fill: '#FFFFFF', stroke: 'rgba(0,0,0,0.45)' };
}

// ---------- Number coercion when loading CSV ----------
export function coerceCounty(d) {
  return {
    GEOID:         d.GEOID,
    STATEFP:       d.STATEFP,
    county:        d.county,
    month:         +d.month,
    state:         d.state,
    NDVI:          +d.NDVI,
    LST_Day:       +d.LST_Day,
    LST_Night:     +d.LST_Night,
    Precipitation: +d.Precipitation,
    state_crop:    d.state_crop,
  };
}

export function coerceState(d) {
  return {
    state:         d.state,
    month:         +d.month,
    NDVI:          +d.NDVI,
    LST_Day:       +d.LST_Day,
    LST_Night:     +d.LST_Night,
    Precipitation: +d.Precipitation,
    state_crop:    d.state_crop,
  };
}

// ---------- Throttle / debounce ----------
export function throttle(fn, wait = 16) {
  let last = 0, queued = null;
  return function (...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    } else {
      clearTimeout(queued);
      queued = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, wait);
    }
  };
}
