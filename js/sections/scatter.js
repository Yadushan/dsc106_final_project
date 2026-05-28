// =========================================================
//  Scatter — county cloud + state-level dots with month labels
//  Two charts: LST_Day vs NDVI, Precipitation vs NDVI
//  State filter buttons + crop growth annotations
// =========================================================
import {
  STATES, STATE_COLORS, STATE_COLORS_DARK, STATE_CROP, MONTH_SHORT, MONTH_NAMES,
  TempUnit,
  showTip, moveTip, hideTip
} from '../utils.js';

// Indices at which the seasonal trajectory shows a direction arrow.
// 4 arrows per state — one anchored in the middle of each of the four
// seasons, so the chronological loop reads at a glance:
//   Jan→Feb (winter)  ·  Apr→May (spring rise)
//   Jul→Aug (summer post-peak)  ·  Oct→Nov (fall return)
const ARROW_SEGMENT_INDICES = [0, 3, 6, 9];

const CHARTS = [
  {
    id: 'scatter-lst',
    xKey: 'LST_Day',
    get xLabel() { return `Land Surface Temp — Day (${TempUnit.unitLabel()})`; },
    xFmt: d => TempUnit.formatAbs(d, 0),
  },
  {
    id: 'scatter-lst-night',
    xKey: 'LST_Night',
    get xLabel() { return `Land Surface Temp — Night (${TempUnit.unitLabel()})`; },
    xFmt: d => TempUnit.formatAbs(d, 0),
  },
  {
    id: 'scatter-precip',
    xKey: 'Precipitation',
    xLabel: 'Precipitation (mm)',
    xFmt: d => d3.format('.0f')(d),
    xMin: 0,
    xMax: 140,
    xTicks: [20, 40, 60, 80, 100, 120, 140],
  },
];

export function initScatter(ctx) {
  let filter = 'all';

  const renderers = CHARTS.map(cfg => makeScatter(cfg, ctx));

  // wire up filter buttons
  document.querySelectorAll('#scatter-filter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#scatter-filter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filter = btn.dataset.state;
      // Rebuild so axes re-zoom to the new filter's data range — when
      // a single state is selected, the x-axis tightens to just that
      // state's range, giving each dot far more pixel space.
      renderers.forEach(r => r.rebuild(filter));
    });
  });

  let resizeId;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(() => renderers.forEach(r => r.rebuild()), 150);
  });

  // Rebuild on temperature-unit toggle so the LST chart's axis and
  // tooltips switch to the new unit. The precip chart is also rebuilt
  // (harmless — its axis doesn't change), keeping both in sync.
  document.addEventListener('tempunitchange', () => {
    renderers.forEach(r => r.rebuild());
  });
}

function makeScatter(cfg, ctx) {
  const el = document.getElementById(cfg.id);
  let svg, gCloud, gTraj, gArrows, gLink, gTruth, gDots, gAnnot, gAxes, x, y, m;
  let currentFilter = 'all';

  function rebuild(filter = currentFilter) {
    currentFilter = filter;
    el.innerHTML = '';
    const w = el.clientWidth;
    const h = el.clientHeight;
    m = { t: 16, r: 24, b: 46, l: 52 };

    svg = d3.select(el).append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('width', '100%').attr('height', '100%');

    // Filter-aware domain: when a single state is selected we tighten
    // the x-axis to that state's data range so each dot gets way more
    // pixel space. "All States" keeps the full county-data range so
    // the comparative cloud remains comparable.
    const filteredData = filter === 'all'
      ? ctx.countyData
      : ctx.countyData.filter(d => d.state === filter);

    const xVals = filteredData.map(d => d[cfg.xKey]).filter(Number.isFinite);
    const yVals = filteredData.map(d => d.NDVI).filter(Number.isFinite);

    // Per-chart domain overrides — used to keep the precip axis on
    // fixed 0–140mm with tick marks every 20mm (a few county outliers
    // above 140mm would otherwise stretch the axis).
    let xExtent = d3.extent(xVals);
    if (cfg.xMin !== undefined) xExtent[0] = cfg.xMin;
    if (cfg.xMax !== undefined) xExtent[1] = cfg.xMax;

    x = d3.scaleLinear()
      .domain(xExtent)
      .range([m.l, w - m.r]);
    if (cfg.xTicks === undefined) x.nice();
    y = d3.scaleLinear()
      .domain([Math.max(0, d3.min(yVals)), Math.min(1, d3.max(yVals))]).nice()
      .range([h - m.b, m.t]);

    // grid
    const gridG = svg.append('g').attr('class', 'grid');
    gridG.selectAll('line.h').data(y.ticks(5)).join('line')
      .attr('x1', m.l).attr('x2', w - m.r)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#EEE7D8').attr('stroke-width', 1);

    // axes
    gAxes = svg.append('g');
    const xAxis = d3.axisBottom(x).tickFormat(cfg.xFmt).tickSizeOuter(0);
    if (cfg.xTicks) xAxis.tickValues(cfg.xTicks);
    else            xAxis.ticks(6);
    gAxes.append('g').attr('transform', `translate(0,${h - m.b})`)
      .call(xAxis)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 11).attr('color', '#8A8A8A');
    gAxes.append('g').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(1)).tickSizeOuter(0))
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 11).attr('color', '#8A8A8A');

    // axis titles
    gAxes.append('text').attr('x', w / 2).attr('y', h - 6)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter, sans-serif').attr('font-weight', 600)
      .attr('font-size', 12).attr('fill', '#1A1A1A')
      .text(cfg.xLabel);
    gAxes.append('text').attr('transform', `translate(14,${h / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter, sans-serif').attr('font-weight', 600)
      .attr('font-size', 12).attr('fill', '#1A1A1A')
      .text('Vegetation Index (NDVI)');

    // annotation reference lines
    gAnnot = svg.append('g').attr('class', 'annot');
    const refs = [
      { y: 0.3, label: 'Emergence (0.2–0.4)' },
      { y: 0.7, label: 'Peak Greenness (0.6–0.8)' },
    ];
    refs.forEach(r => {
      gAnnot.append('line')
        .attr('x1', m.l).attr('x2', w - m.r)
        .attr('y1', y(r.y)).attr('y2', y(r.y))
        .attr('stroke', '#1F4E79').attr('stroke-dasharray', '4 4')
        .attr('stroke-opacity', 0.4);
      gAnnot.append('text')
        .attr('x', w - m.r - 6).attr('y', y(r.y) - 4)
        .attr('text-anchor', 'end')
        .attr('font-family', 'Fraunces, Georgia, serif')
        .attr('font-style', 'italic')
        .attr('font-size', 11.5).attr('fill', '#1F4E79')
        .attr('opacity', 0.75)
        .text(r.label);
    });

    gCloud  = svg.append('g').attr('class', 'cloud');
    gTraj   = svg.append('g').attr('class', 'traj');
    gArrows = svg.append('g').attr('class', 'traj-arrows');  // direction markers
    gLink   = svg.append('g').attr('class', 'link');
    gTruth  = svg.append('g').attr('class', 'truth');   // small dots at exact (x,y)
    gDots   = svg.append('g').attr('class', 'dots');     // big labelled bubbles

    update(currentFilter);
  }

  const DOT_R = 8;             // slightly smaller now charts are bigger
  const COLLIDE_R = 9.5;       // collision radius (just slightly > DOT_R)

  function update(filter) {
    currentFilter = filter;

    // ---- Background cloud: county-level (5,000+ points, low opacity) ----
    const cloudData = filter === 'all'
      ? ctx.countyData
      : ctx.countyData.filter(d => d.state === filter);

    gCloud.selectAll('circle')
      .data(cloudData, d => d.GEOID + '|' + d.month)
      .join(
        enter => enter.append('circle')
          .attr('cx', d => x(d[cfg.xKey]))
          .attr('cy', d => y(d.NDVI))
          .attr('r', 1.6)
          .attr('fill', d => STATE_COLORS[d.state])
          .attr('fill-opacity', 0)
          .call(en => en.transition().duration(380).attr('fill-opacity', 0.14)),
        update => update.transition().duration(280)
          .attr('cx', d => x(d[cfg.xKey]))
          .attr('cy', d => y(d.NDVI))
          .attr('fill-opacity', 0.14),
        exit => exit.transition().duration(180).attr('fill-opacity', 0).remove()
      );

    // ---- Seasonal trajectory line per state (chronological path) ----
    const statesShown = filter === 'all'
      ? STATES
      : (STATES.includes(filter) ? [filter] : []);

    const trajData = statesShown.map(s => {
      const arr = ctx.stateData
        .filter(d => d.state === s)
        .sort((a, b) => a.month - b.month);
      return { state: s, points: arr };
    });

    // Linear segments — keeps the trajectory honest (each segment is the
    // straight monthly transition between two real data points) AND
    // guarantees the direction arrows we draw at segment midpoints sit
    // exactly on the line. Catmull-Rom smoothing made arrows float off
    // the curve in tightly bent regions like Iowa's July inflection.
    const lineGen = d3.line()
      .x(d => x(d[cfg.xKey]))
      .y(d => y(d.NDVI))
      .curve(d3.curveLinear);

    gTraj.selectAll('path.traj-line')
      .data(trajData, d => d.state)
      .join(
        enter => enter.append('path')
          .attr('class', 'traj-line')
          .attr('fill', 'none')
          .attr('stroke', d => STATE_COLORS[d.state])
          .attr('stroke-width', 1.2)              // thinner — softer skeleton
          .attr('stroke-opacity', 0)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('d', d => lineGen(d.points))
          .call(en => en.transition().duration(450).attr('stroke-opacity', 0.35)),
        update => update.transition().duration(380)
          .attr('stroke', d => STATE_COLORS[d.state])
          .attr('d', d => lineGen(d.points))
          .attr('stroke-opacity', 0.35),
        exit => exit.transition().duration(200).attr('stroke-opacity', 0).remove()
      );

    // ---- Direction arrows along trajectory ----
    // Small filled triangles pointing FROM the earlier month TO the next,
    // placed midway between selected month pairs. Makes the seasonal
    // clockwise / counter-clockwise direction unambiguous (per TA feedback).
    gArrows.selectAll('*').remove();
    trajData.forEach(t => {
      const pts = t.points;
      ARROW_SEGMENT_INDICES.forEach(i => {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const ax = x(a[cfg.xKey]), ay = y(a.NDVI);
        const bx = x(b[cfg.xKey]), by = y(b.NDVI);
        if (!Number.isFinite(ax) || !Number.isFinite(bx)) return;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;

        gArrows.append('path')
          .attr('class', 'traj-arrow')
          .attr('d', 'M -3.5,-2.5 L 3,0 L -3.5,2.5 Z')  // smaller triangle
          .attr('transform', `translate(${mx}, ${my}) rotate(${angle})`)
          .attr('fill', STATE_COLORS_DARK[t.state])
          .attr('fill-opacity', 0)
          .call(sel => sel.transition().duration(450).attr('fill-opacity', 0.85));
      });
    });

    // ---- Foreground: state-level dots placed at EXACT (x, y) ----
    // No dodging, no displacement, no leader lines. Each labelled bubble
    // sits exactly where its data says it should. If two bubbles overlap,
    // they overlap — that is itself a truthful signal about how close the
    // underlying values are. Colour + white stroke keep stacked bubbles
    // visually distinguishable; hover reveals exact values per point.
    const stateDots = filter === 'all'
      ? ctx.stateData
      : ctx.stateData.filter(d => d.state === filter);

    // Sort by Y descending so dots with HIGHER NDVI render LAST, i.e.
    // appear on top. This means when bubbles stack the higher-value one
    // is visible — a deterministic, defensible z-order rule.
    const sortedDots = [...stateDots].sort((a, b) => a.NDVI - b.NDVI);

    const sel = gDots.selectAll('g.state-dot')
      .data(sortedDots, d => d.state + '|' + d.month);

    const ent = sel.enter().append('g')
      .attr('class', 'state-dot')
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).raise();   // bring hovered to top
        d3.select(this).select('circle').transition().duration(120).attr('r', DOT_R + 3);
        showTip(`
          <div class="tt-title" style="color:${STATE_COLORS_DARK[d.state]}">${d.state} · ${STATE_CROP[d.state]}</div>
          <div class="tt-row"><span class="lbl">Month</span><span>${MONTH_NAMES[d.month - 1]}</span></div>
          <div class="tt-row"><span class="lbl">${cfg.xLabel.split('(')[0].trim()}</span><span>${cfg.xFmt(d[cfg.xKey])}</span></div>
          <div class="tt-row"><span class="lbl">NDVI</span><span>${d.NDVI.toFixed(2)}</span></div>
        `, event);
      })
      .on('mousemove', moveTip)
      .on('mouseleave', function () {
        d3.select(this).select('circle').transition().duration(120).attr('r', DOT_R);
        hideTip();
      });
    ent.append('circle')
      .attr('r', DOT_R)
      .attr('fill', d => STATE_COLORS[d.state])
      .attr('stroke', '#FFFFFF')       // white stroke separates stacked dots
      .attr('stroke-width', 1.6)
      .attr('fill-opacity', 0.96);
    ent.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'JetBrains Mono, monospace')
      // Two-digit months (10, 11, 12) need a slightly smaller size
      // to stay legibly inside the 8 px-radius dot.
      .attr('font-size', d => d.month >= 10 ? 8 : 9.5)
      .attr('font-weight', 700)
      .attr('fill', 'white')
      .attr('pointer-events', 'none')
      .text(d => d.month);

    ent.attr('transform', d => `translate(${x(d[cfg.xKey])}, ${y(d.NDVI)})`);

    sel.transition().duration(420)
      .attr('transform', d => `translate(${x(d[cfg.xKey])}, ${y(d.NDVI)})`);

    sel.exit().transition().duration(180).attr('opacity', 0).remove();
  }

  rebuild();

  return { rebuild, update };
}
