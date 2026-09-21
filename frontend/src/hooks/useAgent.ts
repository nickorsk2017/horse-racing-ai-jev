import { useCallback, useMemo, useState } from "react";

// ok: null while connecting, true online, false offline.
export interface AgentStatus {
  ok: boolean | null;
  text: string;
}

export interface Agent {
  status: AgentStatus;
  error: Error | null;
  online: (model: string) => void;
  offline: (text: string, err?: Error) => void;
  clearError: () => void;
}

// Jev AI Agent status shared by the Race view and the Model Lab.
export function useAgent(): Agent {
  const [status, setStatus] = useState<AgentStatus>({ ok: null, text: "Jev: connecting…" });
  const [error, setError] = useState<Error | null>(null);

  const online = useCallback((model: string) => {
    setStatus({ ok: true, text: `Jev: online · ${model}` });
  }, []);
  const offline = useCallback((text: string, err?: Error) => {
    setStatus({ ok: false, text });
    if (err) setError(err);
  }, []);
  const clearError = useCallback(() => setError(null), []);

  return useMemo(() => ({ status, error, online, offline, clearError }), [status, error, online, offline, clearError]);
}
