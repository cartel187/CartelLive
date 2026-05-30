import express from "express";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// Mock memory storage for tokens (will fall back to environment variables or defaults)
const config = {
  telegramUrl: process.env.MY_TELEGRAM_LINK || "https://t.me/cartel187",
  secureToken: process.env.SECURE_TOKEN || "cartel-vip",
  jioJsonUrl: "https://jiotvplus.dr-strange.workers.dev/watch/fetch.json",
  jioM3uUrl: "https://jiotvplus.dr-strange.workers.dev/api/jiotvplus.m3u",
  preferredSource: "m3u",
  enableTokenProtection: true,
  enableUserAgentCheck: true,
};

// Helper to determine if a request comes from a browser
function isBrowser(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  
  // List of browser engine and typical browser keywords
  const browserKeywords = ["mozilla", "chrome", "safari", "edge", "firefox", "opera", "macintosh", "windows nt"];
  
  // List of player keywords that shouldn't be categorized as browsers even if they have browser strings
  const playerKeywords = [
    "tivimate", "ott", "navigator", "kodi", "vlc", "perfectplayer", 
    "iptv", "exoplayer", "gstreamer", "potplayer", "mxplayer", "okhttp"
  ];
  
  const hasBrowserKeyword = browserKeywords.some(kw => ua.includes(kw));
  const hasPlayerKeyword = playerKeywords.some(kw => ua.includes(kw));
  
  return hasBrowserKeyword && !hasPlayerKeyword;
}

// Redirect middleware / validation logic
function handleSecurityGate(req: express.Request, res: express.Response, next: express.NextFunction): any {
  const userAgent = req.headers["user-agent"];
  const token = req.query.token as string || req.query.key as string;
  
  // 1. User-Agent Gate
  if (config.enableUserAgentCheck && isBrowser(userAgent)) {
    console.log(`[Gate] Blocked browser user. UA: ${userAgent}. Redirecting to Telegram.`);
    return res.redirect(302, config.telegramUrl);
  }
  
  // 2. Token Gate
  if (config.enableTokenProtection && config.secureToken) {
    if (token !== config.secureToken) {
      console.log(`[Gate] Blocked request due to invalid token: "${token}". Redirecting to Telegram.`);
      return res.redirect(302, config.telegramUrl);
    }
  }
  
  next();
}

// Stats and Cache
let cacheData: any = null;
let lastFetched: number = 0;
const CACHE_STRL_MS = 60 * 1000 * 5; // 5 minutes cache

// Helper to determine group name with the "JioS2 " prefix dynamically
function getChannelCategory(name: string): string {
  const nom = name.toLowerCase();
  let baseGroup = "Entertainment";
  if (nom.includes("sports") || nom.includes("khel")) {
    baseGroup = "Sports";
  } else if (nom.includes("gold") || nom.includes("movies") || nom.includes("cinema") || nom.includes("picture")) {
    baseGroup = "Movies";
  } else if (nom.includes("disney") || nom.includes("junior") || nom.includes("hungama")) {
    baseGroup = "Kids";
  } else if (nom.includes("news") || nom.includes("samachar")) {
    baseGroup = "News";
  }
  return `JioS2 ${baseGroup}`;
}

// Ensure all categories are formatted correctly. JioS2 prefix is only for original JioTV channels
function cleanGroupTitle(group: string, isOriginalJio: boolean): string {
  let g = group.trim();
  const lower = g.toLowerCase();
  
  if (lower.includes("fancode")) return "𝗙𝗔𝗡𝗖𝗢𝗗𝗘";
  if (lower.includes("icc") || lower.includes("𝗶🇨🇴") || lower.includes("𝗶𝗰🇨🇵") || lower.includes("𝗶𝗰𝗰")) return "𝗜🇨🇴 𝗧𝗩";
  if (lower.includes("sony") || lower.includes("snyliv")) return "SonyLIV";
  if (lower.includes("crichd")) return "CricHD";
  if (lower.includes("fifa")) return "FIFA Plus";
  if (lower.includes("star sports")) return "Star Sports";
  if (lower.includes("support") || lower.includes("𝘀𝘂𝗽𝗽𝗼𝗿𝘁")) return "𝗦𝗨𝗣𝗣𝗢𝗥𝗧";
  
  g = g.replace(/^JioS2\s+/i, "");
  
  if (lower.includes("entertainment")) g = "Entertainment";
  else if (lower.includes("movies")) g = "Movies";
  else if (lower.includes("kids")) g = "Kids";
  else if (lower.includes("news")) g = "News";
  else if (lower.includes("sports")) g = "Sports";

  if (isOriginalJio) {
    return `JioS2 ${g}`;
  }
  return g;
}

// Resolve category logos dynamically matching user specifications
function getGroupLogo(groupName: string): string {
  const g = groupName.toLowerCase();
  if (g.includes("fancode")) return "https://ik.imagekit.io/yjtx9nh9y/vecteezy_fancode-app-icon-on-transparent-background_69146538.png";
  if (g.includes("icc") || g.includes("𝗶🇨🇴") || g.includes("𝗶𝗰🇨🇵") || g.includes("𝗶𝗰𝗰")) return "https://ik.imagekit.io/yjtx9nh9y/62823e9932b32411608aa856.png";
  if (g.includes("sony")) return "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png";
  if (g.includes("crichd")) return "https://ik.imagekit.io/yjtx9nh9y/images%20(2).jpeg";
  if (g.includes("fifa")) return "https://ik.imagekit.io/yjtx9nh9y/images.png";
  if (g.includes("star sports")) return "https://ik.imagekit.io/yjtx9nh9y/947787.jpg";
  if (g.includes("support") || g.includes("𝘀𝘂𝗽𝗽𝗼𝗿𝘁")) return "https://ik.imagekit.io/yjtx9nh9y/sllmnhx-telegram-6896827.svg?updatedAt=1777824421413";
  return "https://ik.imagekit.io/yjtx9nh9y/images%20(1).png?updatedAt=1780150309275";
}

// Protect stream playback and redirect traffic via Vercel-like routing matching request origin
function wrapStreamUrl(urlStr: string, host: string): string {
  if (!urlStr || !urlStr.startsWith("http")) return urlStr;
  
  const lowerUrl = urlStr.toLowerCase();
  if (
    lowerUrl.includes(".mpd") ||
    lowerUrl.includes("sony") ||
    lowerUrl.includes("snyliv") ||
    lowerUrl.includes("xofix.vercel.app") ||
    lowerUrl.includes("xoended.vercel.app") ||
    lowerUrl.includes("xociety-intro.vercel.app") ||
    lowerUrl.includes("xobypass=true") ||
    urlStr.includes(host)
  ) {
    return urlStr;
  }
  
  let baseUrl = urlStr;
  let modifiers = "";
  if (urlStr.includes("|")) {
    const parts = urlStr.split("|");
    baseUrl = parts[0];
    modifiers = "|" + parts.slice(1).join("|");
  }
  
  return `${host}/play?url=${encodeURIComponent(baseUrl)}${modifiers}`;
}

// Resilient helper to parse raw M3U streams from third party event logs
function parseM3uText(m3uText: string, defaultGroup: string, defaultGroupLogo: string, isStarSportsFilter = false): any[] {
  const lines = m3uText.split(/\r?\n/);
  const channels: any[] = [];
  let currentChannel: any = null;
  
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    
    if (line.startsWith("#EXTINF:")) {
      if (currentChannel) {
        if (!isStarSportsFilter || currentChannel.name.toLowerCase().includes("star sports")) {
          channels.push(currentChannel);
        }
      }
      currentChannel = {
        contentId: "",
        name: "",
        mpd: "",
        cookie: "",
        kodiprops: [],
        logoUrl: "",
        groupTitle: defaultGroup,
        extraOpts: []
      };
      
      const idMatch = line.match(/tvg-id="([^"]+)"/);
      if (idMatch) currentChannel.contentId = idMatch[1];
      
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) currentChannel.logoUrl = logoMatch[1];
      
      const nameMatch = line.match(/tvg-name="([^"]+)"/);
      if (nameMatch) {
        currentChannel.name = nameMatch[1];
      } else {
        const commaIndex = line.lastIndexOf(",");
        if (commaIndex !== -1) {
          currentChannel.name = line.substring(commaIndex + 1).trim();
        }
      }
    } else if (line.startsWith("#KODIPROP:")) {
      if (currentChannel) {
        currentChannel.kodiprops.push(line);
      }
    } else if (line.startsWith("#EXTVLCOPT:")) {
      if (currentChannel) {
        if (line.startsWith("#EXTVLCOPT:http-user-agent=")) {
          currentChannel.userAgent = line.replace("#EXTVLCOPT:http-user-agent=", "").trim();
        } else if (line.startsWith("#EXTVLCOPT:http-cookie=")) {
          currentChannel.cookie = line.replace("#EXTVLCOPT:http-cookie=", "").trim();
        } else {
          currentChannel.extraOpts.push(line);
        }
      }
    } else if (line && !line.startsWith("#")) {
      if (currentChannel) {
        const parts = line.split("|");
        let mpdUrl = parts[0].trim();
        
        if (parts[1]) {
          const cookieMatch = parts[1].match(/cookie=([^&]+)/i);
          if (cookieMatch) currentChannel.cookie = decodeURIComponent(cookieMatch[1]);
          
          const uaMatch = parts[1].match(/user-agent=([^&]+)/i);
          if (uaMatch) currentChannel.userAgent = decodeURIComponent(uaMatch[1]);
        }
        
        if (isStarSportsFilter) {
          let urlPart = mpdUrl;
          let modifierPart = "";
          if (mpdUrl.includes("|")) {
            const partsUrl = mpdUrl.split("|");
            urlPart = partsUrl[0];
            modifierPart = "|" + partsUrl.slice(1).join("|");
          }
          urlPart += urlPart.includes("?") ? "&xobypass=true" : "?xobypass=true";
          mpdUrl = urlPart + modifierPart;
          
          if (!currentChannel.extraOpts.includes("#EXTVLCOPT:network-caching=3000")) {
            currentChannel.extraOpts.push("#EXTVLCOPT:network-caching=3000");
          }
          if (!currentChannel.extraOpts.includes("#EXTVLCOPT:live-caching=3000")) {
            currentChannel.extraOpts.push("#EXTVLCOPT:live-caching=3000");
          }
        }
        
        currentChannel.mpd = mpdUrl;
        
        if (!isStarSportsFilter || currentChannel.name.toLowerCase().includes("star sports")) {
          channels.push(currentChannel);
        }
        currentChannel = null;
      }
    }
  }
  
  if (currentChannel) {
    if (!isStarSportsFilter || currentChannel.name.toLowerCase().includes("star sports")) {
      channels.push(currentChannel);
    }
  }
  
  channels.forEach(ch => {
    ch.groupTitle = defaultGroup;
    if (!ch.logoUrl) {
      ch.logoUrl = defaultGroupLogo;
    }
    if (!ch.contentId) {
      const sanitized = ch.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      ch.contentId = sanitized || `channel-${Math.floor(Math.random() * 100000)}`;
    }
  });
  
  return channels;
}

// Dynamic Fetcher: 1. FANCODE LOGIC
async function fetchFanCode(): Promise<any[]> {
  const jsonUrl = "https://raw.githubusercontent.com/doctor-8trange/zyphx8/refs/heads/main/data/fancode.json";
  const fcGroupLogo = "https://ik.imagekit.io/yjtx9nh9y/vecteezy_fancode-app-icon-on-transparent-background_69146538.png";
  const groupTitle = "𝗙𝗔𝗡𝗖𝗢𝗗𝗘";
  const channels: any[] = [];

  try {
    const res = await fetch(`${jsonUrl}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    const textData = await res.text();
    
    if (textData.trim().startsWith('{')) {
      const data = JSON.parse(textData);
      const userAgent = data.headers?.["User-Agent"] || "ReactNativeVideo/9.7.0 (Linux;Android 10) AndroidXMedia3/1.6.1";
      const referer = data.headers?.["Referer"] || "https://fancode.com/";

      if (data.matches && Array.isArray(data.matches)) {
        data.matches.forEach((match: any) => {
          if (match.status === "LIVE" && match.STREAMING_CDN?.Primary_Playback_URL) {
            let streamUrl = match.STREAMING_CDN.Primary_Playback_URL
              .replace(/in-mc-plive\.fancode\.com|in-mc-flive\.fancode\.com|bd-mc-plive\.fancode\.com|np-mc-plive\.fancode\.com|lk-mc-plive\.fancode\.com|in-mc-fblive\.fancode\.com/g, "dai-fancode.pages.dev");

            const tvgId = match.match_id || `fc-${Math.floor(Math.random() * 1000000)}`;
            const title = match.title || "FanCode Live";
            const channelLogo = match.image || fcGroupLogo; 
            const lang = (match.language || "English").toLowerCase();
            const langShort = lang.substring(0, 3).toUpperCase();
            const name = `${langShort} | ${title}`;

            channels.push({
              contentId: tvgId.toString(),
              name,
              mpd: streamUrl,
              groupTitle,
              logoUrl: channelLogo,
              userAgent,
              extraOpts: [`#EXTVLCOPT:http-referrer=${referer}`],
            });
          }
        });
      }
    }
  } catch (e) {
    console.error("FanCode Parser Error", e);
  }

  if (channels.length === 0) {
    const fallbackLogo = "https://ik.imagekit.io/yjtx9nh9y/IMG_20250207_083415_447.jpg";
    const fallbackVideoUrl = "https://xoended.vercel.app/xoended.m3u8";
    channels.push({
      contentId: "fancode-no-live",
      name: "No Live Matches on FanCode Right Now",
      mpd: fallbackVideoUrl,
      groupTitle,
      logoUrl: fallbackLogo,
    });
  }

  return channels;
}

// Dynamic Fetcher: 2. ICC TV LOGIC
async function fetchIccTv(): Promise<any[]> {
  const jsonUrl = "https://raw.githubusercontent.com/doctor-8trange/nexphi0/refs/heads/main/data/icc.json";
  const iccGroupLogo = "https://ik.imagekit.io/yjtx9nh9y/62823e9932b32411608aa856.png";
  const groupTitle = "𝗜🇨🇴 𝗧𝗩";
  const channels: any[] = [];

  try {
    const res = await fetch(`${jsonUrl}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    const data = await res.json();

    if (data.live && Array.isArray(data.live)) {
      data.live.forEach((item: any) => {
        const playback = item.playback;
        if (playback && playback.playbackUrl) {
          const title = item.title || "ICC Match";
          const tvgId = item.fields?.videoId || `icc-${Math.floor(Math.random() * 100000)}`;
          const logo = item.thumbnail?.thumbnailUrl || iccGroupLogo;
          
          const headers = playback.headers || [];
          const ua = headers.find((h: string) => h.toLowerCase().startsWith("user-agent"))?.split(": ")[1] || "";
          const referer = headers.find((h: string) => h.toLowerCase().startsWith("referer"))?.split(": ")[1] || "";
          const origin = headers.find((h: string) => h.toLowerCase().startsWith("origin"))?.split(": ")[1] || "";
          const licenseKey = JSON.stringify(playback.keys.jwk);

          channels.push({
            contentId: tvgId.toString(),
            name: `English | ${title}`,
            mpd: playback.playbackUrl,
            groupTitle,
            logoUrl: logo,
            userAgent: ua,
            kodiprops: [
              `#KODIPROP:inputstream=inputstream.adaptive`,
              `#KODIPROP:inputstream.adaptive.manifest_type=mpd`,
              `#KODIPROP:inputstream.adaptive.license_type=com.clearkey.alpha`,
              `#KODIPROP:inputstream.adaptive.license_key=${licenseKey}`
            ],
            extraOpts: [
              `#EXTVLCOPT:http-referrer=${referer}`,
              `#EXTVLCOPT:http-origin=${origin}`
            ],
            extHttp: `#EXTHTTP:{"referer":"${referer}","origin":"${origin}"}`
          });
        }
      });
    }
  } catch (e) {
    console.error("ICC TV Parser Error", e);
  }

  if (channels.length === 0) {
    const fallbackLogo = "https://ik.imagekit.io/yjtx9nh9y/IMG_20250207_083415_447.jpg";
    const fallbackVideoUrl = "https://xoended.vercel.app/xoended.m3u8";
    channels.push({
      contentId: "icc-no-live",
      name: "No Live Matches on ICC TV Right Now",
      mpd: fallbackVideoUrl,
      groupTitle,
      logoUrl: fallbackLogo,
    });
  }

  return channels;
}

// Dynamic Fetcher: 3. SONY LIV LOGIC
async function fetchSonyLiv(): Promise<any[]> {
  const m3uUrl = "https://raw.githubusercontent.com/doctor-8trange/zyphora/refs/heads/main/data/sony.m3u";
  const categoryName = "SonyLIV";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png";
  
  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`);
    if (res.ok) {
      const text = await res.text();
      const chans = parseM3uText(text, categoryName, categoryLogo);
      if (chans.length > 0) return chans;
    }
  } catch (e) {
    console.error("SonyLIV Parser Error", e);
  }
  
  return [
    {
      contentId: "sony-no-live",
      name: "No Live Matches on SonyLIV Right Now",
      mpd: "https://xoended.vercel.app/xoended.m3u8",
      groupTitle: categoryName,
      logoUrl: "https://ik.imagekit.io/yjtx9nh9y/IMG_20250207_083415_447.jpg",
    }
  ];
}

// Dynamic Fetcher: 4. CRIC HD LOGIC
async function fetchCricHD(): Promise<any[]> {
  const m3uUrl = "https://raw.githubusercontent.com/srhady/crichd-speical-live-event/refs/heads/main/playlist.m3u";
  const categoryName = "CricHD";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/images%20(2).jpeg";
  
  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`);
    if (res.ok) {
      const text = await res.text();
      const chans = parseM3uText(text, categoryName, categoryLogo);
      if (chans.length > 0) return chans;
    }
  } catch (e) {
    console.error("CricHD Parser Error", e);
  }
  
  return [
    {
      contentId: "crichd-no-live",
      name: "No Channels on CricHD Right Now",
      mpd: "https://xoended.vercel.app/xoended.m3u8",
      groupTitle: categoryName,
      logoUrl: "https://ik.imagekit.io/yjtx9nh9y/IMG_20250207_083415_447.jpg",
    }
  ];
}

// Dynamic Fetcher: 5. FIFA PLUS LOGIC
async function fetchFifaPlus(): Promise<any[]> {
  const m3uUrl = "https://raw.githubusercontent.com/srhady/fifaplus/refs/heads/main/fifa_live.m3u";
  const categoryName = "FIFA Plus";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/images.png";
  
  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`);
    if (res.ok) {
      const text = await res.text();
      const chans = parseM3uText(text, categoryName, categoryLogo);
      if (chans.length > 0) return chans;
    }
  } catch (e) {
    console.error("FIFA Plus Parser Error", e);
  }
  
  return [
    {
      contentId: "fifa-no-live",
      name: "No Live Matches on FIFA Plus Right Now",
      mpd: "https://xoended.vercel.app/xoended.m3u8",
      groupTitle: categoryName,
      logoUrl: "https://ik.imagekit.io/yjtx9nh9y/IMG_20250207_083415_447.jpg",
    }
  ];
}

// Dynamic Fetcher: 6. STAR SPORTS LOGIC
async function fetchStarSports(): Promise<any[]> {
  const m3uUrl = "https://raw.githubusercontent.com/alex4528y/m3u/refs/heads/main/jtv.m3u";
  const categoryName = "Star Sports";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/947787.jpg"; 
  
  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (res.ok) {
      const text = await res.text();
      const chans = parseM3uText(text, categoryName, categoryLogo, true);
      if (chans.length > 0) return chans;
    }
  } catch (e) {
    console.error("Star Sports Parser Error", e);
  }
  
  return [
    {
      contentId: "starsports-no-live",
      name: "No Star Sports Channels Available Right Now",
      mpd: "https://xoended.vercel.app/xoended.m3u8",
      groupTitle: categoryName,
      logoUrl: "https://ik.imagekit.io/yjtx9nh9y/IMG_20250207_083415_447.jpg",
    }
  ];
}

// Static/Dynamic Generator: 7. SUPPORT LOGIC
function buildSupport(): any[] {
  const categoryName = "𝗦𝗨𝗣𝗣𝗢𝗥𝗧"; 
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/sllmnhx-telegram-6896827.svg?updatedAt=1777824421413";
  const channelName = "@xocietylive";
  const channelLogo = "https://ik.imagekit.io/yjtx9nh9y/IMG_20250207_083415_447.jpg";
  const streamUrl = "https://xociety-intro.vercel.app/xociety.m3u8";

  return [
    {
      contentId: "support-channel",
      name: channelName,
      mpd: streamUrl,
      groupTitle: categoryName,
      logoUrl: channelLogo,
      kodiprops: [],
      extraOpts: []
    }
  ];
}

// Resilient Parser for standard remote M3U playlist feed
async function parseM3uUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch M3U from source. Status: ${response.status}`);
    }
    const m3uText = await response.text();
    const lines = m3uText.split(/\r?\n/);
    
    const livechannels: any[] = [];
    let currentChannel: any = null;
    let defaultUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("#EXTINF:")) {
        if (currentChannel) {
          livechannels.push(currentChannel);
        }
        currentChannel = {
          contentId: "",
          name: "",
          mpd: "",
          cookie: "",
          kodiprops: [],
          logoUrl: "",
        };
        
        // tvg-id
        const idMatch = line.match(/tvg-id="([^"]+)"/);
        if (idMatch) {
          currentChannel.contentId = idMatch[1];
        }
        
        // tvg-logo
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) {
          currentChannel.logoUrl = logoMatch[1];
        }
        
        // tvg-name / name
        const nameMatch = line.match(/tvg-name="([^"]+)"/);
        if (nameMatch) {
          currentChannel.name = nameMatch[1];
        } else {
          const commaIndex = line.lastIndexOf(",");
          if (commaIndex !== -1) {
            currentChannel.name = line.substring(commaIndex + 1).trim();
          }
        }
        
        // if no contentId, try tvg-logo extraction
        if (!currentChannel.contentId) {
          if (currentChannel.logoUrl) {
            const parts = currentChannel.logoUrl.split("/");
            const fn = parts[parts.length - 1];
            if (fn && fn.includes("_")) {
              currentChannel.contentId = fn.split("_")[0];
            }
          }
        }
      } else if (line.startsWith("#KODIPROP:")) {
        if (currentChannel) {
          currentChannel.kodiprops.push(line);
        }
      } else if (line.startsWith("#EXTVLCOPT:http-user-agent=")) {
        if (currentChannel) {
          defaultUA = line.replace("#EXTVLCOPT:http-user-agent=", "").trim();
        }
      } else if (line.startsWith("#EXTVLCOPT:http-cookie=")) {
        if (currentChannel) {
          currentChannel.cookie = line.replace("#EXTVLCOPT:http-cookie=", "").trim();
        }
      } else if (line && !line.startsWith("#")) {
        if (currentChannel) {
          const parts = line.split("|");
          currentChannel.mpd = parts[0].trim();
          // if headers are embedded (case insensitive matching)
          if (parts[1]) {
            const cookieMatch = parts[1].match(/cookie=([^&]+)/i);
            if (cookieMatch) {
              currentChannel.cookie = decodeURIComponent(cookieMatch[1]);
            }
            const uaMatch = parts[1].match(/user-agent=([^&]+)/i);
            if (uaMatch) {
              currentChannel.userAgent = decodeURIComponent(uaMatch[1]);
              defaultUA = currentChannel.userAgent;
            }
          }
          livechannels.push(currentChannel);
          currentChannel = null;
        }
      }
    }
    if (currentChannel) {
      livechannels.push(currentChannel);
    }
    
    return {
      headers: {
        "user-agent": defaultUA,
      },
      livechannels,
      updatedAt: new Date().toLocaleString(),
      timeLeft: "Live parsing from Jiotvplus M3U stream",
    };
  } catch (error) {
    console.error("[M3U Parser] Error parsing:", error);
    throw error;
  }
}

// Core database loaders pulling from Jio & worker streams synchronously
async function fetchJioData() {
  const now = Date.now();
  if (cacheData && (now - lastFetched < CACHE_STRL_MS)) {
    return cacheData;
  }
  
  let baseJioData: any = null;
  
  // Try preferred source first
  if (config.preferredSource === "m3u") {
    try {
      console.log("[Source] Attempting to fetch and parse preferred M3U source...");
      const data = await parseM3uUrl(config.jioM3uUrl);
      if (data && data.livechannels && data.livechannels.length > 0) {
        baseJioData = data;
      }
    } catch (e) {
      console.warn("[Source] M3U parser failed, falling back to JSON:", e);
    }
    
    if (!baseJioData) {
      try {
        console.log("[Source] Falling back to traditional JSON endpoints...");
        const response = await fetch(config.jioJsonUrl);
        if (response.ok) {
          const json = await response.json();
          if (json && json.success) {
            baseJioData = json.data;
          }
        }
      } catch (e) {
        console.error("[Source] JSON fallback also failed:", e);
      }
    }
  } else {
    try {
      console.log("[Source] Attempting to fetch preferred JSON source...");
      const response = await fetch(config.jioJsonUrl);
      if (response.ok) {
        const json = await response.json();
        if (json && json.success) {
          baseJioData = json.data;
        }
      }
    } catch (e) {
      console.warn("[Source] JSON parser failed, trying M3U fallback:", e);
    }
    
    if (!baseJioData) {
      try {
        console.log("[Source] Falling back to M3U source parsing...");
        const data = await parseM3uUrl(config.jioM3uUrl);
        if (data && data.livechannels && data.livechannels.length > 0) {
          baseJioData = data;
        }
      } catch (e) {
        console.error("[Source] M3U fallback also failed:", e);
      }
    }
  }
  
  if (!baseJioData) {
    if (cacheData) {
      console.warn("[Cache] Serving old cache as fallback database due to errors.");
      return cacheData;
    }
    throw new Error("Unable to sync JioTV database from either JSON or M3U endpoints");
  }
  
  console.log("[Source] Merging multifeed scraper streams...");
  try {
    const [fcChannels, iccChannels, sonyChannels, cricChannels, fifaChannels, starSportsChannels] = await Promise.all([
      fetchFanCode(),
      fetchIccTv(),
      fetchSonyLiv(),
      fetchCricHD(),
      fetchFifaPlus(),
      fetchStarSports()
    ]);
    
    const supportChannels = buildSupport();
    
    // Process original Jio channels (keep "JioS2 " prefix)
    const originalJio = baseJioData.livechannels.map((ch: any) => {
      const groupName = ch.groupTitle || getChannelCategory(ch.name);
      return {
        ...ch,
        groupTitle: cleanGroupTitle(groupName, true),
        logoUrl: ch.logoUrl || `https://jiotvimages.live.jio.com/jiotv_images/${ch.contentId}_logo.png`
      };
    });
    
    // Process scraper channels (DO NOT keep/add "JioS2 " prefix)
    const scraperCombined = [
      ...fcChannels,
      ...iccChannels,
      ...sonyChannels,
      ...cricChannels,
      ...fifaChannels,
      ...starSportsChannels,
      ...supportChannels
    ].map((ch: any) => {
      const groupName = ch.groupTitle || getChannelCategory(ch.name);
      return {
        ...ch,
        groupTitle: cleanGroupTitle(groupName, false),
        logoUrl: ch.logoUrl || `https://jiotvimages.live.jio.com/jiotv_images/${ch.contentId}_logo.png`
      };
    });
    
    baseJioData.livechannels = [...originalJio, ...scraperCombined];
    baseJioData.updatedAt = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).replace(",", "");
    
    cacheData = baseJioData;
    lastFetched = now;
    return cacheData;
  } catch (error) {
    console.error("[Multifeed] Scraper merge failed:", error);
    baseJioData.livechannels = baseJioData.livechannels.map((ch: any) => {
      const groupName = ch.groupTitle || getChannelCategory(ch.name);
      return {
        ...ch,
        groupTitle: cleanGroupTitle(groupName, true),
        logoUrl: ch.logoUrl || `https://jiotvimages.live.jio.com/jiotv_images/${ch.contentId}_logo.png`
      };
    });
    cacheData = baseJioData;
    lastFetched = now;
    return cacheData;
  }
}

// General Config Router endpoints (accessible for front-end dashboard)
router.get("/config", (req, res) => {
  res.json({
    telegramUrl: config.telegramUrl,
    secureToken: config.secureToken,
    enableTokenProtection: config.enableTokenProtection,
    enableUserAgentCheck: config.enableUserAgentCheck,
    lastFetchedTime: lastFetched ? new Date(lastFetched).toISOString() : null,
    jioSourceUrl: config.jioJsonUrl,
    jioM3uUrl: config.jioM3uUrl,
    preferredSource: config.preferredSource,
  });
});

// Update runtime config via Dashboard
router.post("/config", express.json(), (req, res) => {
  const { telegramUrl, secureToken, enableTokenProtection, enableUserAgentCheck, preferredSource } = req.body;
  if (telegramUrl !== undefined) config.telegramUrl = telegramUrl;
  if (secureToken !== undefined) config.secureToken = secureToken;
  if (enableTokenProtection !== undefined) config.enableTokenProtection = enableTokenProtection;
  if (enableUserAgentCheck !== undefined) config.enableUserAgentCheck = enableUserAgentCheck;
  if (preferredSource !== undefined) config.preferredSource = preferredSource;
  
  res.json({ success: true, message: "Configuration adjusted successfully", config });
});

// Stream health-check and redirect guard
const playHandler = async (req: express.Request, res: express.Response): Promise<any> => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send("Missing stream URL");
  }

  const skipCheckKeywords = ["xocietypro", "jiotv", "sony", "snyliv", "star", "fancode", "icc", "xobypass", "dai"];
  if (skipCheckKeywords.some(keyword => targetUrl.toLowerCase().includes(keyword))) {
    return res.redirect(302, targetUrl);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const headers: Record<string, string> = {
      "User-Agent": (req.headers["user-agent"] as string) || "ExoPlayer/2.18.1"
    };
    if (req.headers["referer"]) headers["Referer"] = req.headers["referer"] as string;
    if (req.headers["origin"]) headers["Origin"] = req.headers["origin"] as string;

    const checkRes = await fetch(targetUrl, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (checkRes.body) {
      try {
        await checkRes.body.cancel();
      } catch (e) {}
    }

    if (!checkRes.ok || checkRes.status >= 400) {
      return res.redirect(302, "https://xofix.vercel.app/xofix.m3u8");
    }

    const contentType = checkRes.headers.get("content-type") || "";
    const invalidTypes = ["text/html", "application/json", "text/plain", "application/xml"];

    if (invalidTypes.some(type => contentType.toLowerCase().includes(type))) {
      return res.redirect(302, "https://xofix.vercel.app/xofix.m3u8");
    }

    return res.redirect(302, targetUrl);
  } catch (error) {
    return res.redirect(302, "https://xofix.vercel.app/xofix.m3u8");
  }
};

// Main Playlist Generator Endpoint (compatible with both /api/playlist and original request url)
const playlistHandler = async (req: express.Request, res: express.Response): Promise<any> => {
  const outputFormat = (req.query.format as string) || "tivimate"; // "tivimate", "standard-opt", "clean"
  
  try {
    const jioData = await fetchJioData();
    if (!jioData || !jioData.livechannels) {
      return res.status(500).send("#EXTM3U\n# Unable to fetch active IPTV database");
    }
    
    const channels = jioData.livechannels;
    
    let m3u = `#EXTM3U x-tvg-url="https://raw.githubusercontent.com/mitthu786/mitthu786/main/jio/epg.xml.gz"\n`;
    m3u += `# PLAYLIST SECURED & POWERED BY CARTEL SECURITY SYSTEMS\n`;
    m3u += `# For support or updates, join our Telegram Channel: ${config.telegramUrl}\n\n`;
    
    let protocol = req.protocol;
    const rHost = req.get("host") || "";
    if (rHost.includes("run.app") || rHost.includes("vercel.app") || req.secure) {
      protocol = "https";
    }
    const host = `${protocol}://${rHost}`;
    
    for (const channel of channels) {
      const { contentId, name, mpd, cookie } = channel;
      const chUA = channel.userAgent || jioData.headers?.["user-agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
      const groupTitle = channel.groupTitle || getChannelCategory(name);
      const chLogo = channel.logoUrl || `https://jiotvimages.live.jio.com/jiotv_images/${contentId}_logo.png`;
      const groupLogoUrl = getGroupLogo(groupTitle);
      
      const wrappedMpd = wrapStreamUrl(mpd, host);

      // Build kodi props text block
      let kodiPropsBlock = "";
      if (channel.kodiprops && channel.kodiprops.length > 0) {
        for (const prop of channel.kodiprops) {
          kodiPropsBlock += `${prop}\n`;
        }
      }
      
      // Build Extra VLCOPTS block (specifically for network-caching or referer)
      let extraOptsBlock = "";
      if (channel.extraOpts && channel.extraOpts.length > 0) {
        for (const opt of channel.extraOpts) {
          extraOptsBlock += `${opt}\n`;
        }
      }
      
      if (outputFormat === "tivimate") {
        m3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
        if (kodiPropsBlock) m3u += kodiPropsBlock;
        if (extraOptsBlock) m3u += extraOptsBlock;
        m3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
        if (cookie) m3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
        m3u += `${wrappedMpd}|User-Agent=${encodeURIComponent(chUA)}${cookie ? '&Cookie=' + encodeURIComponent(cookie) : ''}\n\n`;
      } else if (outputFormat === "standard-opt") {
        m3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
        if (kodiPropsBlock) m3u += kodiPropsBlock;
        if (extraOptsBlock) m3u += extraOptsBlock;
        m3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
        if (cookie) m3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
        m3u += `${wrappedMpd}\n\n`;
      } else {
        m3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
        if (kodiPropsBlock) m3u += kodiPropsBlock;
        if (extraOptsBlock) m3u += extraOptsBlock;
        m3u += `${wrappedMpd}${channel.userAgent ? '|User-Agent=' + encodeURIComponent(channel.userAgent) : ''}${cookie ? '&Cookie=' + encodeURIComponent(cookie) : ''}\n\n`;
      }
    }
    
    res.setHeader("Content-Type", "application/x-mpegurl; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="jiotvplus.m3u"');
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(m3u);
  } catch (err: any) {
    console.error("[Playlist] Generation Error:", err);
    res.status(500).send(`#EXTM3U\n# Error generating secured playlist: ${err.message || err}`);
  }
};

// Mount endpoints
router.get("/playlist", handleSecurityGate, playlistHandler);
router.get("/playlist.m3u", handleSecurityGate, playlistHandler);
router.get("/jiotvplus.m3u", handleSecurityGate, playlistHandler);
router.get("/play", playHandler);

// Channels list (for dashboard preview, does not output secret stream keys to browser unless authorized)
router.get("/channels", async (req, res) => {
  try {
    const jioData = await fetchJioData();
    if (!jioData || !jioData.livechannels) {
      return res.status(404).json({ success: false, error: "Jio live database unavailable" });
    }
    
    const cleanChannels = jioData.livechannels.map((chan: any) => ({
      contentId: chan.contentId,
      name: chan.name,
      mpd: chan.mpd,
      logo: chan.logoUrl || `https://jiotvimages.live.jio.com/jiotv_images/${chan.contentId}_logo.png`,
      groupTitle: chan.groupTitle,
    }));
    
    res.json({
      success: true,
      channelsCount: cleanChannels.length,
      channels: cleanChannels,
      updatedAt: jioData.updatedAt || new Date(lastFetched).toLocaleString(),
      timeLeft: jioData.timeLeft || "N/A"
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || error });
  }
});

// Setup serverless routing wrapper for Express
const app = express();

// Native CORS middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Mount /play on root app level
app.get("/play", playHandler);

// Mount the router under /api
app.use("/api", router);

// Error fallback handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("API error:", err);
  res.status(500).json({ error: "Internal security failure" });
});

export default app;
