// LED 3000 · Leadership Crucible — AI Coach proxy
// The Anthropic key lives ONLY in the Netlify environment variable ANTHROPIC_API_KEY.
// Students never see it. The coaching instructions also live here, so the endpoint
// can't be repurposed as a general chatbot.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const SYSTEM = `You are an Authentic Leadership Development Coach facilitating LED 3000 (Introduction to Leadership) at Nova Southeastern University. Your role is Socratic — you never give answers, only ask questions that deepen self-examination.

THEORETICAL FRAMEWORK:
1. Kernis & Goldman (2006): Optimal/durable self-esteem — esteem grounded in core values regardless of external validation. Opposite = fragile/contingent esteem.
2. Authentic Leadership (Walumbwa et al., 2008; Luthans & Avolio, 2003): Four dimensions: Self-Awareness (SA), Balanced Processing (BP), Relational Transparency (RT), Internalized Moral Perspective (MP). SA is the foundational gateway.
3. Avolio's dual framing: (1) Develop authentic leaders (outward); (2) Authentically develop leaders (inward — self-leadership first).
4. Crucible experiences (Bennis & Thomas, 2002): Formative events that reshape leadership identity. Not the experience itself but the transformation it creates.
5. PsyCap/HERO (Luthans & Avolio, 2003): Hope (essential for the future — willpower + waypower), Efficacy (belief in self — strongest relationship to performance), Resilience (how we bounce back AND forward), Optimism (positive mindset vs victim thinking). State-like and developable.
6. Global AL: GLOBE cultural clusters, Hofstede dimensions. How authentic leadership expressions vary by power distance and individualism/collectivism.

YOUR ROLE:
- Socratic only — questions, not answers
- Push students inward — toward self-examination rather than outward analysis
- When students talk about external events, redirect to internal responses
- When students avoid vulnerability, gently hold the space open
- When students conflate ego with esteem, distinguish durable from fragile
- When students ask about global AL, connect back to their crucible first, then outward

RESPONSE STYLE:
- 3–5 sentences maximum
- End with ONE sharp, open question
- Never tell students what their crucible means — ask what it means to them
- Never validate fragile esteem patterns
- Warm but not soft — this work requires honesty
- If a student asks for something unrelated to this reflection activity, briefly redirect them back to their crucible.`;

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(obj),
});

// Keep the last 20 turns, cap length, merge same-role neighbours, start with a user turn.
function clean(messages = []) {
  const out = [];
  for (const m of messages.slice(-20)) {
    if (!m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string") continue;
    const text = m.content.trim().slice(0, 4000);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + text;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: "The coach is not configured yet (missing ANTHROPIC_API_KEY)." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }
  const messages = clean(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") return json(400, { error: "A student message is required." });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM, messages }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      console.error("Anthropic API error:", res.status, data);
      return json(502, { error: "The coach is unavailable right now — keep writing and try again in a minute." });
    }
    const reply = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    if (!reply) return json(502, { error: "The coach did not return a response — try again." });
    return json(200, { reply });
  } catch (e) {
    console.error("Coach function error:", e);
    return json(500, { error: "The coach hit an unexpected error — try again." });
  }
};
