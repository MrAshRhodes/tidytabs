/**
 * Popup script: loads settings, applies theme, supports algorithm selection and auto mode,
 * and sends organize requests to the background service worker.
 */

/* eslint-disable no-undef */
import { SettingsManager } from "../src/core/SettingsManager.js";
import { LLMProvider } from "../src/llm/LLMProvider.js";
import CustomCategoryManager from "../src/core/CustomCategoryManager.js";
import { CanonicalCategories } from "../src/llm/PromptTemplates.js";
import { ThemeManager } from "../src/utils/ThemeManager.js";
const statusEl = document.getElementById("status");
const btn = document.getElementById("organizeBtn");
const recategorizeBtn = document.getElementById("recategorizeBtn");
const ungroupCheckbox = document.getElementById("ungroupBeforeRecategorize");
const toggleGroupsBtn = document.getElementById("toggleGroupsBtn");
const buyMeCoffeeBtn = document.getElementById("buyMeCoffeeBtn");
const openSettingsCog = document.getElementById("settingsBtn"); // Fixed: was "openSettingsCog"
const settingsView = document.getElementById("settingsView");
const backFromSettingsBtn = document.getElementById("backFromSettingsBtn");
const providerRadios = Array.from(
  document.querySelectorAll('input[name="provider"]'),
);
const apiKeyInput = document.getElementById("apiKeyInput");
const toggleApiKeyVisibility = document.getElementById(
  "toggleApiKeyVisibility",
);
const clearApiKeyBtn = document.getElementById("clearApiKeyBtn");
const apiKeyHelperText = document.getElementById("apiKeyHelperText");
const testConnectionBtn = document.getElementById("testConnectionBtn");
const connectionStatus = document.getElementById("connectionStatus");
const themeSelect = document.getElementById("themeSelect");
const uiStyleSelect = document.getElementById("uiStyleSelect");
const glassPresetSelect = document.getElementById("glassPresetSelect");
const glassPresetRow = document.getElementById("glassPresetRow");
const defaultAlgoRadios = Array.from(
  document.querySelectorAll('input[name="defaultAlgorithm"]'),
);
const autoModeToggleSettings = document.getElementById(
  "autoModeToggleSettings",
);
const algoRadios = Array.from(
  document.querySelectorAll('input[name="algorithm"]'),
);
const autoModeToggle = document.getElementById("autoModeToggle");
const groupEl = document.querySelector(".algo-options");
const headerMeta = document.querySelector(".header-meta");
const statusDisplay = document.getElementById("statusDisplay");
const statusText = document.getElementById("statusText");
const apiKeyStatusChip = document.getElementById("apiKeyStatusChip");
// Theme icon toggle (sun/moon) in header
const themeToggleIcon = document.getElementById("themeToggleIcon");
const themeIconSun = document.getElementById("themeIconSun");
const themeIconMoon = document.getElementById("themeIconMoon");

const defaultBtnLabel = (btn?.textContent || "Organize Tabs Now").trim();

// Platform detection for keyboard shortcuts
function isMac() {
  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

function formatShortcut(defaultShortcut) {
  if (!defaultShortcut) return "";
  if (!isMac()) return defaultShortcut;
  // Replace Ctrl with ⌘ for Mac
  return defaultShortcut.replace(/Ctrl/gi, "⌘").replace(/Command/gi, "⌘");
}

function updateShortcutHints() {
  const organizeHint = document.getElementById("organizeShortcutHint");
  const switchHint = document.getElementById("switchShortcutHint");
  const toggleHint = document.getElementById("toggleShortcutHint");

  if (organizeHint) {
    organizeHint.textContent = formatShortcut("Ctrl+Shift+O");
  }
  if (switchHint) {
    switchHint.textContent = formatShortcut("Ctrl+Shift+A");
  }
  if (toggleHint) {
    toggleHint.textContent = formatShortcut("Ctrl+Shift+U");
  }
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
  // Also update the new status display in header
  if (statusText) statusText.textContent = text;
}

function setHeaderState(state) {
  // state: 'idle' | 'busy' | 'error'
  if (headerMeta) {
    if (!state || state === "idle") {
      headerMeta.dataset.state = "idle";
    } else {
      headerMeta.dataset.state = state;
    }
  }
}

function getSystemTheme() {
  try {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  const t = theme === "auto" ? getSystemTheme() : theme || "light";
  document.documentElement.setAttribute("data-theme", t);
}

/**
 * Sync theme indicators (sun/moon icon) with current theme.
 * If theme = "auto", reflect the applied system theme for the icon.
 */
function syncThemeButtons(theme) {
  try {
    const applied = theme === "auto" ? getSystemTheme() : theme || "light";
    if (themeIconSun) {
      themeIconSun.style.display = applied === "light" ? "block" : "none";
    }
    if (themeIconMoon) {
      themeIconMoon.style.display = applied === "dark" ? "block" : "none";
    }
    if (themeToggleIcon) {
      themeToggleIcon.setAttribute(
        "aria-label",
        applied === "dark" ? "Switch to light theme" : "Switch to dark theme",
      );
      themeToggleIcon.title = applied === "dark" ? "Light theme" : "Dark theme";
    }
  } catch {}
}

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(["settings"]);
    return {
      provider: "openai",
      defaultAlgorithm: "category",
      autoMode: false,
      theme: "auto",
      uiStyle: "glass",
      glassPreset: "default-frosted",
      ungroupBeforeRecategorize: false,
      limits: { autoOrganizeDebounceMs: 30000 },
      ...(data.settings || {}),
    };
  } catch {
    return {
      provider: "openai",
      defaultAlgorithm: "category",
      autoMode: false,
      theme: "auto",
      uiStyle: "glass",
      glassPreset: "default-frosted",
      limits: { autoOrganizeDebounceMs: 30000 },
    };
  }
}

async function saveSettings(next) {
  try {
    await chrome.storage.local.set({ settings: next });
    return true;
  } catch (err) {
    console.error("[TidyTabs] Failed to save settings", err);
    return false;
  }
}

// Telemetry helpers

async function loadTelemetry() {
  try {
    const data = await chrome.storage.local.get(["lastRunTelemetry"]);
    return data.lastRunTelemetry || null;
  } catch {
    return null;
  }
}

function titleCase(s) {
  try {
    return String(s)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return s || "";
  }
}

function formatSeconds(ms) {
  const sec = Math.max(0, Number(ms || 0)) / 1000;
  if (sec < 1) return `${sec.toFixed(1)}s`;
  if (sec < 10) return `${sec.toFixed(1)}s`;
  return `${Math.round(sec)}s`;
}

function timeAgo(ts) {
  const now = Date.now();
  const d = Math.max(0, now - (Number(ts) || 0));
  if (d < 15_000) return "Just now";
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function formatTelemetryLine(t) {
  if (!t) return "";
  const provider = titleCase(t.provider || "OpenAI");
  const model = t.model || "gpt-5-mini";
  const alg = t.algorithm || "category";
  const groups = Number(t.groupsCount || 0);
  const tabs = Number(t.tabsProcessed || 0);
  const dur = formatSeconds(t.durationMs || 0);
  const when = timeAgo(t.timestamp || Date.now());

  // Make the format more descriptive
  if (alg === "category" && t.usedAI) {
    return `${provider} AI • ${groups} groups, ${tabs} tabs • Took ${dur} • ${when}`;
  }
  // Non-AI or fallback case
  return `${titleCase(alg)} • ${groups} groups, ${tabs} tabs • Took ${dur} • ${when}`;
}

async function renderLastRunTelemetry() {
  const t = await loadTelemetry();
  if (!t) return false;
  const line = formatTelemetryLine(t);
  if (line) {
    setStatus(line);
    return true;
  }
  return false;
}

function showToast(message = "Done", timeout = 1600) {
  try {
    const el = document.createElement("div");
    el.textContent = message;
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:20px",
      "transform:translateX(-50%)",
      "padding:8px 12px",
      "border-radius:10px",
      "background:rgba(17,24,39,0.92)",
      "color:#e5e7eb",
      "border:1px solid rgba(55,65,81,0.6)",
      "box-shadow:0 8px 24px rgba(0,0,0,0.25)",
      "font: 12px/1.3 ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial",
      "z-index:99999",
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => el.remove(), timeout);
  } catch {
    // no-op if DOM unavailable
  }
}

function getSelectedAlgorithm() {
  const selected = algoRadios.find((r) => r.checked);
  return selected?.value || "category";
}

function syncRadioCards() {
  algoRadios.forEach((input) => {
    const card = input.closest(".radio-card");
    const isSelected = !!input.checked;
    if (card) {
      card.classList.toggle("selected", isSelected);
      card.setAttribute("aria-checked", String(isSelected));
      card.tabIndex = isSelected ? 0 : -1;
    }
  });
}

function selectAlgorithmByValue(value, focus = false) {
  const target = algoRadios.find((r) => r.value === value);
  if (target) {
    target.checked = true;
    // Trigger change to persist
    target.dispatchEvent(new Event("change", { bubbles: true }));
    syncRadioCards();
    if (focus) {
      const card = target.closest(".radio-card");
      card?.focus();
    }
  }
}

// Generic debounce
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// View switching between main and settings
function switchView(view) {
  const root = document.querySelector(".popup-container");
  if (!root) return;
  const toSettings = view === "settings";
  root.setAttribute("data-view", toSettings ? "settings" : "main");

  if (settingsView) {
    if (toSettings) {
      settingsView.hidden = false;
      settingsView.removeAttribute("aria-hidden");
      settingsView.removeAttribute("inert");
      if (openSettingsCog)
        openSettingsCog.setAttribute("aria-expanded", "true");
    } else {
      settingsView.hidden = true;
      settingsView.setAttribute("aria-hidden", "true");
      settingsView.setAttribute("inert", "");
      if (openSettingsCog)
        openSettingsCog.setAttribute("aria-expanded", "false");
    }
  }

  if (toSettings) {
    backFromSettingsBtn?.focus();
  } else {
    openSettingsCog?.focus();
  }
}

// Provider helpers
function getSelectedProvider() {
  const sel = providerRadios.find((r) => r.checked);
  return sel?.value || "openai";
}

function syncProviderCards() {
  providerRadios.forEach((input) => {
    const card = input.closest(".radio-card");
    const isSelected = !!input.checked;
    if (card) {
      card.classList.toggle("selected", isSelected);
      card.setAttribute("aria-checked", String(isSelected));
      card.tabIndex = isSelected ? 0 : -1;
    }
  });
}

// Populate settings UI from current settings (without exposing stored API key by default)
async function populateSettingsUI() {
  const s = await loadSettings();

  // Provider - default to groq (free) if no provider set
  const targetProv = s.provider || "groq";
  const provRadio =
    providerRadios.find((r) => r.value === targetProv) || providerRadios[0];
  if (provRadio) {
    provRadio.checked = true;
    syncProviderCards();
  }

  // Theme and Theming Controls
  if (themeSelect) {
    themeSelect.value = s.theme || "auto";
  }
  if (uiStyleSelect) {
    uiStyleSelect.value = s.uiStyle || "glass";
  }
  if (glassPresetSelect) {
    glassPresetSelect.value = s.glassPreset || "default-frosted";
  }
  // Hide glass preset row if style=solid
  try {
    if (glassPresetRow) {
      const style = (s.uiStyle || "glass").toLowerCase();
      glassPresetRow.style.display = style === "glass" ? "" : "none";
    }
  } catch {}

  // Default algorithm
  const selected = s.defaultAlgorithm || "category";
  const da = defaultAlgoRadios.find((r) => r.value === selected);
  if (da) {
    da.checked = true;
    defaultAlgoRadios.forEach((r) => {
      const card = r.closest(".radio-card");
      const isSel = r === da;
      if (card) {
        card.classList.toggle("selected", isSel);
        card.setAttribute("aria-checked", String(isSel));
        card.tabIndex = isSel ? 0 : -1;
      }
    });
  }

  // Auto mode (settings view)
  if (autoModeToggleSettings) {
    autoModeToggleSettings.checked = !!s.autoMode;
  }

  // API key field: check if key exists and show masked placeholder
  if (apiKeyInput) {
    const provider = s.provider || "groq";

    // Enable input for all providers including Groq
    apiKeyInput.disabled = false;
    apiKeyInput.classList.remove("disabled");

    // Show buttons for all providers
    if (testConnectionBtn) {
      testConnectionBtn.hidden = false;
    }
    if (toggleApiKeyVisibility) {
      toggleApiKeyVisibility.hidden = false;
    }

    const hasKey = await SettingsManager.hasValidApiKey(provider);

    // For Groq, check if user has a personal key
    let hasUserGroqKey = false;
    if (provider === "groq") {
      const groqKey = await SettingsManager.getApiKey("groq");
      hasUserGroqKey = groqKey && groqKey.length > 0;
    }

    if (hasKey || hasUserGroqKey) {
      // Show masked placeholder to indicate a key is saved
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "••••••••••••••••";
      apiKeyInput.classList.add("has-saved-key");
      apiKeyInput.type = "password";

      // Show clear button
      if (clearApiKeyBtn) {
        clearApiKeyBtn.hidden = false;
      }

      // Show helper text
      if (apiKeyHelperText) {
        if (provider === "groq") {
          apiKeyHelperText.innerHTML = hasUserGroqKey
            ? "Personal API key saved. Enter new key to update."
            : 'Optional: Add your <a href="https://console.groq.com/keys" target="_blank" style="color: var(--ring); text-decoration: underline;">Groq API key</a> for higher limits';
          apiKeyHelperText.className = hasUserGroqKey
            ? "helper-text success"
            : "helper-text";
        } else {
          apiKeyHelperText.textContent =
            "API key saved. Enter new key to update.";
          apiKeyHelperText.className = "helper-text success";
        }
      }
    } else {
      apiKeyInput.value = "";
      apiKeyInput.placeholder =
        provider === "groq" ? "Optional - Enter API key" : "Enter API key";
      apiKeyInput.classList.remove("has-saved-key");
      apiKeyInput.type = "password";

      // Show/hide clear button based on if there's a key
      if (clearApiKeyBtn) {
        clearApiKeyBtn.hidden = provider === "groq" ? !hasUserGroqKey : true;
      }

      // Show helper text
      if (apiKeyHelperText) {
        if (provider === "groq") {
          apiKeyHelperText.innerHTML =
            'Optional: Add your <a href="https://console.groq.com/keys" target="_blank" style="color: var(--ring); text-decoration: underline;">Groq API key</a> for higher limits. Free tier works without a key.';
          apiKeyHelperText.className = "helper-text";
        } else {
          const providerName = provider === "openai" ? "OpenAI" : "Anthropic";
          apiKeyHelperText.textContent = `Enter your ${providerName} API key`;
          apiKeyHelperText.className = "helper-text";
        }
      }
    }
  }

  if (connectionStatus) {
    connectionStatus.textContent = "";
  }
}

async function organize() {
  try {
    const settings = await loadSettings();
    const algorithm =
      getSelectedAlgorithm() || settings.defaultAlgorithm || "category";

    // Check for API key if using category algorithm (except for Groq)
    if (algorithm === "category") {
      const provider = settings.provider || "groq";

      // Groq doesn't need API key check
      if (provider !== "groq") {
        const apiKey = await SettingsManager.getApiKey(provider);

        if (!apiKey || apiKey.length === 0) {
          const providerName = provider === "openai" ? "OpenAI" : "Anthropic";
          showToast(`⚠️ ${providerName} API key required`, 2500);
          // Automatically open settings after a short delay
          setTimeout(async () => {
            try {
              await populateSettingsUI();
            } catch {}
            switchView("settings");
            // Focus on the API key input
            setTimeout(() => {
              if (apiKeyInput) apiKeyInput.focus();
            }, 200);
          }, 500);
          return;
        }
      }
    }

    setStatus("Organizing...");
    setHeaderState("busy");
    if (btn) {
      btn.disabled = true;
      btn.classList.add("loading");
      btn.textContent = "Organizing…";
    }

    const res = await chrome.runtime.sendMessage({
      type: "organizeTabs",
      algorithm,
    });
    if (res && res.success) {
      setHeaderState("idle");
      showToast("Tabs organized");

      // Warn if AI fallback was used in category mode
      if (
        res.result &&
        res.result.algorithm === "category" &&
        res.result.usedAI === false
      ) {
        showToast("AI unavailable, used fallback", 2200);
      }

      // Small delay to ensure background persisted telemetry, then render
      await new Promise((r) => setTimeout(r, 60));
      const ok = await renderLastRunTelemetry();
      if (!ok) setStatus("Done");
    } else {
      setStatus("Error");
      setHeaderState("error");
      showToast("Organization failed", 2000);
      console.error("Organize response error", res);
    }
  } catch (err) {
    setStatus("Error");
    setHeaderState("error");
    showToast("Organization error", 2000);
    console.error("Organize error", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("loading");
      btn.textContent = defaultBtnLabel;
    }
  }
}

async function recategorize() {
  try {
    const settings = await loadSettings();
    const algorithm =
      getSelectedAlgorithm() || settings.defaultAlgorithm || "category";

    // Check if we should ungroup all tabs first
    const shouldUngroup = ungroupCheckbox ? ungroupCheckbox.checked : false;

    if (shouldUngroup) {
      setStatus("Ungrouping all tabs...");
      setHeaderState("busy");

      // Ungroup all tabs first
      const ungroupResult = await chrome.runtime.sendMessage({
        type: "ungroupAllTabs",
      });

      if (!ungroupResult || !ungroupResult.success) {
        setStatus("Failed to ungroup");
        setHeaderState("error");
        showToast("Failed to ungroup tabs", 2000);
        return;
      }

      // Small delay after ungrouping
      await new Promise((r) => setTimeout(r, 300));
    }

    // Only clear cache for category algorithm
    if (algorithm === "category") {
      setStatus("Clearing AI cache...");
      setHeaderState("busy");

      // Clear AI cache via runtime message
      await chrome.runtime.sendMessage({ type: "clearAICache" });

      // Small delay to ensure cache is cleared
      await new Promise((r) => setTimeout(r, 200));
    }

    // Check for API key if using category algorithm (except for Groq)
    if (algorithm === "category") {
      const provider = settings.provider || "groq";

      // Groq doesn't need API key check
      if (provider !== "groq") {
        const apiKey = await SettingsManager.getApiKey(provider);

        if (!apiKey || apiKey.length === 0) {
          const providerName = provider === "openai" ? "OpenAI" : "Anthropic";
          showToast(`⚠️ ${providerName} API key required`, 2500);
          // Automatically open settings after a short delay
          setTimeout(async () => {
            try {
              await populateSettingsUI();
            } catch {}
            switchView("settings");
            // Focus on the API key input
            setTimeout(() => {
              if (apiKeyInput) apiKeyInput.focus();
            }, 200);
          }, 500);
          return;
        }
      }
    }

    setStatus("Recategorizing...");
    setHeaderState("busy");
    if (recategorizeBtn) {
      recategorizeBtn.disabled = true;
      recategorizeBtn.classList.add("loading");
    }

    const res = await chrome.runtime.sendMessage({
      type: "organizeTabs",
      algorithm,
      forceRefresh: true,
      includeGrouped: shouldUngroup, // Include all tabs if we ungrouped them
    });
    if (res && res.success) {
      setHeaderState("idle");
      showToast("✨ Fresh categorization complete", 1800);

      // Warn if AI fallback was used in category mode
      if (
        res.result &&
        res.result.algorithm === "category" &&
        res.result.usedAI === false
      ) {
        showToast("AI unavailable, used fallback", 2200);
      }

      // Small delay to ensure background persisted telemetry, then render
      await new Promise((r) => setTimeout(r, 60));
      const ok = await renderLastRunTelemetry();
      if (!ok) setStatus("Recategorized");
    } else {
      setStatus("Error");
      setHeaderState("error");
      showToast("Recategorization failed", 2000);
      console.error("Recategorize response error", res);
    }
  } catch (err) {
    setStatus("Error");
    setHeaderState("error");
    showToast("Recategorization error", 2000);
    console.error("Recategorize error", err);
  } finally {
    if (recategorizeBtn) {
      recategorizeBtn.disabled = false;
      recategorizeBtn.classList.remove("loading");
    }
  }
}

async function toggleAllGroups() {
  try {
    setStatus("Toggling groups...");
    setHeaderState("busy");
    if (toggleGroupsBtn) {
      toggleGroupsBtn.disabled = true;
      toggleGroupsBtn.classList.add("loading");
    }

    const res = await chrome.runtime.sendMessage({ type: "toggleAllGroups" });

    if (res && res.success && res.result) {
      setHeaderState("idle");

      // Show appropriate feedback based on action
      const { action, groupsAffected, message } = res.result;

      if (action === "collapse") {
        showToast(`▼ Collapsed ${groupsAffected} groups`, 1800);
      } else if (action === "expand") {
        showToast(`▲ Expanded ${groupsAffected} groups`, 1800);
      } else if (action === "none") {
        showToast("No groups to toggle", 1600);
      } else {
        showToast(message || "Groups toggled", 1600);
      }

      // Update status with the result message
      setStatus(message || "Groups toggled");
    } else {
      setStatus("Toggle failed");
      setHeaderState("error");
      const errorMsg =
        res?.result?.error || res?.error || "Failed to toggle groups";
      showToast(errorMsg, 2000);
      console.error("Toggle groups response error", res);
    }
  } catch (err) {
    setStatus("Error");
    setHeaderState("error");
    showToast("Toggle error", 2000);
    console.error("Toggle groups error", err);
  } finally {
    if (toggleGroupsBtn) {
      toggleGroupsBtn.disabled = false;
      toggleGroupsBtn.classList.remove("loading");
    }
  }
}

async function checkApiKeyStatus() {
  try {
    const settings = await loadSettings();
    const provider = settings.provider || "groq";

    if (!apiKeyStatusChip) return;

    if (provider === "groq") {
      // Check if user has a personal Groq key
      const userGroqKey = await SettingsManager.getApiKey("groq");
      const hasUserKey = userGroqKey && userGroqKey.length > 0;

      apiKeyStatusChip.className = "status-chip has-key";
      apiKeyStatusChip.textContent = hasUserKey ? "Groq Personal" : "Groq Free";
      apiKeyStatusChip.onclick = null;
      apiKeyStatusChip.style.cursor = "default";
    } else {
      const apiKey = await SettingsManager.getApiKey(provider);

      if (apiKey && apiKey.length > 0) {
        // API key is configured
        apiKeyStatusChip.className = "status-chip has-key";
        apiKeyStatusChip.textContent = "✓ API Key";
        apiKeyStatusChip.onclick = null;
        apiKeyStatusChip.style.cursor = "default";
      } else {
        // No API key
        apiKeyStatusChip.className = "status-chip no-key";
        apiKeyStatusChip.textContent = "⚠ No Key";
        // Make clickable to open settings
        apiKeyStatusChip.onclick = async () => {
          try {
            await populateSettingsUI();
          } catch {}
          switchView("settings");
          // Focus on the API key input after a short delay
          setTimeout(() => {
            if (apiKeyInput) apiKeyInput.focus();
          }, 200);
        };
        apiKeyStatusChip.style.cursor = "pointer";
      }
    }
  } catch (err) {
    console.warn("[TidyTabs] Failed to check API key status:", err);
  }
}

async function initUI() {
  const settings = await loadSettings();
  // Apply theme/style/preset
  try {
    ThemeManager.applyAll(settings);
  } catch {}
  syncThemeButtons(settings.theme);

  // Initialize algorithm radios
  const target = settings.defaultAlgorithm || "category";
  const match =
    algoRadios.find((r) => r.value === target) ||
    algoRadios.find((r) => r.value === "category");
  if (match) match.checked = true;
  syncRadioCards();

  // Initialize auto mode toggle
  if (autoModeToggle) autoModeToggle.checked = !!settings.autoMode;

  // Initialize ungroup checkbox
  if (ungroupCheckbox)
    ungroupCheckbox.checked = !!settings.ungroupBeforeRecategorize;

  // Ensure settings view starts collapsed and inert for a11y
  if (settingsView) {
    if (settingsView.hidden !== false) {
      settingsView.setAttribute("inert", "");
      settingsView.setAttribute("aria-hidden", "true");
    }
  }
  if (openSettingsCog) {
    openSettingsCog.setAttribute("aria-expanded", "false");
    openSettingsCog.setAttribute("aria-controls", "settingsView");
  }

  setHeaderState("idle");
  // Try to render last run telemetry; fallback to "Ready" if none
  const ok = await renderLastRunTelemetry();
  if (!ok) setStatus("Ready");

  // Check API key status
  await checkApiKeyStatus();

  // Update keyboard shortcut hints based on platform
  updateShortcutHints();
}

function bindHandlers() {
  // Organize button
  btn?.addEventListener("click", organize);

  // Recategorize button
  recategorizeBtn?.addEventListener("click", recategorize);

  // Toggle groups button
  toggleGroupsBtn?.addEventListener("click", toggleAllGroups);

  // Buy Me a Coffee button
  buyMeCoffeeBtn?.addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://buymeacoffee.com/focused",
      active: true,
    });
    showToast("☕ Opening Buy Me a Coffee...", 1400);
  });

  // Open/close in-popup settings (toggle functionality)
  openSettingsCog?.addEventListener("click", async () => {
    const root = document.querySelector(".popup-container");
    const currentView = root?.getAttribute("data-view");

    if (currentView === "settings") {
      // Settings is open, close it
      switchView("main");
    } else {
      // Settings is closed, open it
      try {
        await populateSettingsUI();
      } catch {}
      switchView("settings");
    }
  });

  // Back from settings
  backFromSettingsBtn?.addEventListener("click", () => {
    switchView("main");
  });

  // Provider selection change
  providerRadios.forEach((radio) => {
    radio.addEventListener("change", async () => {
      syncProviderCards();
      const current = await loadSettings();
      const next = { ...current, provider: getSelectedProvider() };
      await saveSettings(next);
      // Update the API key field for the new provider
      await populateSettingsUI();
      // Clear connection status
      if (connectionStatus) connectionStatus.textContent = "";
      // Update API key status when provider changes
      await checkApiKeyStatus();
    });
  });

  // Default algorithm change in settings view
  defaultAlgoRadios.forEach((radio) => {
    radio.addEventListener("change", async () => {
      const current = await loadSettings();
      const selected =
        defaultAlgoRadios.find((r) => r.checked)?.value || "category";
      const next = { ...current, defaultAlgorithm: selected };
      await saveSettings(next);
      // Reflect in main view radios
      selectAlgorithmByValue(selected);
    });
  });

  // Auto mode toggle (settings)
  autoModeToggleSettings?.addEventListener("change", async () => {
    const current = await loadSettings();
    const next = { ...current, autoMode: !!autoModeToggleSettings.checked };
    await saveSettings(next);
    // Sync main toggle
    if (autoModeToggle)
      autoModeToggle.checked = !!autoModeToggleSettings.checked;
  });

  // Theme select change
  themeSelect?.addEventListener("change", async () => {
    const current = await loadSettings();
    const value = themeSelect.value || "auto";
    const next = { ...current, theme: value };
    await saveSettings(next);
    try {
      ThemeManager.applyAll(next);
    } catch {}
    syncThemeButtons(value);
  });

  // UI Style change (Glass/Solid)
  uiStyleSelect?.addEventListener("change", async () => {
    const current = await loadSettings();
    const value = uiStyleSelect.value || "glass";
    const next = { ...current, uiStyle: value };
    await saveSettings(next);
    try {
      ThemeManager.applyAll(next);
    } catch {}
    // Toggle preset row visibility
    try {
      if (glassPresetRow)
        glassPresetRow.style.display = value === "glass" ? "" : "none";
    } catch {}
  });

  // Glass Preset change
  glassPresetSelect?.addEventListener("change", async () => {
    const current = await loadSettings();
    const value = glassPresetSelect.value || "default-frosted";
    const next = { ...current, glassPreset: value };
    await saveSettings(next);
    try {
      ThemeManager.applyAll(next);
    } catch {}
  });

  // Theme icon toggle (sun/moon) - explicit Light/Dark toggle
  themeToggleIcon?.addEventListener("click", async () => {
    const current = await loadSettings();
    const applied =
      (current.theme === "auto" ? getSystemTheme() : current.theme) || "light";
    const nextTheme = applied === "dark" ? "light" : "dark";
    const next = { ...current, theme: nextTheme };
    await saveSettings(next);
    try {
      ThemeManager.applyAll(next);
    } catch {}
    syncThemeButtons(nextTheme);
    if (themeSelect) themeSelect.value = nextTheme;
  });

  // API key reveal/hide
  toggleApiKeyVisibility?.addEventListener("click", async () => {
    if (!apiKeyInput) return;
    if (apiKeyInput.type === "password") {
      // Reveal: if empty, fetch stored to display
      if (!apiKeyInput.value) {
        try {
          const prov = getSelectedProvider();
          const key = await SettingsManager.getApiKey(prov);
          if (key) apiKeyInput.value = key;
        } catch {}
      }
      apiKeyInput.type = "text";
    } else {
      apiKeyInput.type = "password";
    }
  });

  // Clear API key button
  clearApiKeyBtn?.addEventListener("click", async () => {
    const prov = getSelectedProvider();
    await SettingsManager.setApiKey(prov, "");

    // Update UI
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder =
        prov === "groq" ? "Optional - Enter API key" : "Enter API key";
      apiKeyInput.classList.remove("has-saved-key");
    }

    if (clearApiKeyBtn) {
      clearApiKeyBtn.hidden = true;
    }

    if (apiKeyHelperText) {
      if (prov === "groq") {
        apiKeyHelperText.innerHTML =
          'Optional: Add your <a href="https://console.groq.com/keys" target="_blank" style="color: var(--ring); text-decoration: underline;">Groq API key</a> for higher limits. Free tier works without a key.';
        apiKeyHelperText.className = "helper-text";
      } else {
        const providerName = prov === "openai" ? "OpenAI" : "Anthropic";
        apiKeyHelperText.textContent = `Enter your ${providerName} API key`;
        apiKeyHelperText.className = "helper-text";
      }
    }

    if (connectionStatus) {
      connectionStatus.textContent = "";
    }

    showToast("API key cleared", 1200);
    await checkApiKeyStatus();
  });

  // Persist API key with debounce
  const persistApiKey = debounce(async () => {
    if (!apiKeyInput) return;
    const prov = getSelectedProvider();
    const key = apiKeyInput.value.trim();

    if (key) {
      await SettingsManager.setApiKey(prov, key);
      showToast("API key saved", 1200);

      // Update UI to show key is saved
      apiKeyInput.placeholder = "••••••••••••••••";
      apiKeyInput.classList.add("has-saved-key");

      if (clearApiKeyBtn) {
        clearApiKeyBtn.hidden = false;
      }

      if (apiKeyHelperText) {
        apiKeyHelperText.textContent =
          "API key saved. Enter new key to update.";
        apiKeyHelperText.className = "helper-text success";
      }

      // Update API key status after saving
      await checkApiKeyStatus();
    }
  }, 400);

  apiKeyInput?.addEventListener("input", persistApiKey);

  // Test connection
  testConnectionBtn?.addEventListener("click", async () => {
    try {
      if (connectionStatus) {
        connectionStatus.textContent = "Testing...";
      }
      const prov = getSelectedProvider();
      let key = apiKeyInput?.value?.trim() || "";
      if (!key) {
        key = await SettingsManager.getApiKey(prov);
      }
      const settings = await SettingsManager.getSettings();
      const client = LLMProvider.for(prov, settings, key);
      const res = await client.testConnection();
      if (res.ok) {
        if (connectionStatus) connectionStatus.textContent = "Connected";
        showToast("Connection OK", 1200);
      } else {
        if (connectionStatus)
          connectionStatus.textContent = res.error || "Connection failed";
        showToast("Connection failed", 1600);
      }
    } catch (e) {
      if (connectionStatus) connectionStatus.textContent = "Error";
      console.error("Test connection error", e);
      showToast("Connection error", 1600);
    }
  });

  // Algorithm selection change - now triggers automatic reorganization
  algoRadios.forEach((radio) => {
    radio.addEventListener("change", async () => {
      syncRadioCards();
      const current = await loadSettings();
      const newAlgorithm = getSelectedAlgorithm();
      const next = { ...current, defaultAlgorithm: newAlgorithm };
      await saveSettings(next);

      // Automatically ungroup and reorganize with the new algorithm
      try {
        setStatus("Switching algorithm...");
        setHeaderState("busy");

        // First, ungroup all tabs
        const ungroupResult = await chrome.runtime.sendMessage({
          type: "ungroupAllTabs",
        });

        if (ungroupResult && ungroupResult.success) {
          // Then reorganize with the new algorithm
          const organizeResult = await chrome.runtime.sendMessage({
            type: "organizeTabs",
            algorithm: newAlgorithm,
            includeGrouped: true, // Flag to include already grouped tabs
          });

          if (organizeResult && organizeResult.success) {
            setHeaderState("idle");
            showToast(`Switched to ${newAlgorithm} algorithm`, 1800);

            // Update status with telemetry
            await new Promise((r) => setTimeout(r, 60));
            const ok = await renderLastRunTelemetry();
            if (!ok) setStatus("Algorithm switched");
          } else {
            setStatus("Reorganization failed");
            setHeaderState("error");
            showToast("Failed to reorganize tabs", 2000);
          }
        } else {
          setStatus("Failed to ungroup");
          setHeaderState("error");
          showToast("Failed to ungroup tabs", 2000);
        }
      } catch (err) {
        console.error("Algorithm switch error", err);
        setStatus("Switch failed");
        setHeaderState("error");
        showToast("Algorithm switch failed", 2000);
      }
    });
  });

  // Keyboard support for radiogroup
  if (groupEl) {
    groupEl.addEventListener("keydown", (e) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      if (!keys.includes(e.key)) return;

      e.preventDefault();
      const order = algoRadios.map((r) => r.value);
      const currentValue = getSelectedAlgorithm();
      const idx = order.indexOf(currentValue);
      if (idx === -1) return;

      let nextIdx = idx;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIdx = (idx - 1 + order.length) % order.length;
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIdx = (idx + 1) % order.length;
      }
      selectAlgorithmByValue(order[nextIdx], true);
    });
  }

  // Auto mode toggle change
  autoModeToggle?.addEventListener("change", async () => {
    const current = await loadSettings();
    const next = { ...current, autoMode: !!autoModeToggle.checked };
    await saveSettings(next);
  });

  // Ungroup checkbox change handler
  ungroupCheckbox?.addEventListener("change", async () => {
    const current = await loadSettings();
    const next = {
      ...current,
      ungroupBeforeRecategorize: !!ungroupCheckbox.checked,
    };
    await saveSettings(next);
  });

  // Listen for messages from service worker (for keyboard shortcuts)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "algorithmChanged") {
      // Update the UI when algorithm is changed via keyboard shortcut
      selectAlgorithmByValue(message.algorithm);
      showToast(`Switched to ${message.algorithm}`, 1200);
    } else if (message.type === "organizationCompleted") {
      // Update status when organization is triggered via keyboard shortcut
      renderLastRunTelemetry();
      setHeaderState("idle");
    } else if (message.type === "toggleCompleted") {
      // Update UI when toggle is triggered via keyboard shortcut
      const { action, result } = message;
      if (result && result.groupsAffected > 0) {
        const actionText =
          action === "collapse"
            ? "▼ Collapsed"
            : action === "expand"
              ? "▲ Expanded"
              : "Toggled";
        showToast(`${actionText} ${result.groupsAffected} groups`, 1800);
        setStatus(result.message || "Groups toggled");
      }
      setHeaderState("idle");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initUI();

    // Update version display from manifest
    const manifest = chrome.runtime.getManifest();
    const versionDisplay = document.getElementById("versionDisplay");
    if (versionDisplay && manifest.version) {
      versionDisplay.textContent = `Version ${manifest.version}`;
    }
  } catch (e) {
    console.warn("Popup init failed; applying fallback theme", e);
    applyTheme("auto");
  }
  bindHandlers();
});
