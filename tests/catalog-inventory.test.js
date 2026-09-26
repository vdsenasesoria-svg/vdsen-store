const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'data', 'inventory-2026-09-25.json'), 'utf8'));
const productsSource = html.match(/const P=(\[[\s\S]*?\]);\s*let cat/);
const imagesSource = html.match(/const IMG=(\[[\s\S]*?\]);\s*const OFFICIAL/);

assert.ok(productsSource, 'No se encontró el catálogo P');
assert.ok(imagesSource, 'No se encontró el mapping IMG');

const products = JSON.parse(JSON.stringify(vm.runInNewContext(productsSource[1])));
const images = JSON.parse(JSON.stringify(vm.runInNewContext(imagesSource[1])));
const visibleNames = products.filter((product) => product[5] === 'stock').map((product) => product[1]).sort();

const hasStock = ({ stock }) =>
  stock.currentQuantity > 0 ||
  Object.values(stock.variants || {}).some((quantity) => quantity > 0) ||
  stock.looseUnits > 0 ||
  (stock.closedCases || []).some(({ quantity }) => quantity > 0);
const expectedVisibleNames = inventory.products
  .filter((product) => product.public && hasStock(product))
  .map((product) => product.catalogName)
  .sort();

test('productos con existencia registrada equivalen al catálogo público', () => {
  assert.equal(inventory.cutoffDate, '2026-09-25');
  assert.equal(inventory.products.length, 27);
  assert.equal(expectedVisibleNames.length, 25);
  assert.deepEqual(visibleNames, expectedVisibleNames);
});

test('los movimientos registrados reconcilian el stock actual', () => {
  const tracked = inventory.products.filter((product) => Number.isFinite(product.stock.baseQuantity));
  tracked.forEach((product) => {
    const movements = inventory.movements.filter((movement) => movement.catalogName === product.catalogName);
    const sold = movements.reduce((total, movement) => total + movement.quantity, 0);
    assert.equal(product.stock.baseQuantity - sold, product.stock.currentQuantity, product.catalogName);
    assert.equal(movements.at(-1).resultingStock, product.stock.currentQuantity, product.catalogName);
  });
  assert.equal(inventory.movements.filter((movement) => movement.catalogName === 'ACS Yohimbine HCl').length, 0);
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
  assert.equal(inventory.products.filter((product) => /Ashwagandha|KSM-66/i.test(product.catalogName)).length, 0);
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
