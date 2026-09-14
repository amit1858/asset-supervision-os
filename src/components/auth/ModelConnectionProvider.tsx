"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Drawer } from "@/components/v2/agent/Drawer";
import { cn } from "@/lib/cn";
import { createVolatileCredentialVault, type VolatileCredentialVault } from "./model-connection-memory";

const PROVIDER_HEADER = "X-ASO-AI-Provider";
const MODEL_HEADER = "X-ASO-AI-Model";
const SIGN_OUT_EVENT = "aso:auth-signout";
type ProviderId = "nvidia" | "openrouter" | "openai" | "anthropic";
type ConnectionState = { status: "disconnected" } | { status: "connected"; provider: ProviderId; endpoint: string; model: string };
type PublicProviderConfiguration = { provider: ProviderId; label: string; endpoint: string; protocol: string; keyLabel: string; disclosure: string; models: { id: string; label: string }[] };
type SafeFailureDiagnostics = { origin: string; pathname: string; status: number | null; requestId: string | null; category: string; model: string; contentType: string | null; stage: "request" | "body_parsing" | "schema_validation" };
type ContextValue = { connection: ConnectionState; openConnection: () => void; disconnect: () => void; getProviderHeaders: () => Record<string, string> };

const DISCONNECTED: ContextValue = { connection: { status: "disconnected" }, openConnection: () => {}, disconnect: () => {}, getProviderHeaders: () => ({}) };
const Context = createContext<ContextValue>(DISCONNECTED);

export function ModelConnectionProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const vault = useRef<VolatileCredentialVault>();
  if (!vault.current) vault.current = createVolatileCredentialVault();
  const [connection, setConnection] = useState<ConnectionState>({ status: "disconnected" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const disconnect = useCallback(() => {
    vault.current?.clear();
    setConnection({ status: "disconnected" });
    setClearSignal((value) => value + 1);
  }, []);
  useEffect(() => { if (status === "unauthenticated") disconnect(); }, [disconnect, status]);
  useEffect(() => {
    const clear = () => disconnect();
    window.addEventListener(SIGN_OUT_EVENT, clear);
    window.addEventListener("pagehide", clear);
    return () => { window.removeEventListener(SIGN_OUT_EVENT, clear); window.removeEventListener("pagehide", clear); };
  }, [disconnect]);
  const getProviderHeaders = useCallback((): Record<string, string> => {
    const key = vault.current?.get();
    if (connection.status !== "connected" || !key) return {};
    return { [PROVIDER_HEADER]: connection.provider, [MODEL_HEADER]: connection.model, [`X-ASO-${connection.provider}-API-Key`]: key };
  }, [connection]);
  const value = useMemo(() => ({ connection, openConnection: () => setDrawerOpen(true), disconnect, getProviderHeaders }), [connection, disconnect, getProviderHeaders]);
  const connect = useCallback((provider: ProviderId, endpoint: string, model: string, key: string) => {
    vault.current?.set(key);
    setConnection({ status: "connected", provider, endpoint, model });
    setDrawerOpen(false);
  }, []);
  return <Context.Provider value={value}>{children}<ModelConnectionDrawer open={drawerOpen} onClose={() => { disconnect(); setDrawerOpen(false); }} onConnect={connect} connection={connection} clearSignal={clearSignal} /></Context.Provider>;
}

export function useModelConnection(): ContextValue { return useContext(Context); }
export function notifyModelConnectionSignOut(): void { if (typeof window !== "undefined") window.dispatchEvent(new Event(SIGN_OUT_EVENT)); }

function ModelConnectionDrawer({ open, onClose, onConnect, connection, clearSignal }: { open: boolean; onClose: () => void; onConnect: (provider: ProviderId, endpoint: string, model: string, key: string) => void; connection: ConnectionState; clearSignal: number }) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const testedCredential = useRef<string | null>(null);
  const [configs, setConfigs] = useState<PublicProviderConfiguration[]>([]);
  const [providerId, setProviderId] = useState<ProviderId>("nvidia");
  const [modelId, setModelId] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [state, setState] = useState<"idle" | "testing" | "success" | "failure">("idle");
  const [diagnostics, setDiagnostics] = useState<SafeFailureDiagnostics | null>(null);
  const selected = configs.find((item) => item.provider === providerId) ?? null;
  const selectedModel = selected?.models.find((item) => item.id === modelId) ?? selected?.models[0];
  const clearDraft = useCallback(() => { if (inputRef.current) inputRef.current.value = ""; setShowKey(false); setState("idle"); setDiagnostics(null); testedCredential.current = null; }, []);
  useEffect(() => { clearDraft(); }, [clearDraft, clearSignal]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/ai/model-connection", { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (res) => { if (!res.ok) throw new Error("configuration unavailable"); return (await res.json()) as { providers: PublicProviderConfiguration[] }; })
      .then((data) => {
        if (!active) return;
        setConfigs(data.providers);
        // Preserve the user's current selection across a reopen instead of
        // always resetting to the catalog's first provider — resetting
        // unconditionally on every fetch resolution both loses the user's
        // choice on every reopen and races any selection made while this
        // fetch is still in flight.
        setProviderId((current) => (data.providers.some((item) => item.provider === current) ? current : (data.providers[0]?.provider ?? current)));
      })
      .catch(() => { if (active) setConfigs([]); });
    return () => { active = false; };
  }, [open]);
  useEffect(() => {
    const selectedConfig = configs.find((item) => item.provider === providerId);
    if (!selectedConfig) return;
    setModelId((current) => (selectedConfig.models.some((item) => item.id === current) ? current : (selectedConfig.models[0]?.id ?? "")));
  }, [providerId, configs]);
  const changeProvider = (value: ProviderId) => { setProviderId(value); const next = configs.find((item) => item.provider === value); setModelId(next?.models[0]?.id ?? ""); clearDraft(); };
  const testConnection = async () => {
    const key = inputRef.current?.value ?? "";
    if (!key.trim() || !selectedModel) return;
    setState("testing"); setDiagnostics(null); testedCredential.current = null;
    try {
      const response = await fetch("/api/ai/model-connection", { method: "POST", cache: "no-store", headers: { Accept: "application/json", [PROVIDER_HEADER]: providerId, [MODEL_HEADER]: selectedModel.id, [`X-ASO-${providerId}-API-Key`]: key } });
      if (!response.ok) { const failure = await response.json().catch(() => null) as { diagnostics?: SafeFailureDiagnostics } | null; setDiagnostics(failure?.diagnostics ?? null); setState("failure"); return; }
      const result = await response.json() as { model: string };
      setModelId(result.model); testedCredential.current = key; setState("success");
    } catch { setState("failure"); }
  };
  const connectForSession = () => {
    const key = inputRef.current?.value ?? "";
    if (!selected || !selectedModel || state !== "success" || testedCredential.current !== key) return;
    onConnect(providerId, selected.endpoint, selectedModel.id, key);
    clearDraft();
  };
  return <Drawer open={open} onClose={onClose} closeLabel="Close Provider Centre" titleId={titleId} title="Provider Centre" subtitle="Session-scoped BYOK for governed narration; credentials are never persisted.">
    <div className="space-y-5">
      <section className="rounded-md border border-border bg-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold text-text-primary">Choose a provider</div><div className="mt-0.5 text-xs text-text-muted">Only one provider credential can be active for this session.</div></div><ConnectionBadge status={connection.status} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-text-primary">Provider<select value={providerId} onChange={(e) => changeProvider(e.target.value as ProviderId)} className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-normal text-text-primary">{configs.map((item) => <option key={item.provider} value={item.provider}>{item.label}</option>)}</select></label>
          <label className="text-xs font-semibold text-text-primary">Approved model<select value={modelId} onChange={(e) => { setModelId(e.target.value); clearDraft(); }} className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-normal text-text-primary">{selected?.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-text-muted">{selected?.disclosure ?? "Provider configuration unavailable."}</p>
      </section>
      <section className="space-y-3">
        <label htmlFor="session-provider-api-key" className="text-xs font-semibold text-text-primary">{selected?.keyLabel ?? "Provider API key"}</label>
        <div className="flex min-w-0 gap-2"><input id="session-provider-api-key" ref={inputRef} type={showKey ? "text" : "password"} onChange={() => { setState("idle"); setDiagnostics(null); testedCredential.current = null; }} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={state === "testing"} className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" /><button type="button" onClick={() => setShowKey((value) => !value)} className="min-h-11 shrink-0 rounded-md border border-border bg-elevated px-3 text-xs font-medium text-text-secondary">{showKey ? "Hide" : "Show"}</button></div>
        <p className="text-xs leading-relaxed text-text-muted">The masked key stays in volatile memory only. Testing does not connect it. Reload, sign-out, disconnect, provider switching and closing this centre clear it.</p>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={testConnection} disabled={!selectedModel || state === "testing"} className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary disabled:opacity-50">{state === "testing" ? "Testing connection…" : "Test connection"}</button><button type="button" onClick={connectForSession} disabled={state !== "success"} className="min-h-11 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-text-inverted disabled:opacity-50">Connect for this session</button>{connection.status === "connected" ? <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary">Disconnect</button> : null}</div>
        <ConnectionTestStatus state={state} diagnostics={diagnostics} />
      </section>
      <section className="rounded-md border border-border bg-surface p-4 text-xs leading-relaxed text-text-secondary"><div className="font-semibold text-text-primary">Governed behavior</div><p className="mt-1.5">Provider output may replace only validated Case Investigator prose. Telemetry, scores, calculations, evidence, recommendations, timestamps and human authority remain server-governed. Any failure returns deterministic narration with truthful provenance.</p></section>
    </div>
  </Drawer>;
}

function ConnectionBadge({ status }: { status: ConnectionState["status"] }) { return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", status === "connected" ? "border-healthy-border bg-healthy-subtle text-healthy-text" : "border-border bg-surface text-text-muted")}>{status === "connected" ? "Connected until reload" : "Disconnected"}</span>; }
function ConnectionTestStatus({ state, diagnostics }: { state: "idle" | "testing" | "success" | "failure"; diagnostics: SafeFailureDiagnostics | null }) {
  if (state === "idle") return null;
  if (state === "testing") return <p role="status" className="text-xs text-text-secondary">Testing the server-side provider connection…</p>;
  if (state === "success") return <p role="status" className="text-xs font-medium text-healthy-text">Connection test succeeded. The key is not connected until you select “Connect for this session”.</p>;
  return <div role="alert" className="space-y-1 text-xs text-critical-text"><p className="font-medium">Connection test failed. No credential was saved.</p>{diagnostics ? <p>Safe diagnostic: {diagnostics.category}; upstream {diagnostics.status ?? "unavailable"}; {diagnostics.origin}{diagnostics.pathname}; model {diagnostics.model}; stage {diagnostics.stage}{diagnostics.requestId ? `; correlation ${diagnostics.requestId}` : ""}.</p> : <p>Safe diagnostic details were unavailable.</p>}</div>;
}
