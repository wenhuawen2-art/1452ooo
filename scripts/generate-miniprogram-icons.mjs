import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const output = join(process.cwd(), "wechat-miniprogram", "miniprogram", "assets", "icons");
mkdirSync(output, { recursive: true });

const wrap = (body, { fill = "none", stroke = "#4f86dc", width = 2 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icons = {
  "edit.svg": wrap('<path d="m16 3 5 5-12 12-6 1 1-6L16 3m-2 2 5 5"/>'),
  "trash.svg": wrap('<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>', { stroke: "#d55757" }),
  "map-pin.svg": wrap('<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
  "nav-today.svg": wrap('<circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1"/>', { fill: "#111827", stroke: "#111827", width: 1.8 }),
  "nav-route.svg": wrap('<path d="M3 5.5 9 3l6 2.5L21 3v15.5L15 21l-6-2.5L3 21V5.5Z"/><path d="M9 3v15.5M15 5.5V21"/>', { fill: "#111827", stroke: "#111827", width: 1.5 }),
  "nav-list.svg": wrap('<rect x="3" y="4" width="5" height="5" rx="1"/><rect x="3" y="11" width="5" height="5" rx="1"/><rect x="3" y="18" width="5" height="3" rx="1"/><path d="M11 6.5h10M11 13.5h10M11 19.5h10"/>', { fill: "#111827", stroke: "#111827", width: 1.8 }),
  "nav-people.svg": wrap('<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0Z"/>', { fill: "#111827", stroke: "#111827", width: 1.6 }),
};

const templates = {
  "travel-medicine": '<path d="M9 3h6v4h3a2 2 0 0 1 2 2v9H4V9a2 2 0 0 1 2-2h3V3Z"/><path d="M12 10v6m-3-3h6"/>',
  "travel-documents": '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 12h6m-6 4h6"/>',
  "vehicle-check": '<path d="m4 15 1.5-5h13l1.5 5v4H4v-4Z"/><path d="m7 10 1-3h8l1 3M7 19v2m10-2v2M7 15h.01M17 15h.01"/>',
  "home-safety": '<path d="m3 11 9-7 9 7v9H3v-9Z"/><path d="M9 20v-6h6v6M7 10h.01M17 10h.01"/>',
  "road-emergency": '<path d="M5 7h14v13H5zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M12 10v6m-3-3h6"/>',
  "road-trip-comfort": '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H5a3 3 0 0 0 0 6h2m5 2v6m-4 0h8"/>',
  "electronics-navigation": '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/>',
  "clothing-toiletries": '<path d="m9 4 3 2 3-2 5 4-3 4-2-1v10H9V11l-2 1-3-4 5-4Z"/>',
  "lodging-checkin": '<path d="M4 19V6a2 2 0 0 1 2-2h5v15M4 13h16v6M11 8h2m-2 3h2M17 13v6"/>',
  "camping-outdoor": '<path d="m3 20 9-16 9 16H3Z"/><path d="m9 20 3-6 3 6M6 16h12"/>',
  "family-travel": '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a5 5 0 0 1 7 0"/>',
  "pet-travel": '<path d="M8 11c-2 0-4 2-4 5 0 2 1 3 3 3 2 0 3-1 5-1s3 1 5 1c2 0 3-1 3-3 0-3-2-5-4-5-1 0-2 .5-4 .5S9 11 8 11Z"/><circle cx="7" cy="7" r="1.5"/><circle cx="12" cy="5.5" r="1.5"/><circle cx="17" cy="7" r="1.5"/>',
  "long-drive-safety": '<path d="m12 3 8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"/><path d="m8 12 2.5 2.5L16 9"/>',
};

for (const [name, body] of Object.entries(icons)) writeFileSync(join(output, name), body);
for (const [id, body] of Object.entries(templates)) writeFileSync(join(output, `template-${id}.svg`), wrap(body, { stroke: "#557ba8", width: 1.7 }));
