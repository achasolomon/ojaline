import { useParams, useNavigate } from 'react-router-dom';
import { ChatThread } from '../components/ChatThread';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-white">
      {id ? <ChatThread conversationId={id} onBack={() => navigate(-1)} /> : null}
    </div>
  );
}