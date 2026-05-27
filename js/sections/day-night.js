// =========================================================
//  Day vs Night LST — small multiples (one per state)
//  Two lines per panel + filled gap with annotations
// =========================================================
import {
  STATES, STATE_COLORS, STATE_COLORS_DARK, STATE_CROP,
  MONTH_SHORT, TempUnit,
  showTip, moveTip, hideTip
} from '../utils.js';

export function initDayNight(ctx) {
  const container = document.getElementById('day-night-chart');
  if (!container) return;

  const render = () => {
    container.innerHTML = '';
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Three side-by-side panels
    const cols = window.innerWidth < 760 ? 1 : 3;
    const panelW = (w - (cols - 1) * 16) / cols;
    const panelH = cols === 1 ? Math.min(280, h / 3) : h;

    const root = d3.select(container).append('div')
      .style('display', 'grid')
      .style('grid-template-columns', `repeat(${cols}, 1fr)`)
      .style('gap', '16px')
      .style('width', '100%')
      .style('height', '100%');

    // shared y-domain across all 3 panels for fair comparison
    const allTemps = ctx.stateData.flatMap(d => [d.LST_Day, d.LST_Night]);
    const yDomain = [d3.min(allTemps), d3.max(allTemps)];

    STATES.forEach(s => {
      const panel = root.append('div')
        .style('background', 'white')
        .style('border', '1px solid var(--rule)')
        .style('border-radius', '12px')
        .style('padding', '1rem')
        .style('display', 'flex')
        .style('flex-direction', 'column');

      // header
      const head = panel.append('div')
        .style('display', 'flex')
        .style('justify-content', 'space-between')
        .style('align-items', 'baseline')
        .style('margin-bottom', '0.4rem');
      head.append('h4')
        .style('font-family', 'Fraunces, Georgia, serif')
        .style('font-size', '1.1rem')
        .style('font-weight', 600)
        .style('margin', 0)
        .style('color', STATE_COLORS_DARK[s])
        .text(s);
      head.append('span')
        .attr('class', 'muted')
        .text(STATE_CROP[s]);

      const arr = ctx.index.stateByName.get(s);
      const innerW = panelW - 32;
      const innerH = (cols === 1 ? panelH : h) - 60;
      const m = { t: 14, r: 12, b: 32, l: 52 };

      const svg = panel.append('svg')
        .attr('viewBox', `0 0 ${innerW} ${innerH}`)
        .attr('width', '100%').attr('height', innerH);

      const x = d3.scaleLinear().domain([1, 12]).range([m.l, innerW - m.r]);
      const y = d3.scaleLinear().domain(yDomain).nice().range([innerH - m.b, m.t]);

      // grid
      svg.append('g').selectAll('line')
        .data(y.ticks(5)).join('line')
        .attr('x1', m.l).attr('x2', innerW - m.r)
        .attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', '#EEE7D8');

      // zero line (freezing)
      svg.append('line')
        .attr('x1', m.l).attr('x2', innerW - m.r)
        .attr('y1', y(0)).attr('y2', y(0))
        .attr('stroke', '#1F4E79').attr('stroke-dasharray', '3 3').attr('stroke-opacity', 0.5);
      svg.append('text')
        .attr('x', innerW - m.r - 4).attr('y', y(0) - 4)
        .attr('text-anchor', 'end')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 9.5).attr('fill', '#1F4E79').attr('opacity', 0.7)
        .text(TempUnit.formatAbs(0, 0));

      // gap area (between day and night)
      const area = d3.area()
        .x(d => x(d.month))
        .y0(d => y(d.LST_Night))
        .y1(d => y(d.LST_Day))
        .curve(d3.curveMonotoneX);
      svg.append('path')
        .datum(arr)
        .attr('fill', STATE_COLORS[s])
        .attr('fill-opacity', 0.16)
        .attr('d', area);

      // night line (cool blue)
      const lineGen = key => d3.line()
        .x(d => x(d.month))
        .y(d => y(d[key]))
        .curve(d3.curveMonotoneX);

      svg.append('path').datum(arr)
        .attr('fill', 'none')
        .attr('stroke', '#4A6FA5')
        .attr('stroke-width', 1.6)
        .attr('stroke-dasharray', '4 3')
        .attr('d', lineGen('LST_Night'));

      // day line (vivid state color)
      svg.append('path').datum(arr)
        .attr('fill', 'none')
        .attr('stroke', STATE_COLORS_DARK[s])
        .attr('stroke-width', 2.4)
        .attr('d', lineGen('LST_Day'));

      // dots — day
      svg.append('g').selectAll('circle.day')
        .data(arr).join('circle').attr('class', 'day')
        .attr('cx', d => x(d.month))
        .attr('cy', d => y(d.LST_Day))
        .attr('r', 3)
        .attr('fill', STATE_COLORS_DARK[s]);

      // dots — night
      svg.append('g').selectAll('circle.night')
        .data(arr).join('circle').attr('class', 'night')
        .attr('cx', d => x(d.month))
        .attr('cy', d => y(d.LST_Night))
        .attr('r', 2.4)
        .attr('fill', 'white')
        .attr('stroke', '#4A6FA5').attr('stroke-width', 1.4);

      // axes
      svg.append('g').attr('transform', `translate(0,${innerH - m.b})`)
        .call(d3.axisBottom(x).ticks(12).tickFormat(d => MONTH_SHORT[d - 1]).tickSize(0))
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 9).attr('color', '#8A8A8A')
        .call(g => g.select('.domain').remove());
      svg.append('g').attr('transform', `translate(${m.l},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => TempUnit.formatAbs(d, 0)).tickSize(0))
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 9.5).attr('color', '#8A8A8A')
        .call(g => g.select('.domain').remove());

      // y-axis title — makes it explicit that this is LST, not air temp
      svg.append('text')
        .attr('transform', `translate(14, ${(m.t + innerH - m.b) / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 9)
        .attr('letter-spacing', '0.06em')
        .attr('fill', '#8A8A8A')
        .text(`LAND SURFACE TEMP (${TempUnit.unitLabel()})`);

      // annotation: largest gap month
      let maxGap = arr[0], maxGapVal = arr[0].LST_Day - arr[0].LST_Night;
      arr.forEach(d => {
        const g = d.LST_Day - d.LST_Night;
        if (g > maxGapVal) { maxGap = d; maxGapVal = g; }
      });
      const midY = y((maxGap.LST_Day + maxGap.LST_Night) / 2);
      svg.append('text')
        .attr('x', x(maxGap.month)).attr('y', midY)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Fraunces, Georgia, serif')
        .attr('font-style', 'italic')
        .attr('font-size', 11).attr('fill', '#1A1A1A')
        .attr('opacity', 0.7)
        .text('Δ' + TempUnit.formatDelta(maxGapVal));

      // interactive vertical guide
      const focus = svg.append('g').style('display', 'none');
      focus.append('line').attr('y1', m.t).attr('y2', innerH - m.b)
        .attr('stroke', '#1A1A1A').attr('stroke-width', 0.6).attr('stroke-dasharray', '2 3');
      svg.append('rect')
        .attr('x', m.l).attr('y', m.t)
        .attr('width', innerW - m.l - m.r).attr('height', innerH - m.b - m.t)
        .attr('fill', 'transparent')
        .on('mouseenter', () => focus.style('display', null))
        .on('mouseleave', () => { focus.style('display', 'none'); hideTip(); })
        .on('mousemove', function (event) {
          const [mx] = d3.pointer(event, this);
          const month = Math.round(x.invert(mx));
          if (month < 1 || month > 12) return;
          focus.attr('transform', `translate(${x(month)},0)`);
          const d = arr.find(r => r.month === month);
          if (!d) return;
          showTip(`
            <div class="tt-title" style="color:${STATE_COLORS_DARK[s]}">${s} · ${MONTH_SHORT[month - 1]}</div>
            <div class="tt-row"><span class="lbl">Day LST</span><span>${TempUnit.formatAbs(d.LST_Day, 1)}</span></div>
            <div class="tt-row"><span class="lbl">Night LST</span><span>${TempUnit.formatAbs(d.LST_Night, 1)}</span></div>
            <div class="tt-row"><span class="lbl">Gap</span><span>${TempUnit.formatDelta(d.LST_Day - d.LST_Night)}</span></div>
          `, event);
        });

      // legend
      const lg = panel.append('div')
        .style('display', 'flex').style('gap', '0.9rem')
        .style('font-family', 'JetBrains Mono, monospace')
        .style('font-size', '0.72rem')
        .style('color', '#8A8A8A')
        .style('margin-top', '0.4rem');
      lg.append('span').html(`<span style="display:inline-block;width:14px;height:2px;background:${STATE_COLORS_DARK[s]};vertical-align:middle;margin-right:4px"></span>LST Day`);
      lg.append('span').html(`<span style="display:inline-block;width:14px;height:2px;border-top:2px dashed #4A6FA5;vertical-align:middle;margin-right:4px"></span>LST Night`);
    });

    document.addEventListener('mousemove', e => {
      if (document.getElementById('tooltip').classList.contains('visible')) moveTip(e);
    });
  };

  render();

  let resizeId;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(render, 150);
  });

  // Re-render the entire panel when the user toggles °C ↔ °F
  document.addEventListener('tempunitchange', render);
}
