// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Discord Signature Verify + Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import nacl from 'tweetnacl';

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Verifikasi Ed25519 signature dari Discord
 * @param {Buffer|Uint8Array} rawBody - raw body request
 * @param {string} signature - header X-Signature-Ed25519
 * @param {string} timestamp - header X-Signature-Timestamp
 * @returns {boolean}
 */
export function verifySignature(rawBody, signature, timestamp) {
  if (!DISCORD_PUBLIC_KEY || !signature || !timestamp) return false;

  try {
    return nacl.sign.detached.verify(
      new Uint8Array(Buffer.from(timestamp + rawBody)),
      new Uint8Array(Buffer.from(signature, 'hex')),
      new Uint8Array(Buffer.from(DISCORD_PUBLIC_KEY, 'hex'))
    );
  } catch {
    return false;
  }
}

/**
 * Buat response JSON standar
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Response PONG untuk Discord PING
 */
export function pongResponse() {
  return jsonResponse({ type: 1 });
}

/**
 * Response langsung ke interaction (type 4 = CHANNEL_MESSAGE_WITH_SOURCE)
 */
export function immediateReply(content, ephemeral = false) {
  const data = { content };
  if (ephemeral) data.flags = 64; // EPHEMERAL flag
  return jsonResponse({ type: 4, data });
}

/**
 * Response DEFERRED (type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
 * Tampilkan "thinking..." ke user, lalu followup nanti
 */
export function deferredReply(ephemeral = false) {
  const data = {};
  if (ephemeral) data.flags = 64;
  return jsonResponse({ type: 5, data });
}

/**
 * Kirim followup message setelah DEFERRED response
 */
export async function sendFollowup(interactionToken, content, applicationId = DISCORD_APPLICATION_ID) {
  if (!applicationId) {
    console.error('[Discord] sendFollowup error: applicationId tidak tersedia.');
    return null;
  }

  const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Discord] sendFollowup error:', res.status, errorText);
  }
  return res;
}

/**
 * Kirim DM ke user tertentu via Bot REST API
 * Digunakan oleh cron job untuk kirim morning summary
 */
export async function sendDM(userId, content) {
  // Step 1: Buat DM channel
  const channelRes = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: userId }),
  });

  if (!channelRes.ok) {
    const errText = await channelRes.text();
    console.error('[Discord] Create DM channel error:', channelRes.status, errText);
    return null;
  }

  const channel = await channelRes.json();

  // Step 2: Kirim message ke DM channel
  const msgRes = await fetch(`${DISCORD_API_BASE}/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!msgRes.ok) {
    const errText = await msgRes.text();
    console.error('[Discord] Send DM error:', msgRes.status, errText);
    return null;
  }

  return msgRes.json();
}

/**
 * Cek apakah user ID sesuai whitelist
 */
export function isAuthorizedUser(interaction) {
  const userId =
    interaction.member?.user?.id || interaction.user?.id;
  return userId === process.env.DISCORD_USER_ID;
}

/**
 * Ambil user ID dari interaction
 */
export function getUserId(interaction) {
  return interaction.member?.user?.id || interaction.user?.id;
}

/**
 * Ambil option value dari slash command
 */
export function getOption(interaction, name) {
  const options = interaction.data?.options || [];
  const opt = options.find((o) => o.name === name);
  return opt ? opt.value : null;
}
