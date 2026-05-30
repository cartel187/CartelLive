export interface GuardConfig {
  telegramUrl: string;
  secureToken: string;
  enableTokenProtection: boolean;
  enableUserAgentCheck: boolean;
  lastFetchedTime: string | null;
  jioSourceUrl: string;
  jioM3uUrl?: string;
  preferredSource?: string;
}

export interface ChannelItem {
  contentId: string;
  name: string;
  mpd: string;
  logo: string;
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
