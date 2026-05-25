/* ═══════════════════════════════════════════════
   NASOC – Main JS
   Real Internet Ping, Dark Map (Cuba-centered),
   Live Charts, Animations, Audio Alert
════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ══════════════════════════════════════════════
     1. LIVE UTC CLOCK
  ══════════════════════════════════════════════ */
  const pad = n => String(n).padStart(2, '0');

  function updateClock() {
    const now = new Date();
    document.getElementById('sys-time').textContent =
      `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ` +
      `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

    // Timestamps in alerts & events table
    const hh = pad(now.getUTCHours());
    const mm = pad(now.getUTCMinutes());
    const ss = pad(now.getUTCSeconds());
    const ts = `${hh}:${mm}:${ss}`;

    ['ev-t1','ev-t2','ev-t3','ev-t4','ev-t5'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) {
        const offset = [0, 3, 10, 16, 21][i] * 60 * 1000;
        const t = new Date(now - offset);
        el.textContent = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
      }
    });
    ['alert-time-1','alert-time-2','alert-time-3','alert-time-4'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) {
        const offset = [0, 3, 10, 16][i] * 60 * 1000;
        const t = new Date(now - offset);
        el.textContent = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
      }
    });
  }
  updateClock();
  setInterval(updateClock, 1000);


  /* ══════════════════════════════════════════════
     2. INTERNET CONNECTIVITY PING (REAL)
     — Carga un favicon de Google vía Image()
     — Mide el tiempo de respuesta
     — Si hay 2+ fallos consecutivos → alerta + sonido
  ══════════════════════════════════════════════ */

  let pingFailCount = 0;
  let pingOnline = true;
  let lastOkTime = null;
  let alertActive = false;
  let audioCtx = null;

  // AudioContext lazy init (requiere gesto del usuario la 1a vez)
  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }

  function playAlertSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    // Genera tono de alerta birrítmico
    function beep(freq, startTime, duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
    const t = ctx.currentTime;
    beep(880, t,        0.15);
    beep(440, t + 0.2,  0.15);
    beep(880, t + 0.45, 0.15);
    beep(440, t + 0.65, 0.15);
  }

  function playOnlineSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.2);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  function showInetAlert() {
    if (alertActive) return;
    alertActive = true;
    document.getElementById('internet-alert-overlay').classList.remove('hidden');
    document.getElementById('last-ok-time').textContent = lastOkTime || 'desconocido';
    playAlertSound();
    // Repetir sonido cada 5 segundos mientras el overlay esté visible
    window._alertSoundInterval = setInterval(() => {
      if (alertActive) playAlertSound();
    }, 5000);
  }

  function hideInetAlert() {
    alertActive = false;
    document.getElementById('internet-alert-overlay').classList.add('hidden');
    if (window._alertSoundInterval) {
      clearInterval(window._alertSoundInterval);
      window._alertSoundInterval = null;
    }
  }

  // Expuesto globalmente para el botón "RECONOCER"
  window.dismissInetAlert = function() {
    hideInetAlert();
  };

  function updatePingUI(online, ms) {
    const dot = document.getElementById('ping-dot');
    const msEl = document.getElementById('ping-ms');
    const failEl = document.getElementById('inet-fail-count');
    const statusEl = document.getElementById('inet-status-text');

    if (online) {
      dot.className = 'blink-dot green';
      msEl.textContent = ms !== null ? ms : '--';
    } else {
      dot.className = 'blink-dot red';
      msEl.textContent = 'OFFLINE';
    }
    if (failEl) failEl.textContent = pingFailCount;
    if (statusEl) statusEl.textContent = online ? 'ONLINE' : 'OFFLINE';
  }

  function doPing() {
    // Iniciamos AudioCtx en primer ping (requiere interacción, pero DOMContentLoaded
    // suele preceder a un clic del usuario; igual intentamos)
    const t0 = performance.now();
    const img = new Image();
    const timeout = 3000; // 3s timeout
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        img.src = '';
        handleResult(false, null);
      }
    }, timeout);

    img.onload = img.onerror = function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const dt = Math.round(performance.now() - t0);
      // onerror también puede significar que la imagen llegó (CORS) pero la red respondió
      // Si dt < timeout - 200ms, consideramos que hubo respuesta de red
      const online = (dt < timeout - 200);
      handleResult(online, dt);
    };

    // Favicon de Google con cache-buster para evitar caché del browser
    img.src = `https://www.google.com/favicon.ico?cb=${Date.now()}`;
  }

  function handleResult(online, ms) {
    if (online) {
      pingFailCount = 0;
      pingOnline = true;
      lastOkTime = new Date().toISOString().replace('T',' ').substring(0,19) + ' UTC';
      updatePingUI(true, ms);
      // Si estaba en alerta y volvió → sonido de vuelta online
      if (alertActive) {
        hideInetAlert();
        playOnlineSound();
      }
      // Actualizar status header
      document.getElementById('status-dot').className = 'blink-dot green';
      document.getElementById('status-text').textContent = 'OPERATIONAL';
      document.getElementById('status-text').style.color = 'var(--accent-green)';
    } else {
      pingFailCount++;
      pingOnline = false;
      updatePingUI(false, null);
      if (pingFailCount >= 2) {
        // Actualizar status header
        document.getElementById('status-dot').className = 'blink-dot red';
        document.getElementById('status-text').textContent = 'DEGRADED';
        document.getElementById('status-text').style.color = 'var(--accent-red)';
        showInetAlert();
      }
    }
  }

  // Iniciar ping inmediatamente y luego cada 1 segundo
  doPing();
  setInterval(doPing, 1000);

  // Activar AudioCtx en primer clic del documento
  document.addEventListener('click', () => { getAudioCtx(); }, { once: true });


  /* ══════════════════════════════════════════════
     3. THREAT BARS
  ══════════════════════════════════════════════ */
  const threatContainer = document.getElementById('threatBars');
  for (let i = 0; i < 15; i++) {
    const bar = document.createElement('div');
    bar.className = 'threat-bar' + (i < 7 ? ' active' : '');
    threatContainer.appendChild(bar);
  }


  /* ══════════════════════════════════════════════
     4. SYSTEM HEALTH DONUT
  ══════════════════════════════════════════════ */
  const healthChart = new Chart(document.getElementById('healthDonut'), {
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


  /* ══════════════════════════════════════════════
     5. SPARKLINE (Network Traffic KPI)
  ══════════════════════════════════════════════ */
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


  /* ══════════════════════════════════════════════
     6. NETWORK TRAFFIC CHART (24H) — live update
  ══════════════════════════════════════════════ */
  const trafficHistory = [1.4, 1.8, 2.2, 1.6, 1.3, 2.0, 2.5, 2.7, 2.84];
  const trafficLabels  = ['14:00','18:00','22:00','02:00','06:00','08:00','10:00','12:00','NOW'];

  const trafficChart = new Chart(document.getElementById('trafficChart'), {
    type: 'line',
    data: {
      labels: trafficLabels,
      datasets: [{
        data: [...trafficHistory],
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
          mode: 'index', intersect: false,
          backgroundColor: '#080e1a', borderColor: '#1e3a6e', borderWidth: 1,
          titleColor: '#6a8db0', bodyColor: '#cde4ff',
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(2)} Tbps` }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } }
        },
        y: {
          min: 0, max: 3.2,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 }, callback: v => v.toFixed(1) }
        }
      },
      animation: { duration: 400 }
    }
  });


  /* ══════════════════════════════════════════════
     7. LATENCY HEATMAP (bar chart)
  ══════════════════════════════════════════════ */
  const latencyHistory = [20,35,80,120,90,60,40,30,25,30,45,70,110,150,130,95,60,30];
  const latencyChart = new Chart(document.getElementById('latencyChart'), {
    type: 'bar',
    data: {
      labels: latencyHistory.map(() => ''),
      datasets: [{
        data: [...latencyHistory],
        backgroundColor: latencyHistory.map(v => {
          if (v < 40) return 'rgba(0,230,118,0.75)';
          if (v < 80) return 'rgba(255,196,0,0.75)';
          if (v < 120) return 'rgba(255,140,0,0.75)';
          return 'rgba(255,61,61,0.75)';
        }),
        borderWidth: 0,
        borderRadius: 1
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          min: 0, max: 180,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 8 }, maxTicksLimit: 4 }
        }
      },
      animation: { duration: 400 }
    }
  });

  // Gradient bar below latency chart
  const lhPanel = document.querySelector('.latency-heatmap-panel');
  const gradBar = document.createElement('div');
  gradBar.style.cssText = 'margin:0 10px 6px;height:5px;border-radius:2px;background:linear-gradient(90deg,#00e676 0%,#ffc400 40%,#ff8c00 70%,#ff3d3d 100%);position:relative;z-index:2;';
  const gradLabels = document.createElement('div');
  gradLabels.style.cssText = 'margin:0 10px 4px;display:flex;justify-content:space-between;font-size:8px;font-family:"Share Tech Mono",monospace;color:#3a5880;position:relative;z-index:2;';
  gradLabels.innerHTML = '<span>0 ms</span><span>180+ ms</span>';
  lhPanel.appendChild(gradBar);
  lhPanel.appendChild(gradLabels);


  /* ══════════════════════════════════════════════
     8. PROTOCOL DISTRIBUTION DONUT
  ══════════════════════════════════════════════ */
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


  /* ══════════════════════════════════════════════
     9. PACKET LOSS CHART — live update
  ══════════════════════════════════════════════ */
  const packetHistory = [0.015,0.018,0.022,0.013,0.012,0.017,0.019,0.021,0.02];
  const packetChart = new Chart(document.getElementById('packetChart'), {
    type: 'line',
    data: {
      labels: ['14:00','18:00','22:00','02:00','06:00','08:00','10:00','12:00','NOW'],
      datasets: [{
        data: [...packetHistory],
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
          mode: 'index', intersect: false,
          backgroundColor: '#080e1a', borderColor: '#1e3a6e', borderWidth: 1,
          titleColor: '#6a8db0', bodyColor: '#cde4ff',
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(3)} %` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(18,32,64,0.5)' }, ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } } },
        y: {
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 }, callback: v => v.toFixed(3) }
        }
      },
      animation: { duration: 400 }
    }
  });


  /* ══════════════════════════════════════════════
     10. LEAFLET WORLD MAP — DARK TILES + CUBA CENTER
  ══════════════════════════════════════════════ */
  const map = L.map('worldMap', {
    center: [22.0, -79.5],   // Cuba / Caribe
    zoom: 3,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    dragging: true,
    doubleClickZoom: true
  });

  // CartoDB Dark Matter — modo nocturno REAL, sin filtro CSS
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 8,
    minZoom: 2
  }).addTo(map);

  // Nodos de red (incluye Cuba y Latinoamérica)
  const nodes = [
    { id: 'HABANA',   name: 'HABANA\nCUBA NOC',              lat: 23.1,  lng: -82.4,  type: 'gateway' },
    { id: 'SANTIAGO', name: 'SANTIAGO\nCUBA-EAST NODE',      lat: 20.0,  lng: -75.8,  type: 'ground' },
    { id: 'SSC',      name: 'SSC\nWHITE SANDS NM',           lat: 32.5,  lng: -106.6, type: 'ground' },
    { id: 'KSC_HOU',  name: 'KSC\nKENNEDY SPACE CENTER',     lat: 28.5,  lng: -80.6,  type: 'ground' },
    { id: 'NEN',      name: 'NEN\nNEAR EARTH NETWORK',       lat: 60.0,  lng: 30.0,   type: 'data' },
    { id: 'ARC',      name: 'ARC\nAMES RESEARCH CENTER',     lat: 37.4,  lng: -122.0, type: 'data' },
    { id: 'KSC',      name: 'KSC/CCSDS/SCCN\nGREENBELT MD', lat: 38.0,  lng: -77.0,  type: 'gateway' },
    { id: 'MSFC',     name: 'MSFC\nMARSHALL SPACE FLIGHT',   lat: 35.2,  lng: -1.5,   type: 'data' },
    { id: 'DSN_MAD',  name: 'DSN-MAD\nDEEP SPACE MADRID',    lat: 40.4,  lng: -4.2,   type: 'satellite' },
    { id: 'DSN_CAN',  name: 'DSN-CAN\nDEEP SPACE CANBERRA',  lat: -35.4, lng: 148.9,  type: 'satellite' },
    { id: 'BOGOTA',   name: 'BOGOTA\nCOLOMBIA RELAY',        lat: 4.7,   lng: -74.1,  type: 'data' },
    { id: 'MIAMI',    name: 'MIAMI\nSATELLITE UPLINK',       lat: 25.8,  lng: -80.2,  type: 'satellite' },
  ];

  const typeColors = {
    ground:    '#00e676',
    data:      '#00c8ff',
    gateway:   '#9b59ff',
    satellite: '#ffc400'
  };

  function makeIcon(color, size = 12) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:${color};
        border:2px solid rgba(255,255,255,0.5);
        box-shadow:0 0 8px ${color},0 0 16px ${color}44;
        cursor:pointer;
        transition: transform 0.2s;
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2]
    });
  }

  // Cuba nodes larger
  nodes.forEach(n => {
    const color = typeColors[n.type];
    const size = (n.id === 'HABANA' || n.id === 'SANTIAGO') ? 16 : 12;
    L.marker([n.lat, n.lng], { icon: makeIcon(color, size) })
      .addTo(map)
      .bindTooltip(
        `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#cde4ff;background:#080e1a;border:1px solid #1e3a6e;padding:4px 8px;border-radius:2px;white-space:pre;line-height:1.5">${n.name}</div>`,
        { direction: 'top', offset: [0, -8], opacity: 1, className: '' }
      );
  });

  // Animated ant-path links
  const links = [
    ['SSC',      'KSC_HOU', '#1a6fff'],
    ['KSC_HOU',  'KSC',     '#1a6fff'],
    ['KSC_HOU',  'HABANA',  '#9b59ff'],
    ['HABANA',   'SANTIAGO','#00e676'],
    ['HABANA',   'MIAMI',   '#ffc400'],
    ['MIAMI',    'BOGOTA',  '#ffc400'],
    ['KSC',      'NEN',     '#ffc400'],
    ['KSC',      'MSFC',    '#1a6fff'],
    ['ARC',      'KSC_HOU', '#00c8ff'],
    ['MSFC',     'DSN_MAD', '#9b59ff'],
    ['ARC',      'DSN_CAN', '#ffc400'],
    ['BOGOTA',   'SANTIAGO','#00c8ff'],
  ];

  links.forEach(([a, b, color]) => {
    const na = nodes.find(n => n.id === a);
    const nb = nodes.find(n => n.id === b);
    if (!na || !nb) return;
    const coords = [[na.lat, na.lng], [nb.lat, nb.lng]];
    if (typeof L.polyline.antPath !== 'undefined') {
      L.polyline.antPath(coords, {
        delay: 800 + Math.random() * 600,
        dashArray: [10, 20],
        weight: 1.5,
        color: color,
        pulseColor: '#ffffff',
        opacity: 0.75
      }).addTo(map);
    } else {
      L.polyline(coords, { color, weight: 1.5, opacity: 0.5, dashArray: '6 10' }).addTo(map);
    }
  });


  /* ══════════════════════════════════════════════
     11. SATELLITE VISUALIZATION SVG — con animación real
  ══════════════════════════════════════════════ */
  const satSvg = `
<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg" width="170" height="150">
  <defs>
    <radialGradient id="earthGrad" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#0d2b5c"/>
      <stop offset="100%" stop-color="#020f24"/>
    </radialGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%">
      <stop offset="50%" stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(26,111,255,0.18)"/>
    </radialGradient>
  </defs>

  <!-- Glow halo -->
  <circle cx="100" cy="90" r="65" fill="url(#glowGrad)"/>

  <!-- Earth -->
  <circle cx="100" cy="90" r="38" fill="url(#earthGrad)" stroke="#1a3a7a" stroke-width="1.2"/>
  <!-- Continent blobs -->
  <path d="M82 72 Q90 65 98 70 Q108 68 112 76 Q105 84 95 82 Q84 80 82 72Z" fill="#0f3a6a" opacity="0.8"/>
  <path d="M70 85 Q78 80 84 86 Q80 92 72 90Z" fill="#0f3a6a" opacity="0.7"/>
  <path d="M108 86 Q116 82 122 88 Q118 96 110 94Z" fill="#0f3a6a" opacity="0.6"/>
  <!-- Equator line -->
  <line x1="62" y1="90" x2="138" y2="90" stroke="#1a6fff" stroke-width="0.4" opacity="0.4" stroke-dasharray="2 3"/>

  <!-- Orbit ellipse (visual only) -->
  <ellipse cx="100" cy="90" rx="62" ry="19" fill="none" stroke="#1a6fff" stroke-width="0.6" stroke-dasharray="4 5" opacity="0.4"/>

  <!-- TDRS-1 (orbits fast) -->
  <g style="transform-origin:100px 90px; animation: spin-orbit 18s linear infinite;">
    <g transform="translate(162,90)">
      <rect x="-7" y="-2.5" width="14" height="5" rx="1" fill="#00c8ff" opacity="0.95"/>
      <rect x="-13" y="-1" width="5" height="2" rx="0.5" fill="#1a6fff"/>
      <rect x="8" y="-1" width="5" height="2" rx="0.5" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2" fill="#fff" opacity="0.9"/>
      <line x1="0" y1="2.5" x2="0" y2="8" stroke="#00e676" stroke-width="0.5" opacity="0.7" stroke-dasharray="1 1"/>
    </g>
  </g>

  <!-- TDRS-2 (medium speed, offset 120deg) -->
  <g style="transform-origin:100px 90px; animation: spin-orbit 18s linear infinite; animation-delay: -6s;">
    <g transform="translate(162,90)">
      <rect x="-7" y="-2.5" width="14" height="5" rx="1" fill="#00c8ff" opacity="0.95"/>
      <rect x="-13" y="-1" width="5" height="2" rx="0.5" fill="#1a6fff"/>
      <rect x="8" y="-1" width="5" height="2" rx="0.5" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2" fill="#fff" opacity="0.9"/>
    </g>
  </g>

  <!-- TDRS-3 (offset 240deg) -->
  <g style="transform-origin:100px 90px; animation: spin-orbit 18s linear infinite; animation-delay: -12s;">
    <g transform="translate(162,90)">
      <rect x="-7" y="-2.5" width="14" height="5" rx="1" fill="#00c8ff" opacity="0.9"/>
      <rect x="-13" y="-1" width="5" height="2" rx="0.5" fill="#1a6fff"/>
      <rect x="8" y="-1" width="5" height="2" rx="0.5" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2" fill="#fff" opacity="0.85"/>
    </g>
  </g>

  <!-- TDRS-5 MAINTENANCE (slow, yellow) -->
  <g style="transform-origin:100px 90px; animation: spin-orbit 40s linear infinite reverse;">
    <g transform="translate(162,90)">
      <rect x="-7" y="-2.5" width="14" height="5" rx="1" fill="#ffc400" opacity="0.9"/>
      <rect x="-13" y="-1" width="5" height="2" rx="0.5" fill="#ff8c00"/>
      <rect x="8" y="-1" width="5" height="2" rx="0.5" fill="#ff8c00"/>
      <circle cx="0" cy="0" r="2" fill="#fff" opacity="0.7"/>
    </g>
  </g>
</svg>`;

  document.getElementById('satViz').innerHTML = satSvg;


  /* ══════════════════════════════════════════════
     12. LIVE DATA SIMULATION — actualiza KPIs y charts cada 3s
  ══════════════════════════════════════════════ */
  function rnd(base, range) {
    return +(base + (Math.random() - 0.5) * range).toFixed(3);
  }

  setInterval(() => {
    // Packet loss KPI
    const pl = rnd(0.02, 0.012);
    const plEl = document.getElementById('kpi-loss');
    if (plEl) plEl.innerHTML = pl.toFixed(3) + '<small>%</small>';

    // Latency KPI
    const lat = rnd(27.3, 4);
    const latEl = document.getElementById('kpi-latency');
    if (latEl) latEl.innerHTML = lat.toFixed(1) + ' <small>ms</small>';

    // Traffic KPI
    const tr = rnd(2.841, 0.15);
    const trEl = document.getElementById('kpi-traffic');
    if (trEl) trEl.innerHTML = tr.toFixed(3) + ' <small>Tbps</small>';

    // Active connections
    const cn = Math.round(rnd(12641, 200));
    const cnEl = document.getElementById('kpi-conn');
    if (cnEl) cnEl.textContent = cn.toLocaleString();

    // Update traffic chart — push new point
    if (trafficChart.data.datasets[0].data.length >= 24) {
      trafficChart.data.datasets[0].data.shift();
      trafficChart.data.labels.shift();
    }
    trafficChart.data.datasets[0].data.push(tr);
    const now = new Date();
    trafficChart.data.labels.push(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`);
    trafficChart.update('none');

    // Update latency chart
    if (latencyChart.data.datasets[0].data.length >= 24) {
      latencyChart.data.datasets[0].data.shift();
    }
    const newLat = rnd(lat * 2, 40);
    latencyChart.data.datasets[0].data.push(Math.max(5, newLat));
    latencyChart.data.datasets[0].backgroundColor = latencyChart.data.datasets[0].data.map(v => {
      if (v < 40) return 'rgba(0,230,118,0.75)';
      if (v < 80) return 'rgba(255,196,0,0.75)';
      if (v < 120) return 'rgba(255,140,0,0.75)';
      return 'rgba(255,61,61,0.75)';
    });
    latencyChart.update('none');

    // Update packet chart
    if (packetChart.data.datasets[0].data.length >= 24) {
      packetChart.data.datasets[0].data.shift();
    }
    packetChart.data.datasets[0].data.push(pl);
    packetChart.update('none');

    // Randomize link latencies
    const linkVals = [
      { id: 'll-1', base: 18, range: 5,  cls: 'green' },
      { id: 'll-2', base: 47, range: 12, cls: 'yellow' },
      { id: 'll-3', base: 22, range: 5,  cls: 'green' },
      { id: 'll-4', base: 19, range: 5,  cls: 'green' },
      { id: 'll-5', base: 31, range: 8,  cls: 'yellow' },
      { id: 'll-6', base: 63, range: 15, cls: 'red' },
    ];
    linkVals.forEach(lv => {
      const el = document.getElementById(lv.id);
      if (!el) return;
      const v = Math.round(rnd(lv.base, lv.range));
      el.textContent = v + ' ms';
      el.className = 'link-lat ' + (v < 35 ? 'green' : v < 60 ? 'yellow' : 'red');
    });

    // Health donut small fluctuation
    const hNet = Math.round(rnd(92, 3));
    const hSrv = Math.round(rnd(89, 3));
    const hLnk = Math.round(rnd(94, 2));
    const hSec = Math.round(rnd(91, 2));
    const avg = Math.round((hNet + hSrv + hLnk + hSec) / 4);
    document.getElementById('h-net').textContent = hNet + '%';
    document.getElementById('h-srv').textContent = hSrv + '%';
    document.getElementById('h-lnk').textContent = hLnk + '%';
    document.getElementById('h-sec').textContent = hSec + '%';
    document.getElementById('health-pct-num').textContent = avg + '%';
    healthChart.data.datasets[0].data[0] = avg;
    healthChart.data.datasets[0].data[1] = 100 - avg;
    healthChart.update('none');

  }, 3000);


  /* ══════════════════════════════════════════════
     13. SIDEBAR NAV CLICK + HAMBURGER TOGGLE
  ══════════════════════════════════════════════ */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      // Close on mobile
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
  };

  // Close sidebar clicking outside on mobile
  document.addEventListener('click', e => {
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger');
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !hamburger.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  console.log('%cNASOC Dashboard initialized — Real ping active', 'color:#00e676;font-family:monospace');
});
