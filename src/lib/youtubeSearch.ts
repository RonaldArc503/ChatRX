const API_KEY =
  (import.meta.env.PUBLIC_YOUTUBE_API_KEY as string | undefined)?.trim() || "";

export interface YtSearchResult {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

export function hasYoutubeKey(): boolean {
  return API_KEY.length > 0;
}

export async function searchYoutube(
  query: string,
  max = 8,
): Promise<YtSearchResult[]> {
  if (!API_KEY) {
    throw new Error(
      "Falta la clave de YouTube. Configura PUBLIC_YOUTUBE_API_KEY en el archivo .env.",
    );
  }
  const q = query.trim();
  if (!q) return [];

  const url =
    "https://www.googleapis.com/youtube/v3/search" +
    `?part=snippet&type=video&maxResults=${max}` +
    `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(API_KEY)}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Sin conexión. Revisa tu internet.");
  }

  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      throw new Error("Cuota de YouTube agotada. Intenta más tarde.");
    }
    throw new Error(`Error al buscar (${res.status}).`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string } };
      };
    }>;
  };

  return (data.items ?? [])
    .filter((it) => it.id?.videoId && it.snippet?.title)
    .map((it) => ({
      id: it.id!.videoId!,
      title: it.snippet!.title!,
      channel: it.snippet!.channelTitle ?? "",
      thumbnail: it.snippet!.thumbnails?.medium?.url ?? "",
      url: `https://www.youtube.com/watch?v=${it.id!.videoId}`,
    }));
}
