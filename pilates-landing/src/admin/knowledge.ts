// Knowledge library items and how their links play inside the portal.
// Files live in the private "knowledge" Storage bucket and open through
// short-lived signed URLs; links (YouTube, Vimeo, Google Drive) embed.

export type KnowledgeCategory = 'PILATES' | 'GYROTONIC';
export type KnowledgeKind = 'VIDEO' | 'DOCUMENT';
/** ALL = every portal user; SELECTED = only viewer_ids (owners and admins always see all). */
export type KnowledgeAudience = 'ALL' | 'SELECTED';

export interface KnowledgeItem {
  id: string;
  category: KnowledgeCategory;
  kind: KnowledgeKind;
  title: string;
  description: string;
  link_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  audience: KnowledgeAudience;
  created_at: string;
}

export const BUCKET = 'knowledge';
/** The bucket's limit (Supabase Free plan's per-file upload limit). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type Source = 'youtube' | 'vimeo' | 'drive' | 'link' | 'file';

export interface Embed {
  source: Source;
  /** iframe player URL, when the link can play inside the portal. */
  player?: string;
  thumbnail?: string;
}

/** YouTube, Vimeo and Google Drive links → their embeddable player. */
export function embedFor(url: string): Embed {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { source: 'link' };
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? parts[0]
        : u.searchParams.get('v') ?? (['embed', 'shorts', 'live'].includes(parts[0] ?? '') ? parts[1] : undefined);
    if (id && /^[\w-]{6,20}$/.test(id)) {
      return {
        source: 'youtube',
        player: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
    return { source: 'youtube' };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted hash), player.vimeo.com/video/123?h=abcdef
    const i = parts.findIndex((p) => /^\d+$/.test(p));
    if (i >= 0) {
      const hash = u.searchParams.get('h') ?? (parts[i + 1] && /^[\da-f]+$/i.test(parts[i + 1]!) ? parts[i + 1] : '');
      return { source: 'vimeo', player: `https://player.vimeo.com/video/${parts[i]}${hash ? `?h=${hash}` : ''}` };
    }
    return { source: 'vimeo' };
  }
  if (host === 'drive.google.com') {
    const id = parts[0] === 'file' && parts[1] === 'd' ? parts[2] : u.searchParams.get('id');
    return id ? { source: 'drive', player: `https://drive.google.com/file/d/${id}/preview` } : { source: 'drive' };
  }
  return { source: 'link' };
}

/** 1536000 → "1.5 MB" */
export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Storage path for a new upload: a random folder keeps names unique. */
export function uploadPath(fileName: string): string {
  const safe = fileName.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return `${crypto.randomUUID()}/${safe}`;
}
