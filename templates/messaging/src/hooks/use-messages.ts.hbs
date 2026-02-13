import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Message { id: string; content: string; user_id: string; channel_id: string; created_at: string; }

export function useMessages(channelId = 'default') {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.from('messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true })
      .then(({ data }) => setMessages(data ?? []));

    const channel = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [channelId]);

  const send = useCallback(async (content: string) => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('messages').insert({ content, channel_id: channelId, user_id: user.id });
      if (error) throw error;
    } finally {
      setSending(false);
    }
  }, [channelId]);

  return { messages, sending, send };
}
