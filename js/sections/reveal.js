// =========================================================
//  Reveal — state vs county side-by-side (the "lie")
// =========================================================
import {
  STATES, STATE_FP, FP_TO_STATE, VARIABLES, MONTH_NAMES,
  colorScaleFor, globalExtent, adaptiveStroke, textOnBg,
  showTip, moveTip, hideTip
} from '../utils.js';

export function initReveal(ctx) {
  const stateEl  = document.getElementById('state-choropleth');
  const countyEl = document.getElementById('county-choropleth-preview');
  const varSel   = document.getElementById('reveal-var');
  const monthEl  = document.getElementById('reveal-month');
  const monthLbl = document.getElementById('reveal-month-label');
  if (!stateEl || !countyEl) return;

  let varKey = varSel.value;     // 'NDVI'
  let month  = +monthEl.value;   // 7

  // Combined three-state feature collection (for projection fit)
  const threeStatesFC = {
    type: 'FeatureCollection',
    features: STATES.map(s => ctx.geo.stateOutlines[s])
  };

  function buildPanel(targetEl, dataLookup) {
    targetEl.innerHTML = '';
    const w = targetEl.clientWidth;
    const h = targetEl.clientHeight;
    const svg = d3.select(targetEl)
      .append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('width',  '100%')
      .attr('height', '100%');

    const projection = d3.geoAlbersUsa()
      .fitSize([w, h - 36], threeStatesFC);   // 36px reserved for legend at bottom
    const path = d3.geoPath(projection);

    // counties layer (always present, hidden in state-mode by colouring at state level)
    const gCounties = svg.append('g').attr('class', 'g-counties');
    const gOutline  = svg.append('g').attr('class', 'g-outline');
    const gLabels   = svg.append('g').attr('class', 'g-labels');
    const gLegend   = svg.append('g').attr('class', 'g-legend').attr('transform', `translate(0, ${h - 24})`);

    // Static state outlines
    gOutline.selectAll('path')
      .data(threeStatesFC.features)
      .join('path')
      .attr('d', path)
      .attr('class', 'state-outline');

    // Pre-build county paths if the panel needs them
    gCounties.selectAll('path')
      .data(ctx.geo.counties.features)
      .join('path')
      .attr('class', 'county')
      .attr('d', path);

    return { svg, gCounties, gOutline, gLabels, gLegend, w, h, path };
  }

  let stateRender, countyRender;

  function build() {
    stateRender  = buildPanel(stateEl,  'state');
    countyRender = buildPanel(countyEl, 'county');
    update();
  }

  function update() {
    const v = VARIABLES[varKey];
    const [lo, hi] = globalExtent(ctx.countyData, varKey);
    const color = colorScaleFor(varKey, [lo, hi]);
    monthLbl.textContent = MONTH_NAMES[month - 1];

    // --- State panel: average each state, paint all counties same color ---
    const stateValues = new Map();
    STATES.forEach(s => {
      const rec = ctx.stateData.find(d => d.state === s && d.month === month);
      stateValues.set(s, rec ? rec[varKey] : null);
    });
    stateRender.gCounties.selectAll('path.county')
      .attr('fill', f => {
        const fp = String(f.id).padStart(5, '0').slice(0, 2);
        const stateName = FP_TO_STATE[fp];
        const val = stateValues.get(stateName);
        return val == null ? '#DDD6C7' : color(val);
      })
      .attr('stroke', 'rgba(255,255,255,0.0)')   // hide county strokes in state-mode
      .style('pointer-events', 'none');

    // labels with state-level value — text colour adapts to fill darkness
    // so the label stays readable on every NDVI / temp / precip ramp.
    stateRender.gLabels.selectAll('*').remove();
    STATES.forEach(s => {
      const f = ctx.geo.stateOutlines[s];
      const [cx, cy] = stateRender.path.centroid(f);
      const val = stateValues.get(s);
      const bgFill = val == null ? '#DDD6C7' : color(val);
      const t = textOnBg(bgFill);

      const txt = stateRender.gLabels.append('text')
        .attr('text-anchor', 'middle')
        .attr('x', cx).attr('y', cy)
        .attr('font-family', 'Fraunces, Georgia, serif')
        .attr('font-size', 13).attr('font-weight', 600)
        .attr('fill', t.fill)
        .attr('stroke', t.stroke)
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke');
      txt.append('tspan').attr('x', cx).attr('dy', '-2').text(s);
      txt.append('tspan')
        .attr('x', cx).attr('dy', '1.1em')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 11).attr('font-weight', 400)
        .text(val == null ? '—' : v.fmt(val));
    });

    // --- County panel ---
    // Build (GEOID → value@month) lookup
    const countyValues = new Map();
    ctx.countyData.forEach(d => {
      if (d.month === month) countyValues.set(d.GEOID, d[varKey]);
    });

    countyRender.gCounties.selectAll('path.county')
      .attr('fill', f => {
        const v = countyValues.get(String(f.id));
        return Number.isFinite(v) ? color(v) : '#DDD6C7';
      })
      .attr('stroke', f => {
        const v = countyValues.get(String(f.id));
        return adaptiveStroke(Number.isFinite(v) ? color(v) : '#DDD6C7');
      })
      .style('pointer-events', 'auto')
      .on('mousemove', function (event, f) {
        const fp = String(f.id).padStart(5, '0').slice(0, 2);
        const stateName = FP_TO_STATE[fp];
        const val = countyValues.get(String(f.id));
        const name = f.properties && f.properties.name ? f.properties.name : 'County';
        showTip(`
          <div class="tt-title">${name}, ${stateName || ''}</div>
          <div class="tt-row"><span class="lbl">${v ? v.label : ''}</span><span>${Number.isFinite(val) ? VARIABLES[varKey].fmt(val) : '—'}</span></div>
          <div class="tt-row"><span class="lbl">Month</span><span>${MONTH_NAMES[month - 1]}</span></div>
        `, event);
      })
      .on('mouseleave', hideTip);

    // state labels overlay on county panel (just state name)
    countyRender.gLabels.selectAll('*').remove();
    STATES.forEach(s => {
      const f = ctx.geo.stateOutlines[s];
      const [cx, cy] = countyRender.path.centroid(f);
      countyRender.gLabels.append('text')
        .attr('text-anchor', 'middle')
        .attr('x', cx).attr('y', cy)
        .attr('font-family', 'Fraunces, Georgia, serif')
        .attr('font-size', 14).attr('font-weight', 600)
        .attr('fill', '#1A1A1A')
        .attr('stroke', 'rgba(255,255,255,0.85)')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(s);
    });

    // shared legend at bottom of each panel
    drawLegend(stateRender,  v, [lo, hi]);
    drawLegend(countyRender, v, [lo, hi]);
  }

  function drawLegend(panel, v, domain) {
    panel.gLegend.selectAll('*').remove();
    const w = Math.min(280, panel.w * 0.6);
    const h = 8;
    const x0 = (panel.w - w) / 2;

    // Gradient
    const gradId = 'grad-' + Math.random().toString(36).slice(2, 7);
    const grad = panel.gLegend.append('defs').append('linearGradient')
      .attr('id', gradId).attr('x1', '0%').attr('x2', '100%');
    const n = 12;
    const sc = colorScaleFor(varKey === 'NDVI' ? 'NDVI' : varKey, domain);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      grad.append('stop')
        .attr('offset', (t * 100) + '%')
        .attr('stop-color', sc(domain[0] + t * (domain[1] - domain[0])));
    }
    panel.gLegend.append('rect')
      .attr('x', x0).attr('y', 0)
      .attr('width', w).attr('height', h)
      .attr('rx', 4)
      .attr('fill', `url(#${gradId})`);

    // tick labels
    panel.gLegend.append('text')
      .attr('x', x0).attr('y', h + 14)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 10).attr('fill', '#8A8A8A')
      .text(v.fmt(domain[0]));
    panel.gLegend.append('text')
      .attr('x', x0 + w).attr('y', h + 14)
      .attr('text-anchor', 'end')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 10).attr('fill', '#8A8A8A')
      .text(v.fmt(domain[1]));
  }

  // event wiring
  varSel.addEventListener('change', () => { varKey = varSel.value; update(); });
  monthEl.addEventListener('input', () => { month = +monthEl.value; update(); });

  // Re-render legend ticks + tooltips when the °C/°F toggle fires
  document.addEventListener('tempunitchange', () => update());

  document.addEventListener('mousemove', e => {
    if (document.getElementById('tooltip').classList.contains('visible')) moveTip(e);
  });

  build();

  let resizeId;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(build, 150);
  });
}
