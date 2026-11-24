import { useState } from "react";
import { useBridgePairing } from "@/hooks/useBridgePairing";
import type { BridgeConnectionState } from "@/services/bridgeSettings.service";

const STATE_LABELS: Record<BridgeConnectionState, string> = {
  off: "Not paired",
  connecting: "Waiting for VS Code…",
  connected: "Connected to VS Code",
  unauthorized: "VS Code rejected the code — pair again",
  untrusted:
    "Can't verify VS Code — pair again (or another program is using the port)",
  incompatible: "Version mismatch — update the extensions",
};

const STATE_COLORS: Record<BridgeConnectionState, string> = {
  off: "#888",
  connecting: "#b36b00",
  connected: "#1a7f37",
  unauthorized: "#c62828",
  untrusted: "#c62828",
  incompatible: "#c62828",
};

// The VS Code extension is released separately; this popup is where users are
// pointed to it, so they only see it once they have this (bridge-capable) version.
const VSCODE_EXTENSION_RELEASES_URL =
  "https://github.com/andressuarezmonk/netsuite-tool/releases?q=ide-v";

const SMALL_BUTTON_STYLE = {
  padding: "5px 10px",
  fontSize: 11,
  borderRadius: 5,
  border: "1px solid #ccc",
  background: "white",
  cursor: "pointer",
} as const;

export default function BridgePairing() {
  const { isPaired, connectionState, pair, unpair } = useBridgePairing();
  const [pairingCode, setPairingCode] = useState("");
  const [hasInvalidCode, setHasInvalidCode] = useState(false);

  const submitPairingCode = async () => {
    const wasAccepted = await pair(pairingCode);
    setHasInvalidCode(!wasAccepted);
    if (wasAccepted) setPairingCode("");
  };

  return (
    <div
      style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e5e5" }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        VS Code
      </div>

      {isPaired ? (
        <>
          <div style={{ fontSize: 11, color: STATE_COLORS[connectionState] }}>
            ● {STATE_LABELS[connectionState]}
          </div>
          <button
            onClick={unpair}
            style={{ ...SMALL_BUTTON_STYLE, marginTop: 8 }}
          >
            Unpair
          </button>
        </>
      ) : (
        <>
          <input
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value)}
            placeholder="Paste pairing code"
            spellCheck={false}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              fontSize: 11,
              border: `1px solid ${hasInvalidCode ? "#c62828" : "#ccc"}`,
              borderRadius: 5,
            }}
          />
          <div
            style={{
              fontSize: 10,
              color: hasInvalidCode ? "#c62828" : "#888",
              margin: "4px 0 6px",
            }}
          >
            {hasInvalidCode
              ? "That isn't a valid pairing code."
              : "In VS Code run “NetSuite Tracker: Pair with Chrome”."}
          </div>
          <button
            onClick={submitPairingCode}
            disabled={pairingCode.trim() === ""}
            style={SMALL_BUTTON_STYLE}
          >
            Pair
          </button>
          <div style={{ marginTop: 8 }}>
            <a
              href={VSCODE_EXTENSION_RELEASES_URL}
              onClick={(event) => {
                event.preventDefault();
                chrome.tabs.create({ url: VSCODE_EXTENSION_RELEASES_URL });
              }}
              style={{ fontSize: 11, color: "#0066cc" }}
            >
              Get the VS Code extension →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
