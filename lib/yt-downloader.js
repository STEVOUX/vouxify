  
  await runYtDlp(args, signal, (pct, rawLine) => {
    // scale yt-dlp percentage (0-100) to our progress bar (10-90)
    const scaled = 10 + (pct * 0.8);
    onProgress(scaled, rawLine);
  });

  onProgress(95, 'Finalizing file...');

  // Find the generated file in tmpdir
  const tmpDir = os.tmpdir();
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(`vouxify_yt_${tmpId}`));
  if (!files.length) throw new Error('File not found after yt-dlp success');

  const downloadedPath = path.join(tmpDir, files[0]);
  const finalFilename = files[0].replace(`vouxify_yt_${tmpId}_`, '');
  const finalPath = path.join(os.tmpdir(), `${fileId}.${ext}`);
  
  fs.renameSync(downloadedPath, finalPath);

  onProgress(100, 'Complete');
  
  return {
    fileId,
    filePath: finalPath,
    filename: finalFilename
  };
}

module.exports = { downloadYouTubeTrack };
