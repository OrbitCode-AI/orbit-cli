import type { Plugin } from "vite";

const ORBITCODE_MODULE_ID = "orbitcode";
const RESOLVED_ORBITCODE_ID = "\0orbitcode";

// List of known modules that are bundled or aliased
const KNOWN_MODULES = new Set([
  "preact",
  "preact/hooks",
  "preact/compat",
  "preact/jsx-runtime",
  "preact/jsx-dev-runtime",
  "preact/debug",
  "preact/devtools",
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "orbitcode",
  // Prefresh HMR packages (used by @preact/preset-vite)
  "@prefresh/core",
  "@prefresh/utils",
]);

// Virtual orbitcode module implementation (localStorage-based)
const ORBITCODE_SHIM = `
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';

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

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

// useVar returns [value, setter] like useState, but persists to localStorage
export function useVar(name, defaultValue) {
  const [value, setValue] = useState(() => getStoredValue(name, defaultValue));

  useEffect(() => {
    // Listen for changes from other tabs
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

  return [value, setter];
}

// useSet returns [items, { add, update, remove }, loading] for collection CRUD
export function useSet(name) {
  const [items, setItems] = useState(() => {
    const stored = getStoredValue(name, []);
    // Ensure each item has an id
    return stored.map(item => item.id ? item : { ...item, id: generateId() });
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen for changes from other tabs
    const handler = (e) => {
      if (e.key === getStorageKey(name)) {
        const newItems = e.newValue ? JSON.parse(e.newValue) : [];
        setItems(newItems);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [name]);

  const updateStorage = useCallback((newItems) => {
    setItems(newItems);
    setStoredValue(name, newItems);
  }, [name]);

  const actions = useMemo(() => ({
    add: async (item) => {
      const newItem = { ...item, id: generateId() };
      updateStorage([...items, newItem]);
      return newItem;
    },
    update: (id, updates) => {
      updateStorage(items.map(item =>
        item.id === id ? { ...item, ...updates } : item
      ));
    },
    remove: (id) => {
      updateStorage(items.filter(item => item.id !== id));
    },
  }), [items, updateStorage]);

  return [items, actions, loading];
}
`;

export function orbitcodePlugin(): Plugin {
  return {
    name: "orbitcode",
    enforce: "pre",

    resolveId(id) {
      // Handle the orbitcode virtual module
      if (id === ORBITCODE_MODULE_ID) {
        return RESOLVED_ORBITCODE_ID;
      }

      // Skip known modules
      if (KNOWN_MODULES.has(id)) {
        return null;
      }

      // Redirect unknown bare imports to esm.sh
      if (isBareImport(id)) {
        return {
          id: `https://esm.sh/${id}`,
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
