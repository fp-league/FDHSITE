/**
 * Fortnite Drivers Hub — Discord Role Check Worker
 *
 * Checks whether a Discord user currently holds the admin role in your
 * server. Triggered manually from the admin panel (enter a driver's
 * Discord ID, click "Sync admin") — the site itself then writes the
 * result to Firestore using the logged-in admin's own permissions.
 * This Worker never touches your database directly, so it only needs
 * your Discord bot token — no database credentials at all.
 *
 * Deploy with wrangler, set this secret first:
 *   wrangler secret put DISCORD_BOT_TOKEN
 * And these plain vars in wrangler.toml:
 *   DISCORD_GUILD_ID, ADMIN_ROLE_ID, ALLOWED_ORIGIN
 */

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const discordId = body.discord_id;
    if (!discordId) {
      return new Response(JSON.stringify({ error: "discord_id required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    let isAdmin = false;
    const memberRes = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${discordId}`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
    );

    if (memberRes.status === 200) {
      const member = await memberRes.json();
      isAdmin = Array.isArray(member.roles) && member.roles.includes(env.ADMIN_ROLE_ID);
    } else if (memberRes.status !== 404) {
      const errText = await memberRes.text();
      return new Response(JSON.stringify({ error: "Discord lookup failed", detail: errText }), {
        status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }
    // 404 = not a member of the guild -> isAdmin stays false

    return new Response(JSON.stringify({ isAdmin }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  },
};
