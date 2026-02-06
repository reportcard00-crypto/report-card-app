// Web-specific storage implementation using localStorage

// Helper to check if localStorage is available (handles SSR)
const isLocalStorageAvailable = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    if (typeof localStorage === 'undefined') return false;
    // Test if localStorage is actually accessible
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

class WebStorage {
  async get(key: string): Promise<string | null> {
    try {
      if (!isLocalStorageAvailable()) {
        return null;
      }
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error retrieving item with key "${key}":`, error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      if (!isLocalStorageAvailable()) {
        return;
      }
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error setting item with key "${key}":`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      if (!isLocalStorageAvailable()) {
        return;
      }
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error deleting item with key "${key}":`, error);
    }
  }
}

export const store = new WebStorage();

export const logout = async () => {
  await store.delete('token');
};
