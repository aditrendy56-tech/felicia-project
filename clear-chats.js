import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAllChats() {
  try {
    console.log('Deleting all chat messages...');
    const { error: msgError } = await supabase
      .from('felicia_chat_messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (msgError) throw msgError;

    console.log('Deleting all chat threads...');
    const { error: threadError } = await supabase
      .from('felicia_chat_threads')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (threadError) throw threadError;

    console.log('✅ All chats cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing chats:', error);
  }
}

clearAllChats();