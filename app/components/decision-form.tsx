"use client";

import { useOptimistic, useState, useTransition } from "react";

import { saveDecisionAction } from "@/app/actions";

type DecisionStatus = "VALIDATED" | "REJECTED";

interface DecisionFormProps {
  listingId: string;
  collectionRunId: string;
  returnPath: string;
}

function labelFor(status: DecisionStatus) {
  return status === "VALIDATED" ? "Validado" : "Rejeitado";
}

export function DecisionForm({
  listingId,
  collectionRunId,
  returnPath,
}: DecisionFormProps) {
  const [confirmedDecision, setConfirmedDecision] =
    useState<DecisionStatus | null>(null);
  const [optimisticDecision, addOptimisticDecision] = useOptimistic<
    DecisionStatus | null,
    DecisionStatus
  >(confirmedDecision, (_current, next) => next);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (optimisticDecision) {
    return (
      <span
        aria-live="polite"
        className={`badge badge-${optimisticDecision.toLowerCase()}`}
      >
        {labelFor(optimisticDecision)}
      </span>
    );
  }

  return (
    <form
      className="decision-form"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const status =
          submitter instanceof HTMLButtonElement ? submitter.value : null;
        if (status !== "VALIDATED" && status !== "REJECTED") return;

        formData.set("status", status);
        startTransition(async () => {
          addOptimisticDecision(status);
          setError(null);
          try {
            await saveDecisionAction(formData);
            setConfirmedDecision(status);
          } catch {
            setError("NÃ£o foi possÃ­vel salvar a decisÃ£o. Tente novamente.");
          }
        });
      }}
    >
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="collectionRunId" value={collectionRunId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input
        name="notes"
        aria-label="ObservaÃ§Ã£o"
        placeholder="Nota opcional"
        disabled={isPending}
      />
      <button
        name="status"
        value="VALIDATED"
        className="link-button"
        disabled={isPending}
      >
        {isPending ? "Salvandoâ€¦" : "Validar"}
      </button>
      <button
        name="status"
        value="REJECTED"
        className="link-button danger"
        disabled={isPending}
      >
        Rejeitar
      </button>
      {error && (
        <small className="decision-error" role="alert">
          {error}
        </small>
      )}
    </form>
  );
}
