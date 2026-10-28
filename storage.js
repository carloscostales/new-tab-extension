import { STORAGE_KEY, defaults } from "./constants.js";
import { validate } from "./model.js";
export class ConflictError extends Error {
  constructor() {
    super(
      "Otra pestaña ha guardado cambios. Cancela para cargar su versión o exporta tu borrador antes de continuar.",
    );
  }
}
export function createStore(
  adapter,
  lock = (task) => navigator.locks.request(STORAGE_KEY, task),
) {
  return {
    async read() {
      const raw = await adapter.get();
      if (raw == null) return { revision: 0, config: defaults() };
      if (!Number.isInteger(raw.revision) || raw.revision < 1)
        throw new Error("Revisión almacenada inválida.");
      return { revision: raw.revision, config: validate(raw.config) };
    },
    async save(config, revision) {
      const clean = validate(config);
      return lock(async () => {
        const current = await this.read();
        if (current.revision !== revision) throw new ConflictError();
        const record = { revision: revision + 1, config: clean };
        await adapter.set(record);
        return record;
      });
    },
  };
}
const extension = !!globalThis.chrome?.storage?.local;
const adapter = extension
  ? {
      get: async () =>
        (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY],
      set: async (value) => {
        await chrome.storage.local.set({ [STORAGE_KEY]: value });
      },
    }
  : {
      get: async () => {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      },
      set: async (value) =>
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value)),
    };
export const store = createStore(adapter);
export function subscribe(callback) {
  if (extension)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORAGE_KEY]) callback();
    });
  else
    addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) callback();
    });
}
