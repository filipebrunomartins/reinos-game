import Fastify from "fastify";
import { env } from "./config.js";
import { redis } from "./redis.js";
import authRoutes from "./routes/auth.js";
import configRoutes from "./routes/config.js";
import playerRoutes from "./routes/player.js";
import heroRoutes from "./routes/heroes.js";
import afkRoutes from "./routes/afk.js";
import gachaRoutes from "./routes/gacha.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  // ---- rate limit simples por IP (Redis, janela fixa de 60 s) ----
  app.addHook("onRequest", async (req, reply) => {
    const bucket = `rl:${req.ip}:${Math.floor(Date.now() / 60000)}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, 65);
    if (count > 120) {
      reply.code(429).send({ error: "rate_limited" });
    }
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(configRoutes);
  await app.register(playerRoutes);
  await app.register(heroRoutes);
  await app.register(afkRoutes);
  await app.register(gachaRoutes);

  return app;
}

const app = await buildApp();
app.listen({ port: env.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
