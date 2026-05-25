# NASOC – NASA Network Operations Center Dashboard

A pixel-faithful replica of the NASA Network Operations Center (NASOC) monitoring dashboard, built as a static HTML/CSS/JS frontend.

## 🚀 Live Preview

Open `index.html` directly in your browser — no build step required.

## 📁 Project Structure

```
nasoc/
├── index.html          # Main dashboard HTML
├── css/
│   └── style.css       # All styles (dark sci-fi theme)
├── js/
│   └── main.js         # Charts, map, clock, animations
└── README.md
```

## 📦 Dependencies (loaded via CDN)

| Library | Purpose |
|---|---|
| [Chart.js 4.4](https://www.chartjs.org/) | All charts (area, donut, bar, sparkline) |
| [Leaflet 1.9](https://leafletjs.com/) | Interactive world map |
| [Leaflet Ant Path](https://github.com/rubenspgcavalcante/leaflet-ant-path) | Animated route lines on map |
| [Google Fonts – Orbitron, Rajdhani, Share Tech Mono](https://fonts.google.com/) | Typography |
| OpenStreetMap tiles | Map tiles (free) |

> All dependencies are free and open-source. No API keys required.

## ✨ Features

- **Live UTC clock** — updates every second
- **Interactive Leaflet map** — pan/zoom, animated network links, tooltips on each node
- **Chart.js charts** — Network Traffic (24H), Latency Heatmap, Protocol Distribution donut, Packet Loss (24H), System Health donut, Sparkline
- **Active Alerts panel** — critical alert pulse animation
- **Top Talkers, Link Status, Recent Events** tables
- **Satellite Links** — SVG orbital visualization with TDRS satellites
- **Sidebar navigation** — click to activate
- **Fully responsive** layout (best viewed at 1280px+)

## 🛠 Adding Functionality

### Connect real data
Replace the static values in `js/main.js` with API calls:

```js
// Example: fetch live network metrics
const res = await fetch('https://your-api/metrics');
const data = await res.json();
// Then update chart datasets or DOM elements
```

### WebSocket live updates
```js
const ws = new WebSocket('wss://your-backend/ws');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // Update charts, KPIs, alerts...
};
```

## 🖥 Recommended Viewport

Best at **1440×900** or wider. The dashboard is designed for operator workstation screens.

## 📄 License

MIT — free to use, modify, and distribute.
