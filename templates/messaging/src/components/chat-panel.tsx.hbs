import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageList } from '@/components/message-list';
import { useMessages } from '@/hooks/use-messages';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const { messages, sending, send } = useMessages();

  const handleSend = async () => {
    if (!input.trim()) return;
    await send(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4"><MessageList messages={messages} /></div>
      <div className="border-t border-[hsl(var(--border))] p-4">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." disabled={sending} />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}
