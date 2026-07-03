import type { PoolClient } from "pg";
import { RESOURCE_COLUMNS } from "./economy.js";

export interface ResourceChange {
  resource: keyof typeof RESOURCE_COLUMNS | string;
  delta: number; // positivo credita, negativo debita
}

export class InsufficientResources extends Error {
  constructor(public resource: string) {
    super(`insufficient ${resource}`);
  }
}

/**
 * Aplica variações de recursos ao jogador de forma atômica e audita em `transactions`.
 * Deve ser chamado DENTRO de uma transação (withTx). Lança InsufficientResources
 * se algum débito deixaria o saldo negativo (proteção dupla com o CHECK do banco).
 */
export async function applyChanges(
  client: PoolClient,
  accountId: string,
  source: string,
  sourceRef: string | null,
  changes: ResourceChange[]
): Promise<void> {
  if (changes.length === 0) return;

  // trava a linha do jogador para evitar corrida entre requisições paralelas
  const { rows } = await client.query(
    "SELECT * FROM players WHERE account_id = $1 FOR UPDATE",
    [accountId]
  );
  if (rows.length === 0) throw new Error("player not found");
  const player = rows[0];

  const sets: string[] = [];
  const params: unknown[] = [accountId];
  let i = 2;
  for (const c of changes) {
    const col = RESOURCE_COLUMNS[c.resource];
    if (!col) throw new Error(`unknown resource ${c.resource}`);
    const current = BigInt(player[col]);
    if (current + BigInt(c.delta) < 0n) throw new InsufficientResources(c.resource);
    sets.push(`${col} = ${col} + $${i}`);
    params.push(c.delta);
    i++;
  }
  await client.query(
    `UPDATE players SET ${sets.join(", ")}, updated_at = now() WHERE account_id = $1`,
    params
  );
  await client.query(
    "INSERT INTO transactions (account_id, source, source_ref, changes) VALUES ($1,$2,$3,$4)",
    [accountId, source, sourceRef, JSON.stringify(changes)]
  );
}

/** Gasta diamantes usando primeiro os grátis, depois os pagos. */
export function splitGemCost(
  gemsFree: bigint,
  totalCost: number
): ResourceChange[] {
  const fromFree = gemsFree >= BigInt(totalCost) ? totalCost : Number(gemsFree);
  const fromPaid = totalCost - fromFree;
  const changes: ResourceChange[] = [];
  if (fromFree > 0) changes.push({ resource: "gems_free", delta: -fromFree });
  if (fromPaid > 0) changes.push({ resource: "gems_paid", delta: -fromPaid });
  return changes;
}
