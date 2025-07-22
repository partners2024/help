import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router";
import { nanoid } from "nanoid";

interface ChatMessage {
  id: string;
  content: string;
  user: string;
  role: string;
  timestamp: number;
  readBy?: string[];
}

interface Message {
  type: "add" | "update" | "all" | "notification" | "read" | "read-update";
  id?: string;
  content?: string;
  user?: string;
  role?: string;
  messages?: ChatMessage[];
  messageId?: string;
}

const names = ["ผู้ใช้ 1", "ผู้ใช้ 2", "ผู้ใช้ 3", "ผู้ใช้ 4", "ผู้ใช้ 5"];

function MessageBubble({ 
  message, 
  isCurrentUser 
}: { 
  message: ChatMessage; 
  isCurrentUser: boolean; 
}) {
  return (
    <div className={`message ${isCurrentUser ? 'sent' : 'received'}`}>
      <div className="message-bubble">
        {!isCurrentUser && <div className="message-user">{message.user}</div>}
        <div className="message-text">{message.content}</div>
        <div className="message-info">
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
          {isCurrentUser && (
            <span>
              {message.readBy?.length > 0 ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [name] = useState(names[Math.floor(Math.random() * names.length)]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const { room } = useParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;
      
      if (message.type === "add") {
        const foundIndex = messages.findIndex((m) => m.id === message.id);
        const newMessage = {
          id: message.id!,
          content: message.content!,
          user: message.user!,
          role: message.role!,
          timestamp: Date.now()
        };

        if (foundIndex === -1) {
          setMessages((prev) => [...prev, newMessage]);
        } else {
          setMessages((prev) => {
            return prev
              .slice(0, foundIndex)
              .concat(newMessage)
              .concat(prev.slice(foundIndex + 1));
          });
        }
      } 
      else if (message.type === "update") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? {
                  ...m,
                  content: message.content!,
                  user: message.user!,
                  role: message.role!,
                }
              : m
          )
        );
      }
      else if (message.type === "all") {
        setMessages(message.messages || []);
      }
      else if (message.type === "notification") {
        // แสดงการแจ้งเตือนชั่วคราว
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message.content;
        document.getElementById('root')?.prepend(notification);
        setTimeout(() => notification.remove(), 3000);
      }
      else if (message.type === "read-update") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.messageId
              ? { ...m, readBy: message.readBy }
              : m
          )
        );
      }
    },
  });

  // อัปเดตจำนวนผู้ใช้ออนไลน์
  useEffect(() => {
    const interval = setInterval(() => {
      setOnlineCount(Math.floor(Math.random() * 5) + 1); // จำลองการอัปเดต
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // เลื่อนไปที่ข้อความล่าสุดเมื่อมีข้อความใหม่
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!inputRef.current?.value.trim()) return;

    const chatMessage: ChatMessage = {
      id: nanoid(8),
      content: inputRef.current.value,
      user: name,
      role: "user",
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, chatMessage]);
    socket.send(JSON.stringify({
      type: "add",
      ...chatMessage
    }));

    // ส่งการอ่านข้อความ
    messages.forEach(msg => {
      if (!msg.readBy?.includes(name)) {
        socket.send(JSON.stringify({
          type: "read",
          messageId: msg.id,
          user: name
        }));
      }
    });

    inputRef.current.value = "";
    inputRef.current.focus();
  };

  return (
    <>
      <div className="chat-messages">
        {messages.map((message) => (
          <MessageBubble 
            key={message.id} 
            message={message}
            isCurrentUser={message.user === name}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="message-input-container">
        <button className="emoji-button">😊</button>
        <input
          ref={inputRef}
          type="text"
          className="message-input"
          placeholder={`สวัสดี ${name}! พิมพ์ข้อความ...`}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              sendMessage();
            }
          }}
        />
        <button className="send-button" onClick={sendMessage}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="white" strokeWidth="2"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2"/>
          </svg>
        </button>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
      <Route path="/:room" element={<App />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>
);
