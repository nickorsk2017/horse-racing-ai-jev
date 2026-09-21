import type { AgentStatus } from "../hooks/useAgent.ts";

export default function AgentChip({ status }: { status: AgentStatus }) {
  const cls = status.ok === true ? " online" : status.ok === false ? " offline" : "";
  return (
    <div className={`chip agent${cls}`} title="Jev by TypeSafe AI, via the AI Agent (MCP)">
      {status.text}
    </div>
  );
}
