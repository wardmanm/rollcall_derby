// Inline SVG data URIs for stories: nothing loads from the network (hard rule 4).
function svg(body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${body}</svg>`)}`;
}

export const PHOTO_URL = svg(
  '<rect width="400" height="300" fill="#3d4b58"/><circle cx="200" cy="110" r="55" fill="#8796a4"/><circle cx="200" cy="330" r="150" fill="#8796a4"/>',
);

export const LOGO_URL = svg(
  '<circle cx="200" cy="150" r="130" fill="#f5c518"/><text x="200" y="185" font-size="100" font-weight="900" text-anchor="middle" fill="#b3123f" font-family="sans-serif">HC</text>',
);
