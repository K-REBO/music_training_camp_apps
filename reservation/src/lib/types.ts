/**
 * Type definitions for the reservation system
 */

export interface Member {
  id: string;
  name: string;
  grade: string; // "中大1年", "中大2年", "中大3年", "実践1年", "実践2年", "実践3年", "その他"
  lineUserId?: string; // LINE User ID（"U"で始まる文字列）
  createdAt: string;
  version?: number; // atomicUpdate用
}

export interface Band {
  id: string;
  name: string;
  members: {
    [instrument: string]: string; // instrument -> member name
  };
  memberIds: string[];
  createdAt: string;
  version?: number; // atomicUpdate用
}

export interface Room {
  id: string;
  name: string;
  description: string;
  color: string;
  type: "event" | "studio";
}

export interface TimeSlot {
  id: string;
  startTime: string; // "09:00"
  endTime: string;   // "10:00"
  duration: number;  // 60 (minutes)
  displayName: string; // "1限 (09:00-10:00)"
}

export interface Reservation {
  id: string;
  userId: string;
  userName: string;
  bandId: string;
  bandName: string;
  roomId: string;
  roomName: string;
  timeSlotId: string;
  date: string; // "2024-01-15"
  reservedAt: string;
  version: number;
  status: "active" | "cancelled";
  isPersonal?: boolean;
  eventName?: string; // イベント列用のイベント名
  description?: string; // イベント通知メッセージ（任意）
}

export interface UserSession {
  id: string;
  userId: string;
  userName: string;
  grade: string;
  createdAt: string;
  expiresAt: string;
}

export interface ReservationConflict {
  conflictType: "version_mismatch" | "slot_taken" | "user_limit_exceeded";
  message: string;
  currentData?: any;
}

export interface GridCell {
  timeSlotId: string;
  roomId: string;
  date: string;
  reservation?: Reservation;
  status: "available" | "reserved" | "selecting" | "my_selecting" | "conflicted";
  selectingUser?: string;
}

export interface RealtimeEvent {
  type: "reservation_created" | "reservation_cancelled" | "user_selecting" | "user_deselected" | "grid_updated";
  data: any;
  timestamp: string;
  userId?: string;
}

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  type: "bug" | "improvement" | "feature" | "other";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  updatedAt?: string;
  version?: number; // atomicUpdate用
}