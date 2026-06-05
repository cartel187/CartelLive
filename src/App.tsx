import React, { useState, useEffect } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Copy,
  Check,
  ExternalLink,
  Tv,
  Search,
  Sliders,
  Settings,
  Terminal,
  ArrowRight,
  Lock,
  Unlock,
  RefreshCw,
  Send,
  Info,
  Layers,
  Sparkles,
  Command,
  FileCode,
  CheckCircle2,
  Eye,
  EyeOff
} from "lucide-react";
import { GuardConfig, ChannelItem, ServerStats, SimulationResult, CustomPlaylist } from "./types";

export default function App() {
  // Config state
  const [config, setConfig] = useState<GuardConfig>({
    telegramUrl: "https://t.me/cartel187",
    secureToken: "cartel187",
    enableTokenProtection: true,
    enableUserAgentCheck: true,
    lastFetchedTime: null,
    jioSourceUrl: "https://****** [Connected (Secure Feed)]",
    jioM3uUrl: "https://****** / Protected Feed Link",
    preferredSource: "m3u"
  });

  // Channels & stats state
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [timeLeft, setTimeLeft] = useState<string>("N/A");
  const [lastUpdated, setLastUpdated] = useState<string>("Loading...");
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  // Settings form
  const [telegramInput, setTelegramInput] = useState(config.telegramUrl);
  const [tokenInput, setTokenInput] = useState(config.secureToken);
  const [tokenProtectionToggle, setTokenProtectionToggle] = useState(config.enableTokenProtection);
  const [uaCheckToggle, setUaCheckToggle] = useState(config.enableUserAgentCheck);
  const [ipPinningToggle, setIpPinningToggle] = useState(config.enableIpPinning || false);
  const [preferredSource, setPreferredSource] = useState(config.preferredSource || "m3u");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Filter and Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"tivimate" | "standard-opt" | "clean" | "universal">("universal");

  // Simulation state
  const [simUserAgent, setSimUserAgent] = useState("VLC/3.0.18 LibVLC/3.0.18");
  const [simToken, setSimToken] = useState(config.secureToken);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<"dashboard" | "channels" | "custom_m3u" | "simulator" | "stalker">("dashboard");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState("https://your-domain.vercel.app");

  // Stalker Portals Integration
  interface StalkerItem {
    id: string;
    name: string;
    url: string;
    token: string;
    channelsCount: number;
    lastFetchedAt: string;
    status: "active" | "error" | "pending";
    error?: string;
  }

  const [stalkers, setStalkers] = useState<StalkerItem[]>([
    { id: "1", name: "Stalker 1", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk.m3u", token: "cartelstalk1", channelsCount: 0, lastFetchedAt: "Never", status: "pending" },
    { id: "2", name: "Stalker 2", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk2.m3u", token: "cartelstalk2", channelsCount: 0, lastFetchedAt: "Never", status: "pending" },
    { id: "3", name: "Stalker 3", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk3.m3u", token: "cartelstalk3", channelsCount: 0, lastFetchedAt: "Never", status: "pending" },
    { id: "4", name: "Stalker 4", url: "https://raw.githubusercontent.com/cartel187/CartelFlag/refs/heads/main/stalk4.m3u", token: "cartelstalk4", channelsCount: 0, lastFetchedAt: "Never", status: "pending" }
  ]);
  const [loadingStalkers, setLoadingStalkers] = useState<Record<string, boolean>>({});
  const [stalkerAutoRefresh, setStalkerAutoRefresh] = useState(true);
  const [stalkerFeedbackMsg, setStalkerFeedbackMsg] = useState<string | null>(null);
  const [copiedStalkerId, setCopiedStalkerId] = useState<string | null>(null);

  const fetchStalkerStats = async () => {
    try {
      const res = await fetch("/api/stalker-stats");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stalkers) {
          setStalkers(data.stalkers);
        }
      }
    } catch (e) {
      console.error("Error loading stalker stats:", e);
    }
  };

  const syncStalker = async (id: string, silent = false) => {
    if (!silent) {
      setLoadingStalkers(prev => ({ ...prev, [id]: true }));
    }
    try {
      const res = await fetch("/api/stalker-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stalker) {
          setStalkers(prev => prev.map(s => s.id === id ? data.stalker : s));
          if (!silent) {
            setStalkerFeedbackMsg(`Stalker Portal ${id} synchronized successfully!`);
            setTimeout(() => setStalkerFeedbackMsg(null), 3000);
          }
        }
      }
    } catch (e) {
      console.error(`Sync error for stalker ${id}:`, e);
    } finally {
      if (!silent) {
        setLoadingStalkers(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  const syncAllStalkers = async () => {
    for (const s of stalkers) {
      await syncStalker(s.id, true);
    }
  };

  const handleToggleAutoRefresh = (checked: boolean) => {
    setStalkerAutoRefresh(checked);
    localStorage.setItem("stalkerAutoRefresh", String(checked));
  };

  // Keep stats updated, with automatic loading and 1 hour refresh intervals
  useEffect(() => {
    fetchStalkerStats();

    const savedAuto = localStorage.getItem("stalkerAutoRefresh");
    if (savedAuto !== null) {
      setStalkerAutoRefresh(savedAuto === "true");
    }
  }, []);

  useEffect(() => {
    if (!stalkerAutoRefresh) return;
    const interval = setInterval(() => {
      console.log("Triggering auto-refresh for Stalker Portals (1 Hour interval)...");
      syncAllStalkers();
    }, 3600000); // 1 Hour
    return () => clearInterval(interval);
  }, [stalkerAutoRefresh, stalkers]);

  // Custom M3U Playlists states
  const [customPlaylists, setCustomPlaylists] = useState<CustomPlaylist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistUrl, setNewPlaylistUrl] = useState("");
  const [newPlaylistLogo, setNewPlaylistLogo] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [addingPlaylist, setAddingPlaylist] = useState(false);
  const [playlistSuccessMessage, setPlaylistSuccessMessage] = useState<string | null>(null);

  // Visibility toggles for security inputs
  const [showToken, setShowToken] = useState(false);

  const fetchCustomPlaylists = async () => {
    setLoadingPlaylists(true);
    setPlaylistsError(null);
    try {
      const response = await fetch("/api/custom-playlists");
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCustomPlaylists(data.playlists || []);
        } else {
          setPlaylistsError(data.error || "Failed to load custom playlists");
        }
      } else {
        setPlaylistsError(`Server returned status ${response.status}`);
      }
    } catch (e: any) {
      setPlaylistsError(e.message || "Network error loading custom playlists");
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleSavePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || !newPlaylistUrl.trim()) {
      setPlaylistsError("Name and M3U URL are required.");
      return;
    }
    setAddingPlaylist(true);
    setPlaylistsError(null);
    try {
      const body: any = {
        name: newPlaylistName.trim(),
        url: newPlaylistUrl.trim(),
        logo: newPlaylistLogo.trim() || undefined
      };
      if (editingPlaylistId) {
        body.id = editingPlaylistId;
      }
      const response = await fetch("/api/custom-playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCustomPlaylists(data.playlists || []);
          setNewPlaylistName("");
          setNewPlaylistUrl("");
          setNewPlaylistLogo("");
          setEditingPlaylistId(null);
          setPlaylistSuccessMessage(editingPlaylistId ? "Playlist updated successfully!" : "Playlist added successfully!");
          setTimeout(() => setPlaylistSuccessMessage(null), 3500);
          fetchChannels(); // Refresh channel database preview list!
        } else {
          setPlaylistsError(data.error || "Failed to save custom playlist");
        }
      } else {
        setPlaylistsError(`Server returned status ${response.status}`);
      }
    } catch (e: any) {
      setPlaylistsError(e.message || "Network error saving playlist");
    } finally {
      setAddingPlaylist(false);
    }
  };

  const handleDeletePlaylist = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this playlist?")) return;
    setPlaylistsError(null);
    try {
      const response = await fetch(`/api/custom-playlists/${id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCustomPlaylists(prev => prev.filter(p => p.id !== id));
          setPlaylistSuccessMessage("Playlist deleted successfully.");
          setTimeout(() => setPlaylistSuccessMessage(null), 3000);
          fetchChannels(); // Refresh channel list preview!
        } else {
          setPlaylistsError(data.error || "Failed to delete custom playlist");
        }
      } else {
        setPlaylistsError(`Server returned status ${response.status}`);
      }
    } catch (e: any) {
      setPlaylistsError(e.message || "Network error deleting playlist");
    }
  };

  const startEditPlaylist = (p: CustomPlaylist) => {
    setEditingPlaylistId(p.id || null);
    setNewPlaylistName(p.name);
    setNewPlaylistUrl(p.url);
    setNewPlaylistLogo(p.logo || "");
  };

  const cancelEditPlaylist = () => {
    setEditingPlaylistId(null);
    setNewPlaylistName("");
    setNewPlaylistUrl("");
    setNewPlaylistLogo("");
  };

  // Code visualizer Tab details removed

  // Fetch current backend configuration
  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setTelegramInput(data.telegramUrl);
        setTokenInput(data.secureToken);
        setTokenProtectionToggle(data.enableTokenProtection);
        setUaCheckToggle(data.enableUserAgentCheck);
        setIpPinningToggle(data.enableIpPinning || false);
        if (data.preferredSource) setPreferredSource(data.preferredSource);
        setSimToken(data.secureToken);
      }
    } catch (e) {
      console.warn("Could not load backend config directly, using simulation/default mode.");
    }
  };

  // Fetch live channel listing from Backend API
  const fetchChannels = async (force: boolean = false) => {
    setLoadingChannels(true);
    setChannelsError(null);
    try {
      const url = force ? "/api/channels?force=true" : "/api/channels";
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setChannels(data.channels || []);
          setTimeLeft(data.timeLeft || "N/A");
          setLastUpdated(data.updatedAt || "Just now");
        } else {
          setChannelsError(data.error || "Failed to parse channel database");
        }
      } else {
        setChannelsError(`API error code ${response.status}`);
      }
    } catch (e: any) {
      setChannelsError(e.message || "Failed to make HTTP connection to API");
    } finally {
      setLoadingChannels(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchChannels();
    fetchCustomPlaylists();
    
    // Auto-fetch every 1 hour (3600000 ms)
    const interval = setInterval(() => {
      console.log("Auto-fetching channels...");
      fetchChannels(true);
    }, 3600000);

    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }

    return () => clearInterval(interval);
  }, []);

  // Handle saving configurations to server
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUrl: telegramInput,
          secureToken: tokenInput,
          enableTokenProtection: tokenProtectionToggle,
          enableUserAgentCheck: uaCheckToggle,
          enableIpPinning: ipPinningToggle,
          preferredSource: preferredSource
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to update server configuration", err);
    } finally {
      setSavingSettings(false);
    }
  };

  // Safe M3U URLs based on dynamic settings
  const generatedM3uPath = `/api?token=${config.secureToken}&format=${selectedFormat}`;
  const absoluteM3uUrl = `${currentOrigin}${generatedM3uPath}`;
  const unsecureM3uUrl = `${currentOrigin}/api`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };



  // Run a real-time Security check simulator
  const runSimulation = () => {
    setSimulating(true);
    setTimeout(() => {
      const isBrowserUA = () => {
        const ua = simUserAgent.toLowerCase();
        const browserKeywords = ["mozilla", "chrome", "safari", "edge", "firefox", "opera"];
        const playerKeywords = [
          "tivimate", "ott", "navigator", "kodi", "vlc", "perfectplayer", 
          "iptv", "exoplayer", "gstreamer", "potplayer", "mxplayer", "okhttp"
        ];
        const hasBrowser = browserKeywords.some(kw => ua.includes(kw));
        const hasPlayer = playerKeywords.some(kw => ua.includes(kw));
        return hasBrowser && !hasPlayer;
      };

      let status = 200;
      let action: "REDIRECTED" | "SERVED_M3U" | "FORBIDDEN" = "SERVED_M3U";
      let targetUrl = absoluteM3uUrl;
      let details = "";
      let rawHeader = `HTTP/1.1 200 OK\nContent-Type: application/x-mpegurl; charset=utf-8\nCache-Control: no-cache\nContent-Disposition: attachment; filename="jiotvplus.m3u"`;

      if (config.enableUserAgentCheck && isBrowserUA()) {
        status = 302;
        action = "REDIRECTED";
        targetUrl = config.telegramUrl;
        rawHeader = `HTTP/1.1 302 Found\nLocation: ${config.telegramUrl}\nContent-Type: text/html\nConnection: keep-alive`;
        details = `🛡️ BROWSER DETECTED!\nSince the client User-Agent "${simUserAgent}" looks like standard device browsers, the secure gate immediately triggered a 302 Redirect to your Telegram channel to intercept stream scraping.`;
      } else if (config.enableTokenProtection && simToken !== config.secureToken) {
        status = 302;
        action = "FORBIDDEN";
        targetUrl = config.telegramUrl;
        rawHeader = `HTTP/1.1 302 Found\nLocation: ${config.telegramUrl}\nContent-Type: text/html\nConnection: keep-alive`;
        details = `🔑 INVALID TOKEN!\nThe required query parameter token did not match your master token ("${config.secureToken || 'N/A'}"). The request is locked and forwarded to your Telegram link to convert casual crawlers into actual subscribers.`;
      } else {
        details = `✅ SUCCESS!\nThe client connected with a recognized IPTV agent / media player engine and provided the correct token signature. The M3U compilation was generated successfully containing ${channels.length || "all active JioTV"} live channels on the fly.`;
      }

      setSimulationResult({
        userAgent: simUserAgent,
        providedToken: simToken,
        status,
        action,
        targetUrl,
        details,
        rawResponseHeader: rawHeader,
        playlistSnippet: action === "SERVED_M3U" ? 
`#EXTM3U x-tvg-url="..."
# PLAYLIST SECURED & POWERED BY CARTEL SECURITY SYSTEMS
#EXTINF:-1 tvg-id="301229" tvg-name="Star Sports 2 HD" group-title="Sports", Star Sports 2 HD
${channels[0]?.mpd || "https://jiotvpllive.cdn.jio.com/bpk-tv/..."}|User-Agent=...&Cookie=...` : undefined
      });
      setSimulating(false);
    }, 600);
  };

  // Vercel deployment code structures helper
  const codeFiles = {
    "vercel.json": `{
  "version": 2,
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}`,
    api_playlist: `// api/index.js - Put this in your Vercel project "/api/index.js"
// Standard Node.js Express server configured as a single Vercel serverless function.

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

// Configure your variables directly here or set them dynamically in Vercel Dashboard!
const CONFIG = {
  telegramUrl: process.env.MY_TELEGRAM_LINK || "${telegramInput}",
  secureToken: process.env.SECURE_TOKEN || "${tokenInput}",
  jioJsonUrl: "https://****** [Connected (Secure Feed)]",
  enableTokenCheck: ${tokenProtectionToggle},
  enableUserAgentCheck: ${uaCheckToggle}
};

// Detect typical client browser agents
function isBrowser(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  
  const browserKeywords = ["mozilla", "chrome", "safari", "edge", "firefox", "opera", "macintosh", "windows nt"];
  const playerKeywords = ["tivimate", "ott", "navigator", "kodi", "vlc", "perfectplayer", "iptv", "exoplayer", "okhttp"];
  
  const hasBrowser = browserKeywords.some(kw => ua.includes(kw));
  const hasPlayer = playerKeywords.some(kw => ua.includes(kw));
  
  return hasBrowser && !hasPlayer;
}

// Security Gate Middleware
const securityGate = (req, res, next) => {
  const userAgent = req.headers["user-agent"];
  const token = req.query.token || req.query.key;
  
  // 1. Browser check
  if (CONFIG.enableUserAgentCheck && isBrowser(userAgent)) {
    console.log("Blocked browser copy-paste. Redirecting to Telegram:", CONFIG.telegramUrl);
    return res.redirect(302, CONFIG.telegramUrl);
  }
  
  // 2. Secret Key/Token check
  if (CONFIG.enableTokenCheck && CONFIG.secureToken) {
    if (token !== CONFIG.secureToken) {
      console.log("Blocked invalid token:", token, "Redirecting.");
      return res.redirect(302, CONFIG.telegramUrl);
    }
  }
  
  next();
};

// Cache storage to stay within Vercel rate-limit guidelines
let cache = { data: null, lastFetched: 0 };
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 mins

async function fetchJioDatabase() {
  const now = Date.now();
  if (cache.data && (now - cache.lastFetched < CACHE_EXPIRY)) {
    return cache.data;
  }
  
  const response = await fetch(CONFIG.jioJsonUrl);
  if (!response.ok) throw new Error("Could not fetch remote JioTV database");
  
  const json = await response.json();
  if (json && json.success && json.data) {
    cache.data = json.data;
    cache.lastFetched = now;
    return json.data;
  }
  throw new Error("Invalid response schema from worker");
}

// Helper to determine group name with the "JioS2 " prefix dynamically
function getChannelGroup(name) {
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
  return baseGroup;
}

// Core M3U compiler route
app.get("/api", securityGate, async (req, res) => {
  const outputFormat = req.query.format || "tivimate";
  
  try {
    const data = await fetchJioDatabase();
    const channels = data.livechannels || [];
    const jioUA = data.headers?.["user-agent"] || "Mozilla/5.0";
    
    let m3u = "#EXTM3U x-tvg-url=\\"https://raw.githubusercontent.com/mitthu786/mitthu786/main/jio/epg.xml.gz\\"\\n";
    m3u += "# PLAYLIST SECURED & POWERED BY CARTEL SECURITY\\n";
    m3u += "# Join Telegram: " + CONFIG.telegramUrl + "\\n\\n";
    
    for (const chan of channels) {
      const { contentId, name, mpd, cookie } = chan;
      const logoUrl = "https://jiotvimages.live.jio.com/jiotv_images/" + contentId + "_logo.png";
      const grp = getChannelGroup(name);
      
      const gLogo = "https://ik.imagekit.io/yjtx9nh9y/images%20(1).png?updatedAt=1780150309275";
      if (outputFormat === "tivimate") {
        m3u += "#EXTINF:-1 tvg-id=\\"" + contentId + "\\" tvg-name=\\"" + name + "\\" tvg-logo=\\"" + logoUrl + "\\" group-title=\\"" + grp + "\\" group-logo=\\"" + gLogo + "\\", " + name + "\\n";
        m3u += "#EXTVLCOPT:http-user-agent=" + jioUA + "\\n";
        m3u += "#EXTVLCOPT:http-cookie=" + cookie + "\\n";
        m3u += mpd + "|User-Agent=" + encodeURIComponent(jioUA) + "&Cookie=" + encodeURIComponent(cookie) + "\\n\\n";
      } else {
        m3u += "#EXTINF:-1 tvg-id=\\"" + contentId + "\\" tvg-name=\\"" + name + "\\" tvg-logo=\\"" + logoUrl + "\\" group-title=\\"" + grp + "\\" group-logo=\\"" + gLogo + "\\", " + name + "\\n";
        m3u += mpd + "\\n\\n";
      }
    }
    
    res.setHeader("Content-Type", "application/x-mpegurl; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="secured.m3u"');
    res.send(m3u);
  } catch (err) {
    res.status(500).send("#EXTM3U\\n# Vercel Generation error: " + err.message);
  }
});

// Backward compatible aliases
app.get("/api/playlist", securityGate, (req, res) => {
  res.redirect(307, "/api?" + (req.url.split("?")[1] || ""));
});
app.get("/api/jiotvplus.m3u", securityGate, (req, res) => {
  res.redirect(307, "/api?" + (req.url.split("?")[1] || ""));
});

// Fast JSON stats preview for client (optional)
app.get("/api/channels", async (req, res) => {
  try {
    const data = await fetchJioDatabase();
    res.json({ success: true, count: data.livechannels?.length || 0, updatedAt: data.updatedAt });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Listen server only in local development
if (process.env.NODE_ENV !== "production") {
  app.listen(3002, () => console.log("Dev helper server running on port 3002"));
}

module.exports = app;`,
    "package.json": `{
  "name": "cartel-iptv-guard",
  "version": "1.0.0",
  "description": "Secure Vercel-ready IPTV M3U Playlist Proxy wrapper",
  "main": "api/index.js",
  "scripts": {
    "start": "node api/index.js"
  },
  "dependencies": {
    "express": "^4.21.2",
    "cors": "^4.0.0"
  }
}`,
    readme: `# CARTEL IPTV PLAYLIST GUARD
Quickly deploy this ultra-secure IPTV compiler directly on Vercel:

## One-Click Deployment:
1. Put these files in a clean GitHub repository:
   - \`vercel.json\`
   - \`api/index.js\` (contains Express routes)
   - \`package.json\` (dependencies)
2. Log in to Vercel (https://vercel.com) and click **Add New** -> **Project**.
3. Import your GitHub repository.
4. Click **Environment Variables** in the Vercel dashboard and configure:
   - \`MY_TELEGRAM_LINK\` = your Telegram URL, such as \`${telegramInput}\`
   - \`SECURE_TOKEN\` = your password, such as \`${tokenInput}\`
5. Click **Deploy**!

## Usage:
Load your personalized URL in any player (TiviMate, Kodi, Apple TV, VLC):
\`https://your-vercel-domain.vercel.app/api?token=${tokenInput}&format=tivimate\`

*Standard web browsers visited from desktop or mobiles will instantly be sent straight to your Telegram channel!*`
  };

  const activeCodeContent = "";

  // Calculated categories from live channel feed dynamically
  const dynamicGroups = Array.from(new Set(channels.map((c: any) => c.groupTitle || getChannelGroup(c.name)))).filter(Boolean);
  const categories = ["All Stations", ...dynamicGroups.sort()];
  const [selectedCategory, setSelectedCategory] = useState("All Stations");

  const getChannelGroup = (name: string): string => {
    const nom = name.toLowerCase();
    if (nom.includes("sports") || nom.includes("khel")) return "Sports";
    if (nom.includes("gold") || nom.includes("movies") || nom.includes("cinema") || nom.includes("picture")) return "Movies";
    if (nom.includes("disney") || nom.includes("junior") || nom.includes("hungama")) return "Kids";
    if (nom.includes("news") || nom.includes("samachar")) return "News";
    return "Entertainment";
  };

  const filteredChannels = channels.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.contentId.includes(searchTerm);
    const group = c.groupTitle || getChannelGroup(c.name);
    if (selectedCategory === "All Stations") return matchesSearch;
    return matchesSearch && group === selectedCategory;
  });

  return (
    <div id="iptv_app" className="min-h-screen bg-[#07090e] text-slate-100 font-sans relative overflow-hidden selection:bg-purple-900 selection:text-purple-100">
      
      {/* Visual background atmospheric elements */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-950/20 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] bg-blue-950/15 rounded-full blur-[140px] pointer-events-none"></div>
      
      {/* Header Bar */}
      <header id="app_header" className="sticky top-0 z-50 backdrop-blur-md bg-[#07090e]/85 border-b border-slate-900/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-transparent rounded-xl overflow-hidden shadow-lg shadow-purple-900/10 ring-1 ring-purple-500/20">
            <img src="https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%20Neon%20%20Modern%20AI%20Logo.png?updatedAt=1780156943081" alt="Logo" className="w-8 h-8 object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">ＣΛＲＴΞＬ</h1>
            <p className="text-[10px] font-mono tracking-wider text-purple-400 font-bold">BY CARTEL DEV LABS</p>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="hidden md:flex bg-[#0f121d] border border-slate-900 rounded-xl p-1 gap-1">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={`cursor-pointer px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${activeTab === "dashboard" ? "bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-white shadow-md shadow-black/40 border border-purple-500/10" : "text-slate-400 hover:text-white"}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab("channels")}
            className={`cursor-pointer px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${activeTab === "channels" ? "bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-white shadow-md shadow-black/40 border border-purple-500/10" : "text-slate-400 hover:text-white"}`}
          >
            Active Channels ({channels.length})
          </button>
          <button 
            onClick={() => setActiveTab("custom_m3u")}
            className={`cursor-pointer px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${activeTab === "custom_m3u" ? "bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-white shadow-md shadow-black/40 border border-purple-500/10" : "text-slate-400 hover:text-white"}`}
          >
            Custom M3U ({customPlaylists.length})
          </button>
          <button 
            onClick={() => setActiveTab("stalker")}
            className={`cursor-pointer px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${activeTab === "stalker" ? "bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-white shadow-md shadow-black/40 border border-purple-500/10" : "text-slate-400 hover:text-white"}`}
          >
            Stalker Portal
          </button>
          <button 
            onClick={() => setActiveTab("simulator")}
            className={`cursor-pointer px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${activeTab === "simulator" ? "bg-gradient-to-r from-purple-900/80 to-indigo-900/80 text-white shadow-md shadow-black/40 border border-purple-500/10" : "text-slate-400 hover:text-white"}`}
          >
            Security Gate Simulator
          </button>
        </nav>
        
        {/* Connection status badge */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] sm:text-xs font-mono font-medium text-emerald-400/95">SHIELD POWERED</span>
        </div>
      </header>

      {/* Main Grid Wrapper */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-10 grid grid-cols-1 gap-8 relative z-10">
        
        {/* Banner with essential facts */}
        <div className="bg-gradient-to-b from-[#0e1222]/90 to-[#0b0c16]/95 border border-slate-900 p-6 md:p-8 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative shadow-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-3xl pointer-events-none"></div>
          <div>
            <div className="flex items-center gap-2 text-xs text-purple-400 font-bold tracking-wider uppercase mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>DYNAMIC STREAM CLONER & GUARD</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-tight">Secure & Distribute JioTV Streams</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-xl leading-relaxed">
              This system intercepts ordinary browsers, sending viewers instantly to your custom Telegram channel (<span className="text-purple-300 font-semibold font-mono">@{telegramInput.split("/").pop()}</span>). Concurrently, authorized IPTV clients are seamlessly provisioned with fresh generated tokens.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#08090f] p-4 rounded-xl border border-slate-900/70 shrink-0">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center bg-indigo-900/30 border border-indigo-500/20 text-indigo-400 rounded-lg shrink-0">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                  ACTIVE FEED STATUS
                  {loadingChannels && <RefreshCw className="w-2.5 h-2.5 animate-spin text-purple-400" />}
                </div>
                <div className="text-sm font-semibold text-white tracking-tight">Active: {channels.length} Channels</div>
                <div className="text-[10px] text-slate-400 font-mono">Synced: {lastUpdated}</div>
              </div>
            </div>
            <button
              onClick={() => fetchChannels(true)}
              disabled={loadingChannels}
              className="cursor-pointer bg-[#131627] hover:bg-purple-600/20 text-purple-400 hover:text-purple-300 px-3 py-2 rounded-lg border border-purple-500/10 transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
            >
              <RefreshCw className={`w-3 h-3 ${loadingChannels ? "animate-spin" : ""}`} />
              {loadingChannels ? "Refreshing..." : "Force Refresh"}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        <div className="flex md:hidden bg-[#0d0f19] border border-slate-900 p-1.5 rounded-xl justify-stretch text-center gap-1">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={`cursor-pointer flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${activeTab === "dashboard" ? "bg-gradient-to-r from-purple-900 to-indigo-900 text-white" : "text-slate-400"}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab("channels")}
            className={`cursor-pointer flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${activeTab === "channels" ? "bg-gradient-to-r from-purple-900 to-indigo-900 text-white" : "text-slate-400"}`}
          >
            Channels
          </button>
          <button 
            onClick={() => setActiveTab("custom_m3u")}
            className={`cursor-pointer flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${activeTab === "custom_m3u" ? "bg-gradient-to-r from-purple-900 to-indigo-900 text-white" : "text-slate-400"}`}
          >
            Custom M3U
          </button>
          <button 
            onClick={() => setActiveTab("stalker")}
            className={`cursor-pointer flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${activeTab === "stalker" ? "bg-gradient-to-r from-purple-900 to-indigo-900 text-white" : "text-slate-400"}`}
          >
            Stalker
          </button>
          <button 
            onClick={() => setActiveTab("simulator")}
            className={`cursor-pointer flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${activeTab === "simulator" ? "bg-gradient-to-r from-purple-900 to-indigo-900 text-white" : "text-slate-400"}`}
          >
            Simulator
          </button>
        </div>

        {/* Dynamic Display Area based on tabs */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Column Left: Guard Configurator */}
            <div className="lg:col-span-7 flex flex-col gap-8">
              
              {/* Form card */}
              <div className="bg-[#0b0d18] border border-slate-900 rounded-2xl p-6 relative">
                <div className="flex items-center gap-2 mb-6">
                  <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                  <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Defense Policy Configuration</h3>
                </div>

                <form onSubmit={handleSaveSettings} className="flex flex-col gap-5">
                  
                  {/* Telegram URL Field */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-slate-300 font-medium">Telegram Channel Link (Browser Redirect Target)</label>
                    <div className="relative">
                      <input 
                        type="url" 
                        value={telegramInput} 
                        onChange={(e) => setTelegramInput(e.target.value)}
                        placeholder="https://t.me/cartel187"
                        required
                        className="w-full bg-[#08090f] border border-slate-900 hover:border-slate-800 focus:border-purple-600 outline-none text-slate-100 rounded-xl px-4 py-3 text-xs font-medium font-mono transition-all"
                      />
                      <span className="absolute right-4 top-3 text-[10px] text-slate-500 font-mono uppercase bg-[#111322] px-2 py-0.5 rounded border border-slate-800">TARGET</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      Anyone pasting the playlist subscription path inside Safari, Chrome, Edge or other browsers is immediately redirected here.
                    </p>
                  </div>

                  {/* Secret Token Field */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-slate-300 font-medium">Security Access Key/Token</label>
                    <div className="relative flex items-center">
                      <input 
                        type={showToken ? "text" : "password"} 
                        value={tokenInput} 
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="e.g. cartel-vip"
                        required
                        className="w-full bg-[#08090f] border border-slate-900 hover:border-slate-800 focus:border-purple-600 outline-none text-slate-100 rounded-xl pl-4 pr-24 py-3 text-xs font-semibold font-mono transition-all"
                      />
                      <div className="absolute right-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="cursor-pointer text-slate-500 hover:text-slate-300 p-1 rounded transition-colors"
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono uppercase bg-[#111322] px-2 py-0.5 rounded border border-slate-800">TOKEN</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      Restricts third parties who know your domain from downloading your playlist. Append <span className="text-purple-400 font-semibold font-mono">?token={tokenInput || "XYZ"}</span> to the IPTV subscription client.
                    </p>
                  </div>

                  {/* Advanced Multi Toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                    
                    {/* UA Protection Toggle */}
                    <div className="flex items-start gap-3 bg-[#080a11] border border-slate-900/60 p-4 rounded-xl">
                      <input 
                        type="checkbox"
                        id="ua_toggle"
                        checked={uaCheckToggle}
                        onChange={(e) => setUaCheckToggle(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 bg-black border-slate-800 focus:ring-purple-600 focus:ring-offset-black mt-0.5"
                      />
                      <div className="flex flex-col">
                        <label htmlFor="ua_toggle" className="text-xs font-semibold text-slate-200 cursor-pointer">Block Web Browsers</label>
                        <span className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Redirect Chrome, Safari, Edge requestors.</span>
                      </div>
                    </div>

                    {/* Token Protection Toggle */}
                    <div className="flex items-start gap-3 bg-[#080a11] border border-slate-900/60 p-4 rounded-xl">
                      <input 
                        type="checkbox"
                        id="token_toggle"
                        checked={tokenProtectionToggle}
                        onChange={(e) => setTokenProtectionToggle(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 bg-black border-slate-800 focus:ring-purple-600 focus:ring-offset-black mt-0.5"
                      />
                      <div className="flex flex-col">
                        <label htmlFor="token_toggle" className="text-xs font-semibold text-slate-200 cursor-pointer">Enforce Access Key</label>
                        <span className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Require your security token in parameters.</span>
                      </div>
                    </div>

                    {/* IP Pinning Toggle */}
                    <div className="flex items-start gap-3 bg-[#080a11] border border-slate-900/60 p-4 rounded-xl" id="div_ip_pinning">
                      <input 
                        type="checkbox"
                        id="ip_pinning_toggle"
                        checked={ipPinningToggle}
                        onChange={(e) => setIpPinningToggle(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 bg-black border-slate-800 focus:ring-purple-600 focus:ring-offset-black mt-0.5"
                      />
                      <div className="flex flex-col">
                        <label htmlFor="ip_pinning_toggle" className="text-xs font-semibold text-slate-200 cursor-pointer">Sticky IP Lock</label>
                        <span className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Force stream playback to match playlist requester's IP.</span>
                      </div>
                    </div>

                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center justify-between gap-4 border-t border-slate-900/80 pt-4 mt-2">
                    <div className="min-h-5 flex items-center">
                      {settingsSuccess && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Settings locked and deployed!</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="cursor-pointer bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0"
                    >
                      {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      <span>Save Guard Policy</span>
                    </button>
                  </div>

                </form>
              </div>

              {/* Secure link Generator Panel */}
              <div className="bg-[#0b0d18] border border-slate-900 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-semibold text-white tracking-wide uppercase">Secret IPTV Player Link</h3>
                  </div>
                  
                  {/* Format Selector */}
                  <select
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value as any)}
                    className="bg-[#08090f] border border-slate-900 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-300 outline-none hover:border-slate-800"
                  >
                    <option value="universal">Format: Universal</option>
                    <option value="tivimate">Format: TiviMate Enhanced</option>
                    <option value="standard-opt">Format: VLC Standard</option>
                    <option value="clean">Format: Raw Stream Link</option>
                  </select>
                </div>

                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Provide this URL inside TiviMate, OTT Navigator, perfect player or VLC. The stream tokens will rebuild dynamically.
                </p>

                {/* Main URL box */}
                <div className="bg-[#07080d] border border-slate-900 rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3 bg-[#0a0c14] border border-slate-900/60 px-3 py-2.5 rounded-lg">
                    <span className="text-slate-300 font-mono text-[11px] truncate select-all">{absoluteM3uUrl}</span>
                    <button
                      onClick={() => copyToClipboard(absoluteM3uUrl)}
                      className="cursor-pointer bg-[#131627] hover:bg-[#1a1f38] text-purple-400 p-2 rounded-lg border border-purple-500/10 transition-all shrink-0"
                      title="Copy Playlist link"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  
                  {/* Warning regarding protection toggle */}
                  <div className="flex items-start gap-2 text-[10px] text-slate-500 mt-1">
                    <Info className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                    <span>
                      Copy pasting this link directly inside Safari/Chrome will trigger the browser barrier, automatically bouncing requests over to <span className="text-purple-300">{telegramInput}</span>. Try testing simulator!
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Column Right: Informational / Specs Card */}
            <div className="lg:col-span-5 flex flex-col gap-8">
              
              {/* Shield Protection Status */}
              <div className="bg-[#0b0d18] border border-slate-900 p-6 rounded-2xl flex flex-col gap-6 relative shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-white tracking-wide uppercase">Shield Health System</div>
                  <span className="text-[10px] font-mono text-purple-400 uppercase font-bold bg-[#141527] border border-purple-500/10 px-2 py-0.5 rounded">Active</span>
                </div>

                <div className="flex flex-col gap-4">
                  
                  {/* Item 1 */}
                  <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <span className="text-xs text-slate-300 font-semibold">User-Agent filter</span>
                    </div>
                    <span className="text-xs font-mono font-medium text-emerald-400">{config.enableUserAgentCheck ? "ENFORCED" : "DISABLED"}</span>
                  </div>

                  {/* Item 2 */}
                  <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-[#17182e]/50 border border-purple-500/10 text-purple-400 rounded-lg">
                        <Lock className="w-4 h-4" />
                      </div>
                      <span className="text-xs text-slate-300 font-semibold">Token credentials</span>
                    </div>
                    <span className="text-xs font-mono font-medium text-purple-400">{config.enableTokenProtection ? "REQUIRED" : "SKIP-VERIFY"}</span>
                  </div>

                  {/* Item 3 */}
                  <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <span className="text-xs text-slate-300 font-semibold">M3U update rate</span>
                    </div>
                    <span className="text-xs font-mono font-medium text-indigo-400">EVERY INGRESS FETCH</span>
                  </div>

                  {/* Item 4 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg">
                        <Tv className="w-4 h-4" />
                      </div>
                      <span className="text-xs text-slate-300 font-semibold">EPG Integration</span>
                    </div>
                    <span className="text-xs font-mono font-medium text-yellow-400">ONLINE</span>
                  </div>

                </div>

                <div className="bg-[#07090e] border border-slate-900/60 rounded-xl p-4 flex flex-col gap-1.5 font-mono text-[10px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Source endpoint:</span>
                    <span className="text-emerald-400 text-right truncate max-w-[160px]">Connected (Secure Feed)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target redirects:</span>
                    <span className="text-purple-400 truncate max-w-[160px]">{config.telegramUrl}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active database sync:</span>
                    <span className="text-slate-300">{lastUpdated.split(" ")[0] || "Synced"}</span>
                  </div>
                </div>

                {/* Simulated traffic logs */}
                <div className="border border-slate-900/80 rounded-xl p-3.5 bg-[#08090f] flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase tracking-wide">
                    <span>Telemetry Monitor</span>
                    <span className="text-slate-500">Live</span>
                  </div>
                  <div className="font-mono text-[9px] text-slate-400 leading-relaxed flex flex-col gap-1">
                    <span className="text-emerald-400">▸ [03:36:12] Synchronization succeeded from Secure database connection</span>
                    <span className="text-purple-400">▸ [03:36:58] Redirection completed correctly to {telegramInput}</span>
                    <span className="text-indigo-400">▸ [03:37:14] VLC Client fetched playlist. 47 Channels generated dynamically.</span>
                  </div>
                </div>
              </div>

              {/* Telegram 引流看板 */}
              <div className="bg-[#0b0d18] border border-slate-900 rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-28 h-28 bg-[#1e233d]/20 rounded-full blur-2xl pointer-events-none"></div>
                
                <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 col-span-3">
                  <Send className="w-4 h-4 text-sky-400" />
                  <span>Premium Conversion System</span>
                </h4>
                
                <p className="text-xs text-slate-400 leading-relaxed">
                  The primary goal is conversion. When scrapers list or try to copy your links, the security walls and auto-redirect format redirect them straight to your Telegram channel.
                </p>
                
                <div className="grid grid-cols-2 gap-4 mt-1 bg-[#08090f] p-3 rounded-xl border border-slate-900">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-mono">Conversion rate</span>
                    <span className="text-sm font-bold text-sky-400 mt-0.5">85% estimated</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-mono">Channel target</span>
                    <span className="text-sm font-bold text-white mt-0.5 truncate">@{telegramInput.split("/").pop()}</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {activeTab === "channels" && (
          <div className="bg-[#0b0d18] border border-slate-900 rounded-2xl p-6 flex flex-col gap-6">
            
            {/* Filter and search toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Active Live Channels</h3>
                <p className="text-xs text-slate-400">Synchronized and compiled directly from raw worker endpoints.</p>
              </div>

              {/* Search input */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search channels..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-[#08090f] border border-slate-900 hover:border-slate-800 focus:border-purple-600 outline-none rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-300 w-full sm:w-56 transition-all"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                </div>
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap items-center gap-1 bg-[#080a11] p-1.5 rounded-xl border border-slate-900/60 max-w-fit">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${selectedCategory === cat ? "bg-purple-900/60 text-white border border-purple-500/15" : "text-slate-400 hover:text-white"}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Channels listing table/grid */}
            {loadingChannels ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-xs font-mono">Syncing live worker database feeds...</span>
              </div>
            ) : channelsError ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4 text-center">
                <ShieldAlert className="w-10 h-10 text-rose-500 animate-bounce" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Database Synchronization Failed</h4>
                  <p className="text-xs text-rose-400/90 max-w-md mt-1">{channelsError}</p>
                </div>
                <button
                  onClick={fetchChannels}
                  className="bg-[#111322] border border-slate-900 hover:border-slate-800 text-slate-300 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Feed Synchronization</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-medium border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900/80 text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                      <th className="pb-3 pl-2">Channel</th>
                      <th className="pb-3">Content ID</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Quality & Status</th>
                      <th className="pb-3 text-right pr-2">Header Credentials</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/40">
                    {filteredChannels.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          No channels match the current filters ("{searchTerm || selectedCategory}").
                        </td>
                      </tr>
                    ) : (
                      filteredChannels.map((c, idx) => (
                        <tr key={c.contentId + idx} className="hover:bg-[#101222]/30 group transition-all">
                          <td className="py-3 pl-2 flex items-center gap-3">
                            <img
                              src={c.logo}
                              alt={c.name}
                              referrerPolicy="no-referrer"
                              className="w-[42px] h-[42px] object-contain rounded-xl bg-black border border-slate-800 shadow-md flex-shrink-0"
                            />
                            <span className="font-semibold text-white tracking-tight text-[13px] group-hover:text-purple-400 transition-colors">{c.name}</span>
                          </td>
                          <td className="py-3 font-mono text-slate-400 text-[10px]">{c.contentId}</td>
                          <td className="py-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-900/80 text-indigo-400 border border-slate-800/40">
                              {getChannelGroup(c.name)}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>1080p HD (Secured Stream)</span>
                            </div>
                          </td>
                          <td className="py-3 text-right pr-2">
                            <button
                              onClick={() => {
                                const secureRedirectUrl = `${currentOrigin}/play?url=${encodeURIComponent(c.mpd)}&token=${config.secureToken}`;
                                const formattedUAString = `${secureRedirectUrl}|User-Agent=VIP-Player&Cookie=Protected`;
                                copyToClipboard(formattedUAString);
                              }}
                              className="cursor-pointer text-[10px] bg-[#0c0d18] hover:bg-[#1a1c32] group-hover:bg-[#13162b] text-purple-400 py-1 px-2.5 rounded border border-purple-500/10 hover:border-purple-500/20 active:scale-95 transition-all text-right uppercase tracking-wide font-bold"
                            >
                              Copy Stream tag
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Simulator Tab */}
        {activeTab === "simulator" && (
          <div className="bg-[#0b0d18] border border-slate-900 rounded-2xl p-6 flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Security Gate Simulator</h3>
              <p className="text-xs text-slate-400">Validate real-time browser redirect policies & token checkers visually.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              
              {/* Simulator settings column */}
              <div className="md:col-span-5 bg-[#08090f] border border-slate-900 p-5 rounded-2xl flex flex-col gap-4">
                <div className="text-xs font-semibold text-white tracking-wide uppercase flex items-center gap-1.5 pb-2 border-b border-slate-900">
                  <Terminal className="w-4 h-4 text-purple-400" />
                  <span>Configure client request</span>
                </div>

                {/* Preset agents */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-slate-400 font-semibold font-mono">Simulate Device Presets</span>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => setSimUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/104.0.0.0 Safari/537.36")}
                      className="cursor-pointer text-left px-3 py-2 bg-[#0d0f19] hover:bg-[#15192c] text-[11px] text-slate-300 font-semibold rounded-lg border border-slate-900 text-ellipsis overflow-hidden"
                    >
                      Chrome Web Browser (Desktop)
                    </button>
                    <button
                      onClick={() => setSimUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 Safari/605.1.15")}
                      className="cursor-pointer text-left px-3 py-2 bg-[#0d0f19] hover:bg-[#15192c] text-[11px] text-slate-300 font-semibold rounded-lg border border-slate-900 text-ellipsis overflow-hidden"
                    >
                      Safari Web Browser (iPhone Mobile)
                    </button>
                    <button
                      onClick={() => setSimUserAgent("VLC/3.0.18 LibVLC/3.0.18")}
                      className="cursor-pointer text-left px-3 py-2 bg-[#0d0f19] hover:bg-[#15192c] text-[11px] text-slate-300 font-semibold rounded-lg border border-slate-900 text-ellipsis overflow-hidden"
                    >
                      VLC Player (Legitimate IPTV Client)
                    </button>
                    <button
                      onClick={() => setSimUserAgent("TiviMate/4.6.1 (Linux; Android 11)")}
                      className="cursor-pointer text-left px-3 py-2 bg-[#0d0f19] hover:bg-[#15192c] text-[11px] text-slate-300 font-semibold rounded-lg border border-slate-900 text-ellipsis overflow-hidden"
                    >
                      TiviMate App (Premium Player)
                    </button>
                  </div>
                </div>

                {/* Simulated UA Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-300 font-medium">HTTP User-Agent Header</label>
                  <input
                    type="text"
                    value={simUserAgent}
                    onChange={(e) => setSimUserAgent(e.target.value)}
                    placeholder="Provide a custom User-Agent Header string..."
                    className="bg-[#05060b] border border-slate-950 font-mono text-[10px] text-slate-200 outline-none p-2.5 rounded-lg w-full"
                  />
                </div>

                {/* Simulated token query params */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-300 font-medium">Provided URL Token parameter</label>
                  <input
                    type="text"
                    value={simToken}
                    onChange={(e) => setSimToken(e.target.value)}
                    placeholder="Provided security token..."
                    className="bg-[#05060b] border border-slate-950 font-mono text-[11px] text-slate-200 outline-none p-2.5 rounded-lg w-full"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                    <span>Valid system token:</span>
                    <span className="text-purple-400 font-bold">{config.secureToken || "None"}</span>
                  </div>
                </div>

                {/* Execute button */}
                <button
                  onClick={runSimulation}
                  disabled={simulating}
                  className="cursor-pointer bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 font-bold text-xs py-3 rounded-xl shadow-lg border border-purple-500/10 text-white mt-1.5 flex items-center justify-center gap-1.5"
                >
                  {simulating ? <RefreshCw className="w-4 h-4 animate-spin text-white" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Simulate API Access Request</span>
                </button>
              </div>

              {/* Simulator output console column */}
              <div className="md:col-span-7 bg-[#05060b] border border-slate-950 rounded-2xl p-6 min-h-[400px] flex flex-col gap-4 font-mono relative shadow-inner">
                <div className="absolute top-4 right-4 text-[10px] text-slate-500 tracking-wider">CONSOLE</div>
                
                {simulationResult ? (
                  <div className="flex flex-col gap-5 text-xs">
                    
                    {/* Status header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0d0f19] border border-slate-900/60 p-4 rounded-xl">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">SIMULATION RESULTS</span>
                        <span className="text-slate-300 font-semibold text-xs mt-1 truncate">UA: {simulationResult.userAgent && simulationResult.userAgent.slice(0, 40)}...</span>
                      </div>
                      
                      <div className="shrink-0 flex items-center gap-2">
                        {simulationResult.action === "SERVED_M3U" ? (
                          <span className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400/90 text-[10px] font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider">Served M3U OK</span>
                        ) : (
                          <span className="bg-rose-500/15 border border-rose-500/20 text-rose-400/90 text-[10px] font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider">Blocked & Redirected</span>
                        )}
                        <span className="bg-[#141527] border border-slate-800 text-white px-2.5 py-1.5 rounded-lg font-bold text-xs">
                          {simulationResult.status}
                        </span>
                      </div>
                    </div>

                    {/* Details explanation text */}
                    <div className="bg-[#0b0c16] border border-slate-900 p-4 rounded-xl leading-relaxed text-slate-300 border-l-4 border-l-purple-500">
                      {simulationResult.details}
                    </div>

                    {/* Headers visualization */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Response Headers</span>
                      <pre className="bg-[#000] p-3 rounded-lg border border-slate-900/90 overflow-x-auto text-[10px] leading-relaxed text-slate-400">
                        {simulationResult.rawResponseHeader}
                      </pre>
                    </div>

                    {/* Return mock content */}
                    {simulationResult.playlistSnippet && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Generated Playlist Stream Snippet</span>
                        <pre className="bg-[#000] p-3 rounded-lg border border-slate-900/90 overflow-x-auto text-[10px] leading-relaxed text-slate-400">
                          {simulationResult.playlistSnippet}
                        </pre>
                      </div>
                    )}

                    {simulationResult.action !== "SERVED_M3U" && (
                      <div className="bg-[#111322] border border-slate-900/60 px-4 py-3.5 rounded-xl flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-slate-300 font-sans text-xs">
                          <Send className="w-4 h-4 text-sky-400 shrink-0" />
                          <span>Forwarded to Telegram Group Link:</span>
                        </div>
                        <a 
                          href={config.telegramUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="bg-sky-500 hover:bg-sky-600 text-white font-sans font-bold text-[10px] px-3 py-1.5 rounded uppercase tracking-wide flex items-center gap-1 shrink-0"
                        >
                          <span>Telegram Redirect Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 font-sans py-20">
                    <Terminal className="w-8 h-8 text-slate-600 animate-pulse" />
                    <span className="text-xs">Awaiting client request execution...</span>
                    <span className="text-[10px] text-slate-600 max-w-xs text-center leading-relaxed">
                      Toggle preset user agents on the left, then click simulated access to watch the guard barrier block or parse requests.
                    </span>
                  </div>
                )}

              </div>

            </div>
          </div>
        )}



        {/* Custom M3U Playlists Managing Tab */}
        {activeTab === "custom_m3u" && (
          <div id="custom_m3u_panel" className="bg-[#0b0d18] border border-slate-900 rounded-2xl p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900/60 pb-5">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-400" />
                  <span>Custom M3U Playlists</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">Add remote M3U feeds dynamically and merge their live streams securely into your master playlist.</p>
              </div>
              <div className="text-[10px] sm:text-xs font-mono text-purple-400 bg-purple-950/30 border border-purple-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 uppercase">
                <Check className="w-3.5 h-3.5" />
                <span>Auto Compiled into Master</span>
              </div>
            </div>

            {playlistSuccessMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{playlistSuccessMessage}</span>
              </div>
            )}

            {playlistsError && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{playlistsError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Form Column: Add / Edit M3U URL */}
              <form onSubmit={handleSavePlaylist} className="lg:col-span-5 bg-[#08090f] border border-slate-900/80 p-6 rounded-2xl flex flex-col gap-5">
                <div className="text-xs font-bold text-white tracking-wide uppercase pb-2 border-b border-slate-900 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-purple-400" />
                  <span>{editingPlaylistId ? "Edit M3U Playlist" : "Add M3U Playlist Source"}</span>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-slate-400 tracking-wide uppercase">Playlist Name / Brand</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. My Hot Streams"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    className="bg-[#05060b] border border-slate-800 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 w-full transition-all"
                  />
                  <p className="text-[10px] text-slate-500">Channels inside this playlist will be auto-grouped under this category name.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-slate-400 tracking-wide uppercase">M3U Playlist Feed URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/playlist.m3u"
                    value={newPlaylistUrl}
                    onChange={(e) => setNewPlaylistUrl(e.target.value)}
                    className="bg-[#05060b] border border-slate-800 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 w-full transition-all"
                  />
                  <p className="text-[10px] text-slate-500">Must be a direct link to a raw M3U text file, standard playlist, or dynamically updated live stream feed.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-slate-400 tracking-wide uppercase">Playlist Logo URL (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={newPlaylistLogo}
                    onChange={(e) => setNewPlaylistLogo(e.target.value)}
                    className="bg-[#05060b] border border-slate-800 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 w-full transition-all"
                  />
                  <p className="text-[10px] text-slate-500">Use a fallback logo URL if none is embedded into the M3U channel elements.</p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={addingPlaylist}
                    className="cursor-pointer bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg border border-purple-500/10 text-white flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all font-semibold"
                  >
                    {addingPlaylist ? <RefreshCw className="w-4 h-4 animate-spin text-white" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{editingPlaylistId ? "Update Playlist" : "Add Playlist Source"}</span>
                  </button>
                  {editingPlaylistId && (
                    <button
                      type="button"
                      onClick={cancelEditPlaylist}
                      className="cursor-pointer bg-slate-900 border border-slate-800 hover:bg-slate-800 font-bold text-xs py-2.5 px-4 rounded-xl text-slate-400 transition-all font-semibold"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {/* List Column: Active Subscribed Remote feeds */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="text-xs font-bold text-white tracking-wide uppercase pb-2 border-b border-slate-900 flex items-center justify-between">
                  <span>Subscribed Feeds ({customPlaylists.length})</span>
                  <button
                    type="button"
                    onClick={fetchCustomPlaylists}
                    className="cursor-pointer text-[10px] font-mono tracking-wider text-purple-400 flex items-center gap-1 hover:text-purple-300"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>REFRESH</span>
                  </button>
                </div>

                {loadingPlaylists ? (
                  <div className="bg-[#05060b] border border-slate-950 rounded-2xl p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                    <span className="text-xs">Fetching custom playlists...</span>
                  </div>
                ) : customPlaylists.length === 0 ? (
                  <div className="bg-[#05060b]/60 border border-slate-950 rounded-2xl p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                    <Layers className="w-8 h-8 text-slate-700 animate-pulse" />
                    <span className="text-xs font-semibold text-slate-400">No Custom Sources Subscribed Yet</span>
                    <p className="text-[11px] text-slate-600 max-w-xs leading-relaxed">
                      Put an M3U stream URL in the left form and name it. They will automatically be fetched, parsed, and combined with your JioTV streams securely.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {customPlaylists.map((playlist) => (
                      <div key={playlist.id} className="bg-[#08090f] border border-slate-900 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-slate-800 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            referrerPolicy="no-referrer"
                            src={playlist.logo || "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%2520Neon_Modern%2520AI%2520Logo.png"}
                            alt={playlist.name}
                            className="w-10 h-10 object-contain rounded-xl bg-slate-950 border border-slate-900 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://ik.imagekit.io/yjtx9nh9y/Black%20White%20Minimal%20Simple%20Modern%20Pixel%2520Neon_Modern%2520AI%2520Logo.png";
                            }}
                          />
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-white truncate">{playlist.name}</span>
                            <span className="text-[9px] text-slate-500 truncate font-mono">https://****** / Protected Feed Link</span>
                            <span className="text-[9px] text-purple-400 font-mono tracking-wider font-semibold uppercase mt-0.5">M3U STREAM FEED</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditPlaylist(playlist)}
                            className="cursor-pointer bg-purple-950/30 hover:bg-purple-900/30 text-purple-400 text-[11px] font-semibold py-1.5 px-3 rounded-lg border border-purple-500/15 transition-all"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => playlist.id && handleDeletePlaylist(playlist.id)}
                            className="cursor-pointer bg-rose-950/20 hover:bg-rose-900/30 text-rose-400 text-[11px] font-semibold py-1.5 px-3 rounded-lg border border-rose-500/10 transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stalker IPTV Portals Managing Tab */}
        {activeTab === "stalker" && (
          <div id="stalker_panel" className="bg-[#0b0d18] border border-slate-900 rounded-2xl p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900/60 pb-5">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-400" />
                  <span>Stalker Portal Feeds</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-sans">
                  Directly fetch, parse, and compile upstream Stalker IPTV playlists into secure local outputs with dynamic token protection gates.
                </p>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4 bg-[#08090f] p-2.5 rounded-xl border border-slate-900">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Auto Refresh (1 Hour)</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAutoRefresh(!stalkerAutoRefresh)}
                    className={`cursor-pointer px-3 py-1 rounded-md text-[10px] font-mono tracking-wide font-bold transition-all border ${
                      stalkerAutoRefresh
                        ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
                        : "bg-slate-900 text-slate-500 border-slate-800"
                    }`}
                  >
                    {stalkerAutoRefresh ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
                <div className="w-px h-4 bg-slate-900 hidden sm:block" />
                <button
                  type="button"
                  onClick={async () => {
                    setStalkerFeedbackMsg("Syncing all Stalker feeds...");
                    await syncAllStalkers();
                    setStalkerFeedbackMsg("All Stalker Portal feeds updated successfully!");
                    setTimeout(() => setStalkerFeedbackMsg(null), 3500);
                  }}
                  className="cursor-pointer text-[10px] sm:text-xs font-mono font-bold tracking-wider text-purple-400 flex items-center gap-1.5 hover:text-purple-300"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>SYNC ALL FEEDS</span>
                </button>
              </div>
            </div>

            {stalkerFeedbackMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{stalkerFeedbackMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {stalkers.map((s) => {
                const secureLink = `${currentOrigin}/api/stalker/${s.id}.m3u?token=${s.token}`;
                return (
                  <div key={s.id} className="bg-[#08090f] border border-slate-900/90 rounded-2xl p-5 flex flex-col gap-4 hover:border-purple-500/15 transition-all">
                    
                    {/* Card Title Header */}
                    <div className="flex items-center justify-between gap-3 border-b border-slate-900 pb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-lg bg-purple-950/40 border border-purple-500/10 flex items-center justify-center font-bold font-mono text-purple-400 text-xs shrink-0">
                          {s.id}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wide truncate">{s.name}</h4>
                          <span className="text-[9px] font-mono text-slate-500 truncate block">{s.url}</span>
                        </div>
                      </div>
                      
                      {/* Status indicator */}
                      <div>
                        {s.status === "active" ? (
                          <span className="bg-emerald-950/20 text-emerald-400 text-[9px] font-mono px-2 py-0.5 rounded border border-emerald-500/10">ACTIVE</span>
                        ) : s.status === "error" ? (
                          <span className="bg-rose-950/20 text-rose-400 text-[9px] font-mono px-2 py-0.5 rounded border border-rose-500/10">ERROR</span>
                        ) : (
                          <span className="bg-amber-950/20 text-amber-500 text-[9px] font-mono px-2 py-0.5 rounded border border-amber-500/10">PENDING</span>
                        )}
                      </div>
                    </div>

                    {/* Output link block */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Secured Proxy Endpoint URL</label>
                      <div className="flex items-center bg-[#05060b] border border-slate-800 rounded-xl p-1.5 pl-3 gap-2">
                        <span className="font-mono text-[10px] text-slate-300 truncate select-all flex-1">{secureLink}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(secureLink);
                            setCopiedStalkerId(s.id);
                            setTimeout(() => setCopiedStalkerId(null), 2500);
                          }}
                          className="cursor-pointer bg-purple-950/40 hover:bg-purple-900/30 text-purple-400 hover:text-purple-300 shrink-0 p-2 rounded-lg border border-purple-500/10 transition-all text-xs font-bold"
                        >
                          {copiedStalkerId === s.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Stats Fields */}
                    <div className="grid grid-cols-2 gap-3.5 bg-[#05060b]/40 border border-slate-900 p-3.5 rounded-xl font-mono text-[10px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-500 uppercase tracking-wide">SECURE CHANNELS</span>
                        <span className="text-white font-bold text-xs">{s.channelsCount > 0 ? `${s.channelsCount} Live` : "0 (Unsynced)"}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-500 uppercase tracking-wide">LAST SECURED SYNC</span>
                        <span className="text-slate-400 text-[9px] font-medium truncate">{s.lastFetchedAt}</span>
                      </div>
                    </div>

                    {/* Error display if present */}
                    {s.error && (
                      <div className="text-[9px] text-rose-400 font-mono bg-rose-950/10 border border-rose-500/10 p-2 rounded-lg">
                        Error: {s.error}
                      </div>
                    )}

                    {/* Sync button */}
                    <div className="flex items-center justify-between gap-4 mt-1 border-t border-slate-900 pt-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider">Access Token Required</span>
                        <span className="text-[10px] font-mono text-purple-400 font-bold">{s.token}</span>
                      </div>
                      <button
                        type="button"
                        disabled={loadingStalkers[s.id]}
                        onClick={() => syncStalker(s.id)}
                        className="cursor-pointer bg-purple-950/20 hover:bg-purple-900/30 text-purple-400 font-bold hover:text-purple-300 text-[11px] py-2 px-3.5 rounded-xl border border-purple-500/10 transition-all flex items-center gap-1.5 uppercase tracking-wide"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingStalkers[s.id] ? "animate-spin" : ""}`} />
                        <span>{loadingStalkers[s.id] ? "Syncing..." : "Sync Now"}</span>
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>

            <div className="bg-[#05060b] border border-slate-950 rounded-2xl p-4 text-[11px] font-mono text-slate-500 leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-400 mb-1">STALKER SECURE INTERFACE COMPILING RULES</p>
                <p>
                  Every requested Stalker m3u file parsed by our system is completely secured. The streaming URLs are dynamically wrapped to point to the local <code className="text-purple-400">/play</code> endpoint of your deployed service instance with custom IPTV Player User Agent / Cookie headers. To test this proxy, input these secure playlist URLs in <code className="text-purple-400">TiviMate</code>, <code className="text-purple-400">VLC</code>, or any compatible IPTV client player with the specified token query parameter to authenticate seamlessly.
                </p>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Decorative footer */}
      <footer className="border-t border-slate-900/60 py-8 px-6 mt-16 bg-[#040509]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            <span className="font-semibold text-slate-400">CARTEL SECURED IPTV PROTECTION LABS</span>
          </div>
          <div>
            <span>UTC Time: 2026-05-30 13:36:00</span>
          </div>
          <div className="flex gap-4">
            <a href={config.telegramUrl} target="_blank" rel="noreferrer" className="hover:text-amber-100 transition-colors">Telegram</a>
            <span>•</span>
            <span className="text-emerald-500 font-bold uppercase">Shield Active</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
