/**
 * Configuration manager for the application
 */

interface AppConfig {
  app: {
    name: string;
    debug: boolean;
  };
  features: {
    band_member_filtering: boolean;
  };
  auth: {
    session_duration_hours: number;
  };
  reservation: {
    max_reservations_per_user: number;
    confirmation_delay_seconds: number;
  };
  schedule: {
    start_time: string; // "09:00"
    end_time: string;   // "18:00"
    slot_duration_minutes: number; // 60
  };
  rooms: {
    count: number;
    names: string[];
    types: string[]; // "event" | "studio"
  };
  restrictions: {
    consecutive_slots_limit: number; // 連続予約可能コマ数
    daily_personal_limit: number; // 一日の個人練習上限
    daily_band_limit: number; // 一日のバンド練習上限
    room_type_permissions: { [roomType: string]: string[] }; // 部屋タイプ別許可バンド
    band_restrictions: { [bandName: string]: string[] }; // バンド別許可部屋タイプ
    time_restrictions: string[]; // 予約不可時間帯
    room_restrictions: string[]; // 予約不可部屋
  };
}

let config: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (config) {
    return config;
  }

  // デフォルト設定を使用
  config = {
    app: {
      name: "合宿予約システム",
      debug: false
    },
    features: {
      band_member_filtering: true
    },
    auth: {
      session_duration_hours: 24
    },
    reservation: {
      max_reservations_per_user: 10,
      confirmation_delay_seconds: 3
    },
    schedule: {
      start_time: "00:00",
      end_time: "24:00", 
      slot_duration_minutes: 60
    },
    rooms: {
      count: 6, // スタジオA-E + イベント
      names: ["イベント", "スタジオA", "スタジオB", "スタジオC", "スタジオD", "スタジオE"],
      types: ["event", "studio", "studio", "studio", "studio", "studio"] // 部屋タイプ
    },
    restrictions: {
      consecutive_slots_limit: 3, // 連続3コマまで
      daily_personal_limit: 3, // 一日の個人練習3コマまで
      daily_band_limit: 3, // 一日のバンド練習3コマまで
      room_type_permissions: {
        event: ["合宿係"] // イベント列は合宿係のみ
      },
      band_restrictions: {
        "合宿係": ["event"] // 合宿係はイベント列のみ
      },
      time_restrictions: [], // 予約不可時間帯（例: ["22:00-06:00"]）
      room_restrictions: [] // 予約不可部屋（例: ["スタジオA"]）
    }
  };
  
  return config;
}

// 設定値を取得するヘルパー関数
export async function isFeatureEnabled(feature: keyof AppConfig['features']): Promise<boolean> {
  const config = await getConfig();
  return config.features[feature];
}

export async function getAppConfig(): Promise<AppConfig['app']> {
  const config = await getConfig();
  return config.app;
}

export async function getAuthConfig(): Promise<AppConfig['auth']> {
  const config = await getConfig();
  return config.auth;
}

export async function getReservationConfig(): Promise<AppConfig['reservation']> {
  const config = await getConfig();
  return config.reservation;
}

export async function getScheduleConfig(): Promise<AppConfig['schedule']> {
  const config = await getConfig();
  return config.schedule;
}

export async function getRoomsConfig(): Promise<AppConfig['rooms']> {
  const config = await getConfig();
  return config.rooms;
}

export async function getRestrictionsConfig(): Promise<AppConfig['restrictions']> {
  const config = await getConfig();
  return config.restrictions;
}