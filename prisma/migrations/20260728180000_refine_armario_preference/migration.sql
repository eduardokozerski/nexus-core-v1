UPDATE "RadarPreference"
SET
    "term" = 'armário carrinho',
    "normalizedTerm" = 'armario carrinho',
    "reason" = 'Móvel organizador grande fora do perfil operacional.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE
    "kind" = 'BANNED'
    AND "normalizedTerm" = 'armario';
