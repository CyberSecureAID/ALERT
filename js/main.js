/* ═══════════════════════════════════════════════
   NASOC – Main JS  |  v2.0
   Real Internet Ping, Cuba-centered Map,
   Configurable Network Monitor, Audio Alert
════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  const pad = n => String(n).padStart(2, '0');

  /* ══════════════════════════════════════════════
     1. LIVE UTC CLOCK
  ══════════════════════════════════════════════ */
  function updateClock() {
    const now = new Date();
    const el = document.getElementById('sys-time');
    if (el) el.textContent =
      `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ` +
      `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

    const offsets = [0, 3, 10, 16, 21];
    ['ev-t1','ev-t2','ev-t3','ev-t4','ev-t5'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) {
        const t = new Date(now - offsets[i] * 60000);
        el.textContent = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
      }
    });
    [0, 3, 10, 16].forEach((off, i) => {
      const el = document.getElementById(`alert-time-${i+1}`);
      if (el) {
        const t = new Date(now - off * 60000);
        el.textContent = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
      }
    });
  }
  updateClock();
  setInterval(updateClock, 1000);


  /* ══════════════════════════════════════════════
     2. MONITORING STATE & CONFIGURATION
  ══════════════════════════════════════════════ */
  let monitoringActive  = false;
  let pingFailCount     = 0;
  let pingTotalCount    = 0;
  let pingOnline        = true;
  let lastOkTime        = null;
  let alertActive       = false;
  let audioCtx          = null;
  let pingIntervalId    = null;
  let alertRepeatId     = null;

  // User-configurable
  let alarmVolume       = 0.80;   // 0–1
  let failThreshold     = 2;      // consecutive failures before alarm
  let pingIntervalMs    = 1000;   // ms between pings

  // Ping latency history for KPI
  let lastRealPingMs    = null;
  let prevRealPingMs    = null;
  const pingHistory     = [];     // store last 24 real pings

  // AudioContext (lazy — needs user gesture first)
  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }

  function playAlertSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const vol = alarmVolume * 0.3; // scale to safe range
    function beep(freq, start, dur) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start);
      osc.stop(start + dur);
    }
    const t = ctx.currentTime;
    beep(880, t,        0.18);
    beep(440, t + 0.25, 0.18);
    beep(880, t + 0.5,  0.18);
    beep(440, t + 0.75, 0.18);
    beep(1100,t + 1.0,  0.18);
  }

  function playOnlineSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain= ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.25);
    gain.gain.setValueAtTime(alarmVolume * 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  /* ── Alert overlay ── */
  function showInetAlert() {
    if (alertActive) return;
    alertActive = true;
    document.getElementById('internet-alert-overlay').classList.remove('hidden');
    const el = document.getElementById('last-ok-time');
    if (el) el.textContent = lastOkTime || 'desconocido';
    const tEl = document.getElementById('inet-fail-threshold');
    if (tEl) tEl.textContent = failThreshold;
    playAlertSound();
    // Repeat sound while alert is active
    alertRepeatId = setInterval(() => { if (alertActive) playAlertSound(); }, 5000);
  }

  function hideInetAlert() {
    alertActive = false;
    document.getElementById('internet-alert-overlay').classList.add('hidden');
    if (alertRepeatId) { clearInterval(alertRepeatId); alertRepeatId = null; }
  }

  window.dismissInetAlert = function() { hideInetAlert(); };

  /* ── UI Updates ── */
  function updatePingUI(online, ms) {
    const dot    = document.getElementById('ping-dot');
    const msEl   = document.getElementById('ping-ms');
    const failEl = document.getElementById('inet-fail-count');
    const stEl   = document.getElementById('inet-status-text');
    const monPV  = document.getElementById('monPingVal');
    const monFC  = document.getElementById('monFailCount');
    const monTP  = document.getElementById('monTotalPings');

    if (online) {
      if (dot)   dot.className = 'blink-dot green';
      if (msEl)  msEl.textContent = ms !== null ? ms : '--';
      if (monPV) monPV.textContent = ms !== null ? `${ms} ms` : '-- ms';
    } else {
      if (dot)   dot.className = 'blink-dot red';
      if (msEl)  msEl.textContent = 'OFFLINE';
      if (monPV) monPV.textContent = 'OFFLINE';
    }
    if (failEl) failEl.textContent = pingFailCount;
    if (stEl)   stEl.textContent = online ? 'ONLINE' : 'OFFLINE';
    if (monFC)  monFC.textContent = pingFailCount;
    if (monTP)  monTP.textContent = pingTotalCount;

    // Update real latency KPI
    if (online && ms !== null) {
      prevRealPingMs = lastRealPingMs;
      lastRealPingMs = ms;

      const latEl = document.getElementById('kpi-latency');
      if (latEl) latEl.innerHTML = `${ms} <small>ms</small>`;

      const trendEl = document.getElementById('kpi-latency-trend');
      if (trendEl && prevRealPingMs !== null) {
        const diff = ms - prevRealPingMs;
        trendEl.textContent = `${diff > 0 ? '+' : ''}${diff} ms vs anterior`;
        trendEl.className   = `kpi-trend ${diff > 0 ? 'red' : 'green'}`;
      }

      // Keep history
      pingHistory.push(ms);
      if (pingHistory.length > 24) pingHistory.shift();

      // Update latency chart with real value
      if (typeof latencyChart !== 'undefined' && latencyChart) {
        const data = latencyChart.data.datasets[0];
        if (data.data.length >= 24) data.data.shift();
        data.data.push(ms);
        data.backgroundColor = data.data.map(v => {
          if (v < 40)  return 'rgba(0,230,118,0.75)';
          if (v < 80)  return 'rgba(255,196,0,0.75)';
          if (v < 120) return 'rgba(255,140,0,0.75)';
          return 'rgba(255,61,61,0.75)';
        });
        latencyChart.update('none');
      }
    }
  }

  /* ── Single Ping ── */
  function doPing() {
    pingTotalCount++;
    const t0 = performance.now();
    const img = new Image();
    const TIMEOUT = 3500;
    let done = false;

    const timer = setTimeout(() => {
      if (!done) { done = true; img.src = ''; handlePingResult(false, null); }
    }, TIMEOUT);

    img.onload = img.onerror = function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const dt = Math.round(performance.now() - t0);
      const online = dt < TIMEOUT - 200;
      handlePingResult(online, online ? dt : null);
    };

    img.src = `https://www.google.com/favicon.ico?_=${Date.now()}`;
  }

  function handlePingResult(online, ms) {
    if (online) {
      pingFailCount = 0;
      pingOnline    = true;
      lastOkTime    = new Date().toISOString().replace('T',' ').substring(0,19) + ' UTC';
      updatePingUI(true, ms);

      if (alertActive) { hideInetAlert(); playOnlineSound(); }

      const dot  = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (dot)  dot.className = 'blink-dot green';
      if (text) { text.textContent = 'OPERATIONAL'; text.style.color = 'var(--accent-green)'; }
    } else {
      pingFailCount++;
      pingOnline = false;
      updatePingUI(false, null);

      if (pingFailCount >= failThreshold) {
        const dot  = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (dot)  dot.className = 'blink-dot red';
        if (text) { text.textContent = 'DEGRADED'; text.style.color = 'var(--accent-red)'; }
        if (monitoringActive) showInetAlert();
      }
    }
  }

  /* ── Start / Stop monitoring ── */
  function startMonitoring() {
    if (pingIntervalId) clearInterval(pingIntervalId);
    doPing();
    pingIntervalId = setInterval(doPing, pingIntervalMs);

    // UI
    const bar  = document.getElementById('monitoringBar');
    const btn  = document.getElementById('monitorBtn');
    const txt  = document.getElementById('monitorBtnText');
    const bdg  = document.getElementById('monStatusBadge');
    const bdot = document.getElementById('monStatusDot');
    const blbl = document.getElementById('monStatusLabel');
    if (bar)  bar.classList.add('active-monitoring');
    if (btn)  btn.classList.remove('inactive');
    if (txt)  txt.textContent = 'DETENER MONITOREO';
    if (bdg)  { bdg.classList.remove('offline'); }
    if (bdot) { bdot.className = 'blink-dot green'; }
    if (blbl) blbl.textContent = 'ACTIVO';
  }

  function stopMonitoring() {
    if (pingIntervalId) { clearInterval(pingIntervalId); pingIntervalId = null; }
    hideInetAlert();

    // UI
    const bar  = document.getElementById('monitoringBar');
    const btn  = document.getElementById('monitorBtn');
    const txt  = document.getElementById('monitorBtnText');
    const bdg  = document.getElementById('monStatusBadge');
    const bdot = document.getElementById('monStatusDot');
    const blbl = document.getElementById('monStatusLabel');
    const dot  = document.getElementById('ping-dot');
    const msEl = document.getElementById('ping-ms');
    if (bar)  bar.classList.remove('active-monitoring');
    if (btn)  btn.classList.add('inactive');
    if (txt)  txt.textContent = 'ACTIVAR MONITOREO DE RED';
    if (bdg)  bdg.classList.add('offline');
    if (bdot) bdot.className = 'blink-dot red';
    if (blbl) blbl.textContent = 'INACTIVO';
    if (dot)  dot.className = 'blink-dot yellow';
    if (msEl) msEl.textContent = '--';
  }

  window.toggleMonitoring = function() {
    // Activate AudioCtx on first user gesture
    getAudioCtx();
    monitoringActive = !monitoringActive;
    if (monitoringActive) startMonitoring();
    else stopMonitoring();
  };

  /* ── Volume control ── */
  window.updateVolume = function(val) {
    alarmVolume = val / 100;
    const el = document.getElementById('volumeVal');
    if (el) el.textContent = `${val}%`;
  };

  /* ── Threshold control ── */
  window.setThreshold = function(n) {
    failThreshold = n;
    document.querySelectorAll('.mon-threshold-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.textContent) === n);
    });
    const tEl = document.getElementById('inet-fail-threshold');
    if (tEl) tEl.textContent = n;
  };

  /* ── Ping interval control ── */
  window.setPingInterval = function(ms) {
    pingIntervalMs = ms;
    document.querySelectorAll('#int-1, #int-2, #int-5').forEach(btn => btn && btn.classList.remove('active'));
    const labels = { 1000:'1s', 2000:'2s', 5000:'5s' };
    document.querySelectorAll('.mon-threshold-btns .mon-threshold-btn').forEach(btn => {
      if (labels[ms] && btn.textContent === labels[ms]) btn.classList.add('active');
    });
    if (monitoringActive) startMonitoring(); // restart with new interval
  };

  // Activate AudioCtx on any document click
  document.addEventListener('click', () => { getAudioCtx(); }, { once: true });


  /* ══════════════════════════════════════════════
     3. THREAT BARS
  ══════════════════════════════════════════════ */
  const threatContainer = document.getElementById('threatBars');
  if (threatContainer) {
    for (let i = 0; i < 15; i++) {
      const bar = document.createElement('div');
      bar.className = 'threat-bar' + (i < 7 ? ' active' : '');
      threatContainer.appendChild(bar);
    }
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
     6. NETWORK TRAFFIC CHART (24H)
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
        x: { grid: { color: 'rgba(18,32,64,0.5)' }, ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } } },
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
  const latencyHistoryInit = [20,35,80,120,90,60,40,30,25,30,45,70,110,150,130,95,60,30];
  const latencyChart = new Chart(document.getElementById('latencyChart'), {
    type: 'bar',
    data: {
      labels: latencyHistoryInit.map(() => ''),
      datasets: [{
        data: [...latencyHistoryInit],
        backgroundColor: latencyHistoryInit.map(v => {
          if (v < 40)  return 'rgba(0,230,118,0.75)';
          if (v < 80)  return 'rgba(255,196,0,0.75)';
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
          min: 0, max: 200,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 8 }, maxTicksLimit: 4 }
        }
      },
      animation: { duration: 400 }
    }
  });

  // Gradient bar below latency chart
  const lhPanel = document.querySelector('.latency-heatmap-panel');
  if (lhPanel) {
    const gradBar = document.createElement('div');
    gradBar.style.cssText = 'margin:0 10px 4px;height:4px;border-radius:2px;background:linear-gradient(90deg,#00e676 0%,#ffc400 40%,#ff8c00 70%,#ff3d3d 100%);position:relative;z-index:2;';
    const gradLabels = document.createElement('div');
    gradLabels.style.cssText = 'margin:0 10px 4px;display:flex;justify-content:space-between;font-size:8px;font-family:"Share Tech Mono",monospace;color:#3a5880;position:relative;z-index:2;';
    gradLabels.innerHTML = '<span>0 ms</span><span>200+ ms</span>';
    lhPanel.appendChild(gradBar);
    lhPanel.appendChild(gradLabels);
  }


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
      cutout: '60%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 1000 }
    }
  });


  /* ══════════════════════════════════════════════
     9. PACKET LOSS CHART
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
     10. LEAFLET MAP — CUBA CENTERED + ALL LOCATIONS
  ══════════════════════════════════════════════ */
  const map = L.map('worldMap', {
    center: [22.5, -79.5],
    zoom: 4,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    dragging: true,
    doubleClickZoom: true
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 10,
    minZoom: 2
  }).addTo(map);

  // All network nodes including full Cuba coverage
  const nodes = [
    // Cuba nodes
    { id: 'HABANA',     name: 'LA HABANA\nCUBA — NOC PRINCIPAL',      lat: 23.14, lng: -82.36, type: 'gateway' },
    { id: 'CAMAGUEY',   name: 'CAMAGÜEY\nCUBA CENTRO NODE',           lat: 21.38, lng: -77.92, type: 'data' },
    { id: 'HOLGUIN',    name: 'HOLGUÍN\nCUBA ESTE NODE',               lat: 20.89, lng: -76.26, type: 'data' },
    { id: 'CIEGO',      name: 'CIEGO DE ÁVILA\nCUBA RELAY NODE',       lat: 21.85, lng: -78.76, type: 'ground' },
    { id: 'LAS_TUNAS',  name: 'LAS TUNAS\nCUBA NORTE NODE',            lat: 20.97, lng: -76.96, type: 'ground' },
    { id: 'CABO_SAN',   name: 'CABO DE SAN ANTONIO\nCUBA — SAT UPLINK',lat: 21.87, lng: -84.96, type: 'satellite' },
    // Florida / USA southeast
    { id: 'MIAMI',      name: 'MIAMI\nSATELLITE UPLINK',               lat: 25.77, lng: -80.19, type: 'satellite' },
    { id: 'FLORIDA_KSC',name: 'FLORIDA / KSC\nKENNEDY SPACE CENTER',   lat: 28.52, lng: -80.65, type: 'ground' },
    // Rest of NASA network
    { id: 'KSC',        name: 'KSC/SCCN\nGREENBELT MD',               lat: 38.99, lng: -76.85, type: 'gateway' },
    { id: 'SSC',        name: 'SSC\nWHITE SANDS NM',                   lat: 32.51, lng: -106.6, type: 'ground' },
    { id: 'ARC',        name: 'ARC\nAMES RESEARCH CENTER',             lat: 37.41, lng: -122.0, type: 'data' },
    { id: 'MSFC',       name: 'MSFC\nMARSHALL SPACE FLIGHT',           lat: 34.73, lng: -86.64, type: 'data' },
    { id: 'NEN',        name: 'NEN\nNEAR EARTH NETWORK',               lat: 60.20, lng: 24.88,  type: 'data' },
    { id: 'DSN_MAD',    name: 'DSN-MAD\nDEEP SPACE MADRID',            lat: 40.43, lng: -4.25,  type: 'satellite' },
    { id: 'DSN_CAN',    name: 'DSN-CAN\nDEEP SPACE CANBERRA',          lat: -35.4, lng: 148.9,  type: 'satellite' },
    { id: 'BOGOTA',     name: 'BOGOTA\nCOLOMBIA RELAY',                lat: 4.71,  lng: -74.07, type: 'data' },
  ];

  const typeColors = {
    ground:    '#00e676',
    data:      '#00c8ff',
    gateway:   '#9b59ff',
    satellite: '#ffc400'
  };

  const cubaIds = new Set(['HABANA','CAMAGUEY','HOLGUIN','CIEGO','LAS_TUNAS','CABO_SAN']);

  function makeIcon(color, size = 12, pulse = false) {
    const outer = pulse ? `box-shadow:0 0 12px ${color},0 0 24px ${color}88;` : `box-shadow:0 0 6px ${color};`;
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:${color};
        border:2px solid rgba(255,255,255,0.6);
        ${outer}
        cursor:pointer;
      "></div>`,
      iconSize:   [size, size],
      iconAnchor: [size/2, size/2]
    });
  }

  nodes.forEach(n => {
    const color  = typeColors[n.type];
    const isCuba = cubaIds.has(n.id);
    const size   = isCuba ? 18 : 12;
    L.marker([n.lat, n.lng], { icon: makeIcon(color, size, isCuba) })
      .addTo(map)
      .bindTooltip(
        `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#cde4ff;background:#080e1a;border:1px solid #1e3a6e;padding:4px 8px;border-radius:2px;white-space:pre;line-height:1.5">${n.name}</div>`,
        { direction: 'top', offset: [0, -10], opacity: 1, className: '' }
      );
  });

  // Animated network links
  const links = [
    // Cuba internal network
    ['HABANA',    'CAMAGUEY',    '#9b59ff'],
    ['CAMAGUEY',  'HOLGUIN',     '#9b59ff'],
    ['HABANA',    'CIEGO',       '#9b59ff'],
    ['CIEGO',     'CAMAGUEY',    '#9b59ff'],
    ['CAMAGUEY',  'LAS_TUNAS',   '#9b59ff'],
    ['HABANA',    'CABO_SAN',    '#ffc400'],
    // Cuba → outside
    ['HABANA',    'MIAMI',       '#1a6fff'],
    ['CABO_SAN',  'FLORIDA_KSC', '#ffc400'],
    ['MIAMI',     'FLORIDA_KSC', '#00c8ff'],
    // USA network
    ['FLORIDA_KSC','KSC',        '#1a6fff'],
    ['KSC',       'MSFC',        '#1a6fff'],
    ['KSC',       'SSC',         '#00c8ff'],
    ['ARC',       'SSC',         '#00c8ff'],
    ['KSC',       'NEN',         '#ffc400'],
    // International
    ['MSFC',      'DSN_MAD',     '#9b59ff'],
    ['ARC',       'DSN_CAN',     '#ffc400'],
    ['MIAMI',     'BOGOTA',      '#00c8ff'],
    ['BOGOTA',    'HOLGUIN',     '#00e676'],
  ];

  links.forEach(([a, b, color]) => {
    const na = nodes.find(n => n.id === a);
    const nb = nodes.find(n => n.id === b);
    if (!na || !nb) return;
    const coords = [[na.lat, na.lng], [nb.lat, nb.lng]];
    try {
      if (typeof L.polyline.antPath !== 'undefined') {
        L.polyline.antPath(coords, {
          delay: 600 + Math.random() * 800,
          dashArray: [8, 18],
          weight: 1.8,
          color: color,
          pulseColor: '#ffffff',
          opacity: 0.8
        }).addTo(map);
      } else {
        L.polyline(coords, { color, weight: 1.5, opacity: 0.6, dashArray: '6 10' }).addTo(map);
      }
    } catch(e) {
      L.polyline(coords, { color, weight: 1.5, opacity: 0.6, dashArray: '6 10' }).addTo(map);
    }
  });


  /* ══════════════════════════════════════════════
     11. SATELLITE VISUALIZATION — Larger Globe
  ══════════════════════════════════════════════ */
  const satSvg = `
<svg viewBox="0 0 240 220" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <defs>
    <radialGradient id="earthG" cx="50%" cy="45%">
      <stop offset="0%"   stop-color="#0d2b5c"/>
      <stop offset="60%"  stop-color="#06183a"/>
      <stop offset="100%" stop-color="#020a1c"/>
    </radialGradient>
    <radialGradient id="glowG" cx="50%" cy="50%">
      <stop offset="50%"  stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(26,111,255,0.22)"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Outer atmosphere glow -->
  <circle cx="120" cy="110" r="82" fill="url(#glowG)"/>

  <!-- Earth body -->
  <circle cx="120" cy="110" r="52" fill="url(#earthG)" stroke="#1a3a7a" stroke-width="1.5"/>

  <!-- Continent shapes -->
  <path d="M96 90 Q108 80 120 85 Q134 82 138 94 Q128 106 112 104 Q96 102 96 90Z" fill="#0f3a6a" opacity="0.85"/>
  <path d="M82 102 Q93 97 100 105 Q95 115 84 112Z" fill="#0f3a6a" opacity="0.7"/>
  <path d="M130 100 Q142 95 150 103 Q145 114 133 112Z" fill="#0f3a6a" opacity="0.65"/>
  <path d="M100 116 Q108 112 114 118 Q110 126 102 124Z" fill="#0f3a6a" opacity="0.5"/>

  <!-- Equator -->
  <line x1="68" y1="110" x2="172" y2="110" stroke="#1a6fff" stroke-width="0.5" opacity="0.4" stroke-dasharray="2 3"/>

  <!-- Orbit ring 1 (main) -->
  <ellipse cx="120" cy="110" rx="82" ry="24" fill="none" stroke="#1a6fff" stroke-width="0.7" stroke-dasharray="4 5" opacity="0.4"/>

  <!-- Orbit ring 2 (inclined) -->
  <ellipse cx="120" cy="110" rx="75" ry="40" fill="none" stroke="#9b59ff" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.25" transform="rotate(-30 120 110)"/>

  <!-- TDRS-1 (fast, blue) -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 16s linear infinite;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#00c8ff" opacity="0.95" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.9"/>
      <line x1="0" y1="3" x2="0" y2="9" stroke="#00e676" stroke-width="0.8" opacity="0.7" stroke-dasharray="1.5 1.5"/>
    </g>
  </g>

  <!-- TDRS-2 (offset 120°) -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 16s linear infinite; animation-delay:-5.33s;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#00c8ff" opacity="0.9" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.85"/>
    </g>
  </g>

  <!-- TDRS-3 (offset 240°) -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 16s linear infinite; animation-delay:-10.67s;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#00c8ff" opacity="0.88" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.8"/>
    </g>
  </g>

  <!-- TDRS-5 (slow, maintenance, yellow, reverse) -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 44s linear infinite reverse;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#ffc400" opacity="0.9" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#ff8c00"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#ff8c00"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.75"/>
    </g>
  </g>

  <!-- Earth shimmer dots -->
  <circle cx="106" cy="96" r="1.5" fill="#00c8ff" opacity="0.5"/>
  <circle cx="132" cy="118" r="1" fill="#00e676" opacity="0.4"/>
  <circle cx="88" cy="108" r="1" fill="#9b59ff" opacity="0.35"/>
</svg>`;

  const satViz = document.getElementById('satViz');
  if (satViz) satViz.innerHTML = satSvg;


  /* ══════════════════════════════════════════════
     12. LIVE DATA SIMULATION — every 3s
  ══════════════════════════════════════════════ */
  function rnd(base, range) {
    return +(base + (Math.random() - 0.5) * range).toFixed(3);
  }

  setInterval(() => {
    // Packet loss
    const pl = Math.max(0, rnd(0.02, 0.012));
    const plEl = document.getElementById('kpi-loss');
    if (plEl) plEl.innerHTML = pl.toFixed(3) + '<small>%</small>';

    // Traffic KPI
    const tr = rnd(2.841, 0.15);
    const trEl = document.getElementById('kpi-traffic');
    if (trEl) trEl.innerHTML = tr.toFixed(3) + ' <small>Tbps</small>';

    // Active connections
    const cn = Math.round(rnd(12641, 200));
    const cnEl = document.getElementById('kpi-conn');
    if (cnEl) cnEl.textContent = cn.toLocaleString();

    // Push to traffic chart
    if (trafficChart.data.datasets[0].data.length >= 24) {
      trafficChart.data.datasets[0].data.shift();
      trafficChart.data.labels.shift();
    }
    trafficChart.data.datasets[0].data.push(tr);
    const now = new Date();
    trafficChart.data.labels.push(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`);
    trafficChart.update('none');

    // Push to packet chart
    if (packetChart.data.datasets[0].data.length >= 24) packetChart.data.datasets[0].data.shift();
    packetChart.data.datasets[0].data.push(pl);
    packetChart.update('none');

    // Link latencies
    const linkVals = [
      { id: 'll-1', base: 18, range: 5  },
      { id: 'll-2', base: 47, range: 12 },
      { id: 'll-3', base: 12, range: 4  },
      { id: 'll-4', base: 22, range: 5  },
      { id: 'll-5', base: 61, range: 10 },
      { id: 'll-6', base: 63, range: 15 },
    ];
    linkVals.forEach(lv => {
      const el = document.getElementById(lv.id);
      if (!el) return;
      const v = Math.max(5, Math.round(rnd(lv.base, lv.range)));
      el.textContent = v + ' ms';
      el.className   = 'link-lat ' + (v < 35 ? 'green' : v < 60 ? 'yellow' : 'red');
    });

    // Health donut fluctuation
    const hNet = Math.round(rnd(92, 3));
    const hSrv = Math.round(rnd(89, 3));
    const hLnk = Math.round(rnd(94, 2));
    const hSec = Math.round(rnd(91, 2));
    const avg  = Math.round((hNet + hSrv + hLnk + hSec) / 4);
    ['h-net','h-srv','h-lnk','h-sec'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = [hNet,hSrv,hLnk,hSec][i] + '%';
    });
    const pctEl = document.getElementById('health-pct-num');
    if (pctEl) pctEl.textContent = avg + '%';
    healthChart.data.datasets[0].data[0] = avg;
    healthChart.data.datasets[0].data[1] = 100 - avg;
    healthChart.update('none');

  }, 3000);


  /* ══════════════════════════════════════════════
     13. SIDEBAR NAV + HAMBURGER
  ══════════════════════════════════════════════ */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
  };

  document.addEventListener('click', e => {
    const sidebar   = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger');
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        hamburger && !hamburger.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  console.log('%cNASOC v2.0 — Presiona "ACTIVAR MONITOREO DE RED" para iniciar el sistema de alertas.', 'color:#00e676;font-family:monospace;font-size:13px');
});
