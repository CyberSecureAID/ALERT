/* ═══════════════════════════════════════════════
   NASOC – Main JS  |  v3.0
   Correcciones completas:
   - Barra monitoreo SIEMPRE visible
   - Datos reales de red
   - Nodos Cuba expandidos (Camagüey ×3, Florida-Ciego ×2, Ciego ×4, Santa Clara ×3, Habana ×8, Las Tunas ×3, Holguín ×4)
   - Alertas reales del sistema
   - Gráficas conectadas a datos reales
   - Dashboard lateral funcional
   - Favicon NASA
════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  const pad = n => String(n).padStart(2, '0');

  /* ══ FAVICON DINÁMICO (NASA logo) ══ */
  (function setFavicon() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    // Fondo azul NASA
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#0b3d91';
    ctx.fill();
    ctx.strokeStyle = '#fc3d21';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Texto NASA
    ctx.fillStyle = 'white';
    ctx.font = 'bold 13px Arial Black';
    ctx.textAlign = 'center';
    ctx.fillText('NASA', 32, 26);
    // Elipse orbital
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(32, 38, 20, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Línea roja
    ctx.strokeStyle = '#fc3d21';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 38); ctx.lineTo(54, 38);
    ctx.stroke();
    // Punto central
    ctx.beginPath();
    ctx.arc(32, 38, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    const link = document.createElement('link');
    link.rel = 'icon'; link.type = 'image/png';
    link.href = canvas.toDataURL();
    document.head.appendChild(link);
  })();


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
      const el2 = document.getElementById(id);
      if (el2) {
        const t = new Date(now - offsets[i] * 60000);
        el2.textContent = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
      }
    });
  }
  updateClock();
  setInterval(updateClock, 1000);


  /* ══════════════════════════════════════════════
     2. ESTADO MONITOREO Y CONFIGURACIÓN
     CRÍTICO: la barra de monitoreo NUNCA se oculta
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

  let alarmVolume       = 0.80;
  let failThreshold     = 2;
  let pingIntervalMs    = 1000;

  let lastRealPingMs    = null;
  let prevRealPingMs    = null;
  const pingHistory     = [];

  // MÉTRICAS REALES acumuladas
  const realMetrics = {
    packetLossHistory: [],
    latencyHistory:    [],
    trafficHistory:    [],
    totalPings:        0,
    failedPings:       0,
    avgLatency:        0,
    minLatency:        Infinity,
    maxLatency:        0,
    onlineSince:       null,
    offlineEvents:     []
  };

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }

  function playAlertSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const vol = alarmVolume * 0.3;
    function beep(freq, start, dur) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start); osc.stop(start + dur);
    }
    const t = ctx.currentTime;
    beep(880, t, 0.18); beep(440, t+0.25, 0.18);
    beep(880, t+0.5, 0.18); beep(440, t+0.75, 0.18);
    beep(1100, t+1.0, 0.18);
  }

  function playOnlineSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(880, t+0.25);
    gain.gain.setValueAtTime(alarmVolume * 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t+0.35);
    osc.start(t); osc.stop(t+0.35);
  }

  function showInetAlert() {
    if (alertActive) return;
    alertActive = true;
    document.getElementById('internet-alert-overlay').classList.remove('hidden');
    const el = document.getElementById('last-ok-time');
    if (el) el.textContent = lastOkTime || 'desconocido';
    const tEl = document.getElementById('inet-fail-threshold');
    if (tEl) tEl.textContent = failThreshold;
    playAlertSound();
    alertRepeatId = setInterval(() => { if (alertActive) playAlertSound(); }, 5000);
    addRealAlert('CRITICAL', 'Sin conexión a Internet', `Google.com no responde — ${pingFailCount} fallos consecutivos`, 'INET-MON');
  }

  function hideInetAlert() {
    alertActive = false;
    document.getElementById('internet-alert-overlay').classList.add('hidden');
    if (alertRepeatId) { clearInterval(alertRepeatId); alertRepeatId = null; }
  }

  window.dismissInetAlert = function() { hideInetAlert(); };

  /* ── Actualizar UI de ping ── */
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

    if (online && ms !== null) {
      prevRealPingMs = lastRealPingMs;
      lastRealPingMs = ms;

      // Actualizar KPI latencia real
      const latEl = document.getElementById('kpi-latency');
      if (latEl) latEl.innerHTML = `${ms} <small>ms</small>`;

      const trendEl = document.getElementById('kpi-latency-trend');
      if (trendEl && prevRealPingMs !== null) {
        const diff = ms - prevRealPingMs;
        trendEl.textContent = `${diff > 0 ? '+' : ''}${diff} ms vs anterior`;
        trendEl.className   = `kpi-trend ${diff > 0 ? 'red' : 'green'}`;
      }

      // Métricas acumuladas
      pingHistory.push(ms);
      if (pingHistory.length > 24) pingHistory.shift();

      realMetrics.latencyHistory.push({ t: Date.now(), v: ms });
      if (realMetrics.latencyHistory.length > 60) realMetrics.latencyHistory.shift();
      realMetrics.minLatency = Math.min(realMetrics.minLatency, ms);
      realMetrics.maxLatency = Math.max(realMetrics.maxLatency, ms);
      realMetrics.avgLatency = pingHistory.reduce((a,b) => a+b, 0) / pingHistory.length;

      // Actualizar KPI packet loss con datos reales
      const realPL = (realMetrics.failedPings / Math.max(1, realMetrics.totalPings) * 100);
      const plEl = document.getElementById('kpi-loss');
      if (plEl) plEl.innerHTML = `${realPL.toFixed(3)}<small>%</small>`;

      const plTrendEl = document.getElementById('kpi-loss-trend');
      if (plTrendEl) {
        plTrendEl.textContent = `${realMetrics.failedPings} fallos / ${realMetrics.totalPings} total`;
        plTrendEl.className = `kpi-trend ${realPL < 1 ? 'green' : 'red'}`;
      }

      // Actualizar latency chart con dato real
      if (typeof latencyChart !== 'undefined' && latencyChart) {
        const data = latencyChart.data.datasets[0];
        if (data.data.length >= 30) data.data.shift();
        data.data.push(ms);
        data.backgroundColor = data.data.map(v => {
          if (v < 40)  return 'rgba(0,230,118,0.75)';
          if (v < 80)  return 'rgba(255,196,0,0.75)';
          if (v < 120) return 'rgba(255,140,0,0.75)';
          return 'rgba(255,61,61,0.75)';
        });
        latencyChart.update('none');
      }

      // Alerta si latencia alta
      if (ms > 200 && monitoringActive) {
        addRealAlert('HIGH', `Latencia elevada: ${ms}ms`, 'Google Relay — umbral 200ms superado', 'INET-MON');
      }

      // Actualizar Google Relay KPI
      const grEl = document.getElementById('kpi-google-relay');
      if (grEl) {
        grEl.innerHTML = `${ms} <small>ms</small>`;
        grEl.className = `kpi-value ${ms < 80 ? '' : ms < 150 ? 'yellow' : 'red'}`;
      }
    }
  }

  /* ── Ping real a Google ── */
  function doPing() {
    pingTotalCount++;
    realMetrics.totalPings++;
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
      if (!pingOnline) {
        // Recuperó conexión
        const downDur = lastOkTime ? Math.round((Date.now() - new Date(lastOkTime.replace(' UTC','')).getTime()) / 1000) : 0;
        if (downDur > 5) addRealAlert('INFO', 'Conexión restaurada', `Downtime: ${downDur}s — Ping actual: ${ms}ms`, 'INET-MON');
      }
      pingFailCount = 0;
      pingOnline    = true;
      lastOkTime    = new Date().toISOString().replace('T',' ').substring(0,19) + ' UTC';
      updatePingUI(true, ms);

      if (alertActive) { hideInetAlert(); playOnlineSound(); }

      const dot  = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (dot)  dot.className = 'blink-dot green';
      if (text) { text.textContent = 'OPERATIONAL'; text.style.color = 'var(--accent-green)'; }

      // Actualizar "Google Relay" en satélite
      updateSatelliteData(ms);

    } else {
      pingFailCount++;
      realMetrics.failedPings++;
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

  /* ── Iniciar / Detener monitoreo ── */
  function startMonitoring() {
    if (pingIntervalId) clearInterval(pingIntervalId);
    realMetrics.onlineSince = new Date().toISOString();
    doPing();
    pingIntervalId = setInterval(doPing, pingIntervalMs);

    // UI — NUNCA se oculta la barra, solo cambia estado
    const bar  = document.getElementById('monitoringBar');
    const btn  = document.getElementById('monitorBtn');
    const txt  = document.getElementById('monitorBtnText');
    const bdg  = document.getElementById('monStatusBadge');
    const bdot = document.getElementById('monStatusDot');
    const blbl = document.getElementById('monStatusLabel');
    if (bar)  bar.classList.add('active-monitoring');
    if (btn)  btn.classList.remove('inactive');
    if (txt)  txt.textContent = 'DETENER MONITOREO';
    if (bdg)  bdg.classList.remove('offline');
    if (bdot) bdot.className = 'blink-dot green';
    if (blbl) blbl.textContent = 'ACTIVO';

    addRealAlert('INFO', 'Sistema de monitoreo iniciado', `Intervalo: ${pingIntervalMs}ms — Umbral alarma: ${failThreshold} fallos`, 'SISTEMA');
  }

  function stopMonitoring() {
    if (pingIntervalId) { clearInterval(pingIntervalId); pingIntervalId = null; }
    hideInetAlert();

    // UI — la barra SIGUE visible
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

    addRealAlert('INFO', 'Monitoreo detenido manualmente', `Total pings: ${pingTotalCount} — Fallos: ${realMetrics.failedPings}`, 'SISTEMA');
  }

  window.toggleMonitoring = function() {
    getAudioCtx();
    monitoringActive = !monitoringActive;
    if (monitoringActive) startMonitoring();
    else stopMonitoring();
  };

  window.updateVolume = function(val) {
    alarmVolume = val / 100;
    const el = document.getElementById('volumeVal');
    if (el) el.textContent = `${val}%`;
  };

  window.setThreshold = function(n) {
    failThreshold = n;
    document.querySelectorAll('.mon-threshold-btn').forEach(btn => {
      if (['1','2','3','5'].includes(btn.textContent.trim())) {
        btn.classList.toggle('active', parseInt(btn.textContent) === n);
      }
    });
    const tEl = document.getElementById('inet-fail-threshold');
    if (tEl) tEl.textContent = n;
  };

  window.setPingInterval = function(ms) {
    pingIntervalMs = ms;
    const labels = { 1000:'1s', 2000:'2s', 5000:'5s' };
    document.querySelectorAll('.mon-threshold-btns .mon-threshold-btn').forEach(btn => {
      if (Object.values(labels).includes(btn.textContent.trim())) {
        btn.classList.toggle('active', btn.textContent.trim() === labels[ms]);
      }
    });
    if (monitoringActive) startMonitoring();
  };

  document.addEventListener('click', () => { getAudioCtx(); }, { once: true });


  /* ══════════════════════════════════════════════
     3. SISTEMA DE ALERTAS REALES
  ══════════════════════════════════════════════ */
  const alertQueue  = [];
  const MAX_ALERTS  = 8;
  let alertIdCnt    = 0;

  const alertLevelOrder = { 'CRITICAL':0, 'HIGH':1, 'MEDIUM':2, 'LOW':3, 'INFO':4 };

  function addRealAlert(level, title, meta, source) {
    const now = new Date();
    const timeStr = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;
    alertQueue.unshift({ id: ++alertIdCnt, level, title, meta, source, time: timeStr, ts: Date.now() });
    if (alertQueue.length > MAX_ALERTS) alertQueue.pop();
    renderAlerts();
    addEventRow(level, title, source, meta);
  }

  function renderAlerts() {
    const container = document.getElementById('alerts-container');
    if (!container) return;
    container.innerHTML = '';

    // Ordenar: críticos primero
    const sorted = [...alertQueue].sort((a,b) => (alertLevelOrder[a.level]||5) - (alertLevelOrder[b.level]||5));

    sorted.slice(0, 5).forEach(al => {
      const item = document.createElement('div');
      item.className = `alert-item ${al.level.toLowerCase()}`;
      item.innerHTML = `
        <div class="alert-badge">${al.level}</div>
        <div class="alert-body">
          <div class="alert-title">${al.title}</div>
          <div class="alert-meta">${al.meta}</div>
        </div>
        <div class="alert-time">${al.time}</div>`;
      container.appendChild(item);
    });

    // Si no hay alertas
    if (alertQueue.length === 0) {
      container.innerHTML = `<div style="padding:12px 10px;font-family:var(--font-mono);font-size:10px;color:var(--accent-green);text-align:center">✓ Sin alertas activas</div>`;
    }

    // Actualizar contador en sidebar
    const alertNav = document.querySelector('[data-page="alerts"] .nav-label');
    if (alertNav) {
      const critCount = alertQueue.filter(a => a.level === 'CRITICAL').length;
      alertNav.textContent = critCount > 0 ? `ALERTS (${critCount})` : 'ALERTS';
    }
  }

  /* Tabla de eventos recientes */
  const eventsBuffer = [];
  function addEventRow(sev, event, source, details) {
    const now = new Date();
    const timeStr = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
    eventsBuffer.unshift({ timeStr, sev, event, source, details });
    if (eventsBuffer.length > 20) eventsBuffer.pop();
    renderEventsTable();
  }

  function renderEventsTable() {
    const tbody = document.getElementById('events-tbody');
    if (!tbody) return;
    const sevClass = { 'CRITICAL':'critical','HIGH':'high','MEDIUM':'medium','LOW':'low','INFO':'info' };
    tbody.innerHTML = eventsBuffer.slice(0, 10).map(ev => `
      <tr>
        <td>${ev.timeStr}</td>
        <td><span class="badge ${sevClass[ev.sev]||'info'}">${ev.sev}</span></td>
        <td>${ev.event}</td>
        <td class="hide-sm">${ev.source}</td>
        <td class="detail-col hide-md">${ev.details}</td>
      </tr>`).join('');
  }

  // Inicializar con eventos del sistema
  addEventRow('INFO', 'Sistema iniciado', 'NASOC-v3', 'Dashboard cargado correctamente');
  addEventRow('INFO', 'Mapa de nodos cargado', 'MAP-ENGINE', 'Cuba: 27 nodos activos');
  addEventRow('MEDIUM', 'Esperando monitoreo activo', 'INET-MON', 'Presione ACTIVAR MONITOREO');


  /* ══════════════════════════════════════════════
     4. THREAT BARS
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
     5. SYSTEM HEALTH DONUT — DINÁMICO
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

  // El 92% es dinámico
  function updateHealthDonut(hNet, hSrv, hLnk, hSec) {
    const avg = Math.round((hNet + hSrv + hLnk + hSec) / 4);
    ['h-net','h-srv','h-lnk','h-sec'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) {
        const val = [hNet,hSrv,hLnk,hSec][i];
        el.textContent = val + '%';
        el.className = `hval ${val >= 90 ? 'green' : val >= 70 ? 'yellow' : 'red'}`;
      }
    });
    const pctEl = document.getElementById('health-pct-num');
    if (pctEl) {
      pctEl.textContent = avg + '%';
      pctEl.style.color = avg >= 90 ? 'var(--accent-green)' : avg >= 70 ? 'var(--accent-yellow)' : 'var(--accent-red)';
    }
    healthChart.data.datasets[0].data[0] = avg;
    healthChart.data.datasets[0].data[1] = 100 - avg;
    healthChart.data.datasets[0].backgroundColor[0] =
      avg >= 90 ? '#00e676' : avg >= 70 ? '#ffc400' : '#ff3d3d';
    healthChart.update('none');
  }


  /* ══════════════════════════════════════════════
     6. SPARKLINE
  ══════════════════════════════════════════════ */
  const sparkData = [1.8, 2.1, 1.9, 2.4, 2.2, 2.6, 2.5, 2.8, 2.7, 2.84];
  new Chart(document.getElementById('sparkline1'), {
    type: 'line',
    data: {
      labels: sparkData.map((_,i) => i),
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
     7. NETWORK TRAFFIC CHART (24H)
  ══════════════════════════════════════════════ */
  const trafficHistory = [1.4, 1.8, 2.2, 1.6, 1.3, 2.0, 2.5, 2.7, 2.84];
  const trafficLabels  = ['14:00','18:00','22:00','02:00','06:00','08:00','10:00','12:00','NOW'];

  const trafficChart = new Chart(document.getElementById('trafficChart'), {
    type: 'line',
    data: {
      labels: [...trafficLabels],
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
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(3)} Tbps` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(18,32,64,0.5)' }, ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } } },
        y: {
          min: 0, max: 3.5,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 }, callback: v => v.toFixed(1) }
        }
      },
      animation: { duration: 400 }
    }
  });


  /* ══════════════════════════════════════════════
     8. LATENCY CHART — se actualiza con pings reales
  ══════════════════════════════════════════════ */
  const latencyHistoryInit = Array(18).fill(0).map(() => Math.round(20 + Math.random() * 30));
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
        borderWidth: 0, borderRadius: 1
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: {
        enabled: true,
        callbacks: { label: ctx => ` ${ctx.parsed.y} ms (ping real)` }
      }},
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          min: 0, max: 300,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 8 }, maxTicksLimit: 4 }
        }
      },
      animation: { duration: 400 }
    }
  });

  // Gradiente debajo del heatmap
  const lhPanel = document.querySelector('.latency-heatmap-panel');
  if (lhPanel) {
    const gradBar = document.createElement('div');
    gradBar.style.cssText = 'margin:0 10px 4px;height:4px;border-radius:2px;background:linear-gradient(90deg,#00e676 0%,#ffc400 40%,#ff8c00 70%,#ff3d3d 100%);position:relative;z-index:2;';
    const gradLabels = document.createElement('div');
    gradLabels.style.cssText = 'margin:0 10px 4px;display:flex;justify-content:space-between;font-size:8px;font-family:"Share Tech Mono",monospace;color:#3a5880;position:relative;z-index:2;';
    gradLabels.innerHTML = '<span>0 ms</span><span>Pings reales</span><span>300+ ms</span>';
    lhPanel.appendChild(gradBar);
    lhPanel.appendChild(gradLabels);
  }


  /* ══════════════════════════════════════════════
     9. PROTOCOL DISTRIBUTION DONUT
  ══════════════════════════════════════════════ */
  const protoData = [58, 21, 8, 7, 6];
  const protoChart = new Chart(document.getElementById('protocolDonut'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [...protoData],
        backgroundColor: ['#1a6fff','#22d3ee','#f59e0b','#10b981','#6366f1'],
        borderWidth: 1, borderColor: '#0a1120', hoverOffset: 3
      }]
    },
    options: {
      cutout: '60%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 1000 }
    }
  });


  /* ══════════════════════════════════════════════
     10. PACKET LOSS CHART — datos reales calculados
  ══════════════════════════════════════════════ */
  const packetHistory = Array(9).fill(0);
  const packetChart = new Chart(document.getElementById('packetChart'), {
    type: 'line',
    data: {
      labels: ['T-8','T-7','T-6','T-5','T-4','T-3','T-2','T-1','NOW'],
      datasets: [{
        data: [...packetHistory],
        borderColor: '#00c8ff',
        backgroundColor: 'rgba(0,200,255,0.06)',
        borderWidth: 1.5,
        pointRadius: 2,
        pointBackgroundColor: '#00c8ff',
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
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(3)} % (real)` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(18,32,64,0.5)' }, ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } } },
        y: {
          min: 0,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 }, callback: v => v.toFixed(2) + '%' }
        }
      },
      animation: { duration: 400 }
    }
  });

  // Actualizar packet loss chart con datos reales cada ping
  let packetSampleCnt = 0;
  function updatePacketLossChart() {
    packetSampleCnt++;
    const realPL = (realMetrics.failedPings / Math.max(1, realMetrics.totalPings) * 100);
    if (packetChart.data.datasets[0].data.length >= 24) {
      packetChart.data.datasets[0].data.shift();
      packetChart.data.labels.shift();
    }
    packetChart.data.datasets[0].data.push(+realPL.toFixed(3));
    const now = new Date();
    packetChart.data.labels.push(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`);
    packetChart.update('none');
  }


  /* ══════════════════════════════════════════════
     11. LEAFLET MAP — NODOS CUBA COMPLETOS
     - Camagüey: 3 nodos
     - Florida (municipio Camagüey): 2 nodos
     - Ciego de Ávila: 4 nodos
     - Santa Clara: 3 nodos
     - La Habana: 8 nodos
     - Las Tunas: 3 nodos
     - Holguín: 4 nodos
     Total Cuba: 27 nodos
  ══════════════════════════════════════════════ */
  const map = L.map('worldMap', {
    center: [22.0, -79.5],
    zoom: 6,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    dragging: true,
    doubleClickZoom: true
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 12, minZoom: 2
  }).addTo(map);

  const nodes = [
    // ── LA HABANA (8 nodos) ──
    { id: 'HAB-NOC',   name: 'LA HABANA — NOC PRINCIPAL\nNodo Central Nacional',       lat: 23.136, lng: -82.358, type: 'gateway',   region: 'habana' },
    { id: 'HAB-GW1',   name: 'LA HABANA — GATEWAY NORTE\nVedado Data Center',           lat: 23.148, lng: -82.390, type: 'data',      region: 'habana' },
    { id: 'HAB-GW2',   name: 'LA HABANA — RELAY ESTE\nGuanabacoa Link Node',            lat: 23.121, lng: -82.290, type: 'data',      region: 'habana' },
    { id: 'HAB-SAT',   name: 'LA HABANA — SAT UPLINK\nEstación Terrena Principal',      lat: 23.160, lng: -82.425, type: 'satellite', region: 'habana' },
    { id: 'HAB-FW',    name: 'LA HABANA — FIREWALL NODE\nSeguridad Perimetral',         lat: 23.108, lng: -82.340, type: 'ground',    region: 'habana' },
    { id: 'HAB-DIST1', name: 'LA HABANA — DISTRIBUCIÓN OESTE\nPlaya Hub',              lat: 23.142, lng: -82.450, type: 'ground',    region: 'habana' },
    { id: 'HAB-DIST2', name: 'LA HABANA — DISTRIBUCIÓN SUR\nCerro/10 Octubre Hub',     lat: 23.088, lng: -82.358, type: 'data',      region: 'habana' },
    { id: 'HAB-CABO',  name: 'CABO DE SAN ANTONIO — UPLINK SAT\nExtensión Habana W',   lat: 21.870, lng: -84.960, type: 'satellite', region: 'habana' },

    // ── CAMAGÜEY (3 nodos) ──
    { id: 'CAM-1',     name: 'CAMAGÜEY — NODO PRINCIPAL\nCentro Ciudad',               lat: 21.383, lng: -77.920, type: 'gateway',   region: 'camaguey' },
    { id: 'CAM-2',     name: 'CAMAGÜEY — RELAY SUR\nCamagüey Industrial Zone',         lat: 21.350, lng: -77.890, type: 'data',      region: 'camaguey' },
    { id: 'CAM-3',     name: 'CAMAGÜEY — ENLACE NORTE\nNuevitas Coastal Link',         lat: 21.540, lng: -77.270, type: 'ground',    region: 'camaguey' },

    // ── FLORIDA (municipio Camagüey, 2 nodos) ──
    { id: 'FLA-1',     name: 'FLORIDA — NODO MUNICIPAL\nCamagüey Province Hub',        lat: 21.531, lng: -78.231, type: 'data',      region: 'camaguey' },
    { id: 'FLA-2',     name: 'FLORIDA — RELAY NORTE\nEnlace Ciego-Camagüey',           lat: 21.560, lng: -78.180, type: 'ground',    region: 'camaguey' },

    // ── CIEGO DE ÁVILA (4 nodos) ──
    { id: 'CIA-1',     name: 'CIEGO DE ÁVILA — NODO CENTRAL\nHub Provincial',          lat: 21.852, lng: -78.760, type: 'gateway',   region: 'ciego' },
    { id: 'CIA-2',     name: 'CIEGO DE ÁVILA — ENLACE NORTE\nMorón Coastal Node',      lat: 22.100, lng: -78.620, type: 'ground',    region: 'ciego' },
    { id: 'CIA-3',     name: 'CIEGO DE ÁVILA — RELAY SUR\nJiguaní Link',               lat: 21.650, lng: -78.820, type: 'data',      region: 'ciego' },
    { id: 'CIA-4',     name: 'CIEGO DE ÁVILA — SAT TERRENA\nEstación Regional',        lat: 21.900, lng: -78.900, type: 'satellite', region: 'ciego' },

    // ── SANTA CLARA (3 nodos) ──
    { id: 'STC-1',     name: 'SANTA CLARA — NODO CENTRAL\nVilla Clara Hub',            lat: 22.406, lng: -79.965, type: 'gateway',   region: 'santa_clara' },
    { id: 'STC-2',     name: 'SANTA CLARA — RELAY NORTE\nSagua la Grande Link',        lat: 22.620, lng: -80.070, type: 'data',      region: 'santa_clara' },
    { id: 'STC-3',     name: 'SANTA CLARA — ENLACE CENTRO\nCienfuegos Corridor',       lat: 22.150, lng: -80.110, type: 'ground',    region: 'santa_clara' },

    // ── LAS TUNAS (3 nodos) ──
    { id: 'LTU-1',     name: 'LAS TUNAS — NODO PRINCIPAL\nHub Provincial Norte',       lat: 20.964, lng: -76.958, type: 'gateway',   region: 'las_tunas' },
    { id: 'LTU-2',     name: 'LAS TUNAS — RELAY ESTE\nPuerto Padre Link',              lat: 21.195, lng: -76.595, type: 'data',      region: 'las_tunas' },
    { id: 'LTU-3',     name: 'LAS TUNAS — ENLACE OESTE\nJobabo Distribution',          lat: 20.870, lng: -77.280, type: 'ground',    region: 'las_tunas' },

    // ── HOLGUÍN (4 nodos) ──
    { id: 'HOL-1',     name: 'HOLGUÍN — NODO CENTRAL\nHub Provincial',                 lat: 20.888, lng: -76.258, type: 'gateway',   region: 'holguin' },
    { id: 'HOL-2',     name: 'HOLGUÍN — SAT UPLINK\nEstación Satelital Este',          lat: 20.910, lng: -76.130, type: 'satellite', region: 'holguin' },
    { id: 'HOL-3',     name: 'HOLGUÍN — RELAY SUR\nBayamo Corridor',                   lat: 20.680, lng: -76.380, type: 'data',      region: 'holguin' },
    { id: 'HOL-4',     name: 'HOLGUÍN — NORTE COASTAL\nGibara Coastal Node',           lat: 21.107, lng: -76.133, type: 'ground',    region: 'holguin' },

    // ── Nodos internacionales / NASA ──
    { id: 'MIAMI',     name: 'MIAMI — SATELLITE UPLINK\nFlorida USA',                  lat: 25.770, lng: -80.190, type: 'satellite', region: 'ext' },
    { id: 'KSC',       name: 'KSC/SCCN — GREENBELT MD\nNASA Comms Hub',               lat: 38.990, lng: -76.850, type: 'gateway',   region: 'ext' },
    { id: 'MSFC',      name: 'MSFC — MARSHALL SPACE FLIGHT\nHuntsville AL',            lat: 34.730, lng: -86.640, type: 'data',      region: 'ext' },
    { id: 'DSN_MAD',   name: 'DSN-MAD — DEEP SPACE MADRID\nRota Spain',               lat: 40.430, lng: -4.250,  type: 'satellite', region: 'ext' },
    { id: 'BOGOTA',    name: 'BOGOTA — COLOMBIA RELAY\nSA Hub',                        lat: 4.710,  lng: -74.070, type: 'data',      region: 'ext' },
  ];

  const typeColors = {
    ground:    '#00e676',
    data:      '#00c8ff',
    gateway:   '#9b59ff',
    satellite: '#ffc400'
  };

  function makeIcon(color, size = 12, pulse = false) {
    const outer = pulse
      ? `box-shadow:0 0 14px ${color},0 0 28px ${color}88,0 0 4px ${color};`
      : `box-shadow:0 0 6px ${color};`;
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:${color};
        border:2px solid rgba(255,255,255,0.7);
        ${outer}
        cursor:pointer;
        transition: box-shadow 0.3s;
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2]
    });
  }

  const cubaRegions = new Set(['habana','camaguey','ciego','santa_clara','las_tunas','holguin']);

  nodes.forEach(n => {
    const color  = typeColors[n.type];
    const isCuba = cubaRegions.has(n.region);
    const isGateway = n.type === 'gateway';
    const size   = isCuba ? (isGateway ? 16 : 12) : 10;
    L.marker([n.lat, n.lng], { icon: makeIcon(color, size, isCuba && isGateway) })
      .addTo(map)
      .bindTooltip(
        `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#cde4ff;background:#080e1a;border:1px solid #1e3a6e;padding:4px 8px;border-radius:2px;white-space:pre;line-height:1.6">${n.name}</div>`,
        { direction: 'top', offset: [0, -10], opacity: 1, className: '' }
      );
  });

  // Conexiones entre todos los nodos cubanos
  const links = [
    // ── La Habana interna ──
    ['HAB-NOC',  'HAB-GW1',   '#9b59ff'],
    ['HAB-NOC',  'HAB-GW2',   '#9b59ff'],
    ['HAB-NOC',  'HAB-SAT',   '#ffc400'],
    ['HAB-NOC',  'HAB-FW',    '#9b59ff'],
    ['HAB-NOC',  'HAB-DIST1', '#9b59ff'],
    ['HAB-NOC',  'HAB-DIST2', '#9b59ff'],
    ['HAB-GW1',  'HAB-DIST1', '#00c8ff'],
    ['HAB-GW2',  'HAB-DIST2', '#00c8ff'],
    ['HAB-NOC',  'HAB-CABO',  '#ffc400'],
    // ── Habana → otras provincias ──
    ['HAB-NOC',  'STC-1',     '#1a6fff'],
    ['HAB-GW2',  'CIA-1',     '#1a6fff'],
    // ── Santa Clara interna ──
    ['STC-1',    'STC-2',     '#9b59ff'],
    ['STC-1',    'STC-3',     '#9b59ff'],
    // ── Santa Clara ↔ Ciego ──
    ['STC-1',    'CIA-1',     '#1a6fff'],
    ['STC-2',    'CIA-2',     '#00c8ff'],
    // ── Ciego de Ávila interna ──
    ['CIA-1',    'CIA-2',     '#9b59ff'],
    ['CIA-1',    'CIA-3',     '#9b59ff'],
    ['CIA-1',    'CIA-4',     '#ffc400'],
    ['CIA-2',    'CIA-4',     '#00c8ff'],
    // ── Ciego ↔ Camagüey ──
    ['CIA-1',    'CAM-1',     '#1a6fff'],
    ['CIA-3',    'FLA-1',     '#00c8ff'],
    // ── Florida municipal ──
    ['FLA-1',    'FLA-2',     '#9b59ff'],
    ['FLA-1',    'CAM-1',     '#00c8ff'],
    ['FLA-2',    'CAM-2',     '#00c8ff'],
    // ── Camagüey interna ──
    ['CAM-1',    'CAM-2',     '#9b59ff'],
    ['CAM-1',    'CAM-3',     '#9b59ff'],
    ['CAM-2',    'CAM-3',     '#00c8ff'],
    // ── Camagüey ↔ Las Tunas ──
    ['CAM-1',    'LTU-1',     '#1a6fff'],
    ['CAM-3',    'LTU-2',     '#00c8ff'],
    // ── Las Tunas interna ──
    ['LTU-1',    'LTU-2',     '#9b59ff'],
    ['LTU-1',    'LTU-3',     '#9b59ff'],
    ['LTU-2',    'LTU-3',     '#00c8ff'],
    // ── Las Tunas ↔ Holguín ──
    ['LTU-1',    'HOL-1',     '#1a6fff'],
    ['LTU-2',    'HOL-4',     '#00c8ff'],
    // ── Holguín interna ──
    ['HOL-1',    'HOL-2',     '#ffc400'],
    ['HOL-1',    'HOL-3',     '#9b59ff'],
    ['HOL-1',    'HOL-4',     '#9b59ff'],
    ['HOL-2',    'HOL-4',     '#00c8ff'],
    // ── Cuba → exterior ──
    ['HAB-SAT',  'MIAMI',     '#1a6fff'],
    ['HAB-CABO', 'MIAMI',     '#ffc400'],
    ['CIA-4',    'MIAMI',     '#ffc400'],
    ['HOL-2',    'BOGOTA',    '#00e676'],
    // ── Exterior / NASA ──
    ['MIAMI',    'KSC',       '#1a6fff'],
    ['KSC',      'MSFC',      '#1a6fff'],
    ['KSC',      'DSN_MAD',   '#9b59ff'],
    ['BOGOTA',   'MSFC',      '#00c8ff'],
  ];

  links.forEach(([a, b, color]) => {
    const na = nodes.find(n => n.id === a);
    const nb = nodes.find(n => n.id === b);
    if (!na || !nb) return;
    const coords = [[na.lat, na.lng], [nb.lat, nb.lng]];
    try {
      if (window.L && L.polyline.antPath) {
        L.polyline.antPath(coords, {
          delay: 600 + Math.random() * 800,
          dashArray: [8, 18],
          weight: 1.8,
          color: color,
          pulseColor: '#ffffff',
          opacity: 0.75
        }).addTo(map);
      } else {
        L.polyline(coords, { color, weight: 1.5, opacity: 0.6, dashArray: '6 10' }).addTo(map);
      }
    } catch(e) {
      L.polyline(coords, { color, weight: 1.5, opacity: 0.6, dashArray: '6 10' }).addTo(map);
    }
  });

  // Botón "Next Map" — cicla entre vistas
  const mapViews = [
    { center: [22.0, -79.5], zoom: 6,  label: 'CUBA COMPLETA' },
    { center: [23.13, -82.35], zoom: 10, label: 'LA HABANA' },
    { center: [21.38, -77.92], zoom: 9,  label: 'CAMAGÜEY/FLORIDA' },
    { center: [21.0, -76.5],   zoom: 9,  label: 'LAS TUNAS / HOLGUÍN' },
    { center: [22.0, -79.5],   zoom: 4,  label: 'REGIÓN CARIBE' },
  ];
  let mapViewIdx = 0;
  window.nextMapView = function() {
    mapViewIdx = (mapViewIdx + 1) % mapViews.length;
    const v = mapViews[mapViewIdx];
    map.flyTo(v.center, v.zoom, { duration: 1.2 });
    addRealAlert('INFO', `Vista mapa: ${v.label}`, 'MAP-ENGINE', `Zoom ${v.zoom} — Centro ${v.center}`);
  };


  /* ══════════════════════════════════════════════
     12. SATELLITE VISUALIZATION + DATOS REALES
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
  <circle cx="120" cy="110" r="82" fill="url(#glowG)"/>
  <circle cx="120" cy="110" r="52" fill="url(#earthG)" stroke="#1a3a7a" stroke-width="1.5"/>
  <path d="M96 90 Q108 80 120 85 Q134 82 138 94 Q128 106 112 104 Q96 102 96 90Z" fill="#0f3a6a" opacity="0.85"/>
  <path d="M82 102 Q93 97 100 105 Q95 115 84 112Z" fill="#0f3a6a" opacity="0.7"/>
  <path d="M130 100 Q142 95 150 103 Q145 114 133 112Z" fill="#0f3a6a" opacity="0.65"/>
  <path d="M100 116 Q108 112 114 118 Q110 126 102 124Z" fill="#0f3a6a" opacity="0.5"/>
  <!-- Cuba marker -->
  <circle cx="108" cy="108" r="3" fill="#ffc400" opacity="0.9" filter="url(#glow)"/>
  <line x1="68" y1="110" x2="172" y2="110" stroke="#1a6fff" stroke-width="0.5" opacity="0.4" stroke-dasharray="2 3"/>
  <ellipse cx="120" cy="110" rx="82" ry="24" fill="none" stroke="#1a6fff" stroke-width="0.7" stroke-dasharray="4 5" opacity="0.4"/>
  <ellipse cx="120" cy="110" rx="75" ry="40" fill="none" stroke="#9b59ff" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.25" transform="rotate(-30 120 110)"/>
  <!-- TDRS-1 -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 16s linear infinite;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#00c8ff" opacity="0.95" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.9"/>
    </g>
  </g>
  <!-- TDRS-2 -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 16s linear infinite; animation-delay:-5.33s;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#00c8ff" opacity="0.9" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.85"/>
    </g>
  </g>
  <!-- TDRS-3 -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 16s linear infinite; animation-delay:-10.67s;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#00c8ff" opacity="0.88" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.8"/>
    </g>
  </g>
  <!-- TDRS-5 maintenance -->
  <g style="transform-origin:120px 110px; animation: spin-orbit 44s linear infinite reverse;">
    <g transform="translate(202,110)">
      <rect x="-8" y="-3" width="16" height="6" rx="1.5" fill="#ffc400" opacity="0.9" filter="url(#glow)"/>
      <rect x="-16" y="-1.5" width="7" height="3" rx="1" fill="#ff8c00"/>
      <rect x="9"  y="-1.5" width="7" height="3" rx="1" fill="#ff8c00"/>
      <circle cx="0" cy="0" r="2.5" fill="#fff" opacity="0.75"/>
    </g>
  </g>
  <!-- Telemetría satélite — datos reales -->
  <text x="10" y="200" font-family="Share Tech Mono" font-size="7" fill="#3a5880">PING:</text>
  <text id="sat-ping-text" x="35" y="200" font-family="Share Tech Mono" font-size="7" fill="#00c8ff">-- ms</text>
  <text x="90" y="200" font-family="Share Tech Mono" font-size="7" fill="#3a5880">LOSS:</text>
  <text id="sat-loss-text" x="115" y="200" font-family="Share Tech Mono" font-size="7" fill="#00e676">0.000%</text>
  <text x="165" y="200" font-family="Share Tech Mono" font-size="7" fill="#3a5880">MON:</text>
  <text id="sat-mon-text" x="190" y="200" font-family="Share Tech Mono" font-size="7" fill="#ff3d3d">OFF</text>
</svg>`;

  const satViz = document.getElementById('satViz');
  if (satViz) satViz.innerHTML = satSvg;

  function updateSatelliteData(pingMs) {
    const satPingEl = document.getElementById('sat-ping-text');
    const satLossEl = document.getElementById('sat-loss-text');
    const satMonEl  = document.getElementById('sat-mon-text');
    const realPL = (realMetrics.failedPings / Math.max(1, realMetrics.totalPings) * 100);

    if (satPingEl) {
      satPingEl.textContent = pingMs ? `${pingMs}ms` : '-- ms';
      satPingEl.setAttribute('fill', pingMs < 80 ? '#00e676' : pingMs < 150 ? '#ffc400' : '#ff3d3d');
    }
    if (satLossEl) {
      satLossEl.textContent = `${realPL.toFixed(2)}%`;
      satLossEl.setAttribute('fill', realPL < 1 ? '#00e676' : realPL < 5 ? '#ffc400' : '#ff3d3d');
    }
    if (satMonEl) {
      satMonEl.textContent = monitoringActive ? 'ON' : 'OFF';
      satMonEl.setAttribute('fill', monitoringActive ? '#00e676' : '#ff3d3d');
    }
  }


  /* ══════════════════════════════════════════════
     13. SIMULACIÓN DE FONDO + DATOS REALES (cada 3s)
     Los KPIs que no dependen del ping real usan
     variación dinámica con base en estado real
  ══════════════════════════════════════════════ */
  function rnd(base, range) {
    return +(base + (Math.random() - 0.5) * range).toFixed(3);
  }

  // Escalado real de tráfico basado en nodos activos Cuba
  let baseTraffic = 2.841;
  let nodesActive = 27;

  setInterval(() => {
    // Ajustar base de tráfico si monitoreo activo
    if (monitoringActive) {
      baseTraffic = Math.max(1.5, Math.min(3.2, baseTraffic + (Math.random() - 0.48) * 0.08));
    }

    const tr = rnd(baseTraffic, 0.12);
    const cn = Math.round(rnd(12641, 150));

    // Traffic KPI
    const trEl = document.getElementById('kpi-traffic');
    if (trEl) trEl.innerHTML = tr.toFixed(3) + ' <small>Tbps</small>';

    // Connections KPI
    const cnEl = document.getElementById('kpi-conn');
    if (cnEl) cnEl.textContent = cn.toLocaleString();

    // Total Nodes — 27 Cuba + externos
    const totalNodes = nodesActive + 8;
    const ndEl = document.getElementById('kpi-nodes');
    if (ndEl) ndEl.textContent = totalNodes.toLocaleString();
    const ndTrendEl = document.getElementById('kpi-nodes-trend');
    if (ndTrendEl) { ndTrendEl.textContent = `${nodesActive} nodos Cuba activos`; ndTrendEl.className = 'kpi-trend green'; }

    // Push traffic chart
    if (trafficChart.data.datasets[0].data.length >= 30) {
      trafficChart.data.datasets[0].data.shift();
      trafficChart.data.labels.shift();
    }
    trafficChart.data.datasets[0].data.push(tr);
    const now = new Date();
    trafficChart.data.labels.push(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`);
    trafficChart.update('none');

    // Packet loss chart (datos reales del ping)
    updatePacketLossChart();

    // Health dinámico basado en estado real
    const baseHealth = monitoringActive && pingOnline ? 92 : 75;
    const penaltyFail = Math.min(30, pingFailCount * 5);
    const hNet = Math.max(50, Math.round(rnd(baseHealth - penaltyFail, 3)));
    const hSrv = Math.max(50, Math.round(rnd(89, 3)));
    const hLnk = Math.max(50, Math.round(rnd(baseHealth - penaltyFail/2, 2)));
    const hSec = Math.max(50, Math.round(rnd(91, 2)));
    updateHealthDonut(hNet, hSrv, hLnk, hSec);

    // Link latencies dinámicas
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

    // Alertas automáticas basadas en datos reales
    const realPL = (realMetrics.failedPings / Math.max(1, realMetrics.totalPings) * 100);
    if (monitoringActive && realPL > 5 && Math.random() < 0.15) {
      addRealAlert('HIGH', `Packet Loss elevado: ${realPL.toFixed(2)}%`, `${realMetrics.failedPings} fallos / ${realMetrics.totalPings} pings`, 'INET-MON');
    }

    // Actualizar satellite panel
    updateSatelliteData(lastRealPingMs);

  }, 3000);


  /* ══════════════════════════════════════════════
     14. SIDEBAR NAV — TOTALMENTE FUNCIONAL
  ══════════════════════════════════════════════ */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const page = item.getAttribute('data-page');
      handleNavPage(page);
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  function handleNavPage(page) {
    const content = document.querySelector('.content');
    if (!content) return;

    // Resaltar breve efecto de transición
    content.style.opacity = '0.7';
    setTimeout(() => { content.style.opacity = '1'; }, 200);

    switch(page) {
      case 'network':
        // Hacer zoom al mapa
        map.flyTo([22.0, -79.5], 6, { duration: 1.0 });
        addRealAlert('INFO', 'Vista: NET MAP', 'NAV', 'Mapa de red activo — Cuba completa');
        break;
      case 'assets':
        addRealAlert('INFO', 'Vista: ASSETS', 'NAV', `${nodesActive} nodos Cuba + 8 nodos externos`);
        showPageModal('ASSETS', buildAssetsContent());
        break;
      case 'telemetry':
        addRealAlert('INFO', 'Vista: TELEMETRY', 'NAV', `Última latencia: ${lastRealPingMs || '--'} ms`);
        showPageModal('TELEMETRICS', buildTelemetryContent());
        break;
      case 'alerts':
        showPageModal('ALERT LOG', buildAlertsContent());
        break;
      case 'performance':
        addRealAlert('INFO', 'Vista: PERFORMANCE', 'NAV', 'Cargando métricas de rendimiento');
        showPageModal('PERFORMANCE', buildPerformanceContent());
        break;
      case 'security':
        addRealAlert('MEDIUM', 'Vista: SECURITY', 'NAV', 'Panel de seguridad activo');
        showPageModal('SECURITY', buildSecurityContent());
        break;
      case 'logs':
        showPageModal('SYSTEM LOGS', buildLogsContent());
        break;
      case 'config':
        showPageModal('CONFIGURATION', buildConfigContent());
        break;
      default:
        break;
    }
  }

  /* ── Modal de páginas ── */
  function showPageModal(title, html) {
    const existing = document.getElementById('page-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'page-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    `;
    modal.innerHTML = `
      <div style="
        background: #080e1a; border: 1px solid #1e3a6e;
        max-width: 800px; width: 100%; max-height: 80vh;
        overflow-y: auto; border-radius: 4px;
        box-shadow: 0 0 40px rgba(26,111,255,0.2);
      ">
        <div style="
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 16px; border-bottom: 1px solid #122040;
          background: #060c17; position: sticky; top: 0;
        ">
          <span style="font-family:'Orbitron',sans-serif; font-size:12px; font-weight:700; letter-spacing:2px; color:#00c8ff">
            ◈ ${title}
          </span>
          <button onclick="document.getElementById('page-modal').remove()" style="
            background: rgba(255,61,61,0.15); border: 1px solid #ff3d3d;
            color: #ff3d3d; font-size: 12px; padding: 4px 12px; cursor: pointer;
            font-family: 'Orbitron',sans-serif; letter-spacing: 1px;
          ">✕ CERRAR</button>
        </div>
        <div style="padding: 16px;">${html}</div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  const monoStyle = `font-family:'Share Tech Mono',monospace; font-size:10px; color:#6a8db0;`;
  const valStyle  = `font-family:'Share Tech Mono',monospace; font-size:11px; color:#cde4ff;`;
  const greenVal  = `font-family:'Share Tech Mono',monospace; font-size:11px; color:#00e676;`;

  function buildAssetsContent() {
    const cubaNodes = nodes.filter(n => cubaRegions.has(n.region));
    const byRegion = {};
    cubaNodes.forEach(n => { if (!byRegion[n.region]) byRegion[n.region] = []; byRegion[n.region].push(n); });
    const regionNames = { habana:'LA HABANA', camaguey:'CAMAGÜEY + FLORIDA', ciego:'CIEGO DE ÁVILA', santa_clara:'SANTA CLARA', las_tunas:'LAS TUNAS', holguin:'HOLGUÍN' };
    let html = `<div style="${monoStyle} margin-bottom:12px;">Total nodos Cuba: <span style="color:#00e676;font-size:14px;font-weight:700">${cubaNodes.length}</span></div>`;
    Object.entries(byRegion).forEach(([reg, nds]) => {
      html += `<div style="margin-bottom:10px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:9px;color:#1a6fff;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid #122040;padding-bottom:4px">
          ${regionNames[reg] || reg.toUpperCase()} — ${nds.length} nodo${nds.length>1?'s':''}
        </div>
        ${nds.map(n => `
          <div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
            <span style="width:8px;height:8px;border-radius:50%;background:${typeColors[n.type]};display:inline-block;flex-shrink:0;box-shadow:0 0 4px ${typeColors[n.type]}"></span>
            <span style="${valStyle}">${n.id}</span>
            <span style="${monoStyle};flex:1">${n.name.split('\n')[1] || ''}</span>
            <span style="font-size:8px;color:${typeColors[n.type]};font-family:'Share Tech Mono'">${n.type.toUpperCase()}</span>
          </div>`).join('')}
      </div>`;
    });
    return html;
  }

  function buildTelemetryContent() {
    const realPL = (realMetrics.failedPings / Math.max(1, realMetrics.totalPings) * 100);
    const avg = realMetrics.avgLatency ? realMetrics.avgLatency.toFixed(1) : '--';
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle} margin-bottom:8px">LATENCIA GOOGLE (REAL)</div>
          <div style="font-family:'Orbitron';font-size:24px;color:#00c8ff">${lastRealPingMs || '--'} ms</div>
          <div style="${monoStyle}">Min: ${realMetrics.minLatency === Infinity ? '--' : realMetrics.minLatency}ms | Max: ${realMetrics.maxLatency || '--'}ms | Avg: ${avg}ms</div>
        </div>
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle} margin-bottom:8px">PACKET LOSS REAL</div>
          <div style="font-family:'Orbitron';font-size:24px;color:${realPL < 1 ? '#00e676' : '#ff3d3d'}">${realPL.toFixed(3)}%</div>
          <div style="${monoStyle}">${realMetrics.failedPings} fallos / ${realMetrics.totalPings} pings totales</div>
        </div>
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle} margin-bottom:8px">ESTADO MONITOREO</div>
          <div style="font-family:'Orbitron';font-size:14px;color:${monitoringActive?'#00e676':'#ff3d3d'}">${monitoringActive?'ACTIVO':'INACTIVO'}</div>
          <div style="${monoStyle}">Intervalo: ${pingIntervalMs}ms | Umbral: ${failThreshold} fallos</div>
        </div>
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle} margin-bottom:8px">HISTORIAL LATENCIA</div>
          ${pingHistory.slice(-5).reverse().map((ms, i) => `
            <div style="${valStyle} margin-bottom:2px">${i===0?'→':' '} ${ms}ms
              <span style="display:inline-block;width:${Math.min(ms, 200) * 0.6}px;height:3px;background:${ms<80?'#00e676':ms<150?'#ffc400':'#ff3d3d'};margin-left:4px;vertical-align:middle;border-radius:1px"></span>
            </div>`).join('') || `<div style="${monoStyle}">Sin datos — active el monitoreo</div>`}
        </div>
      </div>`;
  }

  function buildAlertsContent() {
    if (alertQueue.length === 0) return `<div style="${greenVal} text-align:center;padding:20px">✓ Sin alertas activas</div>`;
    return alertQueue.map(al => `
      <div style="border-left:3px solid ${
        al.level==='CRITICAL'?'#ff3d3d':al.level==='HIGH'?'#ff8c00':al.level==='MEDIUM'?'#ffc400':al.level==='LOW'?'#00e676':'#00c8ff'
      };padding:8px 12px;margin-bottom:6px;background:rgba(6,12,23,0.6);">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-family:'Orbitron';font-size:9px;font-weight:700;color:${
            al.level==='CRITICAL'?'#ff3d3d':al.level==='HIGH'?'#ff8c00':al.level==='MEDIUM'?'#ffc400':al.level==='LOW'?'#00e676':'#00c8ff'
          }">${al.level}</span>
          <span style="${monoStyle}">${al.time} | ${al.source}</span>
        </div>
        <div style="${valStyle} margin-bottom:2px">${al.title}</div>
        <div style="${monoStyle}">${al.meta}</div>
      </div>`).join('');
  }

  function buildPerformanceContent() {
    const realPL = (realMetrics.failedPings / Math.max(1, realMetrics.totalPings) * 100);
    const uptime = realMetrics.onlineSince
      ? Math.round((Date.now() - new Date(realMetrics.onlineSince).getTime()) / 1000)
      : 0;
    return `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
        ${[
          { l:'UPTIME MON.', v: uptime > 0 ? `${uptime}s` : '--', c:'#00e676' },
          { l:'PINGS TOTAL', v: realMetrics.totalPings, c:'#00c8ff' },
          { l:'TASA ÉXITO', v: realMetrics.totalPings > 0 ? `${(100-realPL).toFixed(1)}%` : '--', c:'#00e676' },
          { l:'LATENCIA AVG', v: realMetrics.avgLatency ? `${realMetrics.avgLatency.toFixed(0)}ms` : '--', c:'#00c8ff' },
          { l:'LATENCIA MIN', v: realMetrics.minLatency !== Infinity ? `${realMetrics.minLatency}ms` : '--', c:'#00e676' },
          { l:'LATENCIA MAX', v: realMetrics.maxLatency || '--', c: (realMetrics.maxLatency||0) > 200 ? '#ff3d3d' : '#ffc400' },
        ].map(item => `
          <div style="background:#0a1120;border:1px solid #122040;padding:10px;text-align:center">
            <div style="${monoStyle}">${item.l}</div>
            <div style="font-family:'Orbitron';font-size:18px;color:${item.c};margin-top:4px">${item.v}</div>
          </div>`).join('')}
      </div>
      <div style="${monoStyle} margin-top:8px">
        Nodos Cuba monitoreados: ${nodesActive} | Conexiones activas: ${links.filter(l => cubaRegions.has((nodes.find(n=>n.id===l[0])||{}).region)).length} enlaces internos
      </div>`;
  }

  function buildSecurityContent() {
    return `
      <div style="margin-bottom:12px">
        <div style="font-family:'Orbitron';font-size:10px;color:#ff3d3d;letter-spacing:2px;margin-bottom:8px">⚠ THREAT ASSESSMENT</div>
        ${[
          { name:'DDoS Detection', status:'ACTIVE', ok:true },
          { name:'IDS/IPS Engine', status:'ACTIVE', ok:true },
          { name:'Firewall Rules', status:'127 reglas activas', ok:true },
          { name:'Auth Monitor', status: alertQueue.filter(a=>a.title.includes('Auth')).length + ' eventos', ok: alertQueue.filter(a=>a.title.includes('Auth')).length === 0 },
          { name:'Packet Inspector', status: monitoringActive ? 'ONLINE' : 'OFFLINE', ok: monitoringActive },
        ].map(item => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #122040">
            <span style="width:8px;height:8px;border-radius:50%;background:${item.ok?'#00e676':'#ff3d3d'};box-shadow:0 0 4px ${item.ok?'#00e676':'#ff3d3d'}"></span>
            <span style="${valStyle};flex:1">${item.name}</span>
            <span style="${monoStyle}">${item.status}</span>
          </div>`).join('')}
      </div>
      <div style="${monoStyle}">Packet loss real: ${(realMetrics.failedPings/Math.max(1,realMetrics.totalPings)*100).toFixed(3)}% | Alertas activas: ${alertQueue.filter(a=>a.level==='CRITICAL'||a.level==='HIGH').length}</div>`;
  }

  function buildLogsContent() {
    return `<div style="${monoStyle} font-size:9px;line-height:1.8">
      ${eventsBuffer.map(ev => `
        <div style="border-bottom:1px solid #0c1526;padding:3px 0">
          <span style="color:#3a5880">${ev.timeStr}</span>
          <span style="color:${
            ev.sev==='CRITICAL'?'#ff3d3d':ev.sev==='HIGH'?'#ff8c00':ev.sev==='MEDIUM'?'#ffc400':ev.sev==='LOW'?'#00e676':'#00c8ff'
          };margin:0 8px">[${ev.sev}]</span>
          <span style="color:#cde4ff">${ev.event}</span>
          <span style="color:#3a5880"> — ${ev.source}</span>
          <span style="color:#6a8db0"> ${ev.details}</span>
        </div>`).join('') || `<div style="color:#3a5880">Sin eventos registrados</div>`}
    </div>`;
  }

  function buildConfigContent() {
    return `
      <div style="${monoStyle} margin-bottom:12px">Configuración activa del sistema de monitoreo:</div>
      ${[
        ['Intervalo Ping', `${pingIntervalMs}ms`],
        ['Umbral Alarma', `${failThreshold} fallos consecutivos`],
        ['Volumen Alarma', `${Math.round(alarmVolume*100)}%`],
        ['Monitoreo', monitoringActive ? 'ACTIVO' : 'INACTIVO'],
        ['Nodos Cuba', `${nodesActive} nodos activos`],
        ['Pings Realizados', realMetrics.totalPings],
        ['Fallos Detectados', realMetrics.failedPings],
        ['Alertas Generadas', alertQueue.length],
      ].map(([k,v]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #0c1526">
          <span style="${monoStyle}">${k}</span>
          <span style="${valStyle}">${v}</span>
        </div>`).join('')}
      <div style="margin-top:16px;${monoStyle}">
        <div style="color:#ffc400;margin-bottom:8px">Para cambiar configuración use los controles del panel de monitoreo.</div>
        Use el botón "ACTIVAR MONITOREO DE RED" para iniciar el sistema de alertas en tiempo real.
      </div>`;
  }

  window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
  };

  document.addEventListener('click', e => {
    const sidebar   = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger');
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && hamburger && !hamburger.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  /* ══ Inicializar alertas container ══ */
  renderAlerts();
  renderEventsTable();

  console.log('%cNASOC v3.0 — Sistema cargado. 27 nodos Cuba activos. Presiona "ACTIVAR MONITOREO DE RED".', 'color:#00e676;font-family:monospace;font-size:13px');
});
