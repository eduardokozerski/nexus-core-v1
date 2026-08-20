import IORedis from "ioredis";

export function createRedisConnection() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error("REDIS_URL não configurada. Configure o Redis antes de iniciar a fila de trabalhos.");

  return new IORedis(url, {
    maxRetriesPerRequest: null,
    // Não deixe um worker sem Redis repetir erros de conexão indefinidamente.
    // Um gerenciador de processos pode reiniciá-lo depois que o serviço voltar.
    retryStrategy: () => null,
  });
}
