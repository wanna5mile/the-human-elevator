window.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("click", () => {
    if (window.scene && !window.bgMusic) {
      window.bgMusic = new BABYLON.Sound(
        "bgMusic",
        "music.mp3",   // change path if needed
        scene,
        null,
        {
          loop: true,
          autoplay: true,
          volume: 0.4
        }
      );
    }
  }, { once: true });
});
