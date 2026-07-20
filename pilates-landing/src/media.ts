/**
 * Image sources for the Let's Pilates LA site.
 *
 * All photography is served as WebP from /public/media. Paths are resolved
 * against Vite's BASE_URL so the site works both at the domain root and under
 * a sub-path (e.g. /staging/). Swap any path anytime — layout stays identical.
 */

const m = (file: string) => `${import.meta.env.BASE_URL}media/${file}`;

export const IMG = {
  logo: m('logo-lets-pilates-la.webp'), // wordmark: Let's Pilates LA — Pilates Studio | Gyrotonic®
  hero: m('hero-cinematic.webp'), // wide B&W montage — full-bleed parallax hero
  reformer: m('reformer-merrithew.webp'), // Merrithew Reformer detail — programs feature card
  gyrotonic: m('gyrotonic-tower-bw.webp'), // B&W Gyrotonic tower work — programs card
  approach: m('teacher-training-bw.webp'), // B&W group training at the pulley towers
  space: m('gyrotonic-tower-reach.webp'), // Gyrotonic tower in a brick/wood room
  private: m('straps-footwork.webp'), // supported footwork in straps — private/recovery card
  pilatesGroup: m('pilates-group-reformers.webp'), // group class, legs in straps — warm light, no faces

  // Spares (not currently placed, kept for easy swapping):
  studioTowerBw: m('studio-tower-bw.webp'),
  reformerSunlight: m('reformer-sunlight.webp'),
  gyrotonicArchway: m('gyrotonic-archway.webp'),
  matgroupClass: m('group-mat-class.webp'),
  towerStretchBw: m('tower-stretch-bw.webp'),
  ladderBarrelSun: m('ladder-barrel-sun.webp'),
  letterboard: m('letterboard-sign.webp'),
  gyroWood: m('gyrotonic-wood-logo.webp'),
  reformerStretch: m('hero-reformer-stretch.webp'),
  props: m('pilates-props.webp'),
};
