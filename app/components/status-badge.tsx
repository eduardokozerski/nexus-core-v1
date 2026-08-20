const labels: Record<string, string> = { SUCCESS: "Concluída", PARTIAL: "Parcial", FAILED: "Falhou", RUNNING: "Executando", PENDING: "Pendente", ACTIVE: "Ativo", PAUSED: "Pausado", VALIDATED: "Validado", REJECTED: "Rejeitado" };

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge badge-${value.toLowerCase()}`}>{labels[value] ?? value}</span>;
}
