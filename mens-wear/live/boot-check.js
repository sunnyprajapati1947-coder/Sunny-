/* Fallback notice for the deployment shell: if app-shell.js never ran (CDN
   blocked, offline, very old browser) the boot card would spin forever, so
   swap it for a plain link to the CDN copy. Kept as a separate file so the
   shipped pages need no inline script under their Content-Security-Policy. */
(function () {
  if (window.__mwShellLoaded) return;
  var boot = document.getElementById("boot");
  if (!boot) return;
  boot.innerHTML =
    '<div><p>The app could not load.</p><p><a href="https://cdn.jsdelivr.net/gh/sunnyprajapati1947-coder/Sunny-@app-v14/mens-wear/live/index.html">Open the store here</a></p></div>';
})();
