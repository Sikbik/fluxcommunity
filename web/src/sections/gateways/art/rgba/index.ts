/**
 * URLs of the RGBA twins of the emissive art (see build.mjs for why and how they are made).
 * Geometry is identical to `ART[id]` in `@/content/art`: same size, same content box.
 *
 * The files are resolved by Vite at build time (hashed, emitted next to the chunk), so this
 * module is only strings: nothing downloads until an <img> or a CSS mask asks for it.
 */
import type { ArtId } from '@/content/art';

const urls = import.meta.glob<string>('./*.{webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface RgbaArt {
  /** WebP with alpha: the fallback. */
  src: string;
  /** AVIF with alpha: preferred, about a third of the bytes. */
  avif: string | undefined;
}

export function rgbaArt(id: ArtId): RgbaArt | undefined {
  const src = urls[`./${id}.webp`];
  if (!src) return undefined;
  return { src, avif: urls[`./${id}.avif`] };
}

/** A CSS `mask-image` value that follows the same AVIF-first rule as the <picture>. */
export function rgbaMaskImage(art: RgbaArt): string {
  return art.avif
    ? `image-set(url("${art.avif}") type("image/avif"), url("${art.src}") type("image/webp"))`
    : `url("${art.src}")`;
}
