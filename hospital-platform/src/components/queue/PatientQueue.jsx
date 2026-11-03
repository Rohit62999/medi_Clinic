import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabase";
import { QUEUE_REFRESH_MS } from "../../constants";
import { errorMessage } from "../../utils/helpers";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { EmptyState, Notice, PageHeader, RefreshButton } from "../common";
import { TokenSlip } from "./TokenSlip";

export function PatientQueue() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    const { data, error: loadError } = await supabase.rpc("get_my_queue_status");
    if (loadError) {
      setError(errorMessage(loadError, "Your queue status couldn't be loaded."));
    } else {
      setError("");
      setEntries(data || []);
      setUpdatedAt(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load, QUEUE_REFRESH_MS);

  return (
    <>
      <PageHeader
        title="My queue token"
        description={
          updatedAt
            ? `Updates automatically. Last checked at ${updatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.`
            : "Your place in today's queue."
        }
      >
        <RefreshButton onClick={() => load()} busy={loading} />
      </PageHeader>
      <Notice tone="error">{error}</Notice>

      {loading && entries.length === 0 ? (
        <p className="muted loading-line">Checking today's queue…</p>
      ) : entries.length === 0 ? (
        <EmptyState title="You're not in a queue today">
          When you arrive for a confirmed appointment, reception checks you in and your token appears here.
        </EmptyState>
      ) : (
        <div className="token-list">
          {entries.map((entry) => (
            <TokenSlip key={entry.queue_id} entry={entry} />
          ))}
        </div>
      )}
    </>
  );
}

