<div align="center">

# Perfectionism

**Small plugins that fix the annoying parts of League of Legends champ select.**

Built for [Pengu Loader](https://pengu.lol)

![Pengu Loader](https://img.shields.io/badge/Pengu_Loader-plugin_suite-8A63D2?style=for-the-badge)
![League of Legends](https://img.shields.io/badge/League_of_Legends-client-C89B3C?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/SrKing-9812/Perfectionist-Plugins?style=for-the-badge&color=F5C542)

</div>

<br>

## Plugins

<table>
  <tr>
    <th align="left">🛡️ Ban Blocker</th>
  </tr>
  <tr>
    <td>
      In champ select, every teammate except you gets a <b>BLOCK</b> button.
      <br><br>
      While a teammate is blocked, the plugin instantly prepicks the champion they are about to ban on your own pick turn. That way, their ban can never land on it.
    </td>
  </tr>
  <tr>
    <td>&nbsp;</td>
  </tr>
  <tr>
    <th align="left">🎨 Hide Unowned Skins</th>
  </tr>
  <tr>
    <td>
      In champ select, the skin carousel only shows the skins you own for the champion you picked.
      <br><br>
      The list is filtered where the client reads it, so the carousel, the arrows and the dots all move through owned
      skins only, and the ones that are left keep their normal spacing.
    </td>
  </tr>
  <tr>
    <td>&nbsp;</td>
  </tr>
  <tr>
    <th align="left">🔓 Unlock Profile Skins</th>
  </tr>
  <tr>
    <td>
      In the <b>Set profile background</b> window, every skin shows as unlocked, even the event skins (Signature).
      <br><br>
      Browse the full list and pick any skin you like as your profile background.
    </td>
  </tr>
  <tr>
    <td>&nbsp;</td>
  </tr>
  <tr>
    <th align="left">🎁 Auto Claimer</th>
  </tr>
  <tr>
    <td>
      Claims every reward for you the moment it becomes claimable — event tracks, missions and the TFT Battle Pass.
      <br><br>
      Three optional extras: auto-buy shop items Riot lists for 1 BE, auto-open mystery loot (icons, ward skins), and auto-open chests with keys.
    </td>
  </tr>
  <tr>
    <td>&nbsp;</td>
  </tr>
  <tr>
    <th align="left">🚀 BetterClient</th>
  </tr>
  <tr>
    <td>
      Debloats the client without changing how it looks or behaves: telemetry and analytics calls are dropped,
      duplicate requests are merged, and immutable payloads (game-data assets and rune definitions) are cached
      instead of re-downloaded and re-parsed every time a screen renders.
      <br><br>
      Everything it does on the page runs in idle slices instead of blocking navigation: image decode marking is
      batched, the client phase comes from the client's own events rather than a timer, and the in-game un-gate pass
      reads the page once with a single query and backs off to one check every five seconds once it has nothing left
      to unlock.
      <br><br>
      It also keeps the social panel, friend requests and settings usable while a game is running, and repairs the
      champ-select data race after a client reload so the ban list is still populated.
      <br><br>
      For weaker machines there is one optional switch, <b>Performance mode</b>, which drops background blur,
      decorative animation and looping background video. Leave it off and the client is pixel-identical.
      <br><br>
      <b>Pages Remake</b> (off by default) replaces the Loot screen with a plain-DOM copy of the same inventory so
      it opens without Ember's per-element build. Its code is only downloaded while the switch is on, and any
      failure — or turning it off — puts Riot's original page back instantly.
      <br><br>
      For memory creep, <code>tools/betterclient-monitor.mjs</code> logs per-process RAM and client phase to CSV and
      diffs heap snapshots.
    </td>
  </tr>
</table>

## Install

1. Download this repo.
2. Move the `Perfectionism` folder into your Pengu Loader `plugins` folder.
3. Restart the League Client.

That's it. The folder holds one tiny loader file. The plugins themselves come from the
[`perfectionist-plugins`](https://www.npmjs.com/package/perfectionist-plugins) npm package the
first time the client starts. Install, remove and toggle plugins in **Settings → Perfectionism**.

## Updates

Every time the client starts, the loader checks npm for a newer version and runs it. Publishing
a new version of the npm package **is** the update. If a new version appears while the client is
already open, the suite downloads it with a progress window and restarts the client at a safe
moment (never in the middle of a game). You never replace files by hand.

<br>

---

<div align="center">

Made by **Sr. King** 👑

If these helped you, a ⭐ on the repo is always nice.

</div>
