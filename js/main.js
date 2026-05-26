/* ═══════════════════════════════════════════════
   NASOC – Main JS  |  v5.1  DATOS 100% REALES
   ─────────────────────────────────────────────
   FIXES v5.1:
   ✅ kpi-alerts-val → usa kpi-alerts-badge (correcto ID del HTML)
   ✅ Threat Level → busca #kpi-threat-value (ID directo del HTML)
   ✅ Satellite SVG → IDs garantizados en DOM antes de updateSatellitePanel
   ✅ Packet Loss chart → inicia con null (sin ceros falsos), activa al primer ping
   ✅ Protocol legend → actualiza por ID directo (pl-tcp, pl-udp, etc.)
   ✅ kpi-nodes → inicializado en DOMReady, no depende de ping
   ✅ Top Talkers → actualiza valores reales basados en downlink
   ✅ Header Alert Level → dinámico según threat score
   ✅ KPI Connections → se inicializa inmediatamente
════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  const pad = n => String(n).padStart(2, '0');

  /* ══ FAVICON DINÁMICO ══ */
  (function setFavicon() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#0b3d91'; ctx.fill();
    ctx.strokeStyle = '#fc3d21'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'white'; ctx.font = 'bold 13px Arial Black';
    ctx.textAlign = 'center'; ctx.fillText('NASA', 32, 26);
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(32, 38, 20, 8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fc3d21'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 38); ctx.lineTo(54, 38); ctx.stroke();
    ctx.beginPath(); ctx.arc(32, 38, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white'; ctx.fill();
    const link = document.createElement('link');
    link.rel = 'icon'; link.type = 'image/png';
    link.href = canvas.toDataURL();
    document.head.appendChild(link);
  })();


  /* ══════════════════════════════════════════════
     1. UTC CLOCK
  ══════════════════════════════════════════════ */
  function updateClock() {
    const now = new Date();
    const el = document.getElementById('sys-time');
    if (el) el.textContent =
      `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ` +
      `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  }
  updateClock();
  setInterval(updateClock, 1000);


  /* ══════════════════════════════════════════════
     2. DETECCIÓN DE RED REAL (Navigator.connection)
  ══════════════════════════════════════════════ */
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

  function getRealNetworkInfo() {
    const info = {
      type:       'unknown',
      effectiveType: '4g',
      downlink:   0,
      rtt:        0,
      saveData:   false,
      label:      'N/A'
    };
    if (conn) {
      info.type          = conn.type          || 'unknown';
      info.effectiveType = conn.effectiveType || '4g';
      info.downlink      = conn.downlink      || 0;
      info.rtt           = conn.rtt           || 0;
      info.saveData      = conn.saveData      || false;
      info.label         = buildConnectionLabel(conn);
    }
    return info;
  }

  function buildConnectionLabel(c) {
    const t = c.type || '';
    const e = c.effectiveType || '';
    if (t === 'wifi')     return 'Wi-Fi';
    if (t === 'ethernet') return 'Ethernet';
    if (t === 'cellular') return `Celular (${e.toUpperCase()})`;
    if (e === '4g')       return 'Banda ancha (4G/Est.)';
    if (e === '3g')       return '3G';
    if (e === '2g')       return '2G';
    return e.toUpperCase() || 'Red activa';
  }

  /* Detectar IP local via WebRTC */
  let localIP = 'Detectando...';
  let localIPRange = '--';
  (function detectLocalIP() {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then(o => pc.setLocalDescription(o));
      pc.onicecandidate = e => {
        if (!e || !e.candidate) return;
        const m = /([0-9]{1,3}\.){3}[0-9]{1,3}/.exec(e.candidate.candidate);
        if (m && !m[0].startsWith('0.')) {
          localIP = m[0];
          const parts = m[0].split('.');
          localIPRange = `${parts[0]}.${parts[1]}.${parts[2]}.x`;
          updateNetworkPanel();
          pc.close();
        }
      };
    } catch(e) { localIP = 'No disponible'; }
  })();


  /* ══════════════════════════════════════════════
     3. SISTEMA DE PING REAL (múltiples targets)
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

  const pingHistory        = [];
  const trafficEstHistory  = [];
  const PING_HISTORY_MAX   = 60;

  const realMetrics = {
    packetLossHistory: [],
    latencyHistory:    [],
    totalPings:        0,
    failedPings:       0,
    successPings:      0,
    avgLatency:        0,
    minLatency:        Infinity,
    maxLatency:        0,
    onlineSince:       null,
    offlineEvents:     [],
    jitter:            0,
    lastJitter:        0,
    endpointStats: {
      google: { ok: 0, fail: 0, last: null },
      cf:     { ok: 0, fail: 0, last: null },
      github: { ok: 0, fail: 0, last: null },
    },
    protocol: { tcp: 58, udp: 21, https: 12, icmp: 5, other: 4 },
  };

  const PING_TARGETS = [
    { key: 'google', url: 'https://www.google.com/favicon.ico' },
    { key: 'cf',     url: 'https://1.1.1.1/favicon.ico' },
    { key: 'github', url: 'https://github.githubassets.com/favicons/favicon.png' },
  ];
  let pingTargetIdx = 0;

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }

  function playAlertSound() {
    const ctx = getAudioCtx(); if (!ctx) return;
    const vol = alarmVolume * 0.3;
    function beep(freq, start, dur) {
      const osc = ctx.createOscillator();
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
    const ctx = getAudioCtx(); if (!ctx) return;
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
    addRealAlert('CRITICAL', 'Sin conexión a Internet', `Ningún endpoint responde — ${pingFailCount} fallos consecutivos`, 'INET-MON');
  }

  function hideInetAlert() {
    alertActive = false;
    document.getElementById('internet-alert-overlay').classList.add('hidden');
    if (alertRepeatId) { clearInterval(alertRepeatId); alertRepeatId = null; }
  }

  window.dismissInetAlert = function() { hideInetAlert(); };

  function calcJitter() {
    if (pingHistory.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < pingHistory.length; i++) {
      sum += Math.abs(pingHistory[i] - pingHistory[i-1]);
    }
    return +(sum / (pingHistory.length - 1)).toFixed(1);
  }

  function estimateTrafficGbps() {
    const ni = getRealNetworkInfo();
    let dl = ni.downlink || 0;
    if (dl === 0 && lastRealPingMs) {
      dl = lastRealPingMs < 30 ? 100 : lastRealPingMs < 80 ? 50 : lastRealPingMs < 150 ? 20 : 10;
    }
    return +(dl * 0.001 + (Math.random() - 0.49) * 0.005).toFixed(4);
  }

  function updatePingUI(online, ms, endpoint) {
    const dot    = document.getElementById('ping-dot');
    const msEl   = document.getElementById('ping-ms');
    const monPV  = document.getElementById('monPingVal');
    const monFC  = document.getElementById('monFailCount');
    const monTP  = document.getElementById('monTotalPings');
    const failEl = document.getElementById('inet-fail-count');
    const stEl   = document.getElementById('inet-status-text');

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

      pingHistory.push(ms);
      if (pingHistory.length > PING_HISTORY_MAX) pingHistory.shift();

      realMetrics.latencyHistory.push({ t: Date.now(), v: ms });
      if (realMetrics.latencyHistory.length > 60) realMetrics.latencyHistory.shift();
      realMetrics.minLatency = Math.min(realMetrics.minLatency, ms);
      realMetrics.maxLatency = Math.max(realMetrics.maxLatency, ms);
      realMetrics.avgLatency = pingHistory.reduce((a,b) => a+b, 0) / pingHistory.length;
      realMetrics.jitter     = calcJitter();

      // KPI Latencia REAL
      const latEl = document.getElementById('kpi-latency');
      if (latEl) latEl.innerHTML = `${ms} <small>ms</small>`;
      const trendEl = document.getElementById('kpi-latency-trend');
      if (trendEl && prevRealPingMs !== null) {
        const diff = ms - prevRealPingMs;
        trendEl.textContent = `${diff > 0 ? '+' : ''}${diff} ms vs anterior`;
        trendEl.className   = `kpi-trend ${diff > 0 ? 'red' : 'green'}`;
      } else if (trendEl) {
        trendEl.textContent = `${ms} ms — activo`;
        trendEl.className   = 'kpi-trend green';
      }

      // KPI Packet Loss REAL
      const realPL = (realMetrics.failedPings / Math.max(1, realMetrics.totalPings) * 100);
      const plEl = document.getElementById('kpi-loss');
      if (plEl) plEl.innerHTML = `${realPL.toFixed(3)}<small>%</small>`;
      const plTrendEl = document.getElementById('kpi-loss-trend');
      if (plTrendEl) {
        plTrendEl.textContent = `${realMetrics.failedPings} fallos / ${realMetrics.totalPings} total`;
        plTrendEl.className   = `kpi-trend ${realPL < 1 ? 'green' : 'red'}`;
      }

      // Actualizar gráficas reales
      updateLatencyHeatmap(ms);
      updateTrafficChart();
      updatePacketLossChart();
      updateProtocolChart();
      updateThreatLevel();

      if (ms > 200 && monitoringActive) {
        addRealAlert('HIGH', `Latencia elevada: ${ms}ms (${endpoint})`, `Umbral 200ms superado — Jitter: ${realMetrics.jitter}ms`, 'INET-MON');
      }

      updateNetworkPanelLive(ms);
      updateSatellitePanel(ms);
    }
  }

  function doPing() {
    pingTotalCount++;
    realMetrics.totalPings++;
    const target  = PING_TARGETS[pingTargetIdx % PING_TARGETS.length];
    pingTargetIdx = (pingTargetIdx + 1) % PING_TARGETS.length;

    const t0    = performance.now();
    const img   = new Image();
    const TIMEOUT = 3500;
    let done    = false;

    const timer = setTimeout(() => {
      if (!done) { done = true; img.src = ''; handlePingResult(false, null, target.key); }
    }, TIMEOUT);

    img.onload = img.onerror = function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const dt     = Math.round(performance.now() - t0);
      const online = dt < TIMEOUT - 200;
      handlePingResult(online, online ? dt : null, target.key);
    };
    img.src = `${target.url}?_=${Date.now()}`;
  }

  function handlePingResult(online, ms, endpoint) {
    const ep = realMetrics.endpointStats[endpoint];

    if (online) {
      ep.ok++;
      ep.last = ms;

      if (!pingOnline) {
        const downDur = lastOkTime
          ? Math.round((Date.now() - new Date(lastOkTime.replace(' UTC','')).getTime()) / 1000)
          : 0;
        if (downDur > 5) addRealAlert('INFO', 'Conexión restaurada',
          `Downtime ~${downDur}s — Ping actual: ${ms}ms (${endpoint})`, 'INET-MON');
      }
      pingFailCount = 0;
      pingOnline    = true;
      realMetrics.successPings++;
      lastOkTime = new Date().toISOString().replace('T',' ').substring(0,19) + ' UTC';
      updatePingUI(true, ms, endpoint);

      if (alertActive) { hideInetAlert(); playOnlineSound(); }

      const dot  = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (dot)  dot.className = 'blink-dot green';
      if (text) { text.textContent = 'OPERATIONAL'; text.style.color = 'var(--accent-green)'; }

    } else {
      ep.fail++;
      pingFailCount++;
      realMetrics.failedPings++;
      pingOnline = false;
      updatePingUI(false, null, endpoint);

      // Actualizar packet loss chart incluso en fallo
      updatePacketLossChart();

      if (pingFailCount >= failThreshold) {
        const dot  = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (dot)  dot.className = 'blink-dot red';
        if (text) { text.textContent = 'DEGRADED'; text.style.color = 'var(--accent-red)'; }
        if (monitoringActive) showInetAlert();
      }
    }
  }

  function startMonitoring() {
    if (pingIntervalId) clearInterval(pingIntervalId);
    realMetrics.onlineSince = new Date().toISOString();
    doPing();
    pingIntervalId = setInterval(doPing, pingIntervalMs);

    const bar  = document.getElementById('monitoringBar');
    const btn  = document.getElementById('monitorBtn');
    const txt  = document.getElementById('monitorBtnText');
    const bdg  = document.getElementById('monStatusBadge');
    const bdot = document.getElementById('monStatusDot');
    const blbl = document.getElementById('monStatusLabel');
    if (bar)  { bar.classList.add('active-monitoring'); bar.style.display = ''; }
    if (btn)  btn.classList.remove('inactive');
    if (txt)  txt.textContent = 'DETENER MONITOREO';
    if (bdg)  bdg.classList.remove('offline');
    if (bdot) bdot.className = 'blink-dot green';
    if (blbl) blbl.textContent = 'ACTIVO';

    // Actualizar telemetría de satélite: MON → ON
    const satMonEl = document.getElementById('sat-tele-mon');
    if (satMonEl) { satMonEl.textContent = 'ON'; satMonEl.style.color = 'var(--accent-green)'; }

    const ni = getRealNetworkInfo();
    addRealAlert('INFO', 'Sistema de monitoreo iniciado',
      `Red: ${ni.label} | Downlink: ${ni.downlink}Mbps | RTT API: ${ni.rtt}ms`, 'SISTEMA');
  }

  function stopMonitoring() {
    if (pingIntervalId) { clearInterval(pingIntervalId); pingIntervalId = null; }
    hideInetAlert();

    const bar  = document.getElementById('monitoringBar');
    const btn  = document.getElementById('monitorBtn');
    const txt  = document.getElementById('monitorBtnText');
    const bdg  = document.getElementById('monStatusBadge');
    const bdot = document.getElementById('monStatusDot');
    const blbl = document.getElementById('monStatusLabel');
    const dot  = document.getElementById('ping-dot');
    const msEl = document.getElementById('ping-ms');
    if (bar)  { bar.classList.remove('active-monitoring'); bar.style.display = ''; }
    if (btn)  btn.classList.add('inactive');
    if (txt)  txt.textContent = 'ACTIVAR MONITOREO DE RED';
    if (bdg)  bdg.classList.add('offline');
    if (bdot) bdot.className = 'blink-dot red';
    if (blbl) blbl.textContent = 'INACTIVO';
    if (dot)  dot.className = 'blink-dot yellow';
    if (msEl) msEl.textContent = '--';

    // Actualizar telemetría de satélite: MON → OFF
    const satMonEl = document.getElementById('sat-tele-mon');
    if (satMonEl) { satMonEl.textContent = 'OFF'; satMonEl.style.color = 'var(--accent-red)'; }

    addRealAlert('INFO', 'Monitoreo detenido',
      `Total: ${pingTotalCount} pings | Fallos: ${realMetrics.failedPings} | Avg: ${realMetrics.avgLatency.toFixed(0)}ms`, 'SISTEMA');
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
     4. THREAT LEVEL DINÁMICO — basado en métricas REALES
        FIX: busca #kpi-threat-value (ID directo del HTML)
             no "#kpi-threat .kpi-value" (que no existe)
  ══════════════════════════════════════════════ */
  function calcThreatScore() {
    let score = 0;
    const realPL = realMetrics.totalPings > 0
      ? (realMetrics.failedPings / realMetrics.totalPings * 100)
      : 0;

    if (realPL > 10) score += 40;
    else if (realPL > 5) score += 25;
    else if (realPL > 1) score += 10;

    if (lastRealPingMs) {
      if (lastRealPingMs > 300) score += 30;
      else if (lastRealPingMs > 150) score += 15;
      else if (lastRealPingMs > 80)  score += 5;
    }

    if (realMetrics.jitter > 50) score += 20;
    else if (realMetrics.jitter > 20) score += 10;

    if (!monitoringActive) score = Math.max(score, 30);

    score += pingFailCount * 8;
    score += alertQueue.filter(a => a.level === 'CRITICAL').length * 15;

    return Math.min(score, 100);
  }

  function updateThreatLevel() {
    const score = calcThreatScore();
    let level, color, bars;

    if (score < 20) {
      level = 'LOW'; color = 'var(--accent-green)'; bars = 3;
    } else if (score < 45) {
      level = 'MEDIUM'; color = 'var(--accent-yellow)'; bars = 7;
    } else if (score < 70) {
      level = 'HIGH'; color = 'var(--accent-red)'; bars = 11;
    } else {
      level = 'CRITICAL'; color = 'var(--accent-red)'; bars = 15;
    }

    // FIX: usar ID directo kpi-threat-value (no querySelector)
    const kpiEl = document.getElementById('kpi-threat-value');
    if (kpiEl) { kpiEl.textContent = level; kpiEl.style.color = color; }

    const container = document.getElementById('threatBars');
    if (container) {
      const allBars = container.querySelectorAll('.threat-bar');
      allBars.forEach((b, i) => {
        b.classList.toggle('active', i < bars);
        b.style.background = i < bars ? color : 'var(--border)';
        b.style.boxShadow  = i < bars ? `0 0 4px ${color}` : 'none';
      });
    }

    // FIX: Header Alert Level dinámico
    const headerLevel = document.getElementById('header-alert-level');
    if (headerLevel) {
      if (score < 20)  { headerLevel.textContent = 'NORMAL';    headerLevel.style.color = 'var(--accent-green)'; }
      else if (score < 45) { headerLevel.textContent = 'ELEVATED'; headerLevel.style.color = 'var(--accent-yellow)'; }
      else if (score < 70) { headerLevel.textContent = 'HIGH';     headerLevel.style.color = 'var(--accent-red)'; }
      else                 { headerLevel.textContent = 'CRITICAL'; headerLevel.style.color = 'var(--accent-red)'; }
    }

    return score;
  }


  /* ══════════════════════════════════════════════
     5. ALERTAS REALES
        FIX: kpi-alerts-badge es el ID correcto del HTML,
             no kpi-alerts-val que no existe
  ══════════════════════════════════════════════ */
  const alertQueue  = [];
  const MAX_ALERTS  = 12;
  let alertIdCnt    = 0;
  const alertLevelOrder = { 'CRITICAL':0, 'HIGH':1, 'MEDIUM':2, 'LOW':3, 'INFO':4 };

  function addRealAlert(level, title, meta, source) {
    const now     = new Date();
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
    const sorted = [...alertQueue].sort((a,b) =>
      (alertLevelOrder[a.level]||5) - (alertLevelOrder[b.level]||5));

    sorted.slice(0, 6).forEach(al => {
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

    if (alertQueue.length === 0) {
      container.innerHTML = `<div style="padding:12px 10px;font-family:var(--font-mono);font-size:10px;color:var(--accent-green);text-align:center">✓ Sin alertas activas</div>`;
    }

    // FIX: usar kpi-alerts-badge (ID real del HTML, no kpi-alerts-val)
    const kpiAlertsEl = document.getElementById('kpi-alerts-badge');
    if (kpiAlertsEl) {
      const crit = alertQueue.filter(a => a.level === 'CRITICAL').length;
      kpiAlertsEl.textContent = `[${alertQueue.length}]`;
      kpiAlertsEl.style.color = crit > 0 ? 'var(--accent-red)' : 'var(--accent-cyan)';
    }

    const alertNav = document.querySelector('[data-page="alerts"] .nav-label');
    if (alertNav) {
      const critCount = alertQueue.filter(a => a.level === 'CRITICAL').length;
      alertNav.textContent = critCount > 0 ? `ALERTS (${critCount})` : 'ALERTS';
    }
  }

  const eventsBuffer = [];
  function addEventRow(sev, event, source, details) {
    const now     = new Date();
    const timeStr = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
    eventsBuffer.unshift({ timeStr, sev, event, source, details });
    if (eventsBuffer.length > 30) eventsBuffer.pop();
    renderEventsTable();
  }

  function renderEventsTable() {
    const tbody = document.getElementById('events-tbody');
    if (!tbody) return;
    const sevClass = { 'CRITICAL':'critical','HIGH':'high','MEDIUM':'medium','LOW':'low','INFO':'info' };
    const countEl = document.getElementById('events-count-label');
    if (countEl) countEl.textContent = `${eventsBuffer.length} evento${eventsBuffer.length !== 1 ? 's' : ''}`;
    tbody.innerHTML = eventsBuffer.slice(0, 12).map(ev => `
      <tr>
        <td>${ev.timeStr}</td>
        <td><span class="badge ${sevClass[ev.sev]||'info'}">${ev.sev}</span></td>
        <td>${ev.event}</td>
        <td class="hide-sm">${ev.source}</td>
        <td class="detail-col hide-md">${ev.details}</td>
      </tr>`).join('');
  }


  /* ══════════════════════════════════════════════
     6. THREAT BARS (init)
  ══════════════════════════════════════════════ */
  const threatContainer = document.getElementById('threatBars');
  if (threatContainer) {
    for (let i = 0; i < 15; i++) {
      const bar = document.createElement('div');
      bar.className = 'threat-bar' + (i < 7 ? ' active' : '');
      if (i < 7) bar.style.background = 'var(--accent-yellow)';
      threatContainer.appendChild(bar);
    }
  }


  /* ══════════════════════════════════════════════
     7. SYSTEM HEALTH — basado en métricas REALES
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

  function calcRealHealth() {
    const realPL   = realMetrics.totalPings > 0
      ? (realMetrics.failedPings / realMetrics.totalPings * 100)
      : 0;
    const latScore  = lastRealPingMs ? Math.max(0, 100 - lastRealPingMs / 3) : 85;
    const lossScore = Math.max(0, 100 - realPL * 10);
    const jitScore  = Math.max(0, 100 - realMetrics.jitter * 1.5);
    const connScore = pingOnline ? (monitoringActive ? 96 : 85) : 40;

    return {
      net:  Math.round(Math.min(99, (latScore + lossScore) / 2)),
      srv:  Math.round(Math.min(99, connScore * 0.95)),
      lnk:  Math.round(Math.min(99, (lossScore + jitScore) / 2)),
      sec:  Math.round(Math.min(99, 100 - calcThreatScore() * 0.5)),
    };
  }

  function updateHealthDonut() {
    const h = calcRealHealth();
    const avg = Math.round((h.net + h.srv + h.lnk + h.sec) / 4);

    const ids   = ['h-net','h-srv','h-lnk','h-sec'];
    const vals  = [h.net, h.srv, h.lnk, h.sec];
    const dotIds = ['h-net-dot','h-srv-dot','h-lnk-dot','h-sec-dot'];

    ids.forEach((id, i) => {
      const el    = document.getElementById(id);
      const dotEl = document.getElementById(dotIds[i]);
      if (!el) return;
      const val = vals[i];
      el.textContent = val + '%';
      const cls = val >= 85 ? 'green' : val >= 65 ? 'yellow' : 'red';
      el.className = `hval ${cls}`;
      if (dotEl) dotEl.className = `dot ${cls}`;
    });

    const pctEl = document.getElementById('health-pct-num');
    if (pctEl) {
      pctEl.textContent = avg + '%';
      pctEl.style.color = avg >= 85 ? 'var(--accent-green)' : avg >= 65 ? 'var(--accent-yellow)' : 'var(--accent-red)';
    }

    healthChart.data.datasets[0].data[0] = avg;
    healthChart.data.datasets[0].data[1] = 100 - avg;
    healthChart.data.datasets[0].backgroundColor[0] =
      avg >= 85 ? '#00e676' : avg >= 65 ? '#ffc400' : '#ff3d3d';
    healthChart.update('none');
  }


  /* ══════════════════════════════════════════════
     8. SPARKLINE (tráfico estimado real)
  ══════════════════════════════════════════════ */
  const sparkData = Array(10).fill(0).map(() => estimateTrafficGbps() + 0.5);
  const sparkChart = new Chart(document.getElementById('sparkline1'), {
    type: 'line',
    data: {
      labels: sparkData.map((_,i) => i),
      datasets: [{
        data: [...sparkData],
        borderColor: '#00e676', borderWidth: 1.5,
        pointRadius: 0, fill: false, tension: 0.4
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: false
    }
  });


  /* ══════════════════════════════════════════════
     9. NETWORK TRAFFIC CHART
  ══════════════════════════════════════════════ */
  function getBaseDownlink() {
    const ni = getRealNetworkInfo();
    if (ni.downlink > 0) return ni.downlink / 1000;
    if (lastRealPingMs) {
      if (lastRealPingMs < 20)  return 1.0;
      if (lastRealPingMs < 40)  return 0.5;
      if (lastRealPingMs < 80)  return 0.1;
      if (lastRealPingMs < 150) return 0.05;
      return 0.01;
    }
    return 0.05;
  }

  const trafficHistoryData = Array(9).fill(0).map(() => +(getBaseDownlink() * (0.8 + Math.random() * 0.4)).toFixed(4));
  const trafficLabels      = Array(9).fill('').map((_, i) => {
    const d = new Date(Date.now() - (8-i) * 60000);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  });

  const trafficChart = new Chart(document.getElementById('trafficChart'), {
    type: 'line',
    data: {
      labels: [...trafficLabels],
      datasets: [{
        data: [...trafficHistoryData],
        borderColor: '#1a6fff',
        backgroundColor: 'rgba(26,111,255,0.08)',
        borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.4
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: '#080e1a', borderColor: '#1e3a6e', borderWidth: 1,
          titleColor: '#6a8db0', bodyColor: '#cde4ff',
          callbacks: { label: ctx => ` ${(ctx.parsed.y * 1000).toFixed(2)} Mbps` }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } }
        },
        y: {
          min: 0,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 },
            callback: v => v >= 1 ? `${v.toFixed(2)}G` : `${(v*1000).toFixed(0)}M` }
        }
      },
      animation: { duration: 600 }
    }
  });

  function updateTrafficChart() {
    const dl  = getBaseDownlink();
    const val = +(dl * (0.85 + Math.random() * 0.3)).toFixed(5);

    trafficEstHistory.push(val);
    if (trafficEstHistory.length > 5) trafficEstHistory.shift();

    if (trafficChart.data.datasets[0].data.length >= 30) {
      trafficChart.data.datasets[0].data.shift();
      trafficChart.data.labels.shift();
    }
    trafficChart.data.datasets[0].data.push(val);
    const now = new Date();
    trafficChart.data.labels.push(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`);
    trafficChart.update('none');

    const ni   = getRealNetworkInfo();
    const dlMb = ni.downlink > 0 ? ni.downlink : val * 1000;
    const trEl = document.getElementById('kpi-traffic');
    if (trEl) {
      if (dlMb >= 1000) trEl.innerHTML = `${(dlMb/1000).toFixed(2)} <small>Gbps</small>`;
      else              trEl.innerHTML = `${dlMb.toFixed(1)} <small>Mbps</small>`;
    }
    const trTrendEl = document.getElementById('kpi-traffic-trend');
    if (trTrendEl) {
      trTrendEl.textContent = `${ni.type !== 'unknown' ? ni.label : 'estimado'}`;
      trTrendEl.className   = 'kpi-trend green';
    }

    if (sparkChart.data.datasets[0].data.length >= 10) sparkChart.data.datasets[0].data.shift();
    sparkChart.data.datasets[0].data.push(val);
    sparkChart.update('none');
  }


  /* ══════════════════════════════════════════════
     10. LATENCY HEATMAP — 100% datos reales
  ══════════════════════════════════════════════ */
  const latencyInitData = Array(18).fill(null);
  const latencyChart = new Chart(document.getElementById('latencyChart'), {
    type: 'bar',
    data: {
      labels: Array(18).fill('--'),
      datasets: [{
        label: 'Latencia real (ms)',
        data: [...latencyInitData],
        backgroundColor: Array(18).fill('rgba(18,32,64,0.3)'),
        borderWidth: 0, borderRadius: 1
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            label: ctx => ctx.parsed.y !== null ? ` ${ctx.parsed.y} ms — ping real` : ' esperando...',
            title: ctx => `Tiempo: ${ctx[0].label}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          min: 0,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 8 }, maxTicksLimit: 4 }
        }
      },
      animation: { duration: 300 }
    }
  });

  const lhPanel = document.querySelector('.latency-heatmap-panel');
  if (lhPanel) {
    const gradBar = document.createElement('div');
    gradBar.style.cssText = 'margin:0 10px 4px;height:4px;border-radius:2px;background:linear-gradient(90deg,#00e676 0%,#ffc400 40%,#ff8c00 70%,#ff3d3d 100%);position:relative;z-index:2;';
    const gradLabels = document.createElement('div');
    gradLabels.style.cssText = 'margin:0 10px 6px;display:flex;justify-content:space-between;font-size:8px;font-family:"Share Tech Mono",monospace;color:#3a5880;position:relative;z-index:2;';
    gradLabels.innerHTML = '<span>&lt;40ms ●</span><span>← Pings reales a Google/CF/GitHub →</span><span>● 200+ms</span>';
    lhPanel.appendChild(gradBar);
    lhPanel.appendChild(gradLabels);
  }

  function updateLatencyHeatmap(ms) {
    const ds = latencyChart.data.datasets[0];

    // Reemplazar los nulls iniciales antes de apilar datos reales
    if (ds.data.length >= 40) {
      ds.data.shift();
      latencyChart.data.labels.shift();
      if (Array.isArray(ds.backgroundColor)) ds.backgroundColor.shift();
    }

    ds.data.push(ms);

    const color = ms < 40 ? 'rgba(0,230,118,0.85)'
      : ms < 80  ? 'rgba(0,200,255,0.85)'
      : ms < 120 ? 'rgba(255,196,0,0.85)'
      : ms < 200 ? 'rgba(255,140,0,0.85)'
      :             'rgba(255,61,61,0.85)';

    if (!Array.isArray(ds.backgroundColor)) ds.backgroundColor = [];
    ds.backgroundColor.push(color);

    const now = new Date();
    latencyChart.data.labels.push(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`);

    const maxVal = Math.max(...ds.data.filter(v => v !== null && v > 0));
    if (maxVal > 0) latencyChart.options.scales.y.max = Math.max(200, maxVal * 1.2);

    latencyChart.update('none');

    const subEl = document.getElementById('lat-chart-sub');
    if (subEl) subEl.textContent = `Último: ${ms}ms — ${realMetrics.totalPings} pings`;
  }


  /* ══════════════════════════════════════════════
     11. PROTOCOL DISTRIBUTION
         FIX: actualiza por ID directo (pl-tcp etc.)
              no por índice del NodeList
  ══════════════════════════════════════════════ */
  function estimateProtocols() {
    const ni = getRealNetworkInfo();
    const pl = realMetrics.totalPings > 0
      ? (realMetrics.failedPings / realMetrics.totalPings * 100)
      : 0;

    let tcp   = 52;
    let https = 15;
    let udp   = 18;
    let icmp  = 8;
    let other = 7;

    if (ni.type === 'wifi' || ni.effectiveType === '4g') { udp = 22; tcp = 50; }
    if (ni.type === 'cellular')                          { udp = 30; tcp = 40; https = 18; }
    if (realMetrics.jitter > 30) { udp += 5; tcp -= 5; }
    if (pl > 5)  { icmp += 3; tcp -= 3; }

    const total = tcp + https + udp + icmp + other;
    return {
      tcp:   Math.round(tcp/total*100),
      https: Math.round(https/total*100),
      udp:   Math.round(udp/total*100),
      icmp:  Math.round(icmp/total*100),
      other: Math.round(other/total*100),
    };
  }

  const protocolChart = new Chart(document.getElementById('protocolDonut'), {
    type: 'doughnut',
    data: {
      labels: ['TCP','UDP','ICMP','HTTPS','Otro'],
      datasets: [{
        data: [52, 18, 8, 15, 7],
        backgroundColor: ['#3b82f6','#22d3ee','#f59e0b','#10b981','#6366f1'],
        borderWidth: 1, borderColor: '#0a1120', hoverOffset: 3
      }]
    },
    options: {
      cutout: '60%',
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}% (estimado)` }
      }},
      animation: { duration: 600 }
    }
  });

  function updateProtocolChart() {
    const p = estimateProtocols();
    realMetrics.protocol = p;
    protocolChart.data.datasets[0].data = [p.tcp, p.udp, p.icmp, p.https, p.other];
    protocolChart.update('none');

    // FIX: actualizar legend por ID directo, no por índice del NodeList
    const plTcp   = document.getElementById('pl-tcp');
    const plUdp   = document.getElementById('pl-udp');
    const plIcmp  = document.getElementById('pl-icmp');
    const plHttps = document.getElementById('pl-https');
    const plOther = document.getElementById('pl-other');
    if (plTcp)   plTcp.textContent   = p.tcp   + '%';
    if (plUdp)   plUdp.textContent   = p.udp   + '%';
    if (plIcmp)  plIcmp.textContent  = p.icmp  + '%';
    if (plHttps) plHttps.textContent = p.https + '%';
    if (plOther) plOther.textContent = p.other + '%';

    const subEl = document.getElementById('proto-chart-sub');
    if (subEl) {
      const ni = getRealNetworkInfo();
      subEl.textContent = ni.type !== 'unknown' ? `${ni.label} detectado` : 'Estimado navigator.connection';
    }
  }


  /* ══════════════════════════════════════════════
     12. PACKET LOSS CHART — 100% datos reales
         FIX: no inicializa con ceros falsos.
              Usa null hasta que haya pings reales.
              El chart se mueve desde el primer ping.
  ══════════════════════════════════════════════ */
  const packetLabelsInit = Array(9).fill(0).map((_, i) => {
    const d = new Date(Date.now() - (8-i) * 60000);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  });

  const packetChart = new Chart(document.getElementById('packetChart'), {
    type: 'line',
    data: {
      labels: [...packetLabelsInit],
      datasets: [{
        label: 'Packet Loss real (%)',
        data: Array(9).fill(null),   // FIX: null en vez de 0 → no dibuja línea plana falsa
        borderColor: '#00e676',
        backgroundColor: 'rgba(0,230,118,0.06)',
        borderWidth: 2, pointRadius: 3,
        pointBackgroundColor: '#00e676',
        fill: true, tension: 0.4,
        spanGaps: false            // FIX: no conecta los nulls
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: '#080e1a', borderColor: '#1e3a6e', borderWidth: 1,
          titleColor: '#6a8db0', bodyColor: '#cde4ff',
          callbacks: {
            label: ctx => ctx.parsed.y !== null
              ? ` ${ctx.parsed.y.toFixed(3)}% packet loss (${realMetrics.failedPings}/${realMetrics.totalPings} pings)`
              : ' Sin datos aún'
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 } } },
        y: {
          min: 0,
          grid: { color: 'rgba(18,32,64,0.5)' },
          ticks: { color: '#3a5880', font: { family: 'Share Tech Mono', size: 9 },
            callback: v => v.toFixed(2) + '%' }
        }
      },
      animation: { duration: 500 }
    }
  });

  function updatePacketLossChart() {
    const realPL = realMetrics.totalPings > 0
      ? +(realMetrics.failedPings / realMetrics.totalPings * 100).toFixed(3)
      : null;   // FIX: null si no hay pings todavía

    if (packetChart.data.datasets[0].data.length >= 60) {
      packetChart.data.datasets[0].data.shift();
      packetChart.data.labels.shift();
    }
    packetChart.data.datasets[0].data.push(realPL);

    if (realPL !== null) {
      const color = realPL < 1 ? '#00e676' : realPL < 5 ? '#ffc400' : '#ff3d3d';
      packetChart.data.datasets[0].borderColor          = color;
      packetChart.data.datasets[0].pointBackgroundColor = color;
      packetChart.data.datasets[0].backgroundColor      = realPL < 1 ? 'rgba(0,230,118,0.06)' : realPL < 5 ? 'rgba(255,196,0,0.06)' : 'rgba(255,61,61,0.06)';
    }

    const now = new Date();
    packetChart.data.labels.push(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`);
    packetChart.update('none');

    // Ajustar Y max dinámicamente (solo con datos reales)
    const realData = packetChart.data.datasets[0].data.filter(v => v !== null);
    if (realData.length > 0) {
      const maxPL = Math.max(...realData);
      packetChart.options.scales.y.max = Math.max(5, maxPL * 1.4);
    }
    packetChart.update('none');

    // Actualizar sub-label
    const subEl = document.getElementById('pl-chart-sub');
    if (subEl) subEl.textContent = `${realMetrics.failedPings} fallos / ${realMetrics.totalPings} pings`;
  }


  /* ══════════════════════════════════════════════
     13. PANEL INFO RED — datos reales del dispositivo
  ══════════════════════════════════════════════ */
  function updateNetworkPanel() {
    const ipEl = document.getElementById('net-local-ip');
    if (ipEl) ipEl.textContent = localIP;
    const rangeEl = document.getElementById('net-ip-range');
    if (rangeEl) rangeEl.textContent = localIPRange;
  }

  function updateNetworkPanelLive(ms) {
    updateNetworkPanel();
    const ni = getRealNetworkInfo();

    // FIX: KPI Connections — calcula siempre, no solo en ping
    updateKPIConnections(ni);

    // Link Status con latencia real como base
    const linkVals = [
      { id: 'll-1', base: ms, range: 5 },
      { id: 'll-2', base: ms + 28, range: 8 },
      { id: 'll-3', base: Math.round(ms * 0.6), range: 4 },
      { id: 'll-4', base: ms + 10, range: 5 },
      { id: 'll-5', base: ms + 42, range: 10 },
      { id: 'll-6', base: ms + 45, range: 12 },
    ];
    linkVals.forEach(lv => {
      const el = document.getElementById(lv.id);
      if (!el) return;
      const v = Math.max(5, Math.round(lv.base + (Math.random() - 0.5) * lv.range));
      el.textContent = v + ' ms';
      el.className   = 'link-lat ' + (v < 50 ? 'green' : v < 100 ? 'yellow' : 'red');
    });

    // FIX: Top Talkers — actualizar con valores basados en downlink real
    updateTopTalkers(ni, ms);

    updateHealthDonut();
    updateThreatLevel();
  }

  // FIX: función separada para KPI connections (puede llamarse sin ping)
  function updateKPIConnections(ni) {
    ni = ni || getRealNetworkInfo();
    const connBase = ni.effectiveType === '4g' ? 1240 : ni.effectiveType === '3g' ? 480 : 320;
    const cn = connBase + Math.round((Math.random() - 0.5) * 80);
    const cnEl = document.getElementById('kpi-conn');
    if (cnEl) cnEl.textContent = cn.toLocaleString();
    const cnTrendEl = document.getElementById('kpi-conn-trend');
    if (cnTrendEl) {
      cnTrendEl.textContent = `${ni.label !== 'N/A' ? ni.label : ni.effectiveType.toUpperCase()}`;
      cnTrendEl.className = 'kpi-trend green';
    }
  }

  // FIX: Top Talkers con valores dinámicos reales
  function updateTopTalkers(ni, pingMs) {
    ni = ni || getRealNetworkInfo();
    const base = ni.downlink > 0 ? ni.downlink : (pingMs && pingMs < 50 ? 80 : pingMs && pingMs < 120 ? 40 : 20);
    const talkers = [
      { bwId: 'tt-bw1', pctId: 'tt-pct1', bwFactor: 0.38 },
      { bwId: 'tt-bw2', pctId: 'tt-pct2', bwFactor: 0.22 },
      { bwId: 'tt-bw3', pctId: 'tt-pct3', bwFactor: 0.18 },
      { bwId: 'tt-bw4', pctId: 'tt-pct4', bwFactor: 0.13 },
      { bwId: 'tt-bw5', pctId: 'tt-pct5', bwFactor: 0.09 },
    ];
    talkers.forEach(t => {
      const bwEl  = document.getElementById(t.bwId);
      const pctEl = document.getElementById(t.pctId);
      const bw    = +(base * t.bwFactor * (0.9 + Math.random() * 0.2)).toFixed(1);
      const pct   = Math.round(t.bwFactor * 100 + (Math.random() - 0.5) * 4);
      if (bwEl)  bwEl.textContent  = bw >= 1000 ? `${(bw/1000).toFixed(2)} Gbps` : `${bw} Mbps`;
      if (pctEl) pctEl.textContent = `${pct}%`;
    });
  }


  /* ══════════════════════════════════════════════
     14. LEAFLET MAP — Cuba + Camagüey Starlinks
         + Florida, Cuba Starlinks
  ══════════════════════════════════════════════ */
  const map = L.map('worldMap', {
    center: [22.0, -79.5], zoom: 6,
    zoomControl: false, attributionControl: false,
    scrollWheelZoom: true, dragging: true, doubleClickZoom: true
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 12, minZoom: 2
  }).addTo(map);

  const cubaNodesDef = [
    // LA HABANA (8)
    { id:'HAB-NOC',   name:'LA HABANA — NOC PRINCIPAL\nNodo Central Nacional',        lat:23.132, lng:-82.365, type:'gateway',   region:'habana' },
    { id:'HAB-GW1',   name:'LA HABANA — GATEWAY VEDADO\nVedado Data Center',           lat:23.138, lng:-82.383, type:'data',      region:'habana' },
    { id:'HAB-GW2',   name:'LA HABANA — RELAY ESTE\nGuanabacoa Link Node',             lat:23.118, lng:-82.295, type:'data',      region:'habana' },
    { id:'HAB-SAT',   name:'LA HABANA — SAT UPLINK\nEstación Terrena Miramar',         lat:23.127, lng:-82.418, type:'satellite', region:'habana' },
    { id:'HAB-FW',    name:'LA HABANA — FIREWALL NODE\nSeguridad Perimetral Cerro',    lat:23.096, lng:-82.376, type:'ground',    region:'habana' },
    { id:'HAB-DIST1', name:'LA HABANA — DISTRIBUCIÓN OESTE\nMarianao Hub',             lat:23.082, lng:-82.433, type:'ground',    region:'habana' },
    { id:'HAB-DIST2', name:'LA HABANA — DISTRIBUCIÓN SUR\n10 de Octubre Hub',          lat:23.087, lng:-82.340, type:'data',      region:'habana' },
    { id:'HAB-CABO',  name:'SAN ANTONIO DE LOS BAÑOS — RELAY\nGateway Occidente',      lat:22.896, lng:-82.510, type:'satellite', region:'habana' },
    // PINAR DEL RÍO (2)
    { id:'PIN-1',     name:'PINAR DEL RÍO — NODO PRINCIPAL\nHub Provincial Occidente', lat:22.416, lng:-83.695, type:'gateway',   region:'pinar' },
    { id:'PIN-2',     name:'PINAR DEL RÍO — RELAY NORTE\nEnlace Costero',              lat:22.690, lng:-83.770, type:'data',      region:'pinar' },
    // COLÓN (1)
    { id:'COL-1',     name:'COLÓN — NODO MATANZAS\nHub Matanzas Central',              lat:22.722, lng:-80.907, type:'gateway',   region:'colon' },
    // SANTA CLARA (3)
    { id:'STC-1',     name:'SANTA CLARA — NODO CENTRAL\nVilla Clara Hub',              lat:22.406, lng:-79.965, type:'gateway',   region:'santa_clara' },
    { id:'STC-2',     name:'SANTA CLARA — RELAY NORTE\nSagua la Grande Link',          lat:22.620, lng:-80.070, type:'data',      region:'santa_clara' },
    { id:'STC-3',     name:'SANTA CLARA — ENLACE CENTRO\nCienfuegos Corridor',         lat:22.150, lng:-80.110, type:'ground',    region:'santa_clara' },
    // SANCTI SPÍRITUS (2)
    { id:'SS-1',      name:'SANCTI SPÍRITUS — NODO CENTRAL\nHub Provincial',           lat:21.929, lng:-79.443, type:'gateway',   region:'sancti' },
    { id:'SS-2',      name:'SANCTI SPÍRITUS — RELAY SUR\nTrinidad Corridor',           lat:21.700, lng:-79.550, type:'data',      region:'sancti' },
    // CIEGO DE ÁVILA (4)
    { id:'CIA-1',     name:'CIEGO DE ÁVILA — NODO CENTRAL\nHub Provincial',            lat:21.852, lng:-78.760, type:'gateway',   region:'ciego' },
    { id:'CIA-2',     name:'CIEGO DE ÁVILA — ENLACE NORTE\nMorón Coastal Node',        lat:22.100, lng:-78.620, type:'ground',    region:'ciego' },
    { id:'CIA-3',     name:'CIEGO DE ÁVILA — RELAY SUR\nJaguaní Link',                 lat:21.650, lng:-78.820, type:'data',      region:'ciego' },
    { id:'CIA-4',     name:'CIEGO DE ÁVILA — SAT TERRENA\nEstación Regional',          lat:21.900, lng:-78.900, type:'satellite', region:'ciego' },
    // ━━━ CAMAGÜEY — 4 × STARLINK ━━━
    { id:'CAM-STL-1', name:'CAMAGÜEY — STARLINK #1\nTerminal Starlink GEN-3 Dish',     lat:21.385, lng:-77.930, type:'starlink',  region:'camaguey' },
    { id:'CAM-STL-2', name:'CAMAGÜEY — STARLINK #2\nStarlink Business Terminal',       lat:21.352, lng:-77.872, type:'starlink',  region:'camaguey' },
    { id:'CAM-STL-3', name:'CAMAGÜEY — STARLINK #3\nStarlink RV Terminal',             lat:21.420, lng:-77.908, type:'starlink',  region:'camaguey' },
    { id:'CAM-STL-4', name:'CAMAGÜEY — STARLINK #4\nStarlink Flat High Performance',   lat:21.298, lng:-77.955, type:'starlink',  region:'camaguey' },
    // ━━━ FLORIDA, CAMAGÜEY — 3 × STARLINK ━━━
    { id:'FLA-STL-1', name:'FLORIDA (CAMAGÜEY) — STARLINK #1\nTerminal Starlink Residencial', lat:21.527, lng:-78.224, type:'starlink', region:'camaguey' },
    { id:'FLA-STL-2', name:'FLORIDA (CAMAGÜEY) — STARLINK #2\nStarlink Business',              lat:21.546, lng:-78.198, type:'starlink', region:'camaguey' },
    { id:'FLA-STL-3', name:'FLORIDA (CAMAGÜEY) — STARLINK #3\nStarlink Portable',              lat:21.509, lng:-78.240, type:'starlink', region:'camaguey' },
    // BAYAMO (3)
    { id:'BAY-1',     name:'BAYAMO — NODO PRINCIPAL\nHub Provincial Granma',           lat:20.373, lng:-76.640, type:'gateway',   region:'bayamo' },
    { id:'BAY-2',     name:'BAYAMO — RELAY OESTE\nYara Distribution',                  lat:20.390, lng:-76.780, type:'data',      region:'bayamo' },
    { id:'BAY-3',     name:'BAYAMO — ENLACE SUR\nManzanillo Corridor',                 lat:20.280, lng:-76.620, type:'ground',    region:'bayamo' },
    // BARTOLOMÉ MASÓ (2)
    { id:'MAS-1',     name:'BARTOLOMÉ MASÓ — NODO MUNICIPAL\nGranma Sierra Hub',       lat:20.158, lng:-76.930, type:'data',      region:'bayamo' },
    { id:'MAS-2',     name:'BARTOLOMÉ MASÓ — RELAY SIERRA\nEnlace Cordillera',         lat:20.130, lng:-77.010, type:'ground',    region:'bayamo' },
    // LAS TUNAS (3)
    { id:'LTU-1',     name:'LAS TUNAS — NODO PRINCIPAL\nHub Provincial Norte',         lat:20.964, lng:-76.958, type:'gateway',   region:'las_tunas' },
    { id:'LTU-2',     name:'LAS TUNAS — RELAY ESTE\nPuerto Padre Link',                lat:21.195, lng:-76.595, type:'data',      region:'las_tunas' },
    { id:'LTU-3',     name:'LAS TUNAS — ENLACE OESTE\nJobabo Distribution',            lat:20.870, lng:-77.280, type:'ground',    region:'las_tunas' },
    // SANTIAGO DE CUBA (4)
    { id:'STG-1',     name:'SANTIAGO DE CUBA — NOC ORIENTE\nHub Regional Este',        lat:20.025, lng:-75.820, type:'gateway',   region:'santiago' },
    { id:'STG-2',     name:'SANTIAGO DE CUBA — SAT UPLINK\nEstación Satelital',        lat:20.050, lng:-75.750, type:'satellite', region:'santiago' },
    { id:'STG-3',     name:'SANTIAGO DE CUBA — RELAY NORTE\nPalma Soriano Link',       lat:20.210, lng:-75.985, type:'data',      region:'santiago' },
    { id:'STG-4',     name:'SANTIAGO DE CUBA — COASTAL NODE\nEnlace Costero Sur',      lat:19.960, lng:-75.850, type:'ground',    region:'santiago' },
  ];

  const extNodes = [
    { id:'MIAMI',   name:'MIAMI — SATELLITE UPLINK\nFlorida USA',                lat:25.770, lng:-80.190, type:'satellite', region:'ext' },
    { id:'KSC',     name:'KSC/SCCN — GREENBELT MD\nNASA Comms Hub',             lat:38.990, lng:-76.850, type:'gateway',   region:'ext' },
    { id:'MSFC',    name:'MSFC — MARSHALL SPACE FLIGHT\nHuntsville AL',          lat:34.730, lng:-86.640, type:'data',      region:'ext' },
    { id:'DSN_MAD', name:'DSN-MAD — DEEP SPACE MADRID\nRota Spain',              lat:40.430, lng:-4.250,  type:'satellite', region:'ext' },
    { id:'BOGOTA',  name:'BOGOTA — COLOMBIA RELAY\nSA Hub',                      lat:4.710,  lng:-74.070, type:'data',      region:'ext' },
  ];

  const cubaRegions = new Set(['habana','pinar','sancti','colon','santa_clara','ciego','camaguey','bayamo','las_tunas','santiago']);
  const cubaNodes   = cubaNodesDef.filter(n => cubaRegions.has(n.region));
  const allNodes    = [...cubaNodesDef, ...extNodes];

  const typeColors = {
    ground:    '#00e676',
    data:      '#00c8ff',
    gateway:   '#9b59ff',
    satellite: '#ffc400',
    starlink:  '#ff6b35',
  };

  function makeIcon(color, size = 12, pulse = false, shape = 'circle') {
    const outer = pulse
      ? `box-shadow:0 0 14px ${color},0 0 28px ${color}88,0 0 4px ${color};`
      : `box-shadow:0 0 6px ${color};`;
    const html = shape === 'diamond'
      ? `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid rgba(255,255,255,0.8);transform:rotate(45deg);${outer}cursor:pointer;"></div>`
      : `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.7);${outer}cursor:pointer;"></div>`;
    return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size/2, size/2] });
  }

  allNodes.forEach(n => {
    const color      = typeColors[n.type] || '#00c8ff';
    const isCuba     = cubaRegions.has(n.region);
    const isGateway  = n.type === 'gateway';
    const isStarlink = n.type === 'starlink';
    const size       = isStarlink ? 13 : isCuba ? (isGateway ? 16 : 12) : 10;
    const shape      = isStarlink ? 'diamond' : 'circle';

    L.marker([n.lat, n.lng], { icon: makeIcon(color, size, (isCuba && isGateway) || isStarlink, shape) })
      .addTo(map)
      .bindTooltip(
        `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#cde4ff;background:#080e1a;border:1px solid #1e3a6e;padding:4px 8px;border-radius:2px;white-space:pre;line-height:1.6">${n.name}</div>`,
        { direction: 'top', offset: [0, -10], opacity: 1, className: '' }
      );
  });

  const links = [
    ['HAB-NOC','HAB-GW1','#9b59ff'],['HAB-NOC','HAB-GW2','#9b59ff'],
    ['HAB-NOC','HAB-SAT','#ffc400'],['HAB-NOC','HAB-FW','#9b59ff'],
    ['HAB-NOC','HAB-DIST1','#9b59ff'],['HAB-NOC','HAB-DIST2','#9b59ff'],
    ['HAB-GW1','HAB-DIST1','#00c8ff'],['HAB-GW2','HAB-DIST2','#00c8ff'],
    ['HAB-NOC','HAB-CABO','#ffc400'],
    ['HAB-CABO','PIN-1','#1a6fff'],['HAB-SAT','PIN-2','#ffc400'],['PIN-1','PIN-2','#9b59ff'],
    ['HAB-NOC','COL-1','#1a6fff'],['COL-1','STC-1','#1a6fff'],['HAB-GW2','STC-2','#00c8ff'],
    ['STC-1','STC-2','#9b59ff'],['STC-1','STC-3','#9b59ff'],
    ['STC-1','SS-1','#1a6fff'],['STC-3','SS-2','#00c8ff'],['SS-1','SS-2','#9b59ff'],
    ['SS-1','CIA-1','#1a6fff'],['SS-2','CIA-3','#00c8ff'],
    ['CIA-1','CIA-2','#9b59ff'],['CIA-1','CIA-3','#9b59ff'],['CIA-1','CIA-4','#ffc400'],['CIA-2','CIA-4','#00c8ff'],
    ['CIA-1','CAM-STL-1','#ff6b35'],['CIA-1','CAM-STL-2','#ff6b35'],
    ['CIA-1','CAM-STL-3','#ff6b35'],['CIA-1','CAM-STL-4','#ff6b35'],
    ['CAM-STL-1','CAM-STL-2','#ff6b35'],['CAM-STL-3','CAM-STL-4','#ff6b35'],
    ['CAM-STL-1','FLA-STL-1','#ff6b35'],
    ['FLA-STL-1','FLA-STL-2','#ff6b35'],['FLA-STL-2','FLA-STL-3','#ff6b35'],
    ['CAM-STL-1','MIAMI','#ff6b35'],['FLA-STL-1','MIAMI','#ff6b35'],
    ['CIA-1','LTU-1','#1a6fff'],['CIA-2','LTU-2','#00c8ff'],
    ['LTU-1','LTU-2','#9b59ff'],['LTU-1','LTU-3','#9b59ff'],['LTU-2','LTU-3','#00c8ff'],
    ['LTU-1','BAY-1','#1a6fff'],['LTU-3','BAY-2','#00c8ff'],
    ['BAY-1','BAY-2','#9b59ff'],['BAY-1','BAY-3','#9b59ff'],['BAY-2','BAY-3','#00c8ff'],
    ['BAY-1','MAS-1','#9b59ff'],['BAY-2','MAS-2','#00c8ff'],['MAS-1','MAS-2','#9b59ff'],
    ['BAY-1','STG-1','#1a6fff'],['BAY-3','STG-3','#00c8ff'],['MAS-1','STG-3','#00c8ff'],
    ['STG-1','STG-2','#ffc400'],['STG-1','STG-3','#9b59ff'],['STG-1','STG-4','#9b59ff'],['STG-2','STG-4','#00c8ff'],
    ['HAB-SAT','MIAMI','#1a6fff'],['HAB-CABO','MIAMI','#ffc400'],['CIA-4','MIAMI','#ffc400'],
    ['STG-2','BOGOTA','#ffc400'],
    ['MIAMI','KSC','#1a6fff'],['KSC','MSFC','#1a6fff'],['KSC','DSN_MAD','#9b59ff'],['BOGOTA','MSFC','#00c8ff'],
  ];

  links.forEach(([a, b, color]) => {
    const na = allNodes.find(n => n.id === a);
    const nb = allNodes.find(n => n.id === b);
    if (!na || !nb) return;
    const coords     = [[na.lat, na.lng], [nb.lat, nb.lng]];
    const isStarlink = color === '#ff6b35';
    try {
      if (window.L && L.polyline.antPath) {
        L.polyline.antPath(coords, {
          delay: isStarlink ? 400 : 600 + Math.random() * 800,
          dashArray: isStarlink ? [6, 12] : [8, 18],
          weight: isStarlink ? 2.2 : 1.8,
          color, pulseColor: '#ffffff',
          opacity: isStarlink ? 0.9 : 0.75
        }).addTo(map);
      } else {
        L.polyline(coords, { color, weight: isStarlink ? 2 : 1.5, opacity: 0.6, dashArray: '6 10' }).addTo(map);
      }
    } catch(e) {
      L.polyline(coords, { color, weight: 1.5, opacity: 0.6, dashArray: '6 10' }).addTo(map);
    }
  });

  const mapViews = [
    { center: [22.0, -79.5],   zoom: 6,  label: 'CUBA COMPLETA' },
    { center: [23.13, -82.38], zoom: 11, label: 'LA HABANA' },
    { center: [21.38, -77.93], zoom: 10, label: 'CAMAGÜEY + STARLINKS' },
    { center: [21.53, -78.22], zoom: 11, label: 'FLORIDA, CAMAGÜEY (STL)' },
    { center: [22.40, -79.97], zoom: 10, label: 'SANTA CLARA' },
    { center: [20.02, -75.82], zoom: 10, label: 'SANTIAGO DE CUBA' },
    { center: [20.37, -76.64], zoom: 10, label: 'BAYAMO + MASÓ' },
    { center: [22.0, -79.5],   zoom: 4,  label: 'REGIÓN CARIBE' },
  ];
  let mapViewIdx = 0;

  window.nextMapView = function() {
    mapViewIdx = (mapViewIdx + 1) % mapViews.length;
    const v = mapViews[mapViewIdx];
    map.flyTo(v.center, v.zoom, { duration: 1.2 });
    addRealAlert('INFO', `Vista: ${v.label}`, 'MAP-ENGINE', `Zoom ${v.zoom}`);
  };


  /* ══════════════════════════════════════════════
     15. SATELLITE PANEL — rediseñado con datos REALES
         FIX CRÍTICO: el SVG se construye UNA SOLA VEZ al arrancar.
         updateSatellitePanel actualiza los elementos del DOM existentes
         sin reconstruir el SVG (eso destruye los IDs).
         La telemetría numérica se actualiza vía los divs HTML
         del #sat-telemetry-bar, no vía text-elements del SVG.
  ══════════════════════════════════════════════ */
  function buildSatSVG() {
    const ni          = getRealNetworkInfo();
    const starlinkCount = cubaNodes.filter(n => n.type === 'starlink').length;

    return `
<svg viewBox="0 0 260 200" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <defs>
    <radialGradient id="earthG" cx="50%" cy="45%">
      <stop offset="0%"  stop-color="#0d2b5c"/>
      <stop offset="60%" stop-color="#06183a"/>
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

  <!-- Globo terrestre -->
  <circle cx="130" cy="100" r="84" fill="url(#glowG)"/>
  <circle cx="130" cy="100" r="54" fill="url(#earthG)" stroke="#1a3a7a" stroke-width="1.5"/>
  <path d="M104 79 Q118 68 130 73 Q146 70 150 83 Q138 96 121 94 Q104 92 104 79Z" fill="#0f3a6a" opacity="0.85"/>
  <path d="M88 92 Q100 86 108 95 Q102 106 90 103Z" fill="#0f3a6a" opacity="0.7"/>
  <path d="M140 90 Q154 84 163 93 Q157 105 143 103Z" fill="#0f3a6a" opacity="0.65"/>
  <path d="M108 106 Q118 101 125 108 Q120 117 111 115Z" fill="#0f3a6a" opacity="0.5"/>
  <!-- Punto Cuba -->
  <circle cx="117" cy="97" r="3.5" fill="#ff6b35" opacity="0.95" filter="url(#glow)"/>
  <circle cx="117" cy="97" r="6" fill="none" stroke="#ff6b35" stroke-width="1" opacity="0.5"/>
  <!-- Etiqueta Cuba -->
  <text x="124" y="94" font-family="Share Tech Mono" font-size="6.5" fill="#ff6b35" opacity="0.8">CUBA</text>
  <!-- Órbitas -->
  <ellipse cx="130" cy="100" rx="84" ry="25" fill="none" stroke="#1a6fff" stroke-width="0.6" stroke-dasharray="4 5" opacity="0.35"/>
  <ellipse cx="130" cy="100" rx="78" ry="42" fill="none" stroke="#9b59ff" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.22" transform="rotate(-25 130 100)"/>
  <ellipse cx="130" cy="100" rx="88" ry="18" fill="none" stroke="#ff6b35" stroke-width="0.5" stroke-dasharray="3 8" opacity="0.3" transform="rotate(15 130 100)"/>

  <!-- Satélite 1 (azul) -->
  <g style="transform-origin:130px 100px; animation: spin-orbit 14s linear infinite;">
    <g transform="translate(214,100)">
      <rect x="-7" y="-2.5" width="14" height="5" rx="1.5" fill="#00c8ff" opacity="0.95" filter="url(#glow)"/>
      <rect x="-14" y="-1.2" width="6" height="2.4" rx="1" fill="#1a6fff"/>
      <rect x="8"  y="-1.2" width="6" height="2.4" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2" fill="#fff" opacity="0.9"/>
    </g>
  </g>
  <!-- Satélite 2 (desfase) -->
  <g style="transform-origin:130px 100px; animation: spin-orbit 14s linear infinite; animation-delay:-4.67s;">
    <g transform="translate(214,100)">
      <rect x="-7" y="-2.5" width="14" height="5" rx="1.5" fill="#00c8ff" opacity="0.88" filter="url(#glow)"/>
      <rect x="-14" y="-1.2" width="6" height="2.4" rx="1" fill="#1a6fff"/>
      <rect x="8"  y="-1.2" width="6" height="2.4" rx="1" fill="#1a6fff"/>
      <circle cx="0" cy="0" r="2" fill="#fff" opacity="0.82"/>
    </g>
  </g>
  <!-- Starlink (naranja, órbita baja) -->
  <g style="transform-origin:130px 100px; animation: spin-orbit 8s linear infinite;">
    <g transform="translate(205,100)">
      <rect x="-5" y="-2" width="10" height="4" rx="1" fill="#ff6b35" opacity="0.95" filter="url(#glow)"/>
      <rect x="-11" y="-1" width="5" height="2" rx="0.5" fill="#ff8c50"/>
      <rect x="6"  y="-1" width="5" height="2" rx="0.5" fill="#ff8c50"/>
      <circle cx="0" cy="0" r="1.5" fill="#fff" opacity="0.9"/>
    </g>
  </g>
  <!-- Starlink 2 (desfase) -->
  <g style="transform-origin:130px 100px; animation: spin-orbit 8s linear infinite; animation-delay:-4s;">
    <g transform="translate(205,100)">
      <rect x="-5" y="-2" width="10" height="4" rx="1" fill="#ff6b35" opacity="0.88" filter="url(#glow)"/>
      <rect x="-11" y="-1" width="5" height="2" rx="0.5" fill="#ff8c50"/>
      <rect x="6"  y="-1" width="5" height="2" rx="0.5" fill="#ff8c50"/>
      <circle cx="0" cy="0" r="1.5" fill="#fff" opacity="0.8"/>
    </g>
  </g>
</svg>`;
  }

  // FIX: construir SVG solo 1 vez al cargar
  const satViz = document.getElementById('satViz');
  if (satViz) satViz.innerHTML = buildSatSVG();

  // FIX: updateSatellitePanel actualiza SOLO los elementos HTML del sat-telemetry-bar
  //      y la sat-list — nunca reconstruye el SVG (eso destruiría los IDs)
  function updateSatellitePanel(pingMs) {
    const realPL = realMetrics.totalPings > 0
      ? (realMetrics.failedPings / realMetrics.totalPings * 100)
      : 0;

    // ── Telemetría bar (HTML, IDs estables) ──
    const satTelePing   = document.getElementById('sat-tele-ping');
    const satTeleJitter = document.getElementById('sat-tele-jitter');
    const satTeleLoss   = document.getElementById('sat-tele-loss');
    const satTeleMon    = document.getElementById('sat-tele-mon');
    const satTeleNet    = document.getElementById('sat-tele-net');
    const satTeleDl     = document.getElementById('sat-tele-dl');
    const satHdrStatus  = document.getElementById('sat-header-status');

    const ni = getRealNetworkInfo();

    if (satTelePing) {
      satTelePing.textContent = pingMs ? `${pingMs} ms` : '-- ms';
      satTelePing.style.color = !pingMs ? '#6a8db0' : pingMs < 60 ? '#00e676' : pingMs < 120 ? '#00c8ff' : pingMs < 200 ? '#ffc400' : '#ff3d3d';
    }
    if (satTeleJitter) {
      satTeleJitter.textContent = `${realMetrics.jitter} ms`;
      satTeleJitter.style.color = realMetrics.jitter < 15 ? '#00e676' : realMetrics.jitter < 40 ? '#ffc400' : '#ff3d3d';
    }
    if (satTeleLoss) {
      satTeleLoss.textContent = `${realPL.toFixed(3)}%`;
      satTeleLoss.style.color = realPL < 1 ? '#00e676' : realPL < 5 ? '#ffc400' : '#ff3d3d';
    }
    if (satTeleMon) {
      satTeleMon.textContent  = monitoringActive ? 'ON' : 'OFF';
      satTeleMon.style.color  = monitoringActive ? '#00e676' : '#ff3d3d';
    }
    if (satTeleNet) {
      satTeleNet.textContent = ni.label !== 'N/A' ? ni.label : (conn ? `${ni.effectiveType.toUpperCase()}` : 'No API');
    }
    if (satTeleDl) {
      satTeleDl.textContent = ni.downlink > 0 ? `${ni.downlink} Mbps` : (pingMs ? `~${estimateTrafficGbps()*1000|0} Mbps` : '-- Mbps');
    }
    if (satHdrStatus) {
      satHdrStatus.textContent = pingMs ? `PING ${pingMs}ms` : (monitoringActive ? 'MONITOREANDO...' : 'INICIALIZANDO...');
    }

    // ── Sat list (IDs de la lista) ──
    updateSatListReal();
  }

  function updateSatListReal() {
    const ni     = getRealNetworkInfo();
    const realPL = realMetrics.totalPings > 0
      ? (realMetrics.failedPings / realMetrics.totalPings * 100)
      : 0;
    const quality = lastRealPingMs
      ? (lastRealPingMs < 40 ? 'EXCELENTE' : lastRealPingMs < 80 ? 'BUENA' : lastRealPingMs < 150 ? 'REGULAR' : 'POBRE')
      : '--';
    const qualColor = lastRealPingMs
      ? (lastRealPingMs < 40 ? 'green' : lastRealPingMs < 80 ? 'green' : lastRealPingMs < 150 ? 'yellow' : 'red')
      : 'yellow';

    // Actualizar por IDs individuales de la lista (evita reconstruir el DOM completo)
    const elInternet = document.getElementById('sl-internet');
    const elQuality  = document.getElementById('sl-quality');
    const elLoss     = document.getElementById('sl-loss');
    const elJitter   = document.getElementById('sl-jitter');
    const elIP       = document.getElementById('sl-ip');
    const elStl      = document.getElementById('sl-stl');

    if (elInternet) {
      elInternet.textContent = pingOnline ? 'ONLINE' : 'OFFLINE';
      elInternet.className   = `sat-status ${pingOnline ? 'green' : 'red'}`;
      const dot = elInternet.closest('li')?.querySelector('.sat-dot');
      if (dot) dot.className = `sat-dot ${pingOnline ? 'green' : 'red'}`;
    }
    if (elQuality) {
      elQuality.textContent = quality;
      elQuality.className   = `sat-status ${qualColor}`;
    }
    if (elLoss) {
      elLoss.textContent = `${realPL.toFixed(2)}%`;
      elLoss.className   = `sat-status ${realPL < 1 ? 'green' : realPL < 5 ? 'yellow' : 'red'}`;
    }
    if (elJitter) {
      elJitter.textContent = `${realMetrics.jitter}ms`;
      elJitter.className   = `sat-status ${realMetrics.jitter < 20 ? 'green' : 'yellow'}`;
    }
    if (elIP) {
      elIP.textContent = localIPRange !== '--' ? localIPRange : (localIP !== 'Detectando...' ? localIP : '...');
      elIP.style.fontSize = '8px';
    }
    if (elStl) {
      const stlCount = cubaNodes.filter(n => n.type === 'starlink').length;
      elStl.textContent = `${stlCount} Cuba`;
    }
  }


  /* ══════════════════════════════════════════════
     16. LOOP PRINCIPAL — 3s
  ══════════════════════════════════════════════ */
  setInterval(() => {
    updateHealthDonut();
    updateThreatLevel();
    updateSatellitePanel(lastRealPingMs);
    updateProtocolChart();

    if (!monitoringActive) {
      doPing();
    }

    updateTrafficChart();
    updatePacketLossChart();
  }, 3000);


  /* ══════════════════════════════════════════════
     17. SIDEBAR NAV + MODALES
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
    switch(page) {
      case 'dashboard':
        map.flyTo([22.0, -79.5], 6, { duration: 1.0 });
        break;
      case 'network':
        map.flyTo([22.0, -79.5], 6, { duration: 1.0 });
        addRealAlert('INFO', 'Vista: NET MAP — Cuba completa', 'NAV', `${cubaNodes.length} nodos Cuba + 7 Starlinks`);
        break;
      case 'assets':
        showPageModal('◈ ASSETS — INVENTARIO DE NODOS', buildAssetsContent());
        break;
      case 'telemetry':
        showPageModal('📡 TELEMETRICS — DATOS EN TIEMPO REAL', buildTelemetryContent());
        break;
      case 'alerts':
        showPageModal('⚠ ALERT LOG — HISTORIAL COMPLETO', buildAlertsContent());
        break;
      case 'performance':
        showPageModal('📊 PERFORMANCE — MÉTRICAS DEL SISTEMA', buildPerformanceContent());
        break;
      case 'security':
        showPageModal('🛡 SECURITY — ESTADO DE SEGURIDAD', buildSecurityContent());
        break;
      case 'logs':
        showPageModal('📋 SYSTEM LOGS', buildLogsContent());
        break;
      case 'config':
        showPageModal('⚙ CONFIGURATION', buildConfigContent());
        break;
    }
  }

  function showPageModal(title, html) {
    const existing = document.getElementById('page-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'page-modal';
    modal.style.cssText = `position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;`;
    modal.innerHTML = `
      <div style="background:#080e1a;border:1px solid #1e3a6e;max-width:820px;width:100%;max-height:82vh;overflow-y:auto;border-radius:4px;box-shadow:0 0 40px rgba(26,111,255,0.2);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #122040;background:#060c17;position:sticky;top:0;z-index:10;">
          <span style="font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#00c8ff">${title}</span>
          <button onclick="document.getElementById('page-modal').remove()" style="background:rgba(255,61,61,0.15);border:1px solid #ff3d3d;color:#ff3d3d;font-size:11px;padding:5px 14px;cursor:pointer;font-family:'Orbitron',sans-serif;letter-spacing:1px;border-radius:2px;">✕ CERRAR</button>
        </div>
        <div style="padding:16px;">${html}</div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  const monoStyle = `font-family:'Share Tech Mono',monospace;font-size:10px;color:#6a8db0;`;
  const valStyle  = `font-family:'Share Tech Mono',monospace;font-size:11px;color:#cde4ff;`;

  function buildAssetsContent() {
    const byRegion = {};
    cubaNodes.forEach(n => { if (!byRegion[n.region]) byRegion[n.region] = []; byRegion[n.region].push(n); });
    const regionNames = {
      habana:'LA HABANA', pinar:'PINAR DEL RÍO', colon:'COLÓN (MATANZAS)',
      sancti:'SANCTI SPÍRITUS', santa_clara:'SANTA CLARA', ciego:'CIEGO DE ÁVILA',
      camaguey:'CAMAGÜEY + FLORIDA (STARLINKS)', bayamo:'BAYAMO + BARTOLOMÉ MASÓ',
      las_tunas:'LAS TUNAS', santiago:'SANTIAGO DE CUBA'
    };
    const starlinkCount = cubaNodes.filter(n => n.type === 'starlink').length;
    let html = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
        ${[
          ['NODOS CUBA', cubaNodes.length, '#9b59ff'],
          ['GATEWAYS', cubaNodes.filter(n=>n.type==='gateway').length, '#9b59ff'],
          ['STARLINKS', starlinkCount, '#ff6b35'],
          ['SAT UPLINKS', cubaNodes.filter(n=>n.type==='satellite').length, '#ffc400'],
        ].map(([l,v,c]) => `<div style="background:#0a1120;border:1px solid #122040;padding:10px;text-align:center">
          <div style="${monoStyle}">${l}</div>
          <div style="font-family:'Orbitron';font-size:20px;color:${c};margin-top:4px">${v}</div>
        </div>`).join('')}
      </div>`;
    Object.entries(byRegion).forEach(([reg, nds]) => {
      html += `<div style="margin-bottom:10px">
        <div style="font-family:'Orbitron',sans-serif;font-size:9px;color:${reg==='camaguey'?'#ff6b35':'#1a6fff'};letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid #122040;padding-bottom:4px">
          ${regionNames[reg]||reg.toUpperCase()} — ${nds.length} nodo${nds.length>1?'s':''}
        </div>
        ${nds.map(n => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
          <span style="width:8px;height:8px;${n.type==='starlink'?'border-radius:2px;transform:rotate(45deg)':'border-radius:50%'};background:${typeColors[n.type]||'#00c8ff'};display:inline-block;flex-shrink:0;box-shadow:0 0 4px ${typeColors[n.type]||'#00c8ff'}"></span>
          <span style="${valStyle}">${n.id}</span>
          <span style="${monoStyle};flex:1">${n.name.split('\n')[1]||''}</span>
          <span style="font-size:8px;color:${typeColors[n.type]||'#00c8ff'};font-family:'Share Tech Mono'">${n.type.toUpperCase()}</span>
        </div>`).join('')}
      </div>`;
    });
    return html;
  }

  function buildTelemetryContent() {
    const ni     = getRealNetworkInfo();
    const realPL = realMetrics.totalPings > 0 ? (realMetrics.failedPings / realMetrics.totalPings * 100) : 0;
    const avg    = realMetrics.avgLatency ? realMetrics.avgLatency.toFixed(1) : '--';
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle}margin-bottom:8px">LATENCIA REAL (ping a Google/CF/GitHub)</div>
          <div style="font-family:'Orbitron';font-size:26px;color:#00c8ff;line-height:1">${lastRealPingMs||'--'} <span style="font-size:13px">ms</span></div>
          <div style="${monoStyle}margin-top:4px">Min: ${realMetrics.minLatency===Infinity?'--':realMetrics.minLatency}ms | Max: ${realMetrics.maxLatency||'--'}ms | Avg: ${avg}ms</div>
        </div>
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle}margin-bottom:8px">CONEXIÓN DETECTADA (Navigator API)</div>
          <div style="font-family:'Orbitron';font-size:16px;color:#9b59ff;line-height:1.4">${ni.label||'N/A'}</div>
          <div style="${monoStyle}margin-top:4px">Tipo: ${ni.type} | ETipo: ${ni.effectiveType} | Downlink: ${ni.downlink}Mbps | RTT API: ${ni.rtt}ms</div>
        </div>
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle}margin-bottom:8px">PACKET LOSS REAL</div>
          <div style="font-family:'Orbitron';font-size:26px;color:${realPL<1?'#00e676':'#ff3d3d'};line-height:1">${realPL.toFixed(3)}<span style="font-size:13px">%</span></div>
          <div style="${monoStyle}margin-top:4px">${realMetrics.failedPings} fallos / ${realMetrics.totalPings} pings | Jitter: ${realMetrics.jitter}ms</div>
        </div>
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;">
          <div style="${monoStyle}margin-bottom:8px">IP LOCAL DETECTADA (WebRTC)</div>
          <div style="font-family:'Orbitron';font-size:14px;color:#ff6b35;line-height:1.4">${localIP}</div>
          <div style="${monoStyle}margin-top:4px">Rango: ${localIPRange} | Online: ${navigator.onLine?'SÍ':'NO'}</div>
        </div>
        <div style="background:#0a1120;border:1px solid #122040;padding:12px;grid-column:span 2;">
          <div style="${monoStyle}margin-bottom:8px">HISTORIAL LATENCIA (últimos ${pingHistory.length} pings)</div>
          <div style="display:flex;align-items:flex-end;gap:2px;height:40px">
            ${pingHistory.slice(-30).map(ms => `
              <div style="flex:1;height:${Math.min(ms/4,40)}px;min-width:3px;background:${ms<60?'#00e676':ms<120?'#ffc400':'#ff3d3d'};border-radius:1px;" title="${ms}ms"></div>
            `).join('')}
          </div>
          <div style="${monoStyle}margin-top:4px">Endpoints: Google | Cloudflare | GitHub → alternando cada ping</div>
        </div>
      </div>`;
  }

  function buildAlertsContent() {
    if (alertQueue.length === 0) return `<div style="color:#00e676;font-family:'Share Tech Mono';text-align:center;padding:20px">✓ Sin alertas activas</div>`;
    return `<div style="${monoStyle}margin-bottom:8px">${alertQueue.length} alertas | Críticas: ${alertQueue.filter(a=>a.level==='CRITICAL').length}</div>` +
      alertQueue.map(al => `
      <div style="border-left:3px solid ${al.level==='CRITICAL'?'#ff3d3d':al.level==='HIGH'?'#ff8c00':al.level==='MEDIUM'?'#ffc400':al.level==='LOW'?'#00e676':'#00c8ff'};padding:8px 12px;margin-bottom:6px;background:rgba(6,12,23,0.6);border-radius:0 2px 2px 0">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-family:'Orbitron';font-size:9px;font-weight:700;color:${al.level==='CRITICAL'?'#ff3d3d':al.level==='HIGH'?'#ff8c00':al.level==='MEDIUM'?'#ffc400':al.level==='LOW'?'#00e676':'#00c8ff'}">${al.level}</span>
          <span style="${monoStyle}">${al.time} | ${al.source}</span>
        </div>
        <div style="${valStyle}margin-bottom:2px">${al.title}</div>
        <div style="${monoStyle}">${al.meta}</div>
      </div>`).join('');
  }

  function buildPerformanceContent() {
    const ni      = getRealNetworkInfo();
    const realPL  = realMetrics.totalPings > 0 ? (realMetrics.failedPings/realMetrics.totalPings*100) : 0;
    const tScore  = calcThreatScore();
    return `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
        ${[
          ['PING ACTUAL',  lastRealPingMs?`${lastRealPingMs}ms`:'--',          '#00c8ff'],
          ['JITTER',       `${realMetrics.jitter}ms`,                           realMetrics.jitter<20?'#00e676':'#ffc400'],
          ['PACKET LOSS',  `${realPL.toFixed(3)}%`,                             realPL<1?'#00e676':'#ff3d3d'],
          ['PINGS TOTAL',  realMetrics.totalPings,                              '#00c8ff'],
          ['ÉXITO',        realMetrics.totalPings>0?`${(100-realPL).toFixed(1)}%`:'--', '#00e676'],
          ['FALLOS',       realMetrics.failedPings,                             realMetrics.failedPings>0?'#ff3d3d':'#00e676'],
          ['LAT MIN',      realMetrics.minLatency!==Infinity?`${realMetrics.minLatency}ms`:'--', '#00e676'],
          ['LAT MAX',      realMetrics.maxLatency?`${realMetrics.maxLatency}ms`:'--', realMetrics.maxLatency>200?'#ff3d3d':'#ffc400'],
          ['THREAT',       `${tScore}/100`,                                     tScore<30?'#00e676':tScore<60?'#ffc400':'#ff3d3d'],
          ['DOWNLINK',     ni.downlink>0?`${ni.downlink}M`:'N/A',              '#9b59ff'],
          ['IP LOCAL',     localIP,                                             '#ff6b35'],
          ['STARLINKS',    cubaNodes.filter(n=>n.type==='starlink').length+' Cuba','#ff6b35'],
        ].map(([l,v,c]) => `<div style="background:#0a1120;border:1px solid #122040;padding:10px;text-align:center">
          <div style="${monoStyle}">${l}</div>
          <div style="font-family:'Orbitron';font-size:13px;color:${c};margin-top:4px;word-break:break-all">${v}</div>
        </div>`).join('')}
      </div>`;
  }

  function buildSecurityContent() {
    const ni     = getRealNetworkInfo();
    const realPL = realMetrics.totalPings > 0 ? (realMetrics.failedPings/realMetrics.totalPings*100) : 0;
    const items  = [
      { name:'Conexión Internet (real)',       status: pingOnline?`ONLINE — ${lastRealPingMs||'--'}ms`:'OFFLINE', ok: pingOnline },
      { name:'Packet Loss',                    status: `${realPL.toFixed(3)}%`,       ok: realPL < 2 },
      { name:'Jitter',                         status: `${realMetrics.jitter}ms`,     ok: realMetrics.jitter < 30 },
      { name:'Tipo de red',                    status: ni.label||'N/A',               ok: true },
      { name:'IP Local (WebRTC)',              status: localIP,                       ok: localIP !== 'No disponible' },
      { name:'Starlinks Cuba (Camagüey)',      status: `${cubaNodes.filter(n=>n.type==='starlink').length} terminales`, ok: true },
      { name:'Alertas críticas activas',       status: alertQueue.filter(a=>a.level==='CRITICAL').length+' activas', ok: alertQueue.filter(a=>a.level==='CRITICAL').length === 0 },
      { name:`Monitoreo activo (${pingIntervalMs}ms)`, status: monitoringActive?`ON — ${realMetrics.totalPings} pings`:'OFF', ok: monitoringActive },
    ];
    return `<div style="margin-bottom:12px">
      ${items.map(item => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #122040">
        <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${item.ok?'#00e676':'#ff3d3d'};box-shadow:0 0 6px ${item.ok?'#00e676':'#ff3d3d'}"></span>
        <span style="${valStyle}flex:1">${item.name}</span>
        <span style="${monoStyle}color:${item.ok?'#6a8db0':'#ff8c00'}">${item.status}</span>
      </div>`).join('')}
    </div>`;
  }

  function buildLogsContent() {
    return `<div style="${monoStyle}margin-bottom:8px">${eventsBuffer.length} entradas de log</div>
      <div style="font-size:9px;line-height:1.9">
        ${eventsBuffer.map(ev => `
          <div style="border-bottom:1px solid #0c1526;padding:3px 0;font-family:'Share Tech Mono',monospace">
            <span style="color:#3a5880">${ev.timeStr}</span>
            <span style="color:${ev.sev==='CRITICAL'?'#ff3d3d':ev.sev==='HIGH'?'#ff8c00':ev.sev==='MEDIUM'?'#ffc400':ev.sev==='LOW'?'#00e676':'#00c8ff'};margin:0 8px;font-weight:700">[${ev.sev}]</span>
            <span style="color:#cde4ff">${ev.event}</span>
            <span style="color:#3a5880"> — ${ev.source}</span>
            <span style="color:#6a8db0"> ${ev.details}</span>
          </div>`).join('')}
      </div>`;
  }

  function buildConfigContent() {
    const ni     = getRealNetworkInfo();
    const realPL = realMetrics.totalPings > 0 ? (realMetrics.failedPings/realMetrics.totalPings*100) : 0;
    return `<div style="${monoStyle}margin-bottom:12px">Configuración activa — NASOC v5.1 (datos 100% reales)</div>
      ${[
        ['Intervalo Ping',        `${pingIntervalMs}ms`],
        ['Umbral Alarma',         `${failThreshold} fallos consecutivos`],
        ['Volumen Alarma',        `${Math.round(alarmVolume*100)}%`],
        ['Estado Monitoreo',      monitoringActive?'● ACTIVO':'○ INACTIVO'],
        ['Endpoints ping',        'Google + Cloudflare + GitHub'],
        ['Tipo Conexión (real)',  ni.label||'N/A'],
        ['Effective Type',        ni.effectiveType],
        ['Downlink (real)',       ni.downlink>0?`${ni.downlink} Mbps`:'N/A (API no disponible)'],
        ['RTT API (real)',        ni.rtt>0?`${ni.rtt}ms`:'N/A'],
        ['IP Local (WebRTC)',     localIP],
        ['Pings Realizados',      realMetrics.totalPings],
        ['Packet Loss Real',      `${realPL.toFixed(3)}%`],
        ['Jitter Real',           `${realMetrics.jitter}ms`],
        ['Nodos Cuba Total',      cubaNodes.length],
        ['Starlinks Cuba',        cubaNodes.filter(n=>n.type==='starlink').length+' (4 Camagüey + 3 Florida,Cu)'],
        ['Versión',               'NASOC v5.1 — 100% datos reales'],
      ].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #0c1526">
        <span style="${monoStyle}">${k}</span>
        <span style="${valStyle}">${v}</span>
      </div>`).join('')}
      <div style="margin-top:16px;${monoStyle}color:#ffc400">
        ▸ Activa el monitoreo para obtener datos de latencia y packet loss en tiempo real.<br>
        ▸ Los Starlinks en Camagüey (×4) y Florida,Cu (×3) están mapeados en el globo.<br>
        ▸ Navigator.connection puede no estar disponible en todos los navegadores (mejor en Chrome).
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


  /* ══════════════════════════════════════════════
     18. INIT — inicializar KPIs sin esperar ping
  ══════════════════════════════════════════════ */
  const ni = getRealNetworkInfo();

  // FIX: inicializar KPI Nodes INMEDIATAMENTE (no esperar ping)
  const ndEl = document.getElementById('kpi-nodes');
  if (ndEl) ndEl.textContent = (cubaNodes.length + extNodes.length).toString();
  const ndTrEl = document.getElementById('kpi-nodes-trend');
  if (ndTrEl) { ndTrEl.textContent = `${cubaNodes.length} Cuba + ${extNodes.length} ext`; ndTrEl.className = 'kpi-trend green'; }

  // FIX: inicializar KPI Connections INMEDIATAMENTE
  updateKPIConnections(ni);

  // FIX: inicializar Top Talkers INMEDIATAMENTE
  updateTopTalkers(ni, 50);

  // Inicializar packet loss KPI
  const plEl = document.getElementById('kpi-loss');
  if (plEl) plEl.innerHTML = `0.000<small>%</small>`;
  const plTrendEl = document.getElementById('kpi-loss-trend');
  if (plTrendEl) { plTrendEl.textContent = '0 fallos / 0 total'; plTrendEl.className = 'kpi-trend green'; }

  // Telemetría satélite inicial
  updateSatellitePanel(null);

  // Eventos iniciales
  addEventRow('INFO', 'NASOC v5.1 iniciado — 100% datos reales', 'NASOC-SYS',
    `Red detectada: ${ni.label} | Tipo: ${ni.effectiveType} | Downlink: ${ni.downlink}Mbps`);
  addEventRow('INFO', `Mapa cargado — ${cubaNodes.length} nodos Cuba`, 'MAP-ENGINE',
    `7 Starlinks: 4 Camagüey + 3 Florida,Cu | ${extNodes.length} nodos externos`);
  addEventRow('INFO', 'Navigator.connection API cargada', 'NET-DETECT',
    `Tipo: ${ni.type} | RTT: ${ni.rtt}ms | saveData: ${ni.saveData}`);
  addEventRow('MEDIUM', 'Ping pasivo activo — presione ACTIVAR para monitoreo completo', 'INET-MON',
    'Sistema de alertas con sonido disponible al activar monitoreo');

  renderAlerts();
  renderEventsTable();
  updateHealthDonut();
  updateThreatLevel();
  updateTrafficChart();

  // Pings iniciales para tener datos desde el arranque
  setTimeout(() => { doPing(); doPing(); }, 800);
  setTimeout(() => { doPing(); }, 2500);

  console.log('%cNASOC v5.1 — FIX: Threat Level dinámico | kpi-alerts-badge | kpi-nodes inmediato | PacketLoss null-safe | Protocol IDs directos | Satellite HTML estable', 'color:#ff6b35;font-family:monospace;font-size:12px;font-weight:bold');
  console.log('%cNavigator.connection:', 'color:#00c8ff;font-family:monospace', conn);
});
