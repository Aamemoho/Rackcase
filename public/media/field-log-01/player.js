const video = document.querySelector('#field-video');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function respectMotionPreference(event = reducedMotion) {
  if (!video) return;
  if (event.matches) {
    video.removeAttribute('autoplay');
    video.pause();
  }
}

respectMotionPreference();
reducedMotion.addEventListener?.('change', respectMotionPreference);
