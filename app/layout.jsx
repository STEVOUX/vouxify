import './globals.css';

export const metadata = {
  title: 'VOUXIFY - Download Spotify, YouTube, Instagram & TikTok Media Instantly',
  description: 'Download music, videos, playlists, reels, and more in high quality. Fast, free, and secure downloader for Spotify, YouTube, Instagram, and TikTok.',
  keywords: 'STEVOUX, INFIDEVS, VOUXIFY, Spotify downloader, YouTube downloader, Instagram downloader, TikTok downloader, download playlist as zip, convert video to mp3, download reels video, download youtube mp4 1080p',
  authors: [{ name: 'STEVOUX', url: 'https://github.com/STEVOUX' }],
  openGraph: {
    title: 'VOUXIFY - Download Spotify, YouTube, Instagram & TikTok Media Instantly',
    description: 'Download music, videos, playlists, reels, and more in high quality. Fast, free, and secure downloader for Spotify, YouTube, Instagram, and TikTok.',
    type: 'website',
    url: 'https://vouxify.infidevs.in',
  },
};

export const viewport = {
  themeColor: '#1DB954',
};

export default function RootLayout({ children }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'VOUXIFY',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'All',
    creator: {
      '@type': 'Person',
      name: 'STEVOUX',
      url: 'https://github.com/STEVOUX'
    },
    provider: {
      '@type': 'Organization',
      name: 'INFIDEVS'
    }
  };

  return (
    <html lang="en">
      <head>
        {/* Favicon — multiple sizes via Cloudinary transforms for crisp rendering */}
        <link rel="icon" type="image/png" sizes="32x32"  href="https://res.cloudinary.com/dyiztuod3/image/upload/w_32,h_32,c_fit,q_auto,f_png/v1781714384/logo_jewy2p.png" />
        <link rel="icon" type="image/png" sizes="64x64"  href="https://res.cloudinary.com/dyiztuod3/image/upload/w_64,h_64,c_fit,q_auto,f_png/v1781714384/logo_jewy2p.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="https://res.cloudinary.com/dyiztuod3/image/upload/w_192,h_192,c_fit,q_auto,f_png/v1781714384/logo_jewy2p.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="https://res.cloudinary.com/dyiztuod3/image/upload/w_512,h_512,c_fit,q_auto,f_png/v1781714384/logo_jewy2p.png" />
        <link rel="shortcut icon"         href="https://res.cloudinary.com/dyiztuod3/image/upload/w_64,h_64,c_fit,q_auto,f_png/v1781714384/logo_jewy2p.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="https://res.cloudinary.com/dyiztuod3/image/upload/w_180,h_180,c_fit,q_auto,f_png/v1781714384/logo_jewy2p.png" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
