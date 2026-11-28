# Embedding and the player API
Put an interactive on a page, size it, and talk to it from JavaScript.

This page is for anyone who puts a project on a page. The first section is for everyone. The rest is for developers.

## The simplest way
For StudyDesk, StaffDesk and the open site, use the **Embed code** in [Share link](export#embed-code): one iframe to paste into the page's Source code view, sized and labelled like any other Toolbox item.

Anywhere else, upload the **Single HTML file** and show it in an iframe.

Inside StudyDesk the project tells the page its height, so the iframe fits. On a page with **Fit height to content** that height follows what's on it as it plays (see [Pages](artboards)). (For developers: it uses the suite's `setILARSize`, or a `{width: null, height, cacheID}` message.)

## The web component
```
<script src="interactives-player.iife.js"></script>
<interactives-player src="scene.ixp" fit="contain" style="width:800px;height:600px"></interactives-player>
```
Messages the project sends arrive as `ix-message` events. Add `accessibility="off"` to play without layer roles and keyboard operation (see [Accessibility](accessibility)). Add `theme="Dark"` to show one of the project's [themes](themes); without it the viewer's colour scheme and contrast settings choose, and `ix-theme` events report a change.

## From JavaScript
```
import { Player, loadProject } from 'interactives-player';
const player = new Player(document.getElementById('stage'), await loadProject('scene.ixp'));
player.on('message', ({ name, payload }) => console.log(name, payload));
player.send('addToCart', { sku: 'A1' });
player.setVariable('score', 10);
player.timeline('Intro').play();
player.goTo('Checkout', 'fade');
player.setTheme('Dark');   // or null to follow the viewer
player.setData('products', [...]);
```

## Testing it as a prototype
A study page built for it can watch where people go and what they press, to see whether they find their way. Add `?report=study` to the share link (or the single HTML file's address), or post `{ source: 'interactives-report', on: true }` into the frame. The page around it then hears:
- `{ source: 'interactives-page', from, to, name }` each time the page on show changes, with the pages' ids and the name you gave the new one (`from` is null for the first).
- `{ source: 'interactives-click', page, x, y, element }` for every press, with `x` and `y` as shares (0 to 1) of the page's width and height, and `element` the id of the layer that does something when pressed, or null for a press on nothing that does anything.

Without the flag nothing is sent, so learners never send any of it, and neither carries what anyone typed or any variable's value. From JavaScript it's `player.setReporting(true)` with `studypage` and `studyclick` events. A share link published before 20 Nov 2026 needs **Publish** again first.
