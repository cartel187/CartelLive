const fs = require('fs');
fetch('https://raw.githubusercontent.com/cartel187/xovt/refs/heads/main/playlist.m3u').then(r=>r.text()).then(t => {
  const lines = t.split('\n');
  let count = 0;
  for(let i=0; i<lines.length; i++) {
    if(lines[i].includes('JIO ⭕')) {
      console.log(lines[i]);
      console.log(lines[i+1]);
      count++;
      if (count > 10) break;
    }
  }
});
