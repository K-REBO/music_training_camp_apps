/**
 * データ操作ライブラリ
 */
import { kv } from './kv-client.js';
import type { Member, Band, Room, TimeSlot, Reservation, UserSession, Feedback } from '../types.js';
import { getScheduleConfig, getRoomsConfig } from './config.js';

export class DataService {
  // Members
  async getMembers(): Promise<Member[]> {
    const entries = await kv.list(['members']);
    if (!entries || !Array.isArray(entries)) {
      console.warn('KV list returned invalid data:', entries);
      return [];
    }
    return entries.map(entry => entry.value).filter(Boolean);
  }

  async getMemberByNameAndGrade(name: string, grade: string): Promise<Member | null> {
    const members = await this.getMembers();
    return members.find(m => m.name === name && m.grade === grade) || null;
  }

  async createMember(member: Omit<Member, 'id' | 'createdAt'>): Promise<Member> {
    const id = crypto.randomUUID();
    const newMember: Member = {
      ...member,
      id,
      createdAt: new Date().toISOString()
    };

    await kv.set(['members', id], newMember);
    return newMember;
  }

  async getMember(id: string): Promise<Member | null> {
    const result = await kv.get(['members', id]);
    return result.value || null;
  }

  async updateMember(id: string, updates: Partial<Pick<Member, 'name' | 'grade' | 'lineUserId'>>): Promise<Member> {
    const current = await this.getMember(id);
    if (!current) throw new Error('メンバーが見つかりません');
    const updated: Member = { ...current, ...updates };
    const expectedVersion = current.version ?? 0;
    await kv.atomicUpdate(['members', id], expectedVersion, updated);
    return { ...updated, version: expectedVersion + 1 };
  }

  async deleteMember(id: string): Promise<void> {
    await kv.delete(['members', id]);
  }

  // Bands
  async getBands(): Promise<Band[]> {
    const entries = await kv.list(['bands']);
    if (!entries || !Array.isArray(entries)) {
      console.warn('KV list returned invalid data for bands:', entries);
      return [];
    }
    return entries.map(entry => entry.value).filter(Boolean);
  }

  async getBand(id: string): Promise<Band | null> {
    const result = await kv.get(['bands', id]);
    return result.value || null;
  }

  async getBandByName(name: string): Promise<Band | null> {
    const bands = await this.getBands();
    return bands.find(band => band.name === name) || null;
  }

  async createBand(band: Omit<Band, 'id' | 'createdAt'>): Promise<Band> {
    const id = crypto.randomUUID();
    const newBand: Band = { ...band, id, createdAt: new Date().toISOString() };
    await kv.set(['bands', id], newBand);
    return newBand;
  }

  async updateBand(id: string, updates: Partial<Pick<Band, 'name' | 'members' | 'memberIds'>>): Promise<Band> {
    const current = await this.getBand(id);
    if (!current) throw new Error('バンドが見つかりません');
    const updated: Band = { ...current, ...updates };
    const expectedVersion = current.version ?? 0;
    await kv.atomicUpdate(['bands', id], expectedVersion, updated);
    return { ...updated, version: expectedVersion + 1 };
  }

  async deleteBand(id: string): Promise<void> {
    await kv.delete(['bands', id]);
  }

  // 管理者チェック: 椎木知仁 または 合宿係バンドのメンバー
  async isAdmin(userId: string, userName: string): Promise<boolean> {
    if (userName === '椎木知仁') return true;
    const bands = await this.getBands();
    const gasshukkakari = bands.find(b => b.name === '合宿係');
    if (!gasshukkakari) return false;
    return gasshukkakari.memberIds.includes(userId);
  }

  // Rooms
  // KVから取得。{ names, types } のみ保存し、count は names.length から導出する
  private async loadRoomsConfig(): Promise<{ names: string[]; types: string[]; version: number }> {
    const result = await kv.get(['config', 'rooms']);
    if (result.value) {
      const { names, types, version } = result.value;
      return { names: names ?? [], types: types ?? [], version: version ?? 0 };
    }
    const defaults = await getRoomsConfig();
    return { names: defaults.names, types: defaults.types, version: 0 };
  }

  private async saveRoomsConfig(config: { names: string[]; types: string[] }, expectedVersion: number): Promise<void> {
    await kv.atomicUpdate(['config', 'rooms'], expectedVersion, config);
  }

  private buildRooms(config: { names: string[]; types: string[] }): Room[] {
    return config.names.map((name, i) => {
      const roomType = (config.types[i] ?? 'studio') as 'event' | 'studio';
      return {
        id: `room-${i + 1}`,
        name: name || `部屋${i + 1}`,
        description: roomType === 'event' ? 'イベント会場' : '練習室',
        color: roomType === 'event' ? '#8b5cf6' : '#3b82f6',
        type: roomType
      };
    });
  }

  async getRooms(): Promise<Room[]> {
    return this.buildRooms(await this.loadRoomsConfig());
  }

  async addStudioRoom(name: string): Promise<Room[]> {
    const config = await this.loadRoomsConfig();
    const { version, ...configData } = config;
    configData.names.push(name);
    configData.types.push('studio');
    await this.saveRoomsConfig(configData, version);
    return this.buildRooms(configData);
  }

  async updateRoomName(roomId: string, name: string): Promise<Room[]> {
    const config = await this.loadRoomsConfig();
    const { version, ...configData } = config;
    const index = parseInt(roomId.replace('room-', ''), 10) - 1;
    if (isNaN(index) || index < 0 || index >= configData.names.length) {
      throw new Error('部屋が見つかりません');
    }
    if (configData.types[index] === 'event') {
      throw new Error('イベント列の名前は変更できません');
    }
    configData.names[index] = name;
    await this.saveRoomsConfig(configData, version);
    return this.buildRooms(configData);
  }

  async deleteLastStudioRoom(): Promise<Room[]> {
    const config = await this.loadRoomsConfig();
    const { version, ...configData } = config;
    if (configData.names.length === 0) {
      throw new Error('削除できる部屋がありません');
    }
    const lastIndex = configData.names.length - 1;
    if (configData.types[lastIndex] === 'event') {
      throw new Error('イベント列は削除できません');
    }
    const lastRoomId = `room-${configData.names.length}`;
    const reservations = await kv.list(['reservations']);
    const hasReservations = reservations.some(
      entry => entry.key[2] === lastRoomId && entry.value?.status === 'active'
    );
    if (hasReservations) {
      throw new Error('この部屋には有効な予約があるため削除できません');
    }
    configData.names.pop();
    configData.types.pop();
    await this.saveRoomsConfig(configData, version);
    return this.buildRooms(configData);
  }

  // TimeSlots
  async getTimeSlots(): Promise<TimeSlot[]> {
    // 設定からタイムスロットを動的に生成
    const scheduleConfig = await getScheduleConfig();
    
    const timeSlots: TimeSlot[] = [];
    const startHour = parseInt(scheduleConfig.start_time.split(':')[0]);
    const startMinute = parseInt(scheduleConfig.start_time.split(':')[1]);
    const endHour = parseInt(scheduleConfig.end_time.split(':')[0]);
    const endMinute = parseInt(scheduleConfig.end_time.split(':')[1]);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const slotDurationMinutes = scheduleConfig.slot_duration_minutes;
    
    let slotIndex = 1;
    for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += slotDurationMinutes) {
      const startHour = Math.floor(minutes / 60);
      const startMinute = minutes % 60;
      const endMinutes = minutes + slotDurationMinutes;
      const endHour = Math.floor(endMinutes / 60);
      const endMinute = endMinutes % 60;
      
      const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
      const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      
      timeSlots.push({
        id: `timeslot-${slotIndex}`,
        startTime: startTimeStr,
        endTime: endTimeStr,
        duration: slotDurationMinutes,
        displayName: `${slotIndex}限 (${startTimeStr}-${endTimeStr})`
      });
      
      slotIndex++;
    }
    
    return timeSlots;
  }

  // Reservations
  async getReservations(date: string): Promise<Reservation[]> {
    const entries = await kv.list(['reservations', date]);
    if (!entries || !Array.isArray(entries)) {
      console.warn('KV list returned invalid data for reservations:', entries);
      return [];
    }
    return entries.map(entry => entry.value).filter(r => r && r.status === 'active');
  }

  async getReservation(date: string, roomId: string, timeSlotId: string): Promise<Reservation | null> {
    const result = await kv.get(['reservations', date, roomId, timeSlotId]);
    return result.value || null;
  }

  async createReservation(reservation: Omit<Reservation, 'id' | 'reservedAt' | 'version'>): Promise<Reservation> {
    const id = crypto.randomUUID();
    const newReservation: Reservation = {
      ...reservation,
      id,
      reservedAt: new Date().toISOString(),
      version: 1
    };

    const key = ['reservations', reservation.date, reservation.roomId, reservation.timeSlotId];
    
    try {
      await kv.atomicUpdate(key, 0, newReservation);
      return newReservation;
    } catch (error) {
      // If the error message already contains a user-friendly Japanese message, use it
      if (error.message.includes('この時間枠は既に予約されています')) {
        throw error;
      }
      // Otherwise, check for generic CONFLICT and convert it
      if (error.message === 'CONFLICT') {
        throw new Error('この時間枠は既に予約されています');
      }
      throw error;
    }
  }

  async cancelReservation(date: string, roomId: string, timeSlotId: string, expectedVersion: number): Promise<void> {
    const key = ['reservations', date, roomId, timeSlotId];
    const current = await kv.get(key);
    
    if (!current.value) {
      throw new Error('予約が見つかりません');
    }

    const updatedReservation = {
      ...current.value,
      status: 'cancelled' as const
    };

    await kv.atomicUpdate(key, expectedVersion, updatedReservation);
  }

  // Sessions
  async createSession(userId: string, userName: string, grade: string): Promise<UserSession> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24時間有効

    const session: UserSession = {
      id: sessionId,
      userId,
      userName,
      grade,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    await kv.set(['sessions', sessionId], session);
    return session;
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    const result = await kv.get(['sessions', sessionId]);
    const session = result.value;
    
    if (!session || new Date(session.expiresAt) < new Date()) {
      return null;
    }
    
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await kv.delete(['sessions', sessionId]);
  }

  // Grid helpers
  async getGridData(date: string): Promise<{
    rooms: Room[];
    timeSlots: TimeSlot[];
    reservations: Reservation[];
  }> {
    const [rooms, timeSlots, reservations] = await Promise.all([
      this.getRooms(),
      this.getTimeSlots(),
      this.getReservations(date)
    ]);

    return { rooms, timeSlots, reservations };
  }

  // Feedback
  async getFeedback(): Promise<Feedback[]> {
    const entries = await kv.list(['feedback']);
    if (!entries || !Array.isArray(entries)) {
      console.warn('KV list returned invalid data for feedback:', entries);
      return [];
    }
    return entries.map(entry => entry.value).filter(Boolean).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createFeedback(feedback: Omit<Feedback, 'id' | 'createdAt' | 'status'>): Promise<Feedback> {
    const id = crypto.randomUUID();
    const newFeedback: Feedback = {
      ...feedback,
      id,
      status: 'open',
      createdAt: new Date().toISOString()
    };
    
    await kv.set(['feedback', id], newFeedback);
    return newFeedback;
  }

  async updateFeedbackStatus(id: string, status: Feedback['status']): Promise<void> {
    const current = await kv.get(['feedback', id]);
    if (!current.value) {
      throw new Error('フィードバックが見つかりません');
    }

    const updatedFeedback: Feedback = {
      ...current.value,
      status,
      updatedAt: new Date().toISOString()
    };

    const expectedVersion = current.value.version ?? 0;
    await kv.atomicUpdate(['feedback', id], expectedVersion, updatedFeedback);
  }

  // 管理機能: 全予約データを削除
  async clearAllReservations(): Promise<void> {
    const entries = await kv.list(['reservations']);
    for (const entry of entries) {
      await kv.delete(entry.key);
    }
  }
}

export const dataService = new DataService();