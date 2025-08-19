/* eslint-disable no-undef */
// Core operations
export async function get(key) {
  try {
    const data = await chrome.storage.local.get([key]);
    return data[key];
  } catch (err) {
    console.error("[ATO] Storage get error", err);
    return undefined;
  }
}

export async function set(obj) {
  try {
    await chrome.storage.local.set(obj);
    return true;
  } catch (err) {
    console.error("[ATO] Storage set error", err);
    return false;
  }
}

// ESM compatibility: provide a named object export so callers can do:
// import { StorageUtils } from '../utils/StorageUtils.js';
// and use StorageUtils.get(...) / StorageUtils.set(...)
// Keep existing named function exports intact for backward compatibility.
export const StorageUtils = {
  get,
  set,
};
