import { URL } from "../lib/jev.ts";

export default function AgentError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <div className="agent-error">
      Jev AI Agent error at <code>{URL}</code>: {error.message}. Check the agent: <code>cd mcp &amp;&amp; ./run.sh</code>,{" "}
      <code>TYPESAFE_API_KEY</code> in <code>mcp/.env</code>.
    </div>
  );
}
