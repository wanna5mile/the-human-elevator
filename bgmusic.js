const bgMusic = new BABYLON.Sound("bgMusic", "bg.mp3", scene, null, {
  loop: true,
  autoplay: true,
  volume: 0.4
});

window.addEventListener("click", () => {
  if (BABYLON.Engine.audioEngine && !BABYLON.Engine.audioEngine.unlocked) {
    BABYLON.Engine.audioEngine.unlock();
  }
}, { once: true });
