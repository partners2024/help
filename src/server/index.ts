import { Server, type Connection, type WSMessage, routePartykitRequest } from "partyserver";

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
  readBy?: string[];
}

export class Chat extends Server {
  static options = { hibernate: true };

  messages: ChatMessage[] = [];
  onlineUsers: Set<string> = new Set();

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, 
        user TEXT, 
        role TEXT, 
        content TEXT,
        timestamp INTEGER,
        readBy TEXT
      )`
    );

    const loadedMessages = this.ctx.storage.sql
      .exec(`SELECT * FROM messages ORDER BY timestamp ASC`)
      .toArray() as ChatMessage[];

    this.messages = loadedMessages.map(msg => ({
      ...msg,
      readBy: msg.readBy ? JSON.parse(msg.readBy) : []
    }));
  }

  onConnect(connection: Connection) {
    this.onlineUsers.add(connection.id);
    this.updateOnlineCount();

    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages
      } as Message)
    );

    // แจ้งเตือนผู้ใช้ใหม่
    this.broadcastMessage({
      type: "notification",
      content: `มีผู้ใช้ใหม่เข้าร่วมแชท (${this.onlineUsers.size} คนออนไลน์)`
    }, [connection.id]);
  }

  onClose(connection: Connection) {
    this.onlineUsers.delete(connection.id);
    this.updateOnlineCount();

    // แจ้งเตือนผู้ใช้ออก
    this.broadcastMessage({
      type: "notification",
      content: `มีผู้ใช้ออกจากแชท (${this.onlineUsers.size} คนออนไลน์)`
    });
  }

  updateOnlineCount() {
    this.broadcastMessage({
      type: "notification",
      content: `จำนวนผู้ออนไลน์: ${this.onlineUsers.size}`
    });
  }

  saveMessage(message: ChatMessage) {
    const existing = this.messages.find(m => m.id === message.id);
    const readBy = message.readBy || [];

    if (existing) {
      this.messages = this.messages.map(m => 
        m.id === message.id ? { ...message, readBy } : m
      );
    } else {
      this.messages.push({ ...message, readBy });
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content, timestamp, readBy) 
       VALUES (?, ?, ?, ?, ?, ?) 
       ON CONFLICT (id) DO UPDATE SET 
         content = excluded.content,
         readBy = excluded.readBy`,
      [
        message.id,
        message.user,
        message.role,
        message.content,
        message.timestamp,
        JSON.stringify(readBy)
      ]
    );
  }

  onMessage(connection: Connection, message: WSMessage) {
    const parsed = JSON.parse(message as string) as Message;

    // แจ้งเตือนข้อความใหม่
    if (parsed.type === "add") {
      this.broadcastMessage({
        type: "notification",
        content: `มีข้อความใหม่จาก ${parsed.user}`
      }, [connection.id]);
    }

    // อัปเดตสถานะการอ่าน
    if (parsed.type === "read") {
      const messageToUpdate = this.messages.find(m => m.id === parsed.messageId);
      if (messageToUpdate && !messageToUpdate.readBy?.includes(parsed.user!)) {
        const updatedReadBy = [...(messageToUpdate.readBy || []), parsed.user!];
        this.messages = this.messages.map(m => 
          m.id === parsed.messageId ? { ...m, readBy: updatedReadBy } : m
        );

        this.broadcastMessage({
          type: "read-update",
          messageId: parsed.messageId,
          readBy: updatedReadBy
        });

        this.saveMessage({
          ...messageToUpdate,
          readBy: updatedReadBy
        });
      }
      return;
    }

    // บรอดคาสต์ข้อความ
    this.broadcast(message);

    // บันทึกข้อความ
    if (parsed.type === "add" || parsed.type === "update") {
      this.saveMessage({
        id: parsed.id!,
        content: parsed.content!,
        user: parsed.user!,
        role: parsed.role!,
        timestamp: Date.now()
      });
    }
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
};
