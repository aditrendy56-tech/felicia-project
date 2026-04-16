import { importMemoryItems } from './src/services/api.js';

const SEED_MEMORIES = [
  {
    category: 'identity',
    topicKey: 'name_user',
    content: 'Nama saya adalah User, seorang developer dan entrepreneur yang fokus pada teknologi AI dan personal productivity',
    memoryType: 'fact',
  },
  {
    category: 'skill',
    topicKey: 'skill_fullstack',
    content: 'Mahir dalam full-stack development dengan React, Node.js, dan Python. Sering menggunakan Vite untuk build tools',
    memoryType: 'fact',
  },
  {
    category: 'skill',
    topicKey: 'skill_ai',
    content: 'Berpengalaman dengan AI integration, termasuk Gemini API dan machine learning untuk personal assistants',
    memoryType: 'fact',
  },
  {
    category: 'goal',
    topicKey: 'goal_felicia',
    content: 'Sedang mengembangkan Felicia sebagai personal AI assistant yang comprehensive dengan memory, calendar, dan mode management',
    memoryType: 'fact',
  },
  {
    category: 'preference',
    topicKey: 'work_style',
    content: 'Lebih suka bekerja secara efisien dengan tools otomatisasi, menghindari repetitive tasks, dan fokus pada high-impact activities',
    memoryType: 'preference',
  },
  {
    category: 'personal',
    topicKey: 'hobby_tech',
    content: 'Hobby utama adalah explore teknologi baru, coding projects, dan membaca tentang AI dan productivity',
    memoryType: 'fact',
  },
  {
    category: 'event',
    topicKey: 'milestone_project',
    content: 'Baru saja menyelesaikan integrasi memory panel dan calendar actions di Felicia project',
    eventDate: '2024-12-01',
    memoryType: 'event',
  },
  {
    category: 'goal',
    topicKey: 'productivity_focus',
    content: 'Target untuk meningkatkan productivity dengan mode management (drop, chaos, overwork) dan time blocking',
    memoryType: 'goal',
  },
  {
    category: 'preference',
    topicKey: 'communication_style',
    content: 'Komunikasi langsung dan actionable, suka feedback real-time dan error handling yang jelas',
    memoryType: 'preference',
  },
  {
    category: 'skill',
    topicKey: 'skill_deployment',
    content: 'Berpengalaman dengan deployment ke Vercel, git workflows, dan CI/CD untuk web applications',
    memoryType: 'fact',
  },
];

async function seedMemories() {
  try {
    console.log('Seeding strategic memories...');
    const result = await importMemoryItems(SEED_MEMORIES, null);
    console.log('✅ Seed complete:', result);
  } catch (error) {
    console.error('❌ Seed failed:', error);
  }
}

seedMemories();