const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const productsSource = html.match(/const P=(\[[\s\S]*?\]);\s*let cat/);
const imagesSource = html.match(/const IMG=(\[[\s\S]*?\]);\s*const OFFICIAL/);

assert.ok(productsSource, 'No se encontró el catálogo P');
assert.ok(imagesSource, 'No se encontró el mapping IMG');

const products = JSON.parse(JSON.stringify(vm.runInNewContext(productsSource[1])));
const images = JSON.parse(JSON.stringify(vm.runInNewContext(imagesSource[1])));
const visibleNames = products.filter((product) => product[5] === 'stock').map((product) => product[1]).sort();

// Corte maestro de suplementos con existencia registrada al 23/09/2026.
const expectedVisibleNames = [
  'ACS L-Citrulline',
  'ACS Yohimbine HCl',
  'Applied Hydration + Electrolyte 7 sticks',
  'Applied Probiotic Advanced Multi-Strain',
  'BioSport Magnesium Glycinate 120 ct',
  'C4 Performance Energy',
  'Dymatize ISO100 3 lb',
  'Evogen ISOJECT 2 lb',
  'GAT Caffeine 100 ct',
  'GAT Omega-3 90 ct',
  'GAT Vitamin D3 + K2 60 ct',
  'Mutant CreaKong 1 kg',
  'Mutant Whey 5 lb',
  'MyProtein Clear Whey Isolate 1.1 lb',
  'MyProtein HYROX THE Electro',
  'MyVitamins Daily Multivitamin',
  'Psychotic Black',
  'Psychotic Rojo',
  'RAW EAA Plus',
  'RAW Essential Pre',
  'RAW Itholate 2 lb',
  'RAW Thavage',
  'RAW Thavage RTD',
  'RYSE Loaded Pre V2',
  'Revive Yohimbine',
].sort();

test('productos con existencia registrada equivalen al catálogo público', () => {
  assert.deepEqual(visibleNames, expectedVisibleNames);
});

test('productos sobre pedido y farmacología no se publican como stock', () => {
  assert.equal(products.filter((product) => product[5] === 'stock' && product[0] === 'Farmacología').length, 0);
  assert.equal(products.filter((product) => product[5] === 'stock' && /Ashwagandha|KSM-66/i.test(product[1])).length, 0);
});

test('los filtros públicos solo incluyen categorías con stock', () => {
  const categories = [...new Set(products.filter((product) => product[5] === 'stock').map((product) => product[0]))];
  assert.deepEqual(categories, ['Proteínas', 'Creatina', 'Salud', 'Rendimiento', 'Pre-entrenos', 'Hidratación']);
  assert.match(html, /new Set\(P\.filter\(x=>x\[5\]==='stock'\)\.map\(x=>x\[0\]\)\)/);
});

test('Ashwagandha permanece definida pero sin existencia registrada', () => {
  const ashwagandha = products.filter((product) => /Ashwagandha|KSM-66/i.test(product[1]));
  assert.deepEqual(ashwagandha.map((product) => product[1]), ['BioSport KSM-66 Ashwagandha', 'Evogen KSM-66']);
  assert.ok(ashwagandha.every((product) => product[5] === 'order'));
});

test('todos los assets locales mapeados existen', () => {
  const missing = images
    .map(([, source]) => source)
    .filter((source) => source.startsWith('/assets/products/'))
    .filter((source) => !fs.existsSync(path.join(root, source.slice(1))));
  assert.deepEqual(missing, []);
});

test('JavaScript embebido compila', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0);
  scripts.forEach((script) => assert.doesNotThrow(() => new Function(script)));
});
