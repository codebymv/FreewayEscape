const { performance } = require('perf_hooks');

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="road"></div></body></html>`);
const document = dom.window.document;
const roadElement = document.getElementById("road");

// Add 1000 child elements to simulate a complex road
for (let i = 0; i < 1000; i++) {
  const el = document.createElement("div");
  roadElement.appendChild(el);
}

// Add 5 manual assets
const manualAssets = new Set();
for (let i = 0; i < 5; i++) {
  const el = document.createElement("div");
  el._isManualAsset = true;
  el._cleanupTimer = 123;
  roadElement.appendChild(el);
  manualAssets.add(el);
}

const ITERATIONS = 1000;

// Test querySelectorAll
const startQuery = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const assetElements = roadElement.querySelectorAll('div');
  assetElements.forEach(element => {
    if (element._isManualAsset && element._cleanupTimer) {
      // do something
      const x = element._cleanupTimer;
    }
  });
}
const endQuery = performance.now();

// Test Set iteration
const startSet = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  manualAssets.forEach(element => {
    if (element._isManualAsset && element._cleanupTimer) {
      // do something
      const x = element._cleanupTimer;
    }
  });
}
const endSet = performance.now();

console.log(`querySelectorAll time: ${endQuery - startQuery} ms`);
console.log(`Set iteration time: ${endSet - startSet} ms`);
console.log(`Improvement: ${((endQuery - startQuery) / (endSet - startSet)).toFixed(2)}x faster`);
