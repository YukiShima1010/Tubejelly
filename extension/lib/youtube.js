const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_REGEX = /^[A-Za-z0-9_-]+$/;

function isYouTubeHost(hostname) {
  return (
    hostname === 'youtu.be' ||
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com')
  );
}

/**
 * タブのURLからYouTubeの動画ID・プレイリストIDを取り出す
 * @param {string | undefined} rawUrl
 * @returns {{ videoId: string | null, playlistId: string | null } | null} YouTube以外は null
 */
export function parseYouTubeUrl(rawUrl) {
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const hostname = url.hostname.toLowerCase();
  if (!isYouTubeHost(hostname)) return null;

  let videoId = null;
  if (hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v');
  } else {
    const [prefix, id] = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'live', 'embed'].includes(prefix)) videoId = id ?? null;
  }
  if (videoId && !VIDEO_ID_REGEX.test(videoId)) videoId = null;

  let playlistId = url.searchParams.get('list');
  if (playlistId && !PLAYLIST_ID_REGEX.test(playlistId)) playlistId = null;

  if (!videoId && !playlistId) return { videoId: null, playlistId: null };
  return { videoId, playlistId };
}

/**
 * タブのタイトルから「 - YouTube」などの接尾辞と通知件数を取り除く
 * @param {string | undefined} title
 */
export function cleanTabTitle(title) {
  if (!title) return '';
  return title
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/\s*-\s*YouTube(?: Music)?$/, '')
    .trim();
}
