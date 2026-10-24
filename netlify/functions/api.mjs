import { getStore } from "@netlify/blobs";

const SYSTEM = `You are Ananya, a Jarvis-like assistant that controls the user's Windows PC. The user speaks Marathi (or Hindi/English).
Reply ONLY with JSON: {"reply":"<one short Marathi sentence on what you will do>","actions":[...]}
Allowed actions, nothing else:
{"t":"open_app","name":"chrome"} {"t":"open_url","url":"https://..."} {"t":"type","text":"..."} {"t":"press","key":"enter"} {"t":"hotkey","keys":["ctrl","t"]} {"t":"scroll","amount":-500} {"t":"wait","sec":2}
Never delete files, shut down, or run shell commands. If the request is unsafe or unclear, return empty actions and say why in reply.`;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.headers.get("x-key") !== Netlify.env.get("ACCESS_KEY")) return json({ error: "चुकीची access key" }, 401);
  const q = getStore("ananya");

  if (req.method === "GET") {
    const list = (await q.get("queue", { type: "json" })) || [];
    await q.setJSON("queue", []);
    return json({ actions: list });
  }

  const { text } = await req.json();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": Netlify.env.get("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: Netlify.env.get("MODEL") || "claude-sonnet-5-5",
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    }),
  });
  const d = await r.json();
  if (!r.ok) return json({ error: d.error?.message || "AI चूक" }, 502);
  let plan;
  try { plan = JSON.parse(d.content[0].text.replace(/```json|```/g, "").trim()); }
  catch { return json({ error: "AI चे उत्तर समजले नाही" }, 502); }

  const list = (await q.get("queue", { type: "json" })) || [];
  await q.setJSON("queue", list.concat(plan.actions || []));
  return json({ reply: plan.reply });
};

export const config = { path: "/api" };
