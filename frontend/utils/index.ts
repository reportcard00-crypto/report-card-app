// Native-specific storage implementation using expo-secure-store
// For web, Metro will use index.web.ts instead
import * as SecureStore from "expo-secure-store";

class NativeStorage {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`Error retrieving item with key "${key}":`, error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`Error setting item with key "${key}":`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`Error deleting item with key "${key}":`, error);
    }
  }
}

export const store = new NativeStorage();

export const logout = async () => {
  await store.delete('token');
};
