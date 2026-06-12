import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";

dotenv.config();

const router = express.Router();

// Persistent configuration storage (will fall back to environment variables or defaults)
const CONFIG_FILE = path.join(process.cwd(), "api", "config.json");
const USER_TOKENS_FILE = path.join(process.cwd(), "api", "user_tokens.json");

const config = {
  telegramUrl: process.env.MY_TELEGRAM_LINK || "https://t.me/cartel187",
  secureToken: process.env.SECURE_TOKEN || "cartel187",
  jioJsonUrl: "https://jiotvplus.dr-strange.workers.dev/watch/fetch.json",
  jioM3uUrl: "https://jiotvplus.dr-strange.workers.dev/api/jiotvplus.m3u",
  preferredSource: "m3u",
  enableTokenProtection: true,
  enableUserAgentCheck: true,
  enableIpPinning: false,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
};

// Sync loaded config values
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    Object.assign(config, fileConfig);
  } else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  }
} catch (e) {
  console.error("Error loading config.json:", e);
}

function saveConfigToFile() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving config.json:", e);
  }
}

// User Tokens database types & manager
export interface UserToken {
  telegramUsername: string;
  token: string;
  createdAt: string;
  activeIps: string[]; // Pinning up to 4 devices (IPs)
  maxDevices: number; // 4
  lastAccessedAt?: string;
  lastUserAgent?: string;
  lastLocation?: string;
}

function loadUserTokens(): UserToken[] {
  try {
    if (fs.existsSync(USER_TOKENS_FILE)) {
      const data = fs.readFileSync(USER_TOKENS_FILE, "utf-8");
      return JSON.parse(data) || [];
    }
  } catch (e) {
    console.error("Error reading user tokens file:", e);
  }
  return [];
}

function saveUserTokens(tokens: UserToken[]): void {
  try {
    fs.writeFileSync(USER_TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing user tokens file:", e);
  }
}

// IP Geolocation API helper
async function getIpLocation(ip: string): Promise<any> {
  const normIp = ip.replace(/^::ffff:/, "");
  if (normIp === "127.0.0.1" || normIp === "::1" || normIp.startsWith("192.168.") || normIp.startsWith("10.") || normIp.startsWith("172.")) {
    return { country: "Local Network", city: "Localhost", region: "Internal", isp: "Internal Network" };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${normIp}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "success") {
        return {
          country: data.country || "Unknown",
          city: data.city || "Unknown",
          region: data.regionName || "Unknown",
          isp: data.isp || "Unknown ISP"
        };
      }
    }
  } catch (e) {
    console.error("Error fetching location for IP:", normIp, e);
  }
  return { country: "Unknown", city: "Unknown", region: "Unknown", isp: "Unknown" };
}

// Real Telegram bot integration helper
async function sendTelegramAlert(message: string): Promise<boolean> {
  const botToken = config.telegramBotToken;
  const chatId = config.telegramChatId;

  if (!botToken || !chatId) {
    console.log("[Telegram] Alert triggered but botToken or chatId is not configured in settings:", message);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Telegram] API returned error status:", response.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Telegram] Network exception:", err);
    return false;
  }
}

// Helper to determine if a request comes from an allowed player
function isAllowedPlayer(userAgent: string | undefined): boolean {
  if (!userAgent) {
    // Some older or simple hardware IPTV players do not send a User-Agent header,
    // while modern web browsers ALWAYS send one. We return true here to ensure full compatibility.
    return true;
  }
  const ua = userAgent.toLowerCase();

  // 1. Explicitly Block Known Scrapers, Bots, and Coding Libraries (Always Block)
  const scraperKeywords = [
    "curl",
    "wget",
    "python",
    "node",
    "axios",
    "postman",
    "insomnia",
    "urllib",
    "java",
    "perl",
    "go-http",
    "scrapy",
    "selenium",
    "puppeteer",
    "playwright",
    "bot",
    "spider",
    "crawl",
    "headless",
    "http-client",
    "rtmpdump",
    "httpx"
  ];
  if (scraperKeywords.some((kw) => ua.includes(kw))) {
    return false;
  }

  // 2. Known IPTV Players, Media Engines, and TV Platforms (Always Allow)
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
    "playtv",
    "libvlc",
    "darplayer",
    "smarttv",
    "smart-tv",
    "webos",
    "tizen",
    "googletv",
    "firetv",
    "firestick",
    "appletv",
    "apple tv",
    "shield",
    "mibox",
    "chromecast",
    "stb",
    "mag",
    "tv",
    "box",
    "hbbtv",
    "bravia",
    "mi-box",
    "philips",
    "panasonic",
    "sharptv",
    "opera tv",
    "tcl",
    "vizio",
    "insignia",
    "hisense"
  ];
  if (playerKeywords.some((kw) => ua.includes(kw))) {
    return true;
  }

  // 3. Block Standard Desktop and Mobile Web Browsers to prevent link-scraping
  // Browser signatures contain chrome, safari, firefox, edge, opera, mozilla
  const isBrowserSignature = [
    "mozilla",
    "chrome",
    "safari",
    "firefox",
    "edge",
    "opera"
  ].some((kw) => ua.includes(kw));

  const isDesktopOrMobileOS = [
    "windows nt",
    "macintosh",
    "iphone",
    "ipad",
    "android" // Note: standard Android browser has 'android' and 'mobile', Android TV usually doesn't say 'mobile'
  ].some((kw) => ua.includes(kw));

  if (isBrowserSignature && isDesktopOrMobileOS) {
    // If it has standard browser signatures on a standard desktop/mobile OS, and didn't match any IPTV player/TV keywords above, block it!
    return false;
  }

  // Allow other/unspecified players/engines to prevent stream blockage
  return true;
}

// Extract real client IP under multiple layers of load balancers / proxies / CDNs
function getClientIp(req: express.Request): string {
  let ip = req.ip || req.socket.remoteAddress || "unknown";
  if (req.headers["x-forwarded-for"]) {
    const forwarded = req.headers["x-forwarded-for"] as string;
    ip = forwarded.split(",")[0].trim();
  }
  return ip;
}

// Compare two IPs securely, allowing subnet matching to accommodate minor mobile/cellular operator IP rotations
function compareIps(ip1: string, ip2: string): boolean {
  if (ip1 === ip2) return true;
  if (ip1 === "unknown" || ip2 === "unknown") return false;
  
  // Normalize IPv6 mapped IPv4 addresses (e.g. ::ffff:192.168.1.1)
  const norm1 = ip1.startsWith("::ffff:") ? ip1.substring(7) : ip1;
  const norm2 = ip2.startsWith("::ffff:") ? ip2.substring(7) : ip2;
  
  if (norm1 === norm2) return true;
  
  // For IP range /24 subnet comparison for cellular IP changes
  const parts1 = norm1.split(".");
  const parts2 = norm2.split(".");
  if (parts1.length === 4 && parts2.length === 4) {
    return parts1[0] === parts2[0] && parts1[1] === parts2[1] && parts1[2] === parts2[2];
  }
  
  // Handle IPv6 /64 prefix comparison
  const hex1 = norm1.split(":");
  const hex2 = norm2.split(":");
  if (hex1.length > 2 && hex2.length > 2) {
    return hex1.slice(0, 4).join(":") === hex2.slice(0, 4).join(":");
  }
  
  return false;
}

// AES-256-CBC encryption to secure play links from scraping/unauthorized downloads
const CRYPTO_KEY = crypto.scryptSync(process.env.SECURE_TOKEN || "cartel187_secure_key", "salt-cartel", 32);
const IV_LENGTH = 16;

function encryptStreamUrl(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", CRYPTO_KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  } catch (err) {
    console.error("Encryption failed:", err);
    return "b64:" + Buffer.from(text).toString("base64");
  }
}

function decryptStreamUrl(encryptedText: string): string | null {
  try {
    if (encryptedText.startsWith("b64:")) {
      return Buffer.from(encryptedText.substring(4), "base64").toString("utf8");
    }
    const parts = encryptedText.split(":");
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", CRYPTO_KEY, iv);
    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err);
    return null;
  }
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
function wrapStreamUrl(
  urlStr: string,
  host: string,
  forceEncrypt: boolean = false,
  stalkerId?: string,
  clientIp?: string
): string {
  if (!urlStr || !urlStr.startsWith("http")) return urlStr;

  let baseUrl = urlStr;
  let modifiers = "";
  if (urlStr.includes("|")) {
    const parts = urlStr.split("|");
    baseUrl = parts[0];
    modifiers = "|" + parts.slice(1).join("|");
  }

  // If forceEncrypt is requested, we strongly encrypt the stream URL with IP and token fingerprints
  if (forceEncrypt) {
    const payload = (stalkerId && clientIp)
      ? `${baseUrl}||${stalkerId}||${clientIp}`
      : stalkerId
        ? `${baseUrl}||${stalkerId}`
        : baseUrl;
    const encrypted = encryptStreamUrl(payload);
    return `${host}/play?e=${encodeURIComponent(encrypted)}${modifiers}`;
  }

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
        tvgName: "",
        mpd: "",
        cookie: "",
        kodiprops: [],
        logoUrl: defaultLogo,
        groupTitle: defaultGroup,
        groupLogo: "",
        extraOpts: [],
      };

      // tvg-id
      const idMatch = line.match(/tvg-id="([^"]*)"/);
      if (idMatch) current.contentId = idMatch[1];

      // tvg-name
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
      if (tvgNameMatch) current.tvgName = tvgNameMatch[1];

      // tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      if (logoMatch) current.logoUrl = logoMatch[1];

      // group-title
      const groupMatch = line.match(/group-title="([^"]*)"/);
      if (groupMatch) {
        current.groupTitle = groupMatch[1];
      }

      // group-logo
      const groupLogoMatch = line.match(/group-logo="([^"]*)"/);
      if (groupLogoMatch) {
        current.groupLogo = groupLogoMatch[1];
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
    enableIpPinning: config.enableIpPinning,
    lastFetchedTime: lastFetched ? new Date(lastFetched).toISOString() : null,
    jioSourceUrl: "https://****** [Connected (Secure Feed)]",
    jioM3uUrl: "https://****** / Protected Feed Link",
    preferredSource: config.preferredSource,
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId,
  });
});

// Update runtime config via Dashboard
router.post("/config", express.json(), (req, res) => {
  const {
    telegramUrl,
    secureToken,
    enableTokenProtection,
    enableUserAgentCheck,
    enableIpPinning,
    preferredSource,
    telegramBotToken,
    telegramChatId,
  } = req.body;
  if (telegramUrl !== undefined) config.telegramUrl = telegramUrl;
  if (secureToken !== undefined) config.secureToken = secureToken;
  if (enableTokenProtection !== undefined)
    config.enableTokenProtection = enableTokenProtection;
  if (enableUserAgentCheck !== undefined)
    config.enableUserAgentCheck = enableUserAgentCheck;
  if (enableIpPinning !== undefined)
    config.enableIpPinning = enableIpPinning;
  if (preferredSource !== undefined) config.preferredSource = preferredSource;
  if (telegramBotToken !== undefined) config.telegramBotToken = telegramBotToken;
  if (telegramChatId !== undefined) config.telegramChatId = telegramChatId;

  // Save to file
  saveConfigToFile();

  res.json({
    success: true,
    message: "Configuration adjusted successfully",
    config: {
      telegramUrl: config.telegramUrl,
      secureToken: config.secureToken,
      enableTokenProtection: config.enableTokenProtection,
      enableUserAgentCheck: config.enableUserAgentCheck,
      enableIpPinning: config.enableIpPinning,
      lastFetchedTime: lastFetched ? new Date(lastFetched).toISOString() : null,
      jioSourceUrl: "https://****** [Connected (Secure Feed)]",
      jioM3uUrl: "https://****** / Protected Feed Link",
      preferredSource: config.preferredSource,
      telegramBotToken: config.telegramBotToken,
      telegramChatId: config.telegramChatId,
    },
  });
});

// Stream redirect guard
const playHandler = async (
  req: express.Request,
  res: express.Response,
): Promise<any> => {
  let targetUrl = req.query.url as string;
  const encryptedUrl = req.query.e as string;

  if (encryptedUrl) {
    const decrypted = decryptStreamUrl(encryptedUrl);
    if (decrypted) {
      const parts = decrypted.split("||");
      targetUrl = parts[0];
      const stalkerId = parts[1];
      const encryptedIp = parts[2];

      if (stalkerId && config.enableIpPinning) {
        const item = stalkerCache[stalkerId];
        if (item) {
          const clientIp = getClientIp(req);
          const allowedIp = encryptedIp || item.lockedIp;
          if (allowedIp && !compareIps(clientIp, allowedIp)) {
            console.log(`[PlayGate Security] Access Denied. Requester IP ${clientIp} does not match locked IP ${allowedIp} for Stalker ID ${stalkerId}`);
            return res.status(403).send("Streaming permitted only on the device/connection that initialized this playlist");
          }
        }
      }
    } else {
      return res.status(403).send("Invalid stream signature");
    }
  }

  // Handle client-portal custom userToken device checking during active playback redirect
  const userTokenParam = req.query.userToken as string;
  if (userTokenParam && userTokenParam !== "undefined") {
    const tokens = loadUserTokens();
    const user = tokens.find(t => t.token === userTokenParam);
    if (!user) {
      return res.status(403).send("Invalid stream user token");
    }
    const clientIp = getClientIp(req);
    if (!user.activeIps.includes(clientIp)) {
      if (user.activeIps.length >= (user.maxDevices || 4)) {
        console.log(`[PlayGate] Access blocked. Max Device limit (4) reached for User: ${user.telegramUsername}`);
        return res.status(403).send("Device limit reached (max 4 devices). Stream blocked.");
      }
      user.activeIps.push(clientIp);
      saveUserTokens(tokens);
    }
  }

  if (!targetUrl) {
    return res.status(400).send("Missing stream URL");
  }

  // Check user-agent security gate if configured
  const userAgent = req.headers["user-agent"];
  if (config.enableUserAgentCheck && !isAllowedPlayer(userAgent)) {
    console.log(`[PlayGate] Blocked non-player streaming attempt. UA: ${userAgent}`);
    return res.status(403).send("Streaming permitted only on IPTV Players");
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

// Stalker Cache in-memory tracking structure
interface StalkerCacheItem {
  id: string;
  name: string;
  url: string;
  token: string;
  channelsCount: number;
  lastFetchedAt: string;
  status: "active" | "error" | "pending";
  error?: string;
  lockedIp?: string; // Pinning the IPTV player to a single IP address/subnet
}

const stalkerCache: Record<string, StalkerCacheItem> = {
  "1": { id: "1", name: "Stalker 1", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk.m3u", token: "cartelstalk1", channelsCount: 0, lastFetchedAt: "Never", status: "pending" },
  "2": { id: "2", name: "Stalker 2", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk2.m3u", token: "cartelstalk2", channelsCount: 0, lastFetchedAt: "Never", status: "pending" },
  "3": { id: "3", name: "Stalker 3", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk3.m3u", token: "cartelstalk3", channelsCount: 0, lastFetchedAt: "Never", status: "pending" },
  "4": { id: "4", name: "Stalker 4", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk4.m3u", token: "cartelstalk4", channelsCount: 0, lastFetchedAt: "Never", status: "pending" }
};

async function syncStalkerItem(id: string): Promise<StalkerCacheItem> {
  const item = stalkerCache[id];
  if (!item) throw new Error("Invalid Stalker ID");

  try {
    const res = await fetch(item.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!res.ok) {
      throw new Error(`Upstream HTTP error: ${res.status}`);
    }

    const text = await res.text();
    const channels = parseM3uTextToChannels(text, item.name);
    
    item.channelsCount = channels.length;
    item.lastFetchedAt = new Date().toLocaleTimeString("en-US", { hour12: true }) + " " + new Date().toLocaleDateString("en-US");
    item.status = "active";
    delete item.error;
  } catch (err: any) {
    item.status = "error";
    item.error = err.message || String(err);
    item.lastFetchedAt = new Date().toLocaleTimeString("en-US", { hour12: true }) + " " + new Date().toLocaleDateString("en-US");
  }

  return item;
}

// Stats and manual sync endpoints for front-end Dashboard
router.get("/stalker-stats", (req, res) => {
  res.json({ success: true, stalkers: Object.values(stalkerCache) });
});

router.post("/stalker-sync", express.json(), async (req, res) => {
  const { id } = req.body;
  try {
    const updatedUserObj = await syncStalkerItem(String(id));
    res.json({ success: true, stalker: updatedUserObj });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Stalker playlist routing handler generating secure stream proxy links
const stalkerPlaylistHandler = async (req: express.Request, res: express.Response) => {
  // Strict User-Agent Gate (Only allowed IPTV Players can download the stalker playlist)
  let userAgent = req.headers["user-agent"];
  if (req.query.ua) {
     userAgent = req.query.ua as string;
  }
  if (config.enableUserAgentCheck && !isAllowedPlayer(userAgent)) {
    console.log(
      `[Stalker Gate] Blocked non-player fetch. UA: ${userAgent}. Redirecting to Telegram.`,
    );
    return res.redirect(302, config.telegramUrl);
  }

  let id = req.params.id || "";
  console.log('[Stalker] Request incoming:', { params: req.params, path: req.path, originalUrl: req.originalUrl });
  if (id.endsWith(".m3u")) {
    id = id.substring(0, id.length - 4);
  }

  if (!id) {
    const match = req.path.match(/stalker(\d+)/i) || req.originalUrl.match(/stalker(\d+)/i);
    if (match) {
      id = match[1];
    }
  }
  console.log('[Stalker] Resolved Stalker ID:', id);

  const token = req.query.token as string;
  const item = stalkerCache[id];

  if (!item) {
    return res.status(404).send("#EXTM3U\n# Error: Stalker playlist ID not found");
  }

  if (token !== item.token) {
    return res.redirect(302, config.telegramUrl);
  }

  // IP Pinning / Sticky Session: Lock the playlist token to the requester's IP
  const clientIp = getClientIp(req);
  item.lockedIp = clientIp;
  console.log(`[Stalker Security] Token "${token}" successfully locked to IP address: ${clientIp}`);

  try {
    const response = await fetch(item.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!response.ok) {
      return res.status(502).send(`#EXTM3U\n# Error: Failed to fetch upstream M3U (status ${response.status})`);
    }

    const text = await response.text();

    // Compute our host origin dynamically
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

    // Softly parse just to keep the dashboard stats counts accurate
    try {
      const parsedChannels = parseM3uTextToChannels(text, item.name);
      item.channelsCount = parsedChannels.length;
    } catch (e) {
      console.error("Dashboard channels sync warning:", e);
    }
    item.lastFetchedAt = new Date().toLocaleTimeString("en-US", { hour12: true }) + " " + new Date().toLocaleDateString("en-US");
    item.status = "active";

    // Build secure playlist, keeping 100% of the M3U structure and details exactly "as is" from the source.
    // We only swap HTTP/HTTPS stream lines with encrypted playback URLs.
    const lines = text.split(/\r?\n/);
    const securedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed && (trimmed.startsWith("http://") || trimmed.startsWith("https://")) && !trimmed.startsWith("#")) {
        return wrapStreamUrl(trimmed, host, true, id, clientIp);
      }
      return line;
    });

    const m3u = securedLines.join("\n");

    res.setHeader("Content-Type", "application/x-mpegurl; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="stalker${id}.m3u"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(m3u.trim());
  } catch (err: any) {
    res.status(500).send(`#EXTM3U\n# Error fetching playlist: ${err.message || err}`);
  }
};

// Map routes and their file-extension aliases
router.get("/stalker/:id", stalkerPlaylistHandler);
router.get("/stalker/:id.m3u", stalkerPlaylistHandler);
router.get("/stalker1", stalkerPlaylistHandler);
router.get("/stalker2", stalkerPlaylistHandler);
router.get("/stalker3", stalkerPlaylistHandler);
router.get("/stalker4", stalkerPlaylistHandler);
router.get("/stalker1.m3u", stalkerPlaylistHandler);
router.get("/stalker2.m3u", stalkerPlaylistHandler);
router.get("/stalker3.m3u", stalkerPlaylistHandler);
router.get("/stalker4.m3u", stalkerPlaylistHandler);

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

// --- Portal Token Verification Helper ---
function getAuthTokenFromRequest(req: express.Request): string {
  const queryToken = req.query.token as string || "";
  let cookieToken = "";
  if (req.headers.cookie) {
    const parts = req.headers.cookie.split(";");
    for (const part of parts) {
      const [k, v] = part.trim().split("=");
      if (k === "auth_token") {
        cookieToken = v;
      }
    }
  }
  return queryToken || cookieToken;
}

// Check current browser bypass authentication status
router.get("/auth/status", (req, res) => {
  const token = getAuthTokenFromRequest(req);
  if (token === "cartelflag") {
    return res.json({ isAuthenticated: true, role: "admin", token });
  } else if (token === "carteltoken") {
    return res.json({ isAuthenticated: true, role: "user", token });
  }
  return res.json({ isAuthenticated: false, role: null, token: null });
});

// Logout (clear session cookie)
router.post("/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "auth_token=; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ success: true });
});

// Telegram username validation and secure custom token claims
// [REMOVED]

// Admin User Tokens Dashboard retrieval
// [REMOVED]

// Admin delete/revoke a user token
// [REMOVED]

// Admin reset active device IPs for a user token
// [REMOVED]

// Custom generated user playlist engine (M3U proxy)
// [REMOVED]

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
