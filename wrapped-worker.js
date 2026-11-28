/* Offline im App-Shell-Cache. Jeder Worker bearbeitet genau eine Jahresauswahl. */
importScripts("./elevation-core.js","./ride-core.js","./wrapped-core.js");
self.onmessage=({data})=>self.postMessage(self.VELOXWrapped.analyzeYear(data.rides,data.year));
