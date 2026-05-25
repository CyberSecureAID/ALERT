/* ═══════════════════════════════════════════════
   NASOC – Main JS
   Charts, Map, Live Clock, Animations
════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. Live UTC Clock ── */
  function updateClock() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('sys-time').textContent =
      `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ` +
      `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  }
  updateClock();
  setInterval(updateClock, 1000);

  /* ── 2. Threat Bars ── */
  const threatContainer = document.getElementById('threatBars');
  for (let i = 0; i < 15; i++) {
    const bar = document.createElement('div');
    bar.className = 'threat-bar' + (i < 7 ? ' active' : '');
    threatContainer.appendChild(bar);
  }

  /* ── 3. System Health Donut ── */
  new Chart(document.getElementById('healthDonut'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [92, 8],
        backgroundColor: ['#00e676', '#0c1526'],
        borderWidth: 0,
      }]
    },
    options: {
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 1200 }
    }
  });

  /* ── 4. Sparkline (Network Traffic KPI) ── */
  const sparkData = [1.8, 2.1, 1.9, 2.4, 2.2, 2.6, 2.5, 2.8, 2.7, 2.84];
  new Chart(document.getElementById('sparkline1'), {
    type: 'line',
    data: {
      labels: sparkData.map((_, i) => i),
      datasets: [{
        data: sparkData,
        borderColor: '#00e676',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: false
    }
  });

  /* ── 5. Network Traffic Chart (24H) ── */
  const trafficLabels = [];
  for (let h = 14; h < 38; h++) {
    trafficLabels.push(`${h % 24 < 10 ? '0' + h % 24 : h % 24}:00`);
  }
  // Only show every 2nd
  const trafficPoints = trafficLabels.map((_, i) =>
    parseFloat((1.2 + Math.sin(i * 0.5) * 0.7 + Math.random() * 0.3).toFixed(2))
  );

  const trafficCtx = document.getElementById('trafficChart');
  new Chart(trafficCtx, {
    type: 'line',
    data: {
      labels: ['14:00','18:00','22:00','02:00','06:00','08:00','10:00','12:00','14:00'],
      datasets: [{
        data: [1.4, 1.8, 2.2, 1.6, 1.3, 2.0, 2.5, 2.7, 2.84],
        borderColor: '#1a6fff',
        backgroundColor: 'rgba(26,111,255,0.08)',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#080e1a',
          borderColor: '#1e3a6e',
          borderWidth: 1,
          titleColor: '#6a8db0',
          bodyColor: '#cde4ff',
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} Tbps`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(18,32,64,0.5)', drawBorder: false },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } }
        },
        y: {
          min: 0, max: 3.0,
          grid: { color: 'rgba(18,32,64,0.5)', drawBorder: false },
          ticks: {
            color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 },
            callback: v => v.toFixed(1)
          }
        }
      },
      animation: { duration: 800 }
    }
  });

  /* ── 6. Latency Heatmap (simplified area chart) ── */
  new Chart(document.getElementById('latencyChart'), {
    type: 'bar',
    data: {
      labels: Array.from({ length: 18 }, (_, i) => ''),
      datasets: [{
        data: [20,35,80,120,90,60,40,30,25,30,45,70,110,150,130,95,60,30],
        backgroundColor: ctx => {
          const v = ctx.raw;
          if (v < 40) return 'rgba(0,230,118,0.7)';
          if (v < 80) return 'rgba(255,196,0,0.7)';
          if (v < 120) return 'rgba(255,140,0,0.7)';
          return 'rgba(255,61,61,0.7)';
        },
        borderWidth: 0,
        borderRadius: 1
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { display: false }
        },
        y: {
          min: 0, max: 160,
          grid: { color: 'rgba(18,32,64,0.5)', drawBorder: false },
          ticks: {
            color: '#3a5880',
            font: { family: 'Share Tech Mono', size: 8 },
            maxTicksLimit: 4,
            callback: v => v
          }
        }
      },
      animation: { duration: 800 }
    }
  });

  /* ── Latency gradient bar below chart ── */
  const lhPanel = document.querySelector('.latency-heatmap-panel');
  const gradBar = document.createElement('div');
  gradBar.style.cssText = `
    margin: 0 10px 6px;
    height: 5px;
    border-radius: 2px;
    background: linear-gradient(90deg, #00e676 0%, #ffc400 40%, #ff8c00 70%, #ff3d3d 100%);
    position:relative;
    z-index:2;
  `;
  const gradLabels = document.createElement('div');
  gradLabels.style.cssText = `
    margin: 0 10px 4px;
    display:flex;
    justify-content:space-between;
    font-size:8px;
    font-family:'Share Tech Mono',monospace;
    color:#3a5880;
    position:relative;
    z-index:2;
  `;
  gradLabels.innerHTML = '<span>0</span><span>150+</span>';
  lhPanel.appendChild(gradBar);
  lhPanel.appendChild(gradLabels);

  /* ── 7. Protocol Distribution Donut ── */
  new Chart(document.getElementById('protocolDonut'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [58, 21, 8, 7, 6],
        backgroundColor: ['#1a6fff','#22d3ee','#f59e0b','#10b981','#6366f1'],
        borderWidth: 1,
        borderColor: '#0a1120',
        hoverOffset: 3
      }]
    },
    options: {
      cutout: '62%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 1000 }
    }
  });

  /* ── 8. Packet Loss Chart ── */
  new Chart(document.getElementById('packetChart'), {
    type: 'line',
    data: {
      labels: ['14:00','18:00','22:00','02:00','06:00','08:00','10:00','12:00','14:00'],
      datasets: [{
        data: [0.015, 0.018, 0.022, 0.013, 0.012, 0.017, 0.019, 0.021, 0.02],
        borderColor: '#00c8ff',
        backgroundColor: 'rgba(0,200,255,0.06)',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#080e1a',
          borderColor: '#1e3a6e',
          borderWidth: 1,
          titleColor: '#6a8db0',
          bodyColor: '#cde4ff',
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(18,32,64,0.5)', drawBorder: false },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } }
        },
        y: {
          grid: { color: 'rgba(18,32,64,0.5)', drawBorder: false },
          ticks: {
            color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 },
            callback: v => v.toFixed(3)
          }
        }
      },
      animation: { duration: 800 }
    }
  });

  /* ── 9. Leaflet World Map ── */
  const map = L.map('worldMap', {
    center: [20, 10],
    zoom: 2,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    dragging: true,
    doubleClickZoom: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '',
    maxZoom: 5
  }).addTo(map);

  // Node definitions
  const nodes = [
    { id: 'SSC',      name: 'SSC\nWHITE SANDS',        lat: 32.5,  lng: -106.6, type: 'ground' },
    { id: 'KSC_HOU',  name: 'KSC\nKENNEDY SPACE CENTER', lat: 28.5, lng: -80.6,  type: 'ground' },
    { id: 'NEN',      name: 'NEN\nNEAR EARTH NETWORK',   lat: 60.0, lng: 30.0,   type: 'data' },
    { id: 'ARC',      name: 'ARC\nAMESC RESEARCH CENTER', lat: 37.4, lng: -122.0, type: 'data' },
    { id: 'KSC',      name: 'KSC\nKSC/CCSDS/SCCN',       lat: 38.0, lng: -77.0,  type: 'gateway' },
    { id: 'MOU',      name: 'MOU\nMARSHALL SPACE FLIGHT', lat: 34.7, lng: -86.6,  type: 'ground' },
    { id: 'MSFC',     name: 'MSFC\nMARSHALL SPACE FLIGHT CENTER', lat: 35.2, lng: -1.5, type: 'data' },
    { id: 'DSN_MAD',  name: 'DSN-MAD\nDEEP SPACE NETWORK MADRID', lat: 40.4, lng: -4.2, type: 'satellite' },
    { id: 'DSN_CAN',  name: 'DSN-CAN\nDEEP SPACE NETWORK CANBERRA', lat: -35.4, lng: 148.9, type: 'satellite' },
  ];

  // Color map
  const typeColors = {
    ground:    '#00e676',
    data:      '#00c8ff',
    gateway:   '#9b59ff',
    satellite: '#ffc400'
  };

  function makeIcon(color) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:14px;height:14px;
        border-radius:50%;
        background:${color};
        border:2px solid rgba(255,255,255,0.6);
        box-shadow:0 0 8px ${color},0 0 16px ${color}44;
        cursor:pointer;
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  const markerMap = {};
  nodes.forEach(n => {
    const color = typeColors[n.type];
    const m = L.marker([n.lat, n.lng], { icon: makeIcon(color) })
      .addTo(map)
      .bindTooltip(`<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#cde4ff;background:#080e1a;border:1px solid #1e3a6e;padding:4px 7px;border-radius:2px;white-space:pre;line-height:1.4">${n.name}</div>`, {
        direction: 'top',
        offset: [0, -8],
        opacity: 1,
        className: 'nasoc-tip'
      });
    markerMap[n.id] = m;
  });

  // Animated lines between nodes
  const links = [
    ['SSC', 'KSC_HOU', '#1a6fff'],
    ['KSC_HOU', 'KSC', '#1a6fff'],
    ['KSC', 'NEN', '#ffc400'],
    ['KSC', 'MSFC', '#1a6fff'],
    ['ARC', 'KSC_HOU', '#00c8ff'],
    ['MSFC', 'DSN_MAD', '#9b59ff'],
    ['DSN_MAD', 'MOU', '#9b59ff'],
    ['ARC', 'DSN_CAN', '#ffc400'],
  ];

  links.forEach(([a, b, color]) => {
    const na = nodes.find(n => n.id === a);
    const nb = nodes.find(n => n.id === b);
    if (!na || !nb) return;
    // Ant path animated
    if (typeof L.polyline.antPath !== 'undefined') {
      L.polyline.antPath([[na.lat, na.lng], [nb.lat, nb.lng]], {
        delay: 1000,
        dashArray: [10, 20],
        weight: 1.5,
        color: color,
        pulseColor: '#fff',
        opacity: 0.7
      }).addTo(map);
    } else {
      L.polyline([[na.lat, na.lng], [nb.lat, nb.lng]], {
        color: color,
        weight: 1.5,
        opacity: 0.5,
        dashArray: '6 10'
      }).addTo(map);
    }
  });

  /* ── 10. Satellite Visualization SVG ── */
  const satSvg = `
<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" width="180" height="140">
  <!-- Earth -->
  <defs>
    <radialGradient id="earthGrad" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#0d2b5c"/>
      <stop offset="100%" stop-color="#020f24"/>
    </radialGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%">
      <stop offset="60%" stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(26,111,255,0.15)"/>
    </radialGradient>
  </defs>
  <!-- Glow -->
  <circle cx="100" cy="90" r="60" fill="url(#glowGrad)"/>
  <!-- Earth body -->
  <circle cx="100" cy="90" r="40" fill="url(#earthGrad)" stroke="#1a3a7a" stroke-width="1"/>
  <!-- Continent blobs -->
  <path d="M82 72 Q90 65 98 70 Q108 68 112 76 Q105 84 95 82 Q84 80 82 72Z" fill="#0f3a6a" opacity="0.7"/>
  <path d="M70 85 Q78 80 84 86 Q80 92 72 90Z" fill="#0f3a6a" opacity="0.6"/>
  <path d="M108 86 Q116 82 122 88 Q118 96 110 94Z" fill="#0f3a6a" opacity="0.6"/>
  <!-- Orbit ring -->
  <ellipse cx="100" cy="90" rx="65" ry="20" fill="none" stroke="#1a6fff" stroke-width="0.7" stroke-dasharray="4 4" opacity="0.5"/>
  <!-- Satellites on orbit -->
  <!-- TDRS-1 -->
  <g transform="rotate(-30,100,90)">
    <ellipse cx="165" cy="90" rx="65" ry="20" fill="none" stroke="none"/>
    <g transform="translate(165,90)">
      <rect x="-8" y="-3" width="16" height="6" rx="1" fill="#00c8ff" opacity="0.9"/>
      <rect x="-14" y="-1" width="6" height="2" fill="#1a6fff"/>
      <rect x="8" y="-1" width="6" height="2" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.8"/>
    </g>
  </g>
  <!-- TDRS-2 -->
  <g transform="rotate(30,100,90)">
    <g transform="translate(165,90)">
      <rect x="-8" y="-3" width="16" height="6" rx="1" fill="#00c8ff" opacity="0.9"/>
      <rect x="-14" y="-1" width="6" height="2" fill="#1a6fff"/>
      <rect x="8" y="-1" width="6" height="2" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.8"/>
    </g>
  </g>
  <!-- TDRS-3 -->
  <g transform="rotate(90,100,90)">
    <g transform="translate(165,90)">
      <rect x="-8" y="-3" width="16" height="6" rx="1" fill="#00c8ff" opacity="0.9"/>
      <rect x="-14" y="-1" width="6" height="2" fill="#1a6fff"/>
      <rect x="8" y="-1" width="6" height="2" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.8"/>
    </g>
  </g>
  <!-- TDRS-5 (maintenance - yellow) -->
  <g transform="rotate(170,100,90)">
    <g transform="translate(165,90)">
      <rect x="-8" y="-3" width="16" height="6" rx="1" fill="#ffc400" opacity="0.85"/>
      <rect x="-14" y="-1" width="6" height="2" fill="#ff8c00"/>
      <rect x="8" y="-1" width="6" height="2" fill="#ff8c00"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.7"/>
    </g>
  </g>
  <!-- Signal lines to ground -->
  <line x1="100" y1="52" x2="100" y2="50" stroke="#00e676" stroke-width="0.7" stroke-dasharray="2 2" opacity="0.6"/>
  <line x1="100" y1="128" x2="100" y2="130" stroke="#00e676" stroke-width="0.7" stroke-dasharray="2 2" opacity="0.6"/>
</svg>`;

  document.getElementById('satViz').innerHTML = satSvg;

  /* ── 11. Live data simulation ── */
  function randomDelta(val, range) {
    return Math.max(0, val + (Math.random() - 0.5) * range);
  }

  setInterval(() => {
    // Slightly vary packet loss display
    const plEl = document.querySelectorAll('.kpi-value')[3];
    if (plEl) {
      const v = (Math.random() * 0.03 + 0.01).toFixed(3);
      plEl.innerHTML = v + '<small>%</small>';
    }
    // Blink alert dot
  }, 5000);

  /* ── 12. Sidebar navigation click ── */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  /* ── 13. Alert item pulse on critical ── */
  const criticalAlerts = document.querySelectorAll('.alert-item.critical');
  setInterval(() => {
    criticalAlerts.forEach(a => {
      a.style.background = a.style.background === 'rgba(255,61,61,0.07)' ? '' : 'rgba(255,61,61,0.07)';
    });
  }, 1500);

  console.log('NASOC Dashboard initialized.');
});
