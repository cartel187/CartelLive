fetch('https://raw.githubusercontent.com/cartel187/xovt/refs/heads/main/playlist.m3u').then(r=>r.text()).then(t => {
  const lines = t.split('\n');
  let count = 0;
  for(let i=0; i<lines.length; i++) {
    if(lines[i].includes('JIO ⭕')) {
      console.log(lines[i]); // EXTINF
      let j = i+1;
      while(j < lines.length && !lines[j].startsWith('#EXTINF')) {
        console.log(lines[j]); // KODIPROP or stream URL
        j++;
      }
      console.log('---');
      count++;
      if (count > 2) break;
    }
  }
});
