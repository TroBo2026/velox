/* VELOX Konsistenzprüfung: Ist der Offline-Cache vollständig und sind alle Versionsnummern gleich?
   Fängt genau die Fehler ab, die sonst unbemerkt bleiben (Datei vergessen in sw.js, Version nur halb hochgezählt).
   Ausführen: node consistency.test.js */
const fs = require("fs"), path = require("path");
const R = __dirname + "/";
const read = (f) => fs.readFileSync(R + f, "utf8");
let failed = false;
const ok = (c, m) => { if (!c) { console.log("  ✗", m); failed = true; } else console.log("  ✓", m); };
const first = (text, re) => { const m = text.match(re); return m ? m[1] : null; };

/* 1. Offline-Cache */
const sw = read("sw.js");
const shellBlock = first(sw, /const SHELL = \[([\s\S]*?)\];/);
const shell = shellBlock ? [...shellBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
ok(shell.length > 5, "SHELL-Liste in sw.js gefunden (" + shell.length + " Einträge)");
const html = read("index.html");
const refs = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)].map((m) => "./" + m[1]);
ok(refs.length > 5, "index.html verweist auf " + refs.length + " lokale Dateien");
refs.forEach((f) => ok(shell.includes(f), "Im Offline-Cache: " + f));
shell.filter((f) => f !== "./").forEach((f) => ok(fs.existsSync(R + f.slice(2)), "Datei existiert: " + f));
ok(/const CACHE = "velox-shell-v\d+"/.test(sw), "Cache-Name folgt dem Muster velox-shell-vN");

/* 2. Versionsnummern */
const appVersion = first(read("app.js"), /APP_VERSION = "([^"]+)"/);
ok(!!appVersion, "APP_VERSION in app.js: " + appVersion);
const versions = {
  "Kopfzeile von app.js": first(read("app.js"), /^\/\* VELOX (\d+\.\d+\.\d+)/),
  "Versionsfeld in index.html": first(html, /VERSION (\d+\.\d+\.\d+)/),
  "Info-Text in index.html": first(html, /VELOX (\d+\.\d+\.\d+) bleibt/),
  "oberster CHANGELOG-Eintrag": first(read("CHANGELOG.md"), /^## (\d+\.\d+\.\d+)/m),
  "velox-polish.css": first(read("velox-polish.css"), /VELOX (\d+\.\d+\.\d+)/),
  "velox-plus.js": first(read("velox-plus.js"), /VELOX Plus (\d+\.\d+\.\d+)/)
};
Object.entries(versions).forEach(([name, v]) => ok(v === appVersion, name + ": " + v + (v === appVersion ? "" : " (erwartet " + appVersion + ")")));

console.log(failed ? "\nFEHLER" : "\nKonsistenzprüfung bestanden");
process.exit(failed ? 1 : 0);
