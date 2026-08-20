INSERT INTO "RadarPreference"
    ("id", "kind", "term", "normalizedTerm", "reason", "active", "updatedAt")
VALUES
    (
      '92af260c-4081-4d92-9526-2f312f9f7b18',
      'BANNED',
      'bateria',
      'bateria',
      'Produto eletrônico ou dependente de circuito de carga.',
      true,
      CURRENT_TIMESTAMP
    )
ON CONFLICT ("kind", "normalizedTerm") DO UPDATE SET
    "term" = EXCLUDED."term",
    "reason" = EXCLUDED."reason",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
