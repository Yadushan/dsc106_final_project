// =========================================================
//  Intro US map — three states with animated hover callouts
// =========================================================
import {
  STATE_FP, STATE_COLORS, STATE_COLORS_DARK, STATE_CROP
} from '../utils.js';

// Per-state callout content + direction the card extends from the
// state centroid (in SVG units). Offsets are CLAMPED at runtime so
// the card never overflows the SVG viewBox.
const STATE_CARD_INFO = {
  Iowa: {
    cropFull: 'Corn',
    icon: '🌽',
    stats: [
      ['99', 'counties'],
      ['Warm-season', 'crop'],
      ['Peak NDVI in', 'July'],
    ],
    offset: [190, -110],
  },
  Kansas: {
    cropFull: 'Winter Wheat',
    icon: '🌾',
    stats: [
      ['105', 'counties'],
      ['Cool-season', 'crop'],
      ['Peak NDVI in', 'July'],
    ],
    offset: [-220, 30],
  },
  Texas: {
    cropFull: 'Cotton',
    icon: '☁️',
    stats: [
      ['254', 'counties'],
      ['Heat-loving', 'crop'],
      ['Peak NDVI in', 'May'],
    ],
    offset: [220, 80],
  },
};

const CARD_W = 200;
const CARD_H = 196;
const HIDE_DELAY_MS = 400;       // grace period after mouseleave

export function initIntroMap(ctx) {
  const container = document.getElementById('intro-map');
  if (!container) return;

  const render = () => {
    container.innerHTML = '';
    const width  = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%');

    const projection = d3.geoAlbersUsa()
      .fitSize([width, height], ctx.usAll);
    const path = d3.geoPath(projection);

    // ---- Layer 1: background US states ----
    svg.append('g').attr('class', 'us-states')
      .selectAll('path')
      .data(ctx.usAll.features)
      .join('path')
      .attr('d', path)
      .attr('fill', '#E8E2D2')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 0.7);

    // ---- Identify 3 focus states ----
    const wantedFPs = new Set(Object.values(STATE_FP));
    const focusFeatures = ctx.usAll.features.filter(f =>
      wantedFPs.has(String(f.id).padStart(2, '0'))
    );
    const nameOf = f => Object.entries(STATE_FP)
      .find(([_, v]) => v === String(f.id).padStart(2, '0'))[0];

    // ---- Layer 2: focus state polygons (interactive) ----
    const focusGroup = svg.append('g').attr('class', 'focus-states');
    const polyByState = {};
    focusFeatures.forEach(f => {
      const stateName = nameOf(f);
      polyByState[stateName] = focusGroup.append('path')
        .attr('d', path(f))
        .attr('fill', STATE_COLORS[stateName])
        .attr('fill-opacity', 0.55)
        .attr('stroke', STATE_COLORS_DARK[stateName])
        .attr('stroke-width', 1.4)
        .style('cursor', 'pointer')
        .attr('class', `focus-state focus-${stateName.toLowerCase()}`);
    });

    // ---- Layer 3: in-state labels (always visible, click-through) ----
    const labels = svg.append('g')
      .attr('class', 'state-labels')
      .style('pointer-events', 'none');
    focusFeatures.forEach(f => {
      const stateName = nameOf(f);
      const [cx, cy] = path.centroid(f);
      const g = labels.append('g').attr('transform', `translate(${cx}, ${cy})`);
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', -4)
        .attr('font-family', 'Fraunces, Georgia, serif')
        .attr('font-size', 14)
        .attr('font-weight', 600)
        .attr('fill', STATE_COLORS_DARK[stateName])
        .text(stateName);
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 10)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 9)
        .attr('letter-spacing', '0.1em')
        .attr('fill', STATE_COLORS_DARK[stateName])
        .attr('opacity', 0.85)
        .text(STATE_CROP[stateName].toUpperCase());
    });

    // ---- Layer 4: hover-card layer (top layer, click-through so it
    //               never steals events from the focus states beneath) ----
    const cardLayer = svg.append('g')
      .attr('class', 'hover-card-layer')
      .style('pointer-events', 'none');

    const cardHandles = {};   // { stateName: { show, hide, hideNow } }

    focusFeatures.forEach(f => {
      const stateName = nameOf(f);
      const info = STATE_CARD_INFO[stateName];
      const [cx, cy] = path.centroid(f);
      const stateColor = STATE_COLORS[stateName];
      const stateColorDark = STATE_COLORS_DARK[stateName];

      // Clamp the card's centre so it stays inside the SVG viewBox
      const desiredCX = cx + info.offset[0];
      const desiredCY = cy + info.offset[1];
      const cardCX = Math.max(CARD_W / 2 + 8, Math.min(width - CARD_W / 2 - 8, desiredCX));
      const cardCY = Math.max(CARD_H / 2 + 8, Math.min(height - CARD_H / 2 - 8, desiredCY));

      // Arrow geometry: from state centroid toward card centre, stop
      // a bit short of the card edge so the arrowhead lands cleanly
      // just outside the frame.
      const adx = cardCX - cx;
      const ady = cardCY - cy;
      const adist = Math.hypot(adx, ady);
      const stopShort = CARD_W / 2 + 16;      // distance from card centre back along the line
      const arrowEndX = cardCX - (adx / adist) * stopShort;
      const arrowEndY = cardCY - (ady / adist) * stopShort;
      const lineLen = Math.hypot(arrowEndX - cx, arrowEndY - cy);
      const arrowAngleDeg = Math.atan2(ady, adx) * 180 / Math.PI;

      const card = cardLayer.append('g')
        .attr('class', `hov-card hov-card-${stateName.toLowerCase()}`)
        .style('opacity', 0);

      // (a) Arrow line — animated via stroke-dashoffset
      const arrowLine = card.append('line')
        .attr('x1', cx).attr('y1', cy)
        .attr('x2', arrowEndX).attr('y2', arrowEndY)
        .attr('stroke', stateColorDark)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('stroke-dasharray', `${lineLen}`)
        .attr('stroke-dashoffset', lineLen)
        .attr('opacity', 0.9);

      // (b) Arrowhead at the end
      const arrowhead = card.append('path')
        .attr('d', 'M -8,-5 L 0,0 L -8,5 Z')
        .attr('transform', `translate(${arrowEndX}, ${arrowEndY}) rotate(${arrowAngleDeg})`)
        .attr('fill', stateColorDark)
        .style('opacity', 0);

      const cardLeft = cardCX - CARD_W / 2;
      const cardTop  = cardCY - CARD_H / 2;

      // (c) Soft shadow underlay
      const shadow = card.append('rect')
        .attr('x', cardLeft + 3).attr('y', cardTop + 6)
        .attr('width', CARD_W).attr('height', CARD_H)
        .attr('rx', 14)
        .attr('fill', 'rgba(20,20,20,0.10)')
        .style('opacity', 0);

      // (d) Card frame
      const frame = card.append('rect')
        .attr('x', cardLeft).attr('y', cardTop)
        .attr('width', CARD_W).attr('height', CARD_H)
        .attr('rx', 14)
        .attr('fill', '#FFFFFF')
        .attr('stroke', '#E3DCCE')
        .attr('stroke-width', 1)
        .style('opacity', 0);

      // (e) Top accent bar
      const accent = card.append('rect')
        .attr('x', cardLeft).attr('y', cardTop)
        .attr('width', CARD_W).attr('height', 4)
        .attr('fill', stateColor)
        .style('opacity', 0);

      // (f) Content — icon, state name, crop name, divider, 3 stats
      const contentX = cardLeft + 22;
      let lineY = cardTop + 44;
      const contentEls = [];

      // Icon (emoji)
      contentEls.push(
        card.append('text')
          .attr('x', contentX).attr('y', lineY)
          .attr('font-size', 28)
          .style('opacity', 0)
          .text(info.icon)
      );
      lineY += 30;

      // State name
      contentEls.push(
        card.append('text')
          .attr('x', contentX).attr('y', lineY)
          .attr('font-family', 'Fraunces, Georgia, serif')
          .attr('font-size', 22)
          .attr('font-weight', 600)
          .attr('fill', stateColorDark)
          .style('opacity', 0)
          .text(stateName)
      );
      lineY += 16;

      // Crop name (mono uppercase)
      contentEls.push(
        card.append('text')
          .attr('x', contentX).attr('y', lineY)
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('font-size', 10)
          .attr('letter-spacing', '0.14em')
          .attr('fill', '#8A8A8A')
          .style('opacity', 0)
          .text(info.cropFull.toUpperCase())
      );
      lineY += 18;

      // Divider
      contentEls.push(
        card.append('line')
          .attr('x1', contentX).attr('x2', cardLeft + CARD_W - 22)
          .attr('y1', lineY).attr('y2', lineY)
          .attr('stroke', '#E3DCCE')
          .attr('stroke-width', 1)
          .style('opacity', 0)
      );
      lineY += 18;

      // Stat lines
      info.stats.forEach(([emph, rest]) => {
        const stat = card.append('text')
          .attr('x', contentX).attr('y', lineY)
          .attr('font-family', 'Inter, sans-serif')
          .attr('font-size', 13)
          .attr('fill', '#4A4A4A')
          .style('opacity', 0);
        stat.append('tspan')
          .attr('fill', '#1A1A1A')
          .attr('font-weight', 600)
          .text(emph);
        stat.append('tspan').text(' ' + rest);
        contentEls.push(stat);
        lineY += 20;
      });

      // ----- Animation: show -----
      function showCard() {
        card.style('opacity', 1);

        // Reset every element to hidden start state
        arrowLine.interrupt().attr('stroke-dashoffset', lineLen);
        arrowhead.interrupt().style('opacity', 0);
        shadow.interrupt().style('opacity', 0);
        frame.interrupt().style('opacity', 0);
        accent.interrupt().style('opacity', 0);
        contentEls.forEach(el => el.interrupt().style('opacity', 0));

        // (1) draw arrow line
        arrowLine.transition().duration(280).ease(d3.easeCubicOut)
          .attr('stroke-dashoffset', 0);

        // (2) arrowhead pops just before line finishes
        arrowhead.transition().delay(200).duration(120).style('opacity', 1);

        // (3) card frame fades up
        shadow.transition().delay(280).duration(220).style('opacity', 1);
        frame.transition().delay(280).duration(220).style('opacity', 1);
        accent.transition().delay(280).duration(220).style('opacity', 1);

        // (4) content lines stagger in
        const contentStart = 480;
        contentEls.forEach((el, i) => {
          el.transition().delay(contentStart + i * 70).duration(180)
            .style('opacity', 1);
        });
      }

      // ----- Animation: hide -----
      function hideCard() {
        card.interrupt()
          .transition().duration(200).ease(d3.easeCubicIn)
          .style('opacity', 0)
          .on('end', resetCard);
      }
      function hideNow() {
        card.interrupt().style('opacity', 0);
        resetCard();
      }
      function resetCard() {
        arrowLine.attr('stroke-dashoffset', lineLen);
        arrowhead.style('opacity', 0);
        shadow.style('opacity', 0);
        frame.style('opacity', 0);
        accent.style('opacity', 0);
        contentEls.forEach(el => el.style('opacity', 0));
      }

      cardHandles[stateName] = { show: showCard, hide: hideCard, hideNow };
    });

    // ---- Wire up hover handlers on focus state polygons ----
    let hideTimer = null;
    Object.entries(polyByState).forEach(([stateName, poly]) => {
      poly
        .on('mouseenter', () => {
          if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
          // Hide other states' cards immediately
          Object.entries(cardHandles).forEach(([name, h]) => {
            if (name !== stateName) h.hideNow();
          });
          cardHandles[stateName].show();
        })
        .on('mouseleave', () => {
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            cardHandles[stateName].hide();
            hideTimer = null;
          }, HIDE_DELAY_MS);
        });
    });
  };

  render();

  let resizeId;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(render, 150);
  });
}
