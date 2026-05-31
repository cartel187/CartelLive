fetch('https://keys.lrl45.workers.dev/mpd/2022', {
  headers: {
    "User-Agent": "plaYtv/7.1.3 (Linux;Android 13) ygx/824.1 ExoPlayerLib/824.0",
    "cookie": "__hdnea__=st=1780201807~exp=1780223407~acl=/*~hmac=f16be01f464993d9c661bf4b1eba6a97225e57b0f822103016dd333c7be85c18",
    "Origin": "https://www.jiotv.com/",
    "Referer": "https://www.jiotv.com/"
  }
}).then(r=>console.log(r.status, r.headers.get("content-type"))).catch(e => console.log(e.message));
