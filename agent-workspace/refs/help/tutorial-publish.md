# Tutorial 5: Publishing and sharing
Check it in Preview, set the page options, then export a single HTML file or make a share link. Also how to hand a project over and get it back.

Your interactive is ready. This tutorial gets it to other people. It works with any project; the lamp from [Tutorial 3](tutorial-state-machine) is a good one to use.

## 1. Check it in Preview

1. Press **Preview** at the top right. It plays the project exactly as the exported file will.
2. The dropdown at the top says **From the start artboard** or **From this artboard**. Use the second to test just the page you're working on.
3. Press **Restart** to start from scratch. Press <kbd>Esc</kbd> to close.

## 2. Set the page options

1. Click an empty part of the canvas, or the page's name, so nothing is selected. The Properties panel shows **Page** and **Project**.
2. Under **Project**, set **Page title** (the title of the browser tab), **Fit** (how the page scales to its space) and **Page background** (the colour around the page).
3. Under **Page**, make sure the page people should see first is the start page. The button says **Start page** (greyed out) when it already is. If not, press **Make start page**.

![The Project section of the Properties panel: name, page title, description, fit, page background, sandbox and reduced motion.](help/project-settings.png)

## 3. Export a single file

1. Press **Export** at the top right (it is only for files).
2. Choose **Single HTML file**. Your browser downloads one `.html` file that holds the player, the project and every image, font and sound.
3. Upload it anywhere that serves web pages, or show it in an iframe. It works offline too.

![The Export menu.](help/export-menu.png)

## 4. Or make a share link

A share link needs no uploading. Anyone with the link can play the project in their browser. They can't edit it.

1. Choose **Share → Share…** (the **Share** button is next to **Export**). If something looks unfinished (a button that does nothing, sample words, a picture with no description) a short [Before you share](before-you-share) list comes first.
2. Under **Where will people use it?** choose **Anyone with a link**, and press **Create the link**. The link appears.
3. Press **Copy** and send it, or **Open** to try it.
4. The link is a snapshot. When you've changed the project, open the dialog again and press **Update to the latest version**.
5. To stop sharing, open **More ways to share**, press **Turn off link** and confirm. The link then shows a "turned off" page.

To use it inside StudyDesk, choose **In a StudyDesk page, and keep learners' results** instead and copy the code it shows into the page's Source code view: each learner's score and progress are kept, and you can see [Insights](insights). Under **More ways to share**, tick **Allow remix** if you are happy for staff to copy the project into their own projects.

![The Share menu: Share link, Invite to collaborate, Save as template and Share for review.](help/share-menu.png)

![The Share dialog: Where will people use it?, the thing to copy, and More ways to share folded underneath.](help/share-where.png)

## 5. Put it on a page

See [Embedding and the player API](embedding) for the iframe snippet, how the page can set variables and listen for messages, and the `<interactives-player>` web component.

## 6. Back it up, or hand it over

- **Export → Project package (.ixp)** saves the whole project with its assets. Anyone can bring it back with **Import** on the projects page.
- On the projects page, the download button on a project card does the same without opening it.
- The **history** button (the clock at the top) lists earlier saved versions. Pick one to preview it, then press **Restore this version**. What was there before is saved first, so you can come back. See [Live editing and saving](live-editing).

## 7. Work with other people

- **Invite someone to edit with you.** Choose **Share → Invite to collaborate…**, type their name and pick them from the list. The project appears on their projects page. Press **Turn on live collaboration** in the same window (it is off until you do), and when two or more people are in it, their initials appear at the top and you see each other's cursors. See [Live editing and saving](live-editing#inviting-people).
- **Ask for comments, not edits.** Choose **Share → Share for review…** and send the review link. Reviewers pin notes on the project and you answer them in the **Comments** tab. See [Review comments](comments).
- **Let others start from yours.** Choose **Share → Save as template…** to make a template with a checklist, or tick **Allow remix** on the Link for StudyDesk. See [Templates, examples and remix](templates).
- To let someone just play it, send a share link.
- An AI agent can join the same way. See [AI agents (MCP)](ai-agents).

## You're done

You've built, animated, wired up, imported and published. Keep going with the topics on the left. Good places to go next: [Timelines and keyframes](timelines), [Groups and frames](groups-frames), [Auto layout](auto-layout), [Data sources](data-sources) and [Troubleshooting and common questions](troubleshooting).
