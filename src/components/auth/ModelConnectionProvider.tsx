"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { Drawer } from "@/components/v2/agent/Drawer";
import { cn } from "@/lib/cn";
import {
  createVolatileCredentialVault,
  type VolatileCredentialVault,
} from "./model-connection-memory";

const API_KEY_HEADER = "X-ASO-NVIDIA-API-Key";
const PROVIDER_HEADER = "X-ASO-AI-Provider";
const SIGN_OUT_EVENT = "aso:auth-signout";

type ConnectionState =
  | { status: "disconnected" }
  | {
      status: "connected";
      provider: "nvidia";
      endpoint: string;
      model: string;
    };

interface PublicProviderConfiguration {
  provider: "nvidia";
  endpoint: string;
  model: string;
}

interface SafeFailureDiagnostics {
  origin: string;
  pathname: string;
  status: number | null;
  requestId: string | null;
  category: string;
  model: string;
  contentType: string | null;
  stage: "request" | "body_parsing" | "schema_validation";
}

interface ModelConnectionContextValue {
  connection: ConnectionState;
  openConnection: () => void;
  disconnect: () => void;
  getProviderHeaders: () => Record<string, string>;
}

const DISCONNECTED_CONTEXT: ModelConnectionContextValue = {
  connection: { status: "disconnected" },
  openConnection: () => {},
  disconnect: () => {},
  getProviderHeaders: () => ({}),
};

const ModelConnectionContext =
  createContext<ModelConnectionContextValue>(DISCONNECTED_CONTEXT);

export function ModelConnectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { status } = useSession();
  const credentialVaultRef = useRef<VolatileCredentialVault>();
  if (!credentialVaultRef.current) {
    credentialVaultRef.current = createVolatileCredentialVault();
  }
  const [connection, setConnection] = useState<ConnectionState>({
    status: "disconnected",
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const openConnection = useCallback(() => setDrawerOpen(true), []);
  const closeConnection = useCallback(() => setDrawerOpen(false), []);

  const disconnect = useCallback(() => {
    credentialVaultRef.current?.clear();
    setConnection({ status: "disconnected" });
    setClearSignal((value) => value + 1);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") disconnect();
  }, [disconnect, status]);

  useEffect(() => {
    const clear = () => disconnect();
    window.addEventListener(SIGN_OUT_EVENT, clear);
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener(SIGN_OUT_EVENT, clear);
      window.removeEventListener("pagehide", clear);
    };
  }, [disconnect]);

  const connect = useCallback(
    (apiKey: string, config: PublicProviderConfiguration) => {
      credentialVaultRef.current?.set(apiKey);
      setConnection({
        status: "connected",
        provider: "nvidia",
        endpoint: config.endpoint,
        model: config.model,
      });
    },
    [],
  );

  const getProviderHeaders = useCallback((): Record<string, string> => {
    const credential = credentialVaultRef.current?.get();
    if (connection.status !== "connected" || !credential) return {};
    return {
      [PROVIDER_HEADER]: "nvidia",
      [API_KEY_HEADER]: credential,
    };
  }, [connection.status]);

  const value = useMemo(
    () => ({
      connection,
      openConnection,
      disconnect,
      getProviderHeaders,
    }),
    [connection, disconnect, getProviderHeaders, openConnection],
  );

  return (
    <ModelConnectionContext.Provider value={value}>
      {children}
      <ModelConnectionDrawer
        open={drawerOpen}
        onClose={closeConnection}
        connection={connection}
        connect={connect}
        disconnect={disconnect}
        clearSignal={clearSignal}
      />
    </ModelConnectionContext.Provider>
  );
}

export function useModelConnection(): ModelConnectionContextValue {
  return useContext(ModelConnectionContext);
}

export function notifyModelConnectionSignOut(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SIGN_OUT_EVENT));
  }
}

function ModelConnectionDrawer({
  open,
  onClose,
  connection,
  connect,
  disconnect,
  clearSignal,
}: {
  open: boolean;
  onClose: () => void;
  connection: ConnectionState;
  connect: (apiKey: string, config: PublicProviderConfiguration) => void;
  disconnect: () => void;
  clearSignal: number;
}) {
  const titleId = useId();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [config, setConfig] = useState<PublicProviderConfiguration | null>(null);
  const [configError, setConfigError] = useState(false);
  const [testState, setTestState] = useState<
    "idle" | "testing" | "success" | "failure"
  >("idle");
  const [failureDiagnostics, setFailureDiagnostics] =
    useState<SafeFailureDiagnostics | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const testedCredentialRef = useRef<string | null>(null);

  const clearDraft = useCallback(() => {
    setApiKey("");
    if (inputRef.current) inputRef.current.value = "";
    setShowKey(false);
    setTestState("idle");
    setFailureDiagnostics(null);
    testedCredentialRef.current = null;
  }, []);

  useEffect(() => {
    clearDraft();
  }, [clearDraft, clearSignal]);

  const close = useCallback(() => {
    clearDraft();
    onClose();
  }, [clearDraft, onClose]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setConfigError(false);
    fetch("/api/ai/model-connection", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("configuration unavailable");
        return (await response.json()) as PublicProviderConfiguration;
      })
      .then((next) => {
        if (active) setConfig(next);
      })
      .catch(() => {
        if (active) setConfigError(true);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const onCredentialChange = (event: ChangeEvent<HTMLInputElement>) => {
    setApiKey(event.target.value);
    setTestState("idle");
    setFailureDiagnostics(null);
    testedCredentialRef.current = null;
  };

  const testConnection = async () => {
    if (!apiKey.trim()) return;
    setTestState("testing");
    setFailureDiagnostics(null);
    testedCredentialRef.current = null;
    try {
      const response = await fetch("/api/ai/model-connection", {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          [API_KEY_HEADER]: apiKey,
        },
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
          diagnostics?: SafeFailureDiagnostics;
        } | null;
        setFailureDiagnostics(failure?.diagnostics ?? null);
        setTestState("failure");
        return;
      }
      const result = (await response.json()) as PublicProviderConfiguration & {
        status: "connection_test_succeeded";
      };
      setConfig(result);
      testedCredentialRef.current = apiKey;
      setTestState("success");
    } catch {
      setTestState("failure");
    }
  };

  const connectForSession = () => {
    if (
      !config ||
      testState !== "success" ||
      testedCredentialRef.current !== apiKey
    ) {
      return;
    }
    connect(apiKey, config);
    clearDraft();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      closeLabel="Close model connection"
      titleId={titleId}
      title="Connect your model"
      subtitle="NVIDIA-assisted narration for this tab until you reload, sign out, or disconnect."
    >
      <div className="space-y-5">
        <section className="rounded-md border border-border bg-elevated p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-text-primary">
                NVIDIA
              </div>
              <div className="mt-0.5 text-xs text-text-muted">
                The only enabled tab-scoped provider in this build.
              </div>
            </div>
            <ConnectionBadge status={connection.status} />
          </div>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-text-muted">Endpoint</dt>
              <dd className="mt-1 break-all font-mono text-text-secondary">
                {config?.endpoint ??
                  (configError ? "Configuration unavailable" : "Loading…")}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Model</dt>
              <dd className="mt-1 break-all font-mono text-text-secondary">
                {config?.model ??
                  (configError ? "Configuration unavailable" : "Loading…")}
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-3">
          <div>
            <label
              htmlFor="nvidia-session-api-key"
              className="text-xs font-semibold text-text-primary"
            >
              NVIDIA API key
            </label>
            <div className="mt-1.5 flex min-w-0 gap-2">
              <input
                id="nvidia-session-api-key"
                ref={inputRef}
                type={showKey ? "text" : "password"}
                onChange={onCredentialChange}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={testState === "testing"}
                aria-describedby="nvidia-key-security"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "Hide NVIDIA API key" : "Show NVIDIA API key"}
                className="min-h-11 shrink-0 rounded-md border border-border bg-elevated px-3 text-xs font-medium text-text-secondary hover:border-border-strong"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p
              id="nvidia-key-security"
              className="mt-2 text-xs leading-relaxed text-text-muted"
            >
              Tab only. The key stays in volatile memory while you navigate
              within the app and is sent only to authenticated server endpoints
              when testing or narrating. Reloading or closing the tab, signing
              out, or disconnecting clears it. Testing the key does not connect
              it. It is never saved to browser storage, cookies, files or
              application configuration.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={testConnection}
              disabled={
                !apiKey.trim() || testState === "testing" || configError
              }
              className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testState === "testing" ? "Testing connection…" : "Test connection"}
            </button>
            <button
              type="button"
              onClick={connectForSession}
              disabled={
                testState !== "success" ||
                testedCredentialRef.current !== apiKey
              }
              className="min-h-11 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-text-inverted hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect for this session
            </button>
            {connection.status === "connected" ? (
              <button
                type="button"
                onClick={() => {
                  disconnect();
                  clearDraft();
                }}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:border-border-strong"
              >
                Disconnect
              </button>
            ) : null}
          </div>

          <ConnectionTestStatus
            state={testState}
            diagnostics={failureDiagnostics}
          />
        </section>

        <section className="rounded-md border border-border bg-surface p-4 text-xs leading-relaxed text-text-secondary">
          <div className="font-semibold text-text-primary">
            What changes when connected
          </div>
          <p className="mt-1.5">
            Deterministic operational computation remains authoritative.
            Eligible K-201 Case Investigator requests may use NVIDIA to
            re-narrate already governed evidence. NVIDIA cannot change scores,
            telemetry, exposure, citations, recommendations or human authority.
          </p>
          <p className="mt-2">
            If NVIDIA fails, times out or returns an invalid or ungrounded
            response, the application uses the deterministic narrator and
            discloses that fallback in the investigator.
          </p>
        </section>
      </div>
    </Drawer>
  );
}

function ConnectionBadge({
  status,
}: {
  status: ConnectionState["status"];
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        status === "connected"
          ? "border-healthy-border bg-healthy-subtle text-healthy-text"
          : "border-border bg-surface text-text-muted",
      )}
    >
      {status === "connected" ? "Connected until reload" : "Disconnected"}
    </span>
  );
}

function ConnectionTestStatus({
  state,
  diagnostics,
}: {
  state: "idle" | "testing" | "success" | "failure";
  diagnostics: SafeFailureDiagnostics | null;
}) {
  if (state === "idle") return null;
  if (state === "testing") {
    return (
      <p role="status" className="text-xs text-text-secondary">
        Testing the server-side NVIDIA connection…
      </p>
    );
  }
  if (state === "success") {
    return (
      <p role="status" className="text-xs font-medium text-healthy-text">
        Connection test succeeded. The key is not connected until you select
        “Connect for this session”.
      </p>
    );
  }
  return (
    <div role="alert" className="space-y-1 text-xs text-critical-text">
      <p className="font-medium">
        Connection test failed. No credential was saved.
      </p>
      {diagnostics ? (
        <p>
          Safe diagnostic: {diagnostics.category}; upstream{" "}
          {diagnostics.status ?? "unavailable"}; {diagnostics.origin}
          {diagnostics.pathname}; model {diagnostics.model}; stage{" "}
          {diagnostics.stage}
          {diagnostics.requestId
            ? `; correlation ${diagnostics.requestId}`
            : ""}
          .
        </p>
      ) : (
        <p>Safe diagnostic details were unavailable.</p>
      )}
    </div>
  );
}
