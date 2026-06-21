/**
 * Media sources for the landing page.
 *
 * Images are bundled locally in /public/media (guaranteed to load).
 * Videos point to free Pilates stock footage — swap these URLs for your own
 * studio footage anytime. If a video fails to load, its `poster` image is
 * shown instead, so the page always looks complete.
 */

export const IMG = {
  reformer: '/media/reformer.jpg', // woman on a reformer
  movement: '/media/dancer.jpg', // pilates with stability ball
  sign: '/media/letspilates.jpg', // "Let's Pilates" light sign
};

export const VIDEO = {
  // Hero background — calm full-body Pilates / movement footage.
  hero: 'https://videos.pexels.com/video-files/4327449/4327449-uhd_2560_1440_25fps.mp4',
  // Use-cases background — studio / reformer movement.
  useCases: 'https://videos.pexels.com/video-files/4753991/4753991-uhd_2560_1440_25fps.mp4',
};
