import type { MatchResult } from "../engine/types";

export function newPartsTask(dealer: string, results: MatchResult[]): { name: string; markdown: string } {
  const name = `New MOC parts — ${dealer} (${results.length} to set up)`;
  const header = "| Dealer SKU | DMS Name | Suggested MOC # | Product | Confidence |\n|---|---|---|---|---|";
  const rows = results.map(
    (r) =>
      `| ${r.sku} | ${r.partName || "—"} | ${r.matchedPartNumber || "—"} | ${r.matchedArchetype ? r.matchedArchetype.replace(/^\d+\s*-\s*/, "") : "—"} | ${r.confidence || "—"} |`
  );
  const markdown = `**${results.length} new part(s)** found for **${dealer}** — set up in Easy Wins.\n\n${header}\n${rows.join("\n")}`;
  return { name, markdown };
}

export async function createClickUpTask(
  deps: { token: string; listId: string; fetchImpl?: typeof fetch },
  task: { name: string; markdown: string }
): Promise<void> {
  const f = deps.fetchImpl ?? fetch;
  const res = await f(`https://api.clickup.com/api/v2/list/${deps.listId}/task`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: deps.token },
    body: JSON.stringify({ name: task.name, markdown_description: task.markdown }),
  });
  if (!(res as any).ok) throw new Error(`ClickUp HTTP ${(res as any).status}`);
}
