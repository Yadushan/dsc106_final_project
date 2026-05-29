// =========================================================
//  Reveal — single county-level map with state-mean overlays
//
//  Originally this section showed two side-by-side maps (a flat
//  state-average view AND a per-county view) so readers could
//  compare the "fiction" to the "reality". TA feedback found the
//  two maps visually redundant — we now collapse to one map and
//  embed the state mean as a prominent in-map label, plus a hover
//  tooltip that spells out each county's gap from that mean.
// =========================================================
import {
  STATES, STATE_FP, FP_TO_STATE, STATE_COLORS_DARK,
  VARIABLES, MONTH_NAMES,
  TempUnit,
  colorScaleFor, globalExtent, adaptiveStroke,
  showTip, moveTip, hideTip
} from '../utils.js';

export function initReveal(ctx) {
  const countyEl = document.getElementById('county-choropleth-preview');
  const varSel   = document.getElementById('reveal-var');
  const monthEl  = document.getElementById('reveal-month');
  const monthLbl = document.getElementById('reveal-month-label');
  if (!countyEl) return;

  let varKey = varSel.value;
  let month  = +monthEl.value;

  // Combined three-state feature collection (for projection fit)
  const threeStatesFC = {
    type: 'FeatureCollection',
    features: STATES.map(s => ctx.geo.stateOutlines[s])
  };

  // ---------- Build the single SVG panel ----------
  function buildPanel(targetEl) {
    targetEl.innerHTML = '';
    const w = targetEl.clientWidth;
    const h = targetEl.clientHeight;
    const svg = d3.select(targetEl)
      .append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('width',  '100%')
      .attr('height', '100%');

    const projection = d3.geoAlbersUsa()
      .fitSize([w, h - 40], threeStatesFC);   // 40px reserved for legend
    const path = d3.geoPath(projection);

    const gCounties = svg.append('g').attr('class', 'g-counties');
    const gOutline  = svg.append('g').attr('class', 'g-outline');
    // Labels sit on top of counties but must NOT block mouse events —
    // pointer-events:none lets hover pass through the big state-mean
    // text to the county polygon underneath.
    const gLabels   = svg.append('g')
      .attr('class', 'g-labels')
      .style('pointer-events', 'none');
    const gLegend   = svg.append('g').attr('class', 'g-legend')
      .attr('transform', `translate(0, ${h - 26})`);

    // Static state outlines (drawn above counties so the border is crisp)
    gOutline.selectAll('path')
      .data(threeStatesFC.features)
      .join('path')
      .attr('d', path)
      .attr('class', 'state-outline');

    // County paths
    gCounties.selectAll('path')
      .data(ctx.geo.counties.features)
      .join('path')
      .attr('class', 'county')
      .attr('d', path);

    return { svg, gCounties, gOutline, gLabels, gLegend, w, h, path };
  }

  let render;

  function build() {
    render = buildPanel(countyEl);
    update();
  }

  // Returns formatted gap string respecting absolute vs delta semantics
  // for temperature variables (LST gap is a difference — no +32 offset).
  function formatGap(gap) {
    if (!Number.isFinite(gap)) return '—';
    if (varKey === 'LST_Day' || varKey === 'LST_Night') {
      return (gap > 0 ? '+' : '') + TempUnit.formatDelta(gap);
    }
    const sign = gap > 0 ? '+' : '';
    return sign + VARIABLES[varKey].fmt(gap);
  }

  function update() {
    const v = VARIABLES[varKey];
    const [lo, hi] = globalExtent(ctx.countyData, varKey);
    const color = colorScaleFor(varKey, [lo, hi]);
    monthLbl.textContent = MONTH_NAMES[month - 1];

    // ----- State means (the "headline" numbers) -----
    const stateValues = new Map();
    STATES.forEach(s => {
      const rec = ctx.stateData.find(d => d.state === s && d.month === month);
      stateValues.set(s, rec ? rec[varKey] : null);
    });

    // ----- Per-county values (the "reality" texture) -----
    const countyValues = new Map();
    ctx.countyData.forEach(d => {
      if (d.month === month) countyValues.set(d.GEOID, d[varKey]);
    });

    // ----- Colour each county + bind hover -----
    render.gCounties.selectAll('path.county')
      .attr('fill', f => {
        const val = countyValues.get(String(f.id));
        return Number.isFinite(val) ? color(val) : '#DDD6C7';
      })
      .attr('stroke', f => {
        const val = countyValues.get(String(f.id));
        return adaptiveStroke(Number.isFinite(val) ? color(val) : '#DDD6C7');
      })
      .style('pointer-events', 'auto')
      .on('mousemove', function (event, f) {
        const fp = String(f.id).padStart(5, '0').slice(0, 2);
        const stateName = FP_TO_STATE[fp];
        const val = countyValues.get(String(f.id));
        const mean = stateValues.get(stateName);
        const gap = (Number.isFinite(val) && Number.isFinite(mean)) ? val - mean : null;
        const name = f.properties && f.properties.name ? f.properties.name : 'County';
        const valFmt = Number.isFinite(val) ? v.fmt(val) : '—';
        const meanFmt = Number.isFinite(mean) ? v.fmt(mean) : '—';
        const gapFmt = formatGap(gap);
        // emphasise the gap row when the county lies far from the state mean
        const gapClass = (Number.isFinite(gap) && Math.abs(gap) > significanceThreshold(varKey))
          ? 'tt-row tt-gap-strong'
          : 'tt-row';

        showTip(`
          <div class="tt-title">${name}, ${stateName || ''} · ${MONTH_NAMES[month - 1]}</div>
          <div class="tt-row"><span class="lbl">This county</span><span>${valFmt}</span></div>
          <div class="tt-row"><span class="lbl">${stateName} mean</span><span>${meanFmt}</span></div>
          <div class="${gapClass}"><span class="lbl">Gap from mean</span><span>${gapFmt}</span></div>
        `, event);
      })
      .on('mouseleave', hideTip);

    // ----- State-mean labels OUTSIDE each state -----
    //
    // The "headline" number is the same idea as before — what an average-
    // only dashboard would report — but now lifted out of the choropleth
    // and parked in the left margin, with a faint dashed leader pointing
    // back to each state's centroid. This frees the entire county texture
    // for unobstructed hover and reading.
    render.gLabels.selectAll('*').remove();
    STATES.forEach(s => {
      const f = ctx.geo.stateOutlines[s];
      const [cx, cy] = render.path.centroid(f);
      const bbox = render.path.bounds(f);    // [[x0,y0],[x1,y1]]
      const mean = stateValues.get(s);
      const stateColor = STATE_COLORS_DARK[s];

      // Anchor label 28px to the LEFT of the state's left edge so the
      // map area itself stays clean. Vertical position tracks the state
      // centroid for a clear visual pairing.
      const labelX = bbox[0][0] - 28;
      const labelY = cy;

      // Arrowhead lands just outside the label (the "info"), with the
      // tail anchored near the state centroid. Reading order: eye
      // catches the state shape → follows the line → arrow plants
      // attention on the numeric label. "Here is that state's reported
      // mean" rather than "this label belongs to that state".
      const tipX = labelX + 6;            // 6 px gap from label's right edge
      const tipY = labelY;
      const dx = tipX - cx;
      const dy = tipY - cy;
      const dist = Math.hypot(dx, dy);
      const ux = dx / dist, uy = dy / dist;

      // Line origin: pulled back from centroid TOWARD the label so the
      // line doesn't terminate deep in the state interior.
      const pullback = Math.min(34, dist * 0.4);
      const lineOriginX = cx + ux * pullback;
      const lineOriginY = cy + uy * pullback;
      // Line stops just past the arrow's back (so they don't overlap).
      const lineEndX = tipX - ux * 6;
      const lineEndY = tipY - uy * 6;

      // Arrow rotates so its apex points FROM state TOWARD label.
      const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

      render.gLabels.append('line')
        .attr('x1', lineOriginX)
        .attr('y1', lineOriginY)
        .attr('x2', lineEndX)
        .attr('y2', lineEndY)
        .attr('stroke', stateColor)
        .attr('stroke-opacity', 0.45)
        .attr('stroke-width', 0.9)
        .attr('stroke-dasharray', '2 3');

      render.gLabels.append('path')
        .attr('d', 'M -5,-3 L 0,0 L -5,3 Z')
        .attr('transform', `translate(${tipX}, ${tipY}) rotate(${angleDeg})`)
        .attr('fill', stateColor)
        .attr('fill-opacity', 0.7);

      const group = render.gLabels.append('g')
        .attr('transform', `translate(${labelX}, ${labelY})`);

      // State name (Fraunces, right-aligned so it grows toward the line)
      group.append('text')
        .attr('class', 'state-name')
        .attr('text-anchor', 'end')
        .attr('font-family', 'Fraunces, Georgia, serif')
        .attr('font-size', 16)
        .attr('font-weight', 600)
        .attr('letter-spacing', '-0.005em')
        .attr('fill', stateColor)
        .attr('y', -8)
        .text(s);

      // Mean value (large mono)
      group.append('text')
        .attr('class', 'state-mean')
        .attr('text-anchor', 'end')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 22)
        .attr('font-weight', 500)
        .attr('letter-spacing', '0.01em')
        .attr('fill', stateColor)
        .attr('y', 16)
        .text(mean == null ? '—' : v.fmt(mean));

      // Caption
      group.append('text')
        .attr('class', 'state-mean-cap')
        .attr('text-anchor', 'end')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 8.5)
        .attr('letter-spacing', '0.14em')
        .attr('fill', stateColor)
        .attr('opacity', 0.7)
        .attr('y', 30)
        .text('STATE MEAN');
    });

    drawLegend(render, v, [lo, hi]);
  }

  function drawLegend(panel, v, domain) {
    panel.gLegend.selectAll('*').remove();
    const w = Math.min(360, panel.w * 0.55);
    const h = 9;
    const x0 = (panel.w - w) / 2;

    const gradId = 'grad-' + Math.random().toString(36).slice(2, 7);
    const grad = panel.gLegend.append('defs').append('linearGradient')
      .attr('id', gradId).attr('x1', '0%').attr('x2', '100%');
    const n = 12;
    const sc = colorScaleFor(varKey, domain);
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

  // Significance threshold per variable for the "gap" hover row emphasis.
  function significanceThreshold(varKey) {
    switch (varKey) {
      case 'NDVI':         return 0.15;
      case 'LST_Day':
      case 'LST_Night':    return 5;     // Celsius
      case 'Precipitation':return 20;
      default:             return 0;
    }
  }

  // ---------- Wiring ----------
  // Hide whichever variable is currently selected from the dropdown
  // list — the active variable already appears as the select's
  // displayed value, so re-listing it just adds noise. The dropdown
  // always offers the OTHER three options to switch to.
  function syncVarOptions() {
    Array.from(varSel.options).forEach(opt => {
      opt.hidden = (opt.value === varSel.value);
    });
  }
  syncVarOptions();

  varSel.addEventListener('change', () => {
    varKey = varSel.value;
    syncVarOptions();
    update();
  });
  monthEl.addEventListener('input', () => { month = +monthEl.value; update(); });
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
