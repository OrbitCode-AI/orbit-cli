import type { Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliRoot = path.resolve(__dirname, "../..");
const cliPackageJson = path.join(cliRoot, "package.json");

const ORBITCODE_MODULE_ID = "orbitcode";
const RESOLVED_ORBITCODE_ID = "\0orbitcode";

// List of known modules that are bundled or aliased
const KNOWN_MODULES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react-dom/test-utils",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "orbitcode",
]);

// Virtual orbitcode module implementation (localStorage-based)
const ORBITCODE_SHIM = `
import { useState, useEffect, useCallback, useRef } from 'react';

function getStorageKey(name) {
  return 'orbitcode:' + name;
}

function getStoredValue(name, defaultValue) {
  try {
    const stored = localStorage.getItem(getStorageKey(name));
    if (stored !== null) {
      return JSON.parse(stored);
    }
  } catch {}
  return defaultValue;
}

function setStoredValue(name, value) {
  try {
    localStorage.setItem(getStorageKey(name), JSON.stringify(value));
  } catch {}
}

// useVar returns [value, setter, loading] like useState, but persists to localStorage
export function useVar(name, defaultValue) {
  const [value, setValue] = useState(() => getStoredValue(name, defaultValue));

  useEffect(() => {
    const handler = (e) => {
      if (e.key === getStorageKey(name)) {
        setValue(e.newValue ? JSON.parse(e.newValue) : defaultValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [name, defaultValue]);

  const setter = useCallback((newValue) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
      setStoredValue(name, resolved);
      return resolved;
    });
  }, [name]);

  return [value, setter, false];
}

// useList returns [items, actions, loading] for ordered array CRUD
export function useList(name) {
  const arrRef = useRef(getStoredValue(name, []));
  const [items, setItems] = useState(() => {
    return arrRef.current.map((item, i) => item);
  });

  useEffect(() => {
    const handler = (e) => {
      if (e.key === getStorageKey(name)) {
        const newArr = e.newValue ? JSON.parse(e.newValue) : [];
        arrRef.current = newArr;
        setItems(newArr.map((item, i) => item));
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [name]);

  function persist(arr) {
    arrRef.current = arr;
    setStoredValue(name, arr);
    setItems(arr.map((item, i) => item));
  }

  const actions = {
    // Legacy API (backward compat)
    add: async (item) => {
      const arr = [...arrRef.current, item];
      persist(arr);
      return String(arr.length - 1);
    },
    update: (id, item) => {
      return actions.updateAt(parseInt(id, 10), item);
    },
    remove: (id) => {
      return actions.removeAt(parseInt(id, 10));
    },
    // New array API
    push: async (item) => {
      return actions.add(item);
    },
    pop: async () => {
      const arr = [...arrRef.current];
      if (arr.length === 0) return;
      arr.pop();
      persist(arr);
    },
    insertAt: async (index, item) => {
      const arr = [...arrRef.current];
      arr.splice(index, 0, item);
      persist(arr);
      return String(index);
    },
    removeAt: async (index) => {
      const arr = [...arrRef.current];
      if (index < 0 || index >= arr.length) return;
      arr.splice(index, 1);
      persist(arr);
    },
    updateAt: async (index, item) => {
      const arr = [...arrRef.current];
      if (index < 0 || index >= arr.length) return;
      arr[index] = item;
      persist(arr);
    },
    move: async (fromIndex, toIndex) => {
      const arr = [...arrRef.current];
      if (fromIndex < 0 || fromIndex >= arr.length) return;
      if (toIndex < 0 || toIndex >= arr.length) return;
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      persist(arr);
    },
    set: async (newItems) => {
      persist([...newItems]);
    },
  };

  return [items, actions, false];
}

export const useSet = useList;

// useMap returns [entries, { set, remove }, loading] for key-value dictionaries
export function useMap(name) {
  const cacheRef = useRef(getStoredValue(name, {}));
  const [entries, setEntries] = useState(() => ({ ...cacheRef.current }));

  useEffect(() => {
    const handler = (e) => {
      if (e.key === getStorageKey(name)) {
        const newObj = e.newValue ? JSON.parse(e.newValue) : {};
        cacheRef.current = newObj;
        setEntries({ ...newObj });
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [name]);

  const actions = {
    set: async (key, value) => {
      cacheRef.current = { ...cacheRef.current, [key]: value };
      setStoredValue(name, cacheRef.current);
      setEntries({ ...cacheRef.current });
    },
    remove: async (key) => {
      const next = { ...cacheRef.current };
      delete next[key];
      cacheRef.current = next;
      setStoredValue(name, next);
      setEntries({ ...next });
    },
  };

  return [entries, actions, false];
}
`;

export function orbitcodePlugin(): Plugin {
  return {
    name: "orbitcode",
    enforce: "pre",

    async resolveId(id, _importer, options) {
      // Handle the orbitcode virtual module
      if (id === ORBITCODE_MODULE_ID) {
        return RESOLVED_ORBITCODE_ID;
      }

      // Resolve known modules from CLI's node_modules (not user project)
      if (KNOWN_MODULES.has(id)) {
        const resolved = await this.resolve(id, cliPackageJson, { ...options, skipSelf: true });
        return resolved ?? null;
      }

      // Redirect unknown bare imports to esm.sh
      // Use ?external so esm.sh emits bare `react` specifiers that
      // our import map intercepts (single Preact instance).
      if (isBareImport(id)) {
        return {
          id: `https://esm.sh/${id}?external=react,react-dom,react/jsx-runtime&target=es2022`,
          external: true,
        };
      }

      return null;
    },

    load(id) {
      if (id === RESOLVED_ORBITCODE_ID) {
        return ORBITCODE_SHIM;
      }
      return null;
    },
  };
}

function isBareImport(id: string): boolean {
  // Bare imports don't start with . or / and aren't URLs
  if (id.startsWith(".") || id.startsWith("/")) return false;
  if (id.startsWith("http://") || id.startsWith("https://")) return false;
  if (id.startsWith("\0")) return false; // virtual module
  return true;
}
