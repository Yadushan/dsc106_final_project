// =========================================================
//  Radial Crop Lifecycle Calendar
//  Each state's NDVI plotted as a polar curve, clockwise Jan→Dec
//  Hover uses Delaunay nearest-point picking so overlapping
//  dots (Iowa/Kansas/Texas often coincide) are all reachable.
// =========================================================
import {
  STATES, STATE_COLORS, STATE_COLORS_DARK, STATE_CROP, MONTH_SHORT, MONTH_NAMES,
  TempUnit,
  showTip, moveTip, hideTip
} from '../utils.js';

export function initRadial(ctx) {
  const container = document.getElementById('radial-calendar');
  if (!container) return;

  const render = () => {
    container.innerHTML = '';
    const w = container.clientWidth;
    const h = container.clientHeight;
    const cx = w / 2, cy = h / 2;
    const innerR = Math.min(w, h) * 0.16;
    const outerR = Math.min(w, h) * 0.42;

    const svg = d3.select(container).append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('width', '100%').attr('height', '100%');

    const g = svg.append('g').attr('transform', `translate(${cx}, ${cy})`);

    // ---- Polar helpers ----
    const ndviScale = d3.scaleLinear().domain([0, 1]).range([innerR, outerR]).clamp(true);
    const angle = m => (m - 1) / 12 * 2 * Math.PI;
    const polarPoint = (m, ndvi) => {
      const a = angle(m);
      const r = ndviScale(ndvi);
      return [r * Math.sin(a), -r * Math.cos(a)];
    };

    // ---- Background rings + month spokes ----
    // Dashed reference rings ONLY. Their meaning is explained in the legend
    // BELOW the chart (see index.html .legend-row), so no inline text here —
    // that's what was crashing into the month labels.
    const refs = [
      { ndvi: 0.3, key: 'emergence' },
      { ndvi: 0.5, key: 'mid' },
      { ndvi: 0.7, key: 'peak' },
    ];
    g.selectAll('circle.ring-ref')
      .data(refs).join('circle')
      .attr('class', 'ring-ref')
      .attr('r', d => ndviScale(d.ndvi))
      .attr('fill', 'none')
      .attr('stroke', '#3F4554')
      .attr('stroke-dasharray', '2 4')
      .attr('stroke-opacity', 0.55);

    // tiny inline tick labels INSIDE the dashed rings on the left side
    // (angle 9.5 ≈ between Sep and Oct — least busy quadrant), as a quiet
    // reminder of what each ring means.
    const refAnchorAngle = angle(9.5);
    refs.forEach(d => {
      const r = ndviScale(d.ndvi);
      g.append('text')
        .attr('x', r * Math.sin(refAnchorAngle) + 4)
        .attr('y', -r * Math.cos(refAnchorAngle))
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 9)
        .attr('fill', '#8C8775')
        .attr('opacity', 0.7)
        .text(d.ndvi.toFixed(1));
    });

    // outer / inner rings
    g.append('circle')
      .attr('r', outerR)
      .attr('fill', 'none')
      .attr('stroke', '#3F4554')
      .attr('stroke-opacity', 0.5);
    g.append('circle')
      .attr('r', innerR)
      .attr('fill', '#1B2028')
      .attr('stroke', '#3F4554')
      .attr('stroke-opacity', 0.6);

    // month spokes + outer labels
    for (let m = 1; m <= 12; m++) {
      const a = angle(m);
      const x1 = innerR * Math.sin(a), y1 = -innerR * Math.cos(a);
      const x2 = outerR * Math.sin(a), y2 = -outerR * Math.cos(a);
      g.append('line')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
        .attr('stroke', '#3F4554').attr('stroke-opacity', 0.3);
      const lx = (outerR + 22) * Math.sin(a);
      const ly = -(outerR + 22) * Math.cos(a);
      g.append('text')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 11)
        .attr('letter-spacing', '0.08em')
        .attr('fill', '#C7BFAB')
        .text(MONTH_SHORT[m - 1]);
    }

    // center label
    g.append('text')
      .attr('text-anchor', 'middle').attr('y', -8)
      .attr('font-family', 'Fraunces, Georgia, serif')
      .attr('font-size', 18).attr('font-weight', 500)
      .attr('fill', '#F0E9D9')
      .text('NDVI');
    g.append('text')
      .attr('text-anchor', 'middle').attr('y', 14)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 10)
      .attr('letter-spacing', '0.12em')
      .attr('fill', '#A29B85')
      .text('YEAR · 2023');

    // ---- Draw each state's curve (fills + lines first) ----
    const lineGen = d3.lineRadial()
      .angle(d => angle(d.month))
      .radius(d => ndviScale(d.NDVI))
      .curve(d3.curveCardinalClosed.tension(0.5));

    STATES.forEach(s => {
      const arr = ctx.index.stateByName.get(s);
      if (!arr) return;
      const color = STATE_COLORS[s];

      g.append('path')
        .datum(arr)
        .attr('fill', color)
        .attr('fill-opacity', 0.10)
        .attr('d', lineGen);

      g.append('path')
        .datum(arr)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2.2)
        .attr('stroke-linejoin', 'round')
        .attr('d', lineGen);
    });

    // ---- Collect all dots into ONE layer ----
    // Pointer events disabled on dots themselves; hover handled by an
    // invisible overlay using Delaunay nearest-point lookup so overlapping
    // dots are equally reachable.
    const allDots = [];
    STATES.forEach(s => {
      const arr = ctx.index.stateByName.get(s);
      const color = STATE_COLORS[s];
      arr.forEach(d => {
        const [px, py] = polarPoint(d.month, d.NDVI);
        allDots.push({ ...d, px, py, color });
      });
    });

    const gDots = g.append('g').style('pointer-events', 'none');
    const dotsSel = gDots.selectAll('circle')
      .data(allDots).join('circle')
      .attr('cx', d => d.px).attr('cy', d => d.py)
      .attr('r', 3.5)
      .attr('fill', '#15191F')
      .attr('stroke', d => d.color).attr('stroke-width', 1.6);

    // ---- Crop-peak labels (placed outside outer ring so they don't
    //      collide with curves or month labels) ----
    STATES.forEach(s => {
      const arr = ctx.index.stateByName.get(s);
      const color = STATE_COLORS[s];
      const peak = arr.reduce((acc, d) => (d.NDVI > acc.NDVI ? d : acc), arr[0]);
      const a = angle(peak.month);
      // place label just outside the outer month-label ring, biased so
      // labels for different peak months don't stack
      const labelR = outerR + 56;
      const lx = labelR * Math.sin(a);
      const ly = -labelR * Math.cos(a);
      g.append('text')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'Fraunces, Georgia, serif')
        .attr('font-size', 13).attr('font-weight', 600).attr('font-style', 'italic')
        .attr('fill', color)
        .text(`${STATE_CROP[s]} peak · ${MONTH_SHORT[peak.month - 1]}`);
    });

    // ---- Delaunay hover surface ----
    // Single rect covering the whole g; finds nearest dot on mousemove.
    const delaunay = d3.Delaunay.from(allDots, d => d.px, d => d.py);
    const maxHoverDist = 28;   // pixels — outside this radius, no tooltip

    g.append('rect')
      .attr('x', -cx).attr('y', -cy)
      .attr('width', w).attr('height', h)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [mx, my] = d3.pointer(event, g.node());
        const idx = delaunay.find(mx, my);
        if (idx < 0) { resetDots(); hideTip(); return; }
        const d = allDots[idx];
        const dist = Math.hypot(mx - d.px, my - d.py);
        if (dist > maxHoverDist) { resetDots(); hideTip(); return; }

        // grow the picked dot, raise it to the top
        dotsSel.attr('r', (dd, i) => i === idx ? 6.5 : 3.5)
               .attr('stroke-width', (dd, i) => i === idx ? 2.4 : 1.6)
               .attr('fill', (dd, i) => i === idx ? dd.color : '#15191F');
        // raise picked node to top so it's not occluded by other states' dots
        dotsSel.filter((dd, i) => i === idx).raise();

        showTip(`
          <div class="tt-title" style="color:${d.color}">${d.state} · ${STATE_CROP[d.state]}</div>
          <div class="tt-row"><span class="lbl">Month</span><span>${MONTH_NAMES[d.month - 1]}</span></div>
          <div class="tt-row"><span class="lbl">NDVI</span><span>${d.NDVI.toFixed(2)}</span></div>
          <div class="tt-row"><span class="lbl">LST Day</span><span>${TempUnit.formatAbs(d.LST_Day, 1)}</span></div>
          <div class="tt-row"><span class="lbl">Precip</span><span>${d.Precipitation.toFixed(0)} mm</span></div>
        `, event);
      })
      .on('mouseleave', function () {
        resetDots();
        hideTip();
      });

    function resetDots() {
      dotsSel.attr('r', 3.5).attr('stroke-width', 1.6).attr('fill', '#15191F');
    }
  };

  render();

  let resizeId;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(render, 150);
  });
}
