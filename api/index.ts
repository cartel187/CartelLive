import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const router = express.Router();

// Mock memory storage for tokens (will fall back to environment variables or defaults)
const config = {
  telegramUrl: process.env.MY_TELEGRAM_LINK || "https://t.me/cartel187",
  secureToken: process.env.SECURE_TOKEN || "cartel187",
  jioJsonUrl: "https://jiotvplus.dr-strange.workers.dev/watch/fetch.json",
  jioM3uUrl: "https://jiotvplus.dr-strange.workers.dev/api/jiotvplus.m3u",
  preferredSource: "m3u",
  enableTokenProtection: true,
  enableUserAgentCheck: true,
};

// Helper to determine if a request comes from an allowed player
function isAllowedPlayer(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();

  // Strict whitelist of IPTV player keywords
  const playerKeywords = [
    "tivimate",
    "ott",
    "navigator",
    "kodi",
    "vlc",
    "perfectplayer",
    "iptv",
    "exoplayer",
    "gstreamer",
    "potplayer",
    "mxplayer",
    "okhttp",
    "smarters",
    "xcip",
    "xspf",
    "player",
    "applecoremedia",
    "stagefright",
    "lavf",
    "plaYtv"
  ];

  return playerKeywords.some((kw) => ua.includes(kw));
}

// Redirect middleware / validation logic
function handleSecurityGate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): any {
  let userAgent = req.headers["user-agent"];
  if (req.query.ua) {
     userAgent = req.query.ua as string;
  }
  const token = (req.query.token as string) || (req.query.key as string);
  const workflowSecret = req.headers["x-cartel-secret"];

  // 0. Workflow Bypass (Used for GitHub Actions)
  if (workflowSecret === "workflow-sync-bot") {
    return next();
  }

  // 1. Strict User-Agent Gate (Only IPTV Players)
  if (config.enableUserAgentCheck && !isAllowedPlayer(userAgent)) {
    console.log(
      `[Gate] Blocked non-player user. UA: ${userAgent}. Redirecting to Telegram.`,
    );
    return res.redirect(302, config.telegramUrl);
  }

  // 2. Token Gate
  if (config.enableTokenProtection && config.secureToken) {
    if (token !== config.secureToken) {
      console.log(
        `[Gate] Blocked request due to invalid token: "${token}". Redirecting to Telegram.`,
      );
      return res.redirect(302, config.telegramUrl);
    }
  }

  next();
}

// IP-based rate limiting middleware
const rateLimitWindowMs = 60 * 1000; // 1 minute
const maxRequestsPerWindow = 60; // Max requests per IP per minute
const requestCounts = new Map<string, { count: number; startTime: number }>();

function ipRateLimiter(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): any {
  let ip = req.ip || req.socket.remoteAddress || "unknown";
  if (req.headers["x-forwarded-for"]) {
    ip = (req.headers["x-forwarded-for"] as string).split(",")[0].trim();
  }

  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now - record.startTime > rateLimitWindowMs) {
    requestCounts.set(ip, { count: 1, startTime: now });
  } else {
    record.count++;
    if (record.count > maxRequestsPerWindow) {
      console.log(`[RateLimit] Blocked IP: ${ip} for exceeding ${maxRequestsPerWindow} requests/min.`);
      return res.status(429).send("Too many requests from this IP. Please wait a minute.");
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
  } else if (
    nom.includes("gold") ||
    nom.includes("movies") ||
    nom.includes("cinema") ||
    nom.includes("picture")
  ) {
    baseGroup = "Movies";
  } else if (
    nom.includes("disney") ||
    nom.includes("junior") ||
    nom.includes("hungama")
  ) {
    baseGroup = "Kids";
  } else if (nom.includes("news") || nom.includes("samachar")) {
    baseGroup = "News";
  }
  return `${baseGroup}`;
}

// Ensure all categories are formatted correctly. JioS2 prefix is only for original JioTV channels
function cleanGroupTitle(group: string, isOriginalJio: boolean): string {
  let g = group.trim();
  const lower = g.toLowerCase();

  if (g === "sonyliv s2" || g.startsWith("jios2")) {
    return g;
  }

  if (lower.includes("fancode") || lower.includes("𝗳𝗮𝗻𝗰𝗼𝗱𝗲")) return "𝗙𝗔𝗡𝗖𝗢𝗗𝗘";
  if (
    lower.includes("icc") ||
    lower.includes("𝗶🇨🇴") ||
    lower.includes("𝗶𝗰🇨🇵") ||
    lower.includes("𝗶𝗰𝗰") ||
    lower.includes("𝗶𝗰𝗰 𝘁𝘃") ||
    lower.includes("icc tv")
  )
    return "𝗜🇨🇨 𝗧𝗩";
  if (
    lower.includes("sony") ||
    lower.includes("snyliv") ||
    lower.includes("sonyliv")
  )
    return "SonyLIV";
  if (lower.includes("crichd") || lower.includes("crichd")) return "CricHD";
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
    return `${g}`;
  }
  return g;
}

// Resolve category logos dynamically matching user specifications
function getGroupLogo(groupName: string): string {
  const g = groupName.toLowerCase();
  if (g.includes("sonyliv s2"))
    return "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png?updatedAt=1777812797381";
  if (g.includes("jios2"))
    return "https://ik.imagekit.io/yjtx9nh9y/Jio-TV-Logo.png?updatedAt=1777823901229";

  if (g.includes("fancode") || g.includes("𝗳𝗮𝗻𝗰𝗼𝗱𝗲"))
    return "https://ik.imagekit.io/yjtx9nh9y/vecteezy_fancode-app-icon-on-transparent-background_69146538.png";
  if (
    g.includes("icc") ||
    g.includes("𝗶🇨🇴") ||
    g.includes("𝗶𝗰🇨🇵") ||
    g.includes("𝗶𝗰𝗰") ||
    g.includes("𝗶𝗰𝗰 𝘁𝘃") ||
    g.includes("icc tv")
  )
    return "https://ik.imagekit.io/yjtx9nh9y/62823e9932b32411608aa856.png";
  if (g.includes("sony") || g.includes("sonyliv"))
    return "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png";
  if (g.includes("crichd"))
    return "https://ik.imagekit.io/yjtx9nh9y/images%20(2).jpeg";
  if (g.includes("fifa")) return "https://ik.imagekit.io/yjtx9nh9y/images.png";
  if (g.includes("star sports"))
    return "https://ik.imagekit.io/yjtx9nh9y/947787.jpg";
  if (g.includes("support") || g.includes("𝘀𝘂𝗽𝗽𝗼𝗿𝘁"))
    return "https://ik.imagekit.io/yjtx9nh9y/sllmnhx-telegram-6896827.svg?updatedAt=1777824421413";
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
    lowerUrl.includes("tgaadi") ||
    lowerUrl.includes("sliv") ||
    lowerUrl.includes("cartelended.vercel.app") ||
    lowerUrl.includes("cartelintro.vercel.app") ||
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
function parseM3uTextToChannels(
  m3uText: string,
  defaultGroup: string,
  defaultLogo = "",
): any[] {
  const lines = m3uText.split(/\r?\n/);
  const channels: any[] = [];
  let current: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:") || line.startsWith("#EXTINF")) {
      if (current) {
        channels.push(current);
      }
      current = {
        contentId: "",
        name: "",
        mpd: "",
        cookie: "",
        kodiprops: [],
        logoUrl: defaultLogo,
        groupTitle: defaultGroup,
        extraOpts: [],
      };

      // tvg-id
      const idMatch = line.match(/tvg-id="([^"]*)"/);
      if (idMatch) current.contentId = idMatch[1];

      // tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      if (logoMatch) current.logoUrl = logoMatch[1];

      // group-title
      const groupMatch = line.match(/group-title="([^"]*)"/);
      if (groupMatch) {
        // Only override groupTitle if defaultGroup is empty, otherwise we hold defaultGroup brand
        if (!defaultGroup) {
          current.groupTitle = groupMatch[1];
        }
      }

      // name after comma
      const commaIndex = line.lastIndexOf(",");
      if (commaIndex !== -1) {
        current.name = line.substring(commaIndex + 1).trim();
      } else {
        const nameMatch = line.match(/tvg-name="([^"]*)"/);
        if (nameMatch) current.name = nameMatch[1];
      }

      if (!current.contentId && current.name) {
        current.contentId = current.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-");
      }
    } else if (line.startsWith("#KODIPROP:")) {
      if (current) {
        current.kodiprops.push(line);
      }
    } else if (line.startsWith("#EXTVLCOPT:")) {
      if (current) {
        if (line.startsWith("#EXTVLCOPT:http-user-agent=")) {
          current.userAgent = line
            .replace("#EXTVLCOPT:http-user-agent=", "")
            .trim();
        } else if (line.startsWith("#EXTVLCOPT:http-cookie=")) {
          current.cookie = line.replace("#EXTVLCOPT:http-cookie=", "").trim();
        } else {
          current.extraOpts.push(line);
        }
      }
    } else if (line.startsWith("#EXTHTTP:")) {
      if (current) {
        current.extHttp = line;
      }
    } else if (!line.startsWith("#")) {
      if (current) {
        // Line can contain modifiers with '|'
        const parts = line.split("|");
        // Preserve the full line if it contains pipes, but extract cookie/ua for internal use if present
        current.mpd = parts[0].trim();

        // Reconstruct the full mpd line including all pipes if present
        if (parts.length > 1) {
          // We still want to extract known headers for our logic
          for (let j = 1; j < parts.length; j++) {
            const p = parts[j];
            const cookieMatch = p.match(/cookie=([^&]+)/i);
            if (cookieMatch)
              current.cookie = decodeURIComponent(cookieMatch[1]);
            const uaMatch = p.match(/user-agent=([^&]+)/i);
            if (uaMatch) current.userAgent = decodeURIComponent(uaMatch[1]);
          }
          // Preserve the original full line with pipes as the mpd
          current.mpd = line.trim();
        }
        channels.push(current);
        current = null;
      }
    }
  }

  if (current) {
    channels.push(current);
  }

  return channels;
}

// ==========================================
// 1. FANCODE LOGIC
// ==========================================
async function buildFanCode(): Promise<string> {
  const jsonUrl =
    "https://raw.githubusercontent.com/doctor-8trange/zyphx8/refs/heads/main/data/fancode.json";
  const fcGroupLogo =
    "https://ik.imagekit.io/yjtx9nh9y/vecteezy_fancode-app-icon-on-transparent-background_69146538.png";
  const boldCategory = "𝗙𝗔𝗡𝗖𝗢𝗗𝗘";
  let m3u = "";

  try {
    const res = await fetch(`${jsonUrl}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    const textData = await res.text();

    if (textData.trim().startsWith("{")) {
      const data = JSON.parse(textData);
      const userAgent =
        data.headers?.["User-Agent"] ||
        "ReactNativeVideo/9.7.0 (Linux;Android 10) AndroidXMedia3/1.6.1";
      const referer = data.headers?.["Referer"] || "https://fancode.com/";

      if (data.matches && Array.isArray(data.matches)) {
        data.matches.forEach((match: any) => {
          if (
            match.status === "LIVE" &&
            match.STREAMING_CDN?.Primary_Playback_URL
          ) {
            let streamUrl = match.STREAMING_CDN.Primary_Playback_URL.replace(
              /in-mc-plive\.fancode\.com|in-mc-flive\.fancode\.com|bd-mc-plive\.fancode\.com|np-mc-plive\.fancode\.com|lk-mc-plive\.fancode\.com|in-mc-fblive\.fancode\.com/g,
              "dai-fancode.pages.dev",
            );

            const tvgId = match.match_id || "";
            const title = match.title || "FanCode Live";
            const channelLogo = match.image || "";
            const lang = (match.language || "English").toLowerCase();
            const langShort = lang.substring(0, 3).toUpperCase();

            m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${title}" tvg-logo="${channelLogo}" group-title="${boldCategory}" group-logo="${fcGroupLogo}",${langShort} | ${title}\n`;
            m3u += `${streamUrl}|User-Agent=${userAgent}&Referer=${referer}\n\n`;
          }
        });
      }
    }
  } catch (e) {
    console.error("FanCode Error", e);
  }

  if (!m3u.includes("#EXTINF")) {
    const fallbackLogo =
      "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
    const fallbackVideoUrl = "https://cartelended.vercel.app/cartelended.m3u8";
    m3u += `#EXTINF:-1 tvg-id="fancode-no-live" tvg-logo="${fallbackLogo}" group-title="${boldCategory}" group-logo="${fcGroupLogo}",No Live Matches on FanCode Right Now\n`;
    m3u += `${fallbackVideoUrl}\n\n`;
  }

  return m3u;
}

// ==========================================
// 2. ICC TV LOGIC
// ==========================================
async function buildIccTv(): Promise<string> {
  const jsonUrl =
    "https://raw.githubusercontent.com/doctor-8trange/nexphi0/refs/heads/main/data/icc.json";
  const iccGroupLogo =
    "https://ik.imagekit.io/yjtx9nh9y/62823e9932b32411608aa856.png";
  const boldCategory = "𝗜𝗖𝗖 𝗧𝗩";
  let m3u = "";

  try {
    const res = await fetch(`${jsonUrl}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    const data = (await res.json()) as any;

    if (data.live && Array.isArray(data.live)) {
      data.live.forEach((item: any) => {
        const playback = item.playback;
        if (playback && playback.playbackUrl) {
          const title = item.title || "ICC Match";
          const tvgId = item.fields?.videoId || "";
          const logo = item.thumbnail?.thumbnailUrl || iccGroupLogo;

          const headers = playback.headers || [];
          const ua =
            headers
              .find((h: any) => h.toLowerCase().startsWith("user-agent"))
              ?.split(": ")[1] || "";
          const referer =
            headers
              .find((h: any) => h.toLowerCase().startsWith("referer"))
              ?.split(": ")[1] || "";
          const origin =
            headers
              .find((h: any) => h.toLowerCase().startsWith("origin"))
              ?.split(": ")[1] || "";
          const licenseKey = JSON.stringify(playback.keys.jwk);

          m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-logo="${logo}" tvg-lang="English" group-title="${boldCategory}" group-logo="${iccGroupLogo}",English | ${title}\n`;
          m3u += `#KODIPROP:inputstream=inputstream.adaptive\n`;
          m3u += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
          m3u += `#KODIPROP:inputstream.adaptive.license_type=com.clearkey.alpha\n`;
          m3u += `#KODIPROP:inputstream.adaptive.license_key=${licenseKey}\n`;
          m3u += `#EXTVLCOPT:http-user-agent=${ua}\n`;
          m3u += `#EXTVLCOPT:http-referrer=${referer}\n`;
          m3u += `#EXTVLCOPT:http-origin=${origin}\n`;
          m3u += `#EXTHTTP:{"referer":"${referer}","origin":"${origin}"}\n`;
          m3u += `${playback.playbackUrl}\n\n`;
        }
      });
    }
  } catch (e) {
    console.error("ICC TV Error", e);
  }

  if (!m3u.includes("#EXTINF")) {
    const fallbackLogo =
      "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
    const fallbackVideoUrl = "https://cartelended.vercel.app/cartelended.m3u8";
    m3u += `#EXTINF:-1 tvg-id="icc-no-live" tvg-logo="${fallbackLogo}" group-title="${boldCategory}" group-logo="${iccGroupLogo}",No Live Matches on ICC TV Right Now\n`;
    m3u += `${fallbackVideoUrl}\n\n`;
  }

  return m3u;
}

// ==========================================
// 3. SONY LIV LOGIC
// ==========================================
async function buildSonyLivEvents(): Promise<string> {
  const m3uUrl =
    "https://raw.githubusercontent.com/doctor-8trange/zyphora/refs/heads/main/data/sony.m3u";
  const categoryName = "SonyLiv Events";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png";
  let m3u = "";

  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`);
    if (res.ok) {
      m3u = await res.text();
      m3u = m3u.replace(/#EXTM3U.*/g, "");
      m3u = m3u.replace(/#DATE:-.*/g, "");
      m3u = m3u.replace(/# Written and Directed by.*/g, "");
      m3u = m3u.replace(/# Join us on Telegram.*/g, "");

      m3u = m3u.replace(/\s*group-logo="[^"]*"/g, "");
      m3u = m3u.replace(
        /group-title="[^"]*"/g,
        `group-logo="${categoryLogo}" group-title="${categoryName}"`,
      );
    }
  } catch (e) {
    console.error("SonyLiv Events Error", e);
  }

  if (!m3u.includes("#EXTINF")) {
    const fallbackLogo =
      "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
    const fallbackVideoUrl = "https://cartelended.vercel.app/cartelended.m3u8";
    m3u += `#EXTINF:-1 tvg-id="sony-no-live" tvg-logo="${fallbackLogo}" group-title="${categoryName}" group-logo="${categoryLogo}",No Live Matches on SonyLiv Events Right Now\n`;
    m3u += `${fallbackVideoUrl}\n\n`;
  }

  return m3u + (!m3u.endsWith("\n\n") ? "\n\n" : "");
}

async function buildSonyLiv(): Promise<string> {
  const m3uUrl =
    "https://raw.githubusercontent.com/cartel187/CartelSony/refs/heads/main/SonyLiv.m3u";
  const categoryName = "SonyLIV";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png";
  let m3u = "";

  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`);
    if (res.ok) {
      const text = await res.text();
      const parsedChannels = parseM3uTextToChannels(
        text,
        categoryName,
        categoryLogo,
      );

      const filteredChannels = parsedChannels.filter((ch) => {
        const hasTelegramId = ch.contentId === "telegram";
        const hasSecretSocietyName =
          ch.name &&
          (ch.name.includes("𝐒𝐄𝐂𝐑𝐄𝐓 𝐒𝐎𝐂𝐈𝐄𝐓𝐘") ||
            ch.name.includes("SECRET") ||
            ch.name.includes("@TheCursedCelestiaI"));
        const hasSecretSocietyUrl =
          ch.mpd &&
          (ch.mpd.includes("cartelintro.vercel.app") ||
            ch.mpd.includes("cartelintro.m3u8"));
        return !hasTelegramId && !hasSecretSocietyName && !hasSecretSocietyUrl;
      });

      let reconstructedM3u = "";
      for (const channel of filteredChannels) {
        const { contentId, name, mpd, cookie } = channel;
        const chLogo = channel.logoUrl || categoryLogo;
        const groupTitle = categoryName;
        const groupLogoUrl = categoryLogo;
        const chUA =
          channel.userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

        let kodiPropsBlock = "";
        if (channel.kodiprops && channel.kodiprops.length > 0) {
          for (const prop of channel.kodiprops) {
            kodiPropsBlock += `${prop}\n`;
          }
        }
        let extraOptsBlock = "";
        if (channel.extraOpts && channel.extraOpts.length > 0) {
          for (const opt of channel.extraOpts) {
            extraOptsBlock += `${opt}\n`;
          }
        }

        reconstructedM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
        if (kodiPropsBlock) reconstructedM3u += kodiPropsBlock;
        if (extraOptsBlock) reconstructedM3u += extraOptsBlock;
        if (channel.extHttp) reconstructedM3u += `${channel.extHttp}\n`;
        if (chUA) {
          reconstructedM3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
        }
        if (cookie) {
          reconstructedM3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
        }
        reconstructedM3u += `${mpd}${channel.userAgent ? "|User-Agent=" + encodeURIComponent(channel.userAgent) : ""}${cookie ? "&Cookie=" + encodeURIComponent(cookie) : ""}\n\n`;
      }
      m3u = reconstructedM3u;
    }
  } catch (e) {
    console.error("SonyLIV New Category Error", e);
  }

  if (!m3u.includes("#EXTINF")) {
    const fallbackLogo =
      "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%2520%2520Modern%2520AI%2520Logo.png?updatedAt=1780156943081";
    const fallbackVideoUrl = "https://cartelended.vercel.app/cartelended.m3u8";
    m3u += `#EXTINF:-1 tvg-id="sony-new-no-live" tvg-logo="${fallbackLogo}" group-title="${categoryName}" group-logo="${categoryLogo}",No Live Matches on SonyLIV Right Now\n`;
    m3u += `${fallbackVideoUrl}\n\n`;
  }

  return m3u + (!m3u.endsWith("\n\n") ? "\n\n" : "");
}

// ==========================================
// 4. CRIC HD LOGIC
// ==========================================
async function buildCricHD(): Promise<string> {
  const m3uUrl =
    "https://raw.githubusercontent.com/srhady/crichd-speical-live-event/refs/heads/main/playlist.m3u";
  const categoryName = "CricHD";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/images%20(2).jpeg";
  let m3u = "";

  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      let textData = await res.text();
      const lines = textData.split("\n");
      let cleanLines = [];

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (
          line.startsWith("#EXTM3U") ||
          line.startsWith("#name:") ||
          line.startsWith("#total channels:") ||
          line.startsWith("#online channels:") ||
          line.startsWith("#telegram:") ||
          line.startsWith("#owner:") ||
          line.startsWith("#last update time:") ||
          line.startsWith("# ---")
        ) {
          continue;
        }

        if (line.startsWith("#EXTINF")) {
          line = line.replace(/\s*group-logo="[^"]*"/g, "");
          line = line.replace(
            /group-title="[^"]*"/g,
            `group-title="${categoryName}" group-logo="${categoryLogo}"`,
          );
          cleanLines.push(line);
        } else {
          cleanLines.push(line);
          if (!line.startsWith("#")) {
            cleanLines.push("");
          }
        }
      }
      m3u = cleanLines.join("\n");
    }
  } catch (e) {
    console.error("CricHD Error", e);
  }

  if (!m3u.includes("#EXTINF")) {
    const fallbackLogo =
      "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
    const fallbackVideoUrl = "https://cartelended.vercel.app/cartelended.m3u8";
    m3u += `#EXTINF:-1 tvg-id="crichd-no-live" tvg-logo="${fallbackLogo}" group-title="${categoryName}" group-logo="${categoryLogo}",No Channels on CricHD Right Now\n`;
    m3u += `${fallbackVideoUrl}\n\n`;
  }

  return m3u + (!m3u.endsWith("\n\n") ? "\n\n" : "");
}

// ==========================================
// 5. FIFA PLUS LOGIC
// ==========================================
async function buildFifaPlus(): Promise<string> {
  const m3uUrl =
    "https://raw.githubusercontent.com/srhady/fifaplus/refs/heads/main/fifa_live.m3u";
  const categoryName = "FIFA Plus";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/images.png";
  let m3u = "";

  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      let textData = await res.text();
      const lines = textData.split("\n");
      let cleanLines = [];

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (
          line.startsWith("#EXTM3U") ||
          line.startsWith("#name:") ||
          line.startsWith("#telegram:") ||
          line.startsWith("#owner:") ||
          line.startsWith("#last update time:")
        ) {
          continue;
        }

        if (line.startsWith("#EXTINF")) {
          line = line.replace(/\s*group-logo="[^"]*"/g, "");
          line = line.replace(
            /group-title="[^"]*"/g,
            `group-title="${categoryName}" group-logo="${categoryLogo}"`,
          );
          cleanLines.push(line);
        } else {
          cleanLines.push(line);
          if (!line.startsWith("#")) {
            cleanLines.push("");
          }
        }
      }
      m3u = cleanLines.join("\n");
    }
  } catch (e) {
    console.error("FIFA Plus Error", e);
  }

  if (!m3u.includes("#EXTINF")) {
    const fallbackLogo =
      "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
    const fallbackVideoUrl = "https://cartelended.vercel.app/cartelended.m3u8";
    m3u += `#EXTINF:-1 tvg-id="fifa-no-live" tvg-logo="${fallbackLogo}" group-title="${categoryName}" group-logo="${categoryLogo}",No Live Matches on FIFA Plus Right Now\n`;
    m3u += `${fallbackVideoUrl}\n\n`;
  }

  return m3u + (!m3u.endsWith("\n\n") ? "\n\n" : "");
}

// ==========================================
// 6. STAR SPORTS (BUFFERING & CF-BYPASS FIX)
// ==========================================
async function buildStarSports(): Promise<string> {
  const m3uUrl =
    "https://raw.githubusercontent.com/alex4528y/m3u/refs/heads/main/jtv.m3u";
  const categoryName = "Star Sports";
  const categoryLogo = "https://ik.imagekit.io/yjtx9nh9y/947787.jpg";
  let m3u = "";

  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`, {
      headers: {
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (res.ok) {
      let textData = await res.text();
      const lines = textData.split("\n");
      let cleanLines = [];
      let keepChannel = false;

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (
          line.startsWith("#EXTM3U") ||
          line.startsWith("#name:") ||
          line.startsWith("#total channels:") ||
          line.startsWith("#telegram:")
        ) {
          continue;
        }

        if (line.startsWith("#EXTINF")) {
          if (line.toLowerCase().includes("star sports")) {
            keepChannel = true;

            line = line.replace(/\s*group-logo="[^"]*"/g, "");
            if (line.includes("group-title=")) {
              line = line.replace(
                /group-title="[^"]*"/g,
                `group-title="${categoryName}" group-logo="${categoryLogo}"`,
              );
            } else {
              const commaIndex = line.indexOf(",");
              if (commaIndex !== -1) {
                line =
                  line.slice(0, commaIndex) +
                  ` group-title="${categoryName}" group-logo="${categoryLogo}"` +
                  line.slice(commaIndex);
              }
            }
            cleanLines.push(line);

            // 🔥 TWEAK 1: Force IPTV Players to Cache 3 Seconds of Video (Stops Stuttering)
            cleanLines.push(`#EXTVLCOPT:network-caching=3000`);
            cleanLines.push(`#EXTVLCOPT:live-caching=3000`);
          } else {
            keepChannel = false;
          }
        } else if (keepChannel) {
          // 🔥 TWEAK 2: Inject bypass tag to stop Cloudflare from causing Double-Connection Rate Limits
          if (line.startsWith("http")) {
            let urlPart = line;
            let modifierPart = "";
            if (line.includes("|")) {
              const parts = line.split("|");
              urlPart = parts[0];
              modifierPart = "|" + parts.slice(1).join("|");
            }

            urlPart += urlPart.includes("?")
              ? "&xobypass=true"
              : "?xobypass=true";
            line = urlPart + modifierPart;
          }

          cleanLines.push(line);
          if (!line.startsWith("#")) {
            cleanLines.push("");
            keepChannel = false;
          }
        }
      }
      m3u = cleanLines.join("\n");
    }
  } catch (e) {
    console.error("Star Sports Error", e);
  }

  if (!m3u.includes("#EXTINF")) {
    const fallbackLogo =
      "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
    const fallbackVideoUrl = "https://cartelended.vercel.app/cartelended.m3u8";
    m3u += `#EXTINF:-1 tvg-id="starsports-no-live" tvg-logo="${fallbackLogo}" group-title="${categoryName}" group-logo="${categoryLogo}",No Star Sports Channels Available Right Now\n`;
    m3u += `${fallbackVideoUrl}\n\n`;
  }

  return m3u + (!m3u.endsWith("\n\n") ? "\n\n" : "");
}

// ==========================================
// 7. TELEGRAM SUPPORT LOGIC
// ==========================================
async function buildSupport(): Promise<string> {
  const categoryName = "𝗦𝗨𝗣𝗣𝗢𝗥𝗧";
  const categoryLogo =
    "https://ik.imagekit.io/yjtx9nh9y/sllmnhx-telegram-6896827.svg?updatedAt=1777824421413";
  const channelName = "@cartel187";
  const channelLogo =
    "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
  const streamUrl = "https://cartelintro.vercel.app/cartelintro.m3u8";

  let m3u = `#EXTINF:-1 tvg-id="support-channel" tvg-logo="${channelLogo}" group-title="${categoryName}" group-logo="${categoryLogo}",${channelName}\n`;
  m3u += `${streamUrl}\n\n`;

  return m3u;
}

// ==========================================
// 8. EXTRA REFRESHING PLAYLIST (Xovt)
// ==========================================
async function buildExtraPlaylists(): Promise<string> {
  const m3uUrl =
    "https://raw.githubusercontent.com/cartel187/Cartelfetch/refs/heads/main/playlist.m3u";
  let m3u = "";

  try {
    const res = await fetch(`${m3uUrl}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      const text = await res.text();
      // Parse without default group/logo so we get the original attributes from the M3U file
      const parsedChannels = parseM3uTextToChannels(text, "", "");

      const filteredChannels = parsedChannels.filter((ch) => {
        const group = (ch.groupTitle || "").toLowerCase();

        // Match conditions:
        const isJioTv = group.includes("jio ⭕");
        const isSonyLiv = group.includes("sonyliv channel");

        return isJioTv || isSonyLiv;
      });

      let reconstructedM3u = "";
      for (const channel of filteredChannels) {
        let { contentId, name, mpd, cookie, groupTitle, logoUrl } = channel;
        const groupLower = groupTitle.toLowerCase();
        let groupLogo = getGroupLogo(groupTitle);

        // Branding re-mapping only where explicitly requested or needed for renaming
        if (groupLower.includes("jio ⭕")) {
          // Replace both "JIO ⭕|" and "JIO ⭕" with "JioS2 "
          groupTitle = groupTitle
            .replace(/JIO\s*⭕\s*\|?/gi, "JioS2 ")
            .replace(/\s+/g, " ")
            .trim();
          groupLogo =
            "https://ik.imagekit.io/yjtx9nh9y/Jio-TV-Logo.png?updatedAt=1777823901229";
        } else if (groupLower.includes("sonyliv channel")) {
          groupTitle = "SonyLIV S2";
          groupLogo =
            "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png?updatedAt=1777812797381";
        }

        const chUA =
          channel.userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
        let finalStreamLine = mpd;

        let kodiPropsBlock = "";
        if (channel.kodiprops && channel.kodiprops.length > 0) {
          for (const prop of channel.kodiprops) {
            kodiPropsBlock += `${prop}\n`;
          }
        }
        let extraOptsBlock = "";
        if (channel.extraOpts && channel.extraOpts.length > 0) {
          for (const opt of channel.extraOpts) {
            extraOptsBlock += `${opt}\n`;
          }
        }

        reconstructedM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${logoUrl}" group-title="${groupTitle}" group-logo="${groupLogo}", ${name}\n`;
        if (kodiPropsBlock) reconstructedM3u += kodiPropsBlock;
        if (extraOptsBlock) reconstructedM3u += extraOptsBlock;

        if (chUA) reconstructedM3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
        if (cookie) reconstructedM3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
        if (channel.extHttp) reconstructedM3u += `${channel.extHttp}\n`;

        const lowerStream = finalStreamLine.toLowerCase();
        if (chUA && !lowerStream.includes("|user-agent=")) {
          finalStreamLine += `|User-Agent=${encodeURIComponent(chUA)}`;
        }
        if (cookie && !lowerStream.includes("|cookie=")) {
          finalStreamLine += `&Cookie=${encodeURIComponent(cookie)}`;
        }
        reconstructedM3u += `${finalStreamLine}\n\n`;
      }
      m3u = reconstructedM3u;
    }
  } catch (e) {
    console.error("Extra Refreshing Playlists Error", e);
  }

  return m3u + (!m3u.endsWith("\n\n") ? "\n\n" : "");
}

// Resilient Parser for standard remote M3U playlist feed
async function parseM3uUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch M3U from source. Status: ${response.status}`,
      );
    }
    const m3uText = await response.text();
    const lines = m3uText.split(/\r?\n/);

    const livechannels: any[] = [];
    let currentChannel: any = null;
    let defaultUA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
          currentChannel.cookie = line
            .replace("#EXTVLCOPT:http-cookie=", "")
            .trim();
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

// Support endpoints and helpers for Custom M3U Playlists
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = getFirestore(admin.app(), (firebaseConfig as any).firestoreDatabaseId);

const STALKER_TOKEN = "cartelstalk";

async function fetchStalkerPlaylists(): Promise<any[]> {
  try {
    const snapshot = await db.collection("stalkerPlaylists").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("Error reading stalker_playlists from Firestore", err);
    return [];
  }
}

async function fetchCustomPlaylistsChannels(): Promise<any[]> {
  const filePath = path.join(process.cwd(), "api", "custom_playlists.json");
  let playlists: any[] = [];
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      playlists = JSON.parse(content);
    }
  } catch (err) {
    console.error("Error reading custom_playlists.json", err);
  }

  const customChannels: any[] = [];

  const fetchPromises = playlists
    .filter((p) => p.enabled !== false && p.url)
    .map(async (playlist) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout
        const res = await fetch(playlist.url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.warn(
            `[Custom Playlist] Failed to fetch: ${res.status} for ${playlist.name}`,
          );
          return;
        }
        const text = await res.text();
        const parsed = parseM3uTextToChannels(
          text,
          playlist.name,
          playlist.logo || "",
        );

        parsed.forEach((ch) => {
          ch.groupTitle = playlist.name || ch.groupTitle || "Custom Streams";
          if (playlist.logo && !ch.logoUrl) {
            ch.logoUrl = playlist.logo;
          }
          customChannels.push(ch);
        });
      } catch (err) {
        console.error(
          `[Custom Playlist] Error downloading ${playlist.name}:`,
          err,
        );
      }
    });

  await Promise.all(fetchPromises);
  return customChannels;
}

async function buildCustomPlaylistsM3u(outputFormat: string): Promise<string> {
  const filePath = path.join(process.cwd(), "api", "custom_playlists.json");
  let playlists: any[] = [];
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      playlists = JSON.parse(content);
    }
  } catch (err) {
    console.error("Error reading custom_playlists.json", err);
  }

  let m3uAccumulator = "";

  const fetchPromises = playlists
    .filter((p) => p.enabled !== false && p.url)
    .map(async (playlist) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(playlist.url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.warn(`[Custom M3U] Failed to fetch: ${res.status}`);
          return;
        }
        const text = await res.text();
        const parsedChannels = parseM3uTextToChannels(
          text,
          playlist.name,
          playlist.logo || "",
        );

        let playlistM3u = "";
        for (const channel of parsedChannels) {
          const { contentId, name, mpd, cookie } = channel;
          const chUA =
            channel.userAgent ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
          const groupTitle =
            playlist.name || channel.groupTitle || "Custom Streams";
          const chLogo =
            channel.logoUrl ||
            playlist.logo ||
            "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%2520%2520Modern%2520AI%2520Logo.png?updatedAt=1780156943081";
          const groupLogoUrl =
            playlist.logo ||
            "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%2520%2520Modern%2520AI%2520Logo.png?updatedAt=1780156943081";

          let kodiPropsBlock = "";
          if (channel.kodiprops && channel.kodiprops.length > 0) {
            for (const prop of channel.kodiprops) {
              kodiPropsBlock += `${prop}\n`;
            }
          }
          let extraOptsBlock = "";
          if (channel.extraOpts && channel.extraOpts.length > 0) {
            for (const opt of channel.extraOpts) {
              extraOptsBlock += `${opt}\n`;
            }
          }

          if (outputFormat === "tivimate" || outputFormat === "universal") {
            playlistM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
            if (kodiPropsBlock) playlistM3u += kodiPropsBlock;
            if (extraOptsBlock) playlistM3u += extraOptsBlock;
            if (channel.extHttp) playlistM3u += `${channel.extHttp}\n`;
            playlistM3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
            if (cookie) playlistM3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
            playlistM3u += `${mpd}|User-Agent=${encodeURIComponent(chUA)}${cookie ? "&Cookie=" + encodeURIComponent(cookie) : ""}\n\n`;
          } else if (outputFormat === "standard-opt") {
            playlistM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
            if (kodiPropsBlock) playlistM3u += kodiPropsBlock;
            if (extraOptsBlock) playlistM3u += extraOptsBlock;
            if (channel.extHttp) playlistM3u += `${channel.extHttp}\n`;
            playlistM3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
            if (cookie) playlistM3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
            playlistM3u += `${mpd}\n\n`;
          } else {
            playlistM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
            if (kodiPropsBlock) playlistM3u += kodiPropsBlock;
            if (extraOptsBlock) playlistM3u += extraOptsBlock;
            if (channel.extHttp) playlistM3u += `${channel.extHttp}\n`;
            playlistM3u += `${mpd}${channel.userAgent ? "|User-Agent=" + encodeURIComponent(channel.userAgent) : ""}${cookie ? "&Cookie=" + encodeURIComponent(cookie) : ""}\n\n`;
          }
        }
        m3uAccumulator += playlistM3u;
      } catch (err) {
        console.error(
          `Error processing custom M3U playlist ${playlist.name}:`,
          err,
        );
      }
    });

  await Promise.all(fetchPromises);
  return m3uAccumulator;
}

// Core database loaders pulling from Jio & worker streams synchronously
async function fetchJioData(force = false) {
  const now = Date.now();
  if (!force && cacheData && now - lastFetched < CACHE_STRL_MS) {
    return cacheData;
  }

  let baseJioData: any = null;

  // Try preferred source first
  if (config.preferredSource === "m3u") {
    try {
      console.log(
        "[Source] Attempting to fetch and parse preferred M3U source...",
      );
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
      console.warn(
        "[Cache] Serving old cache as fallback database due to errors.",
      );
      return cacheData;
    }
    throw new Error(
      "Unable to sync JioTV database from either JSON or M3U endpoints",
    );
  }

  console.log("[Source] Merging multifeed scraper streams...");
  try {
    const [
      fcM3u,
      iccM3u,
      sonyM3u,
      sonyEventsM3u,
      cricM3u,
      fifaM3u,
      starM3u,
      supportM3u,
      extraM3u,
    ] = await Promise.all([
      buildFanCode(),
      buildIccTv(),
      buildSonyLiv(),
      buildSonyLivEvents(),
      buildCricHD(),
      buildFifaPlus(),
      buildStarSports(),
      buildSupport(),
      buildExtraPlaylists(),
    ]);

    const fcChannels = parseM3uTextToChannels(
      fcM3u,
      "𝗙𝗔𝗡𝗖𝗢𝗗𝗘",
      "https://ik.imagekit.io/yjtx9nh9y/vecteezy_fancode-app-icon-on-transparent-background_69146538.png",
    );
    const iccChannels = parseM3uTextToChannels(
      iccM3u,
      "I🇨🇨 TV",
      "https://ik.imagekit.io/yjtx9nh9y/62823e9932b32411608aa856.png",
    );
    const sonyChannels = parseM3uTextToChannels(
      sonyM3u,
      "SonyLIV",
      "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png",
    );
    const sonyEventsChannels = parseM3uTextToChannels(
      sonyEventsM3u,
      "SonyLiv Events",
      "https://ik.imagekit.io/yjtx9nh9y/sony-liv-logo-hd.png",
    );
    const cricChannels = parseM3uTextToChannels(
      cricM3u,
      "CricHD",
      "https://ik.imagekit.io/yjtx9nh9y/images%20(2).jpeg",
    );
    const fifaChannels = parseM3uTextToChannels(
      fifaM3u,
      "FIFA Plus",
      "https://ik.imagekit.io/yjtx9nh9y/images.png",
    );
    const starSportsChannels = parseM3uTextToChannels(
      starM3u,
      "Star Sports",
      "https://ik.imagekit.io/yjtx9nh9y/947787.jpg",
    );
    const supportChannels = parseM3uTextToChannels(
      supportM3u,
      "𝗦𝗨𝗣𝗣𝗢𝗥𝗧",
      "https://ik.imagekit.io/yjtx9nh9y/sllmnhx-telegram-6896827.svg?updatedAt=1777824421413",
    );
    const extraChannels = parseM3uTextToChannels(extraM3u, "");

    // Process original Jio channels (keep "JioS2 " prefix, filter out scraper brands to avoid mixing)
    const originalJio = baseJioData.livechannels
      .filter((ch: any) => {
        const nom = (ch.name || "").toLowerCase();
        const grp = (ch.groupTitle || "").toLowerCase();
        return (
          !nom.includes("fancode") &&
          !nom.includes("crichd") &&
          !nom.includes("icc tv") &&
          !nom.includes("sonyliv") &&
          !nom.includes("sony liv") &&
          !grp.includes("fancode") &&
          !grp.includes("crichd") &&
          !grp.includes("icc") &&
          !grp.includes("sony")
        );
      })
      .map((ch: any) => {
        const groupName = ch.groupTitle || getChannelCategory(ch.name);
        return {
          ...ch,
          groupTitle: cleanGroupTitle(groupName, true),
          logoUrl:
            ch.logoUrl ||
            `https://jiotvimages.live.jio.com/jiotv_images/${ch.contentId}_logo.png`,
        };
      });

    // Process scraper channels (DO NOT keep/add "JioS2 " prefix)
    const scraperCombined = [
      ...fcChannels,
      ...iccChannels,
      ...sonyChannels,
      ...sonyEventsChannels,
      ...cricChannels,
      ...fifaChannels,
      ...starSportsChannels,
      ...supportChannels,
      ...extraChannels,
    ].map((ch: any) => {
      const groupName = ch.groupTitle || getChannelCategory(ch.name);
      return {
        ...ch,
        groupTitle: cleanGroupTitle(groupName, false),
        logoUrl:
          ch.logoUrl ||
          `https://jiotvimages.live.jio.com/jiotv_images/${ch.contentId}_logo.png`,
      };
    });

    // Process custom channels (keep their group title as defined)
    const customChannels = await fetchCustomPlaylistsChannels();
    const customProcessed = customChannels.map((ch: any) => {
      const groupName = ch.groupTitle || "Custom Playlist";
      return {
        ...ch,
        groupTitle: cleanGroupTitle(groupName, false),
        logoUrl:
          ch.logoUrl ||
          "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%2520%2520Modern%2520AI%2520Logo.png?updatedAt=1780156943081",
      };
    });

    baseJioData.livechannels = [
      ...scraperCombined,
      ...customProcessed,
    ];
    baseJioData.updatedAt = new Date()
      .toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .replace(",", "");

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
        logoUrl:
          ch.logoUrl ||
          `https://jiotvimages.live.jio.com/jiotv_images/${ch.contentId}_logo.png`,
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
    jioSourceUrl: "https://****** [Connected (Secure Feed)]",
    jioM3uUrl: "https://****** / Protected Feed Link",
    preferredSource: config.preferredSource,
  });
});

// Update runtime config via Dashboard
router.post("/config", express.json(), (req, res) => {
  const {
    telegramUrl,
    secureToken,
    enableTokenProtection,
    enableUserAgentCheck,
    preferredSource,
  } = req.body;
  if (telegramUrl !== undefined) config.telegramUrl = telegramUrl;
  if (secureToken !== undefined) config.secureToken = secureToken;
  if (enableTokenProtection !== undefined)
    config.enableTokenProtection = enableTokenProtection;
  if (enableUserAgentCheck !== undefined)
    config.enableUserAgentCheck = enableUserAgentCheck;
  if (preferredSource !== undefined) config.preferredSource = preferredSource;

  res.json({
    success: true,
    message: "Configuration adjusted successfully",
    config: {
      telegramUrl: config.telegramUrl,
      secureToken: config.secureToken,
      enableTokenProtection: config.enableTokenProtection,
      enableUserAgentCheck: config.enableUserAgentCheck,
      lastFetchedTime: lastFetched ? new Date(lastFetched).toISOString() : null,
      jioSourceUrl: "https://****** [Connected (Secure Feed)]",
      jioM3uUrl: "https://****** / Protected Feed Link",
      preferredSource: config.preferredSource,
    },
  });
});

// Stream redirect guard
const playHandler = async (
  req: express.Request,
  res: express.Response,
): Promise<any> => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send("Missing stream URL");
  }
  return res.redirect(302, targetUrl);
};

// Main Playlist Generator Endpoint (compatible with both /api/playlist and original request url)
const playlistHandler = async (
  req: express.Request,
  res: express.Response,
): Promise<any> => {
  const outputFormat = (req.query.format as string) || "tivimate"; // "tivimate", "standard-opt", "clean"

  try {
    const jioData = await fetchJioData(true);
    if (!jioData || !jioData.livechannels) {
      return res
        .status(500)
        .send("#EXTM3U\n# Unable to fetch active IPTV database");
    }

    // 1. Gather all Scraper M3U blocks
    const [
      fancodeM3u,
      iccM3u,
      sonyM3u,
      sonyEventsM3u,
      crichdM3u,
      fifaM3u,
      starSportsM3u,
      supportM3u,
      extraM3u,
    ] = await Promise.all([
      buildFanCode(),
      buildIccTv(),
      buildSonyLiv(),
      buildSonyLivEvents(),
      buildCricHD(),
      buildFifaPlus(),
      buildStarSports(),
      buildSupport(),
      buildExtraPlaylists(),
    ]);

    const customM3u = await buildCustomPlaylistsM3u(outputFormat);
    let combinedStreams =
      fancodeM3u +
      iccM3u +
      sonyM3u +
      sonyEventsM3u +
      crichdM3u +
      fifaM3u +
      starSportsM3u +
      supportM3u +
      extraM3u +
      customM3u;

    if (!combinedStreams.includes("#EXTINF")) {
      const fallbackVideoUrl =
        "https://cartelended.vercel.app/cartelended.m3u8";
      const fallbackLogo =
        "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081";
      combinedStreams = `#EXTINF:-1 tvg-id="no-stream" tvg-name="No Live Events" tvg-logo="${fallbackLogo}" group-title="Information",No Live Events Right Now\n${fallbackVideoUrl}\n\n`;
    }

    // 2. Format JioTV channels in M3U format
    let jioM3u = "";
    const originalJioChannels = jioData.livechannels.filter((ch: any) => {
      const gTitle = ch.groupTitle || "";
      return gTitle.startsWith("JioS2 ");
    });

    for (const channel of originalJioChannels) {
      const { contentId, name, mpd, cookie } = channel;
      const chUA =
        channel.userAgent ||
        jioData.headers?.["user-agent"] ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
      const groupTitle = channel.groupTitle || getChannelCategory(name);
      const chLogo =
        channel.logoUrl ||
        `https://jiotvimages.live.jio.com/jiotv_images/${contentId}_logo.png`;
      const groupLogoUrl = getGroupLogo(groupTitle);

      // Build kodi props text block
      let kodiPropsBlock = "";
      if (channel.kodiprops && channel.kodiprops.length > 0) {
        for (const prop of channel.kodiprops) {
          kodiPropsBlock += `${prop}\n`;
        }
      }

      // Build Extra VLCOPTS block
      let extraOptsBlock = "";
      if (channel.extraOpts && channel.extraOpts.length > 0) {
        for (const opt of channel.extraOpts) {
          extraOptsBlock += `${opt}\n`;
        }
      }

      if (outputFormat === "tivimate" || outputFormat === "universal") {
        jioM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
        if (kodiPropsBlock) jioM3u += kodiPropsBlock;
        if (extraOptsBlock) jioM3u += extraOptsBlock;
        if (channel.extHttp) jioM3u += `${channel.extHttp}\n`;
        jioM3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
        if (cookie) jioM3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
        jioM3u += `${mpd}|User-Agent=${encodeURIComponent(chUA)}${cookie ? "&Cookie=" + encodeURIComponent(cookie) : ""}\n\n`;
      } else if (outputFormat === "standard-opt") {
        jioM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
        if (kodiPropsBlock) jioM3u += kodiPropsBlock;
        if (extraOptsBlock) jioM3u += extraOptsBlock;
        if (channel.extHttp) jioM3u += `${channel.extHttp}\n`;
        jioM3u += `#EXTVLCOPT:http-user-agent=${chUA}\n`;
        if (cookie) jioM3u += `#EXTVLCOPT:http-cookie=${cookie}\n`;
        jioM3u += `${mpd}\n\n`;
      } else {
        jioM3u += `#EXTINF:-1 tvg-id="${contentId}" tvg-name="${name}" tvg-logo="${chLogo}" group-title="${groupTitle}" group-logo="${groupLogoUrl}", ${name}\n`;
        if (kodiPropsBlock) jioM3u += kodiPropsBlock;
        if (extraOptsBlock) jioM3u += extraOptsBlock;
        if (channel.extHttp) jioM3u += `${channel.extHttp}\n`;
        jioM3u += `${mpd}${channel.userAgent ? "|User-Agent=" + encodeURIComponent(channel.userAgent) : ""}${cookie ? "&Cookie=" + encodeURIComponent(cookie) : ""}\n\n`;
      }
    }

    // 3. Construct total master M3U
    const author = "CARTEL 187";
    const telegram = "https://t.me/cartel187";
    const dateNow = new Date()
      .toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .replace(",", "");

    let masterM3u = `#EXTM3U x-tvg-url="https://raw.githubusercontent.com/mitthu786/mitthu786/main/jio/epg.xml.gz"\n`;
    masterM3u += `#DATE:- ${dateNow}\n`;
    masterM3u += `# Written and Directed by ✨ ${author} ✨\n`;
    masterM3u += `# Join us on Telegram: ${telegram}\n\n`;

    // Combine JioTV and Scrapers
    let totalPayload = jioM3u + combinedStreams;

    // 🛡️ URL WRAPPER LOGIC MATCHING SCRIPT EXACTLY
    let protocol = req.protocol;
    const rHost = req.get("host") || "";
    if (
      rHost.includes("run.app") ||
      rHost.includes("vercel.app") ||
      req.secure
    ) {
      protocol = "https";
    }
    const host = `${protocol}://${rHost}`;

    totalPayload = totalPayload
      .split("\n")
      .map((line) => {
        let tLine = line.trim();

        // 🚨 FIX: Skip wrapper for scraper streams and system URLs to prevent playback failure
        if (
          tLine.startsWith("http") &&
          !tLine.includes(".mpd") &&
          !tLine.includes("sony") &&
          !tLine.includes("snyliv") &&
          !tLine.includes("tgaadi") &&
          !tLine.includes("sliv") &&
          !tLine.includes("fancode") &&
          !tLine.includes("dai-fancode") &&
          !tLine.includes("crichd") &&
          !tLine.includes("zohanayaan") &&
          !tLine.includes("icc") &&
          !tLine.includes("fifa") &&
          !tLine.includes("star") &&
          !tLine.includes("cartel187") &&
          !tLine.includes("cartelended.vercel.app") &&
          !tLine.includes("cartelintro.vercel.app") &&
          !tLine.includes("xobypass=true") &&
          !tLine.includes("workers.dev") &&
          !tLine.includes("lrl45") &&
          !tLine.includes(host)
        ) {
          let baseUrl = tLine;
          let modifiers = "";

          if (tLine.includes("|")) {
            const parts = tLine.split("|");
            baseUrl = parts[0];
            modifiers = "|" + parts.slice(1).join("|");
          }

          return `${host}/play?url=${encodeURIComponent(baseUrl)}${modifiers}`;
        }
        return line;
      })
      .join("\n");

    masterM3u += totalPayload;
    masterM3u = masterM3u.replace(/\n{3,}/g, "\n\n");

    res.setHeader("Content-Type", "application/x-mpegurl; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="jiotvplus.m3u"');
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(masterM3u.trim());
  } catch (err: any) {
    console.error("[Playlist] Generation Error:", err);
    res
      .status(500)
      .send(
        `#EXTM3U\n# Error generating secured playlist: ${err.message || err}`,
      );
  }
};

// Mount endpoints
router.get("/", ipRateLimiter, handleSecurityGate, playlistHandler);
router.get("/playlist", ipRateLimiter, handleSecurityGate, playlistHandler);
router.get("/playlist.m3u", ipRateLimiter, handleSecurityGate, playlistHandler);
router.get("/jiotvplus.m3u", ipRateLimiter, handleSecurityGate, playlistHandler);
router.get("/play", ipRateLimiter, playHandler);

router.get("/custom-playlists", (req, res) => {
  const filePath = path.join(process.cwd(), "api", "custom_playlists.json");
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return res.json({ success: true, playlists: JSON.parse(content) });
    }
    return res.json({ success: true, playlists: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/custom-playlists", express.json(), (req, res) => {
  const { id, name, url, logo, enabled } = req.body;
  if (!name || !url) {
    return res
      .status(400)
      .json({ success: false, error: "Name and M3U URL are required" });
  }

  const filePath = path.join(process.cwd(), "api", "custom_playlists.json");
  let playlists: any[] = [];
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      playlists = JSON.parse(content);
    }

    if (id) {
      const index = playlists.findIndex((p) => p.id === id);
      if (index !== -1) {
        playlists[index] = {
          ...playlists[index],
          name,
          url,
          logo,
          enabled: enabled !== false,
        };
      } else {
        playlists.push({ id, name, url, logo, enabled: enabled !== false });
      }
    } else {
      const newId = "custom-" + Date.now();
      playlists.push({
        id: newId,
        name,
        url,
        logo,
        enabled: enabled !== false,
      });
    }

    fs.writeFileSync(filePath, JSON.stringify(playlists, null, 2), "utf-8");

    // Clear cache to force reload next request
    cacheData = null;
    lastFetched = 0;

    return res.json({ success: true, playlists });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/custom-playlists/:id", (req, res) => {
  const { id } = req.params;
  const filePath = path.join(process.cwd(), "api", "custom_playlists.json");
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      let playlists = JSON.parse(content);
      playlists = playlists.filter((p: any) => p.id !== id);
      fs.writeFileSync(filePath, JSON.stringify(playlists, null, 2), "utf-8");

      // Clear cache to force reload
      cacheData = null;
      lastFetched = 0;
    }
    return res.json({
      success: true,
      message: "Playlist deleted successfully",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Stalker Playlist Management
router.get("/stalker-playlists", async (req, res) => {
  try {
    const playlists = await fetchStalkerPlaylists();
    res.json({ success: true, playlists });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/stalker-playlists", express.json(), async (req, res) => {
  const { id, name, url, logo, enabled } = req.body;
  if (!name || !url) {
    return res.status(400).json({ success: false, error: "Name and M3U URL are required" });
  }

  try {
    const playlistData = { name, url, logo, enabled: enabled !== false };
    if (id) {
      await db.collection("stalkerPlaylists").doc(id).set(playlistData, { merge: true });
    } else {
      await db.collection("stalkerPlaylists").add(playlistData);
    }
    const playlists = await fetchStalkerPlaylists();
    return res.json({ success: true, playlists });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/stalker-playlists/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection("stalkerPlaylists").doc(id).delete();
    const playlists = await fetchStalkerPlaylists();
    return res.json({ success: true, message: "Stalker playlist deleted successfully", playlists });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

const stalkerExportHandler = async (req: express.Request, res: express.Response) => {
  const url = req.query.url as string;
  const token = req.query.token as string;

  if (token !== STALKER_TOKEN) {
    return res.redirect(302, config.telegramUrl);
  }

  if (!url) {
    return res.status(400).send("#EXTM3U\n# Missing URL parameter");
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    
    if (!response.ok) throw new Error("Failed to fetch source playlist");
    
    let text = await response.text();
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const host = `${protocol}://${req.get("host")}`;

    // Apply security wrapper to all URLs in the stalker playlist
    const processedLines = text.split(/\r?\n/);

    res.setHeader("Content-Type", "application/x-mpegurl");
    res.setHeader("Content-Disposition", `inline; filename="stalker_playlist.m3u"`);
    res.status(200).send(processedLines.join("\n"));
  } catch (err: any) {
    res.status(500).send(`#EXTM3U\n# Error: ${err.message}`);
  }
};

router.get("/stalker-export", stalkerExportHandler);

// Channels list (for dashboard preview, does not output secret stream keys to browser unless authorized)
router.get("/channels", async (req, res) => {
  try {
    const force = req.query.force === "true";
    const jioData = await fetchJioData(force);
    if (!jioData || !jioData.livechannels) {
      return res
        .status(404)
        .json({ success: false, error: "Jio live database unavailable" });
    }

    const cleanChannels = jioData.livechannels.map((chan: any) => ({
      contentId: chan.contentId,
      name: chan.name,
      mpd: chan.mpd,
      logo:
        chan.logoUrl ||
        `https://jiotvimages.live.jio.com/jiotv_images/${chan.contentId}_logo.png`,
      groupTitle: chan.groupTitle,
    }));

    res.json({
      success: true,
      channelsCount: cleanChannels.length,
      channels: cleanChannels,
      updatedAt: jioData.updatedAt || new Date(lastFetched).toLocaleString(),
      timeLeft: jioData.timeLeft || "N/A",
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
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
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
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("API error:", err);
    res.status(500).json({ error: "Internal security failure" });
  },
);

export default app;
