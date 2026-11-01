import { useEffect, useState } from "react";
import {
  discardRemoval,
  listPendingRemovals,
  onRemovalsChange,
  runRemovalSync,
  type RemoveEntry,
} from "@/services/LearnerRemoveService";

/** Shows removal requests the server refused, with Restore / Try again. */
export function RemovalNotice() {
  const [failed, setFailed] = useState<RemoveEntry[]>([]);

  useEffect(() => {
    const load = () => void listPendingRemovals().then((all) => setFailed(all.filter((e) => e.status === "FAILED")));
    load();
    return onRemovalsChange(load);
  }, []);

  if (failed.length === 0) return null;
  return (
    <div className="container py-2" style={{ maxWidth: 640 }}>
      {failed.map((e) => (
        <div key={e.id} className="alert alert-warning small mb-2">
          <strong>{e.studentLabel}</strong> could not be {e.mode === "delete" ? "deleted" : "archived"}: {e.error}
          <div className="mt-2 d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => void discardRemoval(e.id)}>
              Restore learner
            </button>
            <button className="btn btn-sm btn-outline-primary" onClick={() => void runRemovalSync()}>
              Try again
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
