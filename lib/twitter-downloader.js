}

/**
 * Download from X/Twitter URL using api.vxtwitter.com
 */
async function downloadTwitter({ url, format }, fileId, onProgress) {
  onProgress(5, 'Fetching Twitter metadata...');

  const parsedUrl = new URL(url);
  const apiReqUrl = `https://api.vxtwitter.com${parsedUrl.pathname}`;

  const apiRes = await fetch(apiReqUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  });

  if (!apiRes.ok) throw new Error('API fetch failed');
  const data = await apiRes.json();
  
  if (!data || !data.tweetID || !data.media_extended || data.media_extended.length === 0) {
    throw new Error('Twitter video not found or private');
  }

  const mediaUrl = data.media_extended[0].url;

  onProgress(10, 'Connecting to media server...');

  const ext = format === 'audio' ? 'mp3' : 'mp4';
  const tmpVideoPath = path.join(os.tmpdir(), `vouxify_tw_${fileId}.mp4`);
  const finalPath = path.join(os.tmpdir(), `${fileId}.${ext}`);
  
  // Clean up title for filename
  const safeTitle = (data.text || `twitter_${data.tweetID}`).replace(/[^a-z0-9]/gi, '_').substring(0, 50);
  const finalFilename = `${safeTitle}.${ext}`;

  if (format === 'audio') {
    await downloadFile(mediaUrl, tmpVideoPath, onProgress);
    await extractAudio(tmpVideoPath, finalPath, onProgress);
    fs.unlinkSync(tmpVideoPath);
  } else {
    await downloadFile(mediaUrl, finalPath, onProgress);
  }

  onProgress(100, 'Complete');
  
  return {
    fileId,
    filePath: finalPath,
    filename: finalFilename
  };
}

module.exports = { downloadTwitter };
