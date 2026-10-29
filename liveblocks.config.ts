import type { LiveblocksFlow } from "@liveblocks/react-flow";
import type { CanvasEdge, CanvasNode } from "./types/canvas";

// Define Liveblocks types for your application
// https://liveblocks.io/docs/api-reference/liveblocks-react#Typing-your-data
declare global {
  interface Liveblocks {
    // Each user's Presence, for useMyPresence, useOthers, etc.
    Presence: {
      // Real-time cursor position on the canvas; null when the pointer is
      // not on the canvas.
      cursor: { x: number; y: number } | null;
      // Whether the participant's client is waiting on an AI response.
      isThinking: boolean;
    };

    // The flow root is initialized by useLiveblocksFlow after Storage loads.
    Storage: {
      flow?: LiveblocksFlow<CanvasNode, CanvasEdge>;
    };

    // Custom user info set when authenticating with a secret key
    UserMeta: {
      id: string;
      info: {
        name: string;
        avatar: string;
        color: string;
      };
    };

    // The server uses this targeted event to remove revoked members' active connections.
    RoomEvent: {
      type: "access-revoked";
      userId: string;
    };

    // Custom metadata set on threads, for useThreads, useCreateThread, etc.
    ThreadMetadata: Record<string, never>;

    // Custom room info set with resolveRoomsInfo, for useRoomInfo
    RoomInfo: Record<string, never>;
  }
}

export {};
