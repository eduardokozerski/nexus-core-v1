CREATE TYPE "RadarPreferenceKind" AS ENUM ('PREFERRED', 'BANNED');

CREATE TABLE "RadarPreference" (
    "id" TEXT NOT NULL,
    "kind" "RadarPreferenceKind" NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RadarPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RadarPreference_kind_normalizedTerm_key"
ON "RadarPreference"("kind", "normalizedTerm");

CREATE INDEX "RadarPreference_active_kind_idx"
ON "RadarPreference"("active", "kind");

INSERT INTO "RadarPreference"
    ("id", "kind", "term", "normalizedTerm", "reason", "active", "updatedAt")
VALUES
    ('92af260c-4081-4d92-9526-2f312f9f7b01', 'PREFERRED', 'saboneteira', 'saboneteira', 'Preferência informada em 28/07: organização compacta para banheiro.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b02', 'PREFERRED', 'suporte de parede', 'suporte de parede', 'Preferência informada em 28/07: suportes compactos para casa.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b03', 'PREFERRED', 'suporte controle remoto', 'suporte controle remoto', 'Preferência informada em 28/07: suporte de controle remoto.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b04', 'PREFERRED', 'suporte de celular', 'suporte de celular', 'Preferência informada em 28/07: acessórios compactos para celular.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b05', 'PREFERRED', 'organizador de banheiro', 'organizador de banheiro', 'Preferência informada em 28/07: organização compacta para casa.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b06', 'PREFERRED', 'organizador de cozinha', 'organizador de cozinha', 'Preferência informada em 28/07: organização compacta para casa.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b07', 'PREFERRED', 'limpa ralo', 'limpa ralo', 'Preferência informada em 28/07: ferramenta compacta de limpeza.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b08', 'PREFERRED', 'limpador porta usb', 'limpador porta usb', 'Preferência informada em 28/07: ferramenta compacta para celular e notebook.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b09', 'PREFERRED', 'dummy 13', 'dummy 13', 'Preferência informada em 28/07: brinquedo articulado compacto.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b10', 'PREFERRED', 'fidget', 'fidget', 'Preferência informada em 28/07: brinquedo passivo compacto.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b11', 'BANNED', 'bola voadora', 'bola voadora', 'Produto eletrônico ou com mecanismo inviável.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b12', 'BANNED', 'patrulha canina', 'patrulha canina', 'Produto licenciado e fora do foco informado em 28/07.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b13', 'BANNED', 'paw patrol', 'paw patrol', 'Produto licenciado e fora do foco informado em 28/07.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b14', 'BANNED', 'armário', 'armario', 'Móvel grande fora do perfil operacional.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b15', 'BANNED', 'guarda roupa', 'guarda roupa', 'Móvel grande fora do perfil operacional.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b16', 'BANNED', 'closet', 'closet', 'Móvel grande fora do perfil operacional.', true, CURRENT_TIMESTAMP),
    ('92af260c-4081-4d92-9526-2f312f9f7b17', 'BANNED', 'porta volumes', 'porta volumes', 'Produto volumoso fora do foco operacional.', true, CURRENT_TIMESTAMP);
