import { useCallback, useEffect, useState } from "react";
import { parsePairingCode } from "@protocol";
import {
  BridgeSettingsService,
  DEFAULT_BRIDGE_SETTINGS,
  STORAGE_KEY_BRIDGE_SETTINGS,
  STORAGE_KEY_BRIDGE_STATUS,
  type BridgeConnectionState,
  type BridgeSettings,
} from "@/services/bridgeSettings.service";

export function useBridgePairing() {
  const [settings, setSettings] = useState<BridgeSettings>(
    DEFAULT_BRIDGE_SETTINGS,
  );
  const [connectionState, setConnectionState] =
    useState<BridgeConnectionState>("off");

  useEffect(() => {
    BridgeSettingsService.getSettings().then(setSettings);
    BridgeSettingsService.getState().then(setConnectionState);

    // The service worker updates the status as the socket connects/drops
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return;
      if (STORAGE_KEY_BRIDGE_SETTINGS in changes) {
        BridgeSettingsService.getSettings().then(setSettings);
      }
      if (STORAGE_KEY_BRIDGE_STATUS in changes) {
        BridgeSettingsService.getState().then(setConnectionState);
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => chrome.storage.onChanged.removeListener(onStorageChanged);
  }, []);

  /** Returns false when the text isn't a valid pairing code. */
  const pair = useCallback(async (pairingCode: string): Promise<boolean> => {
    const pairingInfo = parsePairingCode(pairingCode);
    if (!pairingInfo) return false;
    await BridgeSettingsService.setSettings({
      enabled: true,
      port: pairingInfo.port,
      token: pairingInfo.token,
    });
    return true;
  }, []);

  const unpair = useCallback(async () => {
    await BridgeSettingsService.setSettings(DEFAULT_BRIDGE_SETTINGS);
  }, []);

  return { isPaired: settings.enabled, connectionState, pair, unpair };
}
