import multiavatar from "@multiavatar/multiavatar/esm";

export const buildAvatarSvg = (seed: string): string => {
  const trimmed = seed.trim();
  if (!trimmed) {
    throw new Error("Avatar seed is required.");
  }
  return multiavatar(trimmed, true);
};

export const buildAvatarDataUrl = (seed: string): string => {
  const svg = buildAvatarSvg(seed);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
