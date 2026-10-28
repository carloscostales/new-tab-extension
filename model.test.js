import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "./constants.js";
import { validate, url, parseImport, exportConfig, move } from "./model.js";
import { createStore, ConflictError } from "./storage.js";
test("exportación e importación conservan configuración e identidades", () =>
  assert.deepEqual(parseImport(exportConfig(defaults())), defaults()));

test("tamaño de cuadros compatible con configuraciones anteriores y límites", () => {
  const config = defaults();
  delete config.settings.tileSize;
  assert.equal(validate(config).settings.tileSize, 200);
  config.settings.tileSize = 240;
  assert.equal(parseImport(exportConfig(config)).settings.tileSize, 240);
  for (const size of [119, 401, 180.5, "180", null]) {
    config.settings.tileSize = size;
    assert.throws(() => validate(config));
  }
});
test("dominios se normalizan; protocolos peligrosos se rechazan", () => {
  assert.equal(url("example.com"), "https://example.com/");
  for (const v of [
    "javascript:alert(1)",
    "file:///etc",
    "data:text/plain,a",
    "https://user:secret@example.com",
  ])
    assert.throws(() => url(v));
});
test("esquema estricto, posiciones y límites", () => {
  for (const mutate of [
    (c) => (c.version = 2),
    (c) => (c.links[0].col = 1e9),
    (c) => (c.links[0].row = 1.2),
    (c) => (c.links[0].col = "1"),
    (c) => (c.links[0].showIcon = 1),
    (c) => (c.links[0].color = "#fff"),
    (c) => (c.links[0].title = ""),
    (c) => (c.links[1].id = c.links[0].id),
    (c) => (c.links[1].col = 1),
    (c) => (c.settings.rows = 21),
    (c) => (c.settings.backgroundImage = "data:image/svg+xml;base64,aaaa"),
  ]) {
    const c = defaults();
    mutate(c);
    assert.throws(() => validate(c));
  }
});
test("archivos inválidos y excesivos se rechazan", () => {
  for (const text of ["null", "[]", "{", " ".repeat(3_000_001)])
    assert.throws(() => parseImport(text));
});
test("mover a celda vacía e intercambiar sin mutar original", () => {
  const original = defaults(),
    moved = move(original, "initial-0", 2, 2);
  assert.equal(moved.links[0].row, 2);
  assert.equal(original.links[0].row, 1);
  const swapped = move(original, "initial-0", 2, 1);
  assert.equal(swapped.links[1].col, 1);
  assert.equal(swapped.links[0].col, 2);
  assert.throws(() => move(original, "initial-0", 13, 1));
});
test("fallo de escritura no cambia datos persistidos", async () => {
  let saved = { revision: 1, config: defaults() };
  const store = createStore(
    {
      get: async () => saved,
      set: async () => {
        throw new Error("Sin espacio");
      },
    },
    (fn) => fn(),
  );
  const next = move(defaults(), "initial-0", 1, 2);
  await assert.rejects(store.save(next, 1), /Sin espacio/);
  assert.equal(saved.revision, 1);
  assert.equal(saved.config.links[0].row, 1);
});
test("revisión obsoleta nunca sobrescribe", async () => {
  let saved = { revision: 2, config: defaults() },
    writes = 0;
  const store = createStore(
    {
      get: async () => saved,
      set: async (v) => {
        saved = v;
        writes++;
      },
    },
    (fn) => fn(),
  );
  await assert.rejects(store.save(defaults(), 1), ConflictError);
  assert.equal(writes, 0);
  await store.save(defaults(), 2);
  assert.equal(saved.revision, 3);
});
test("datos corruptos y errores de lectura no se silencian", async () => {
  const bad = createStore(
    { get: async () => ({ revision: 1, config: {} }) },
    (fn) => fn(),
  );
  await assert.rejects(bad.read());
  const broken = createStore(
    {
      get: async () => {
        throw new Error("Lectura fallida");
      },
    },
    (fn) => fn(),
  );
  await assert.rejects(broken.read(), /Lectura fallida/);
});
test("guardados simultáneos se serializan y detectan conflicto", async () => {
  let saved = null,
    queue = Promise.resolve();
  const lock = (fn) => {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
  };
  const store = createStore(
    {
      get: async () => saved,
      set: async (v) => {
        saved = v;
      },
    },
    lock,
  );
  const results = await Promise.allSettled([
    store.save(defaults(), 0),
    store.save(defaults(), 0),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(saved.revision, 1);
});
test("nombre de imagen local se conserva y es compatible con datos anteriores", () => {
  const config = defaults();
  config.settings.backgroundImage = "data:image/webp;base64,YQ==";
  config.settings.backgroundImageName = "mi paisaje.webp";
  assert.equal(
    parseImport(exportConfig(config)).settings.backgroundImageName,
    "mi paisaje.webp",
  );
  delete config.settings.backgroundImageName;
  assert.doesNotThrow(() => validate(config));
  config.settings.backgroundImageName = 42;
  assert.throws(() => validate(config));
  config.settings.backgroundImageName = "a".repeat(256);
  assert.throws(() => validate(config));
  config.settings.backgroundImageName = "antigua.webp";
  config.settings.backgroundImage = "https://example.com/fondo.jpg";
  assert.equal(validate(config).settings.backgroundImageName, "");
});
test("modo claro por defecto y modo oscuro en importación y exportación", () => {
  const config = defaults();
  delete config.settings.theme;
  assert.equal(validate(config).settings.theme, "light");
  config.settings.theme = "dark";
  assert.equal(parseImport(exportConfig(config)).settings.theme, "dark");
  for (const theme of [null, 42, "auto", "DARK"]) {
    config.settings.theme = theme;
    assert.throws(() => validate(config));
  }
});
