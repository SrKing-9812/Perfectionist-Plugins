<div align="center">

# Perfectionism

**Small plugins that fix the annoying parts of League of Legends champ select.**

Built for [Pengu Loader](https://pengu.lol)

![Pengu Loader](https://img.shields.io/badge/Pengu%20Loader-plugin%20suite-8A63D2?style=for-the-badge)
![League of Legends](https://img.shields.io/badge/League%20of%20Legends-client-C89B3C?style=for-the-badge)
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
      No more scrolling past skins you can't use.
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