// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Register Discord Slash Commands
// Jalankan sekali: node scripts/register-commands.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !BOT_TOKEN) {
  console.error('❌ DISCORD_APPLICATION_ID dan DISCORD_BOT_TOKEN harus diset di .env.local');
  process.exit(1);
}

/**
 * Daftar slash commands Felicia
 */
const commands = [
  {
    name: 'jadwal',
    description: 'Tampilkan jadwal hari ini dari Google Calendar',
    type: 1,
  },
  {
    name: 'mode',
    description: 'Aktifkan mode kondisi (drop/chaos/overwork)',
    type: 1,
    options: [
      {
        name: 'nama',
        description: 'Nama mode: drop, chaos, atau overwork',
        type: 3, // STRING
        required: false,
        choices: [
          { name: '😮‍💨 DROP — cape/lemes/bangun siang', value: 'drop' },
          { name: '🌀 CHAOS — konflik/stres/overload', value: 'chaos' },
          { name: '🛑 OVERWORK — sakit/kecapean parah', value: 'overwork' },
        ],
      },
    ],
  },
  {
    name: 'reschedule',
    description: 'Pindahkan goal yang terlewat ke waktu lain',
    type: 1,
  },
  {
    name: 'status',
    description: 'Tampilkan mode aktif dan ringkasan hari ini',
    type: 1,
  },
  {
    name: 'review',
    description: 'Weekly review: goal tercapai vs terlewat',
    type: 1,
  },
  {
    name: 'tanya',
    description: 'Tanya bebas ke Felicia (Gemini AI dengan konteks Adit)',
    type: 1,
    options: [
      {
        name: 'pesan',
        description: 'Pertanyaan atau pesan untuk Felicia',
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

/**
 * Register commands ke Discord
 */
async function registerCommands() {
  // Prefer guild-specific (langsung aktif, tanpa delay 1 jam)
  const url = GUILD_ID
    ? `${DISCORD_API_BASE}/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
    : `${DISCORD_API_BASE}/applications/${APP_ID}/commands`;

  const scope = GUILD_ID ? `guild ${GUILD_ID}` : 'global';

  console.log(`\n🚀 Registering ${commands.length} slash commands (${scope})...\n`);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ Failed to register commands: ${res.status}`);
    console.error(errorText);
    process.exit(1);
  }

  const result = await res.json();

  console.log(`✅ Berhasil register ${result.length} commands:\n`);
  result.forEach((cmd) => {
    const optionsList = cmd.options?.map((o) => o.name).join(', ') || '-';
    console.log(`   /${cmd.name} — ${cmd.description}`);
    console.log(`     Options: ${optionsList}`);
    console.log(`     ID: ${cmd.id}\n`);
  });

  console.log('🎉 Done! Slash commands sudah aktif di Discord.\n');
}

registerCommands().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
