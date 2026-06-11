export interface GuardConfig {
  telegramUrl: string;
  secureToken: string;
  enableTokenProtection: boolean;
  enableUserAgentCheck: boolean;
  lastFetchedTime: string | null;
  jioSourceUrl: string;
  jioM3uUrl?: string;
  preferredSource?: string;
  enableIpPinning?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export interface UserToken {
  telegramUsername: string;
  token: string;
  createdAt: string;
  activeIps: string[];
  maxDevices: number;
  lastAccessedAt?: string;
  lastUserAgent?: string;
  lastLocation?: string;
}

export interface ChannelItem {
  contentId: string;
  name: string;
  mpd: string;
  logo: string;
  groupTitle?: string;
}

export interface CustomPlaylist {
  id: string;
  name: string;
  url: string;
  logo?: string;
  enabled?: boolean;
}

export interface StalkerPlaylist {
  id: string;
  name: string;
  url: string;
  logo?: string;
  enabled?: boolean;
}

export interface ServerStats {
  success: boolean;
  channelsCount: number;
  channels: ChannelItem[];
  updatedAt: string;
  timeLeft: string;
}

export interface SimulationResult {
  userAgent: string;
  providedToken: string;
  status: number;
  action: "REDIRECTED" | "SERVED_M3U" | "FORBIDDEN";
  targetUrl: string;
  details: string;
  rawResponseHeader?: string;
  playlistSnippet?: string;
}
