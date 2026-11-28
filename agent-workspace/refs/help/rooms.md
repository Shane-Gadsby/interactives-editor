# Rooms (a live chat for the class)
A live message list for everyone in the same class: a chat or a question wall, with who is here, made-up names and hiding by the owner.

A **Room** data source is a live message list for the people playing the same project in the same StudyDesk course: a chat, a question wall, a place to say what they thought. A message that is sent shows on everyone's screen at once. Nobody has to refresh.

## Adding a room
In the **Data** tab choose **+ Room**. It is a data source like any other, in scope by its name (`chat`), so its messages can fill a [repeat](repeaters) and its count can sit in a text.

| In expressions | What it is |
|---|---|
| `chat.messages` | The latest messages, oldest first: `text`, `seat` (the name shown), `at` (the time, in milliseconds) and `mine` (true for the person's own) |
| `chat.here` | How many people are in the room right now |
| `chat.me` | What this person is called in the room |
| `chat.count` | How many messages are in the list |
| `chat.ready` | True once the room has answered. Show your own words until then |
| `chat.up` | True while the live link is up |
| `chat.problem` | `blocked`, `empty`, `offline`, `signin` or `closed` after something did not work, or empty |

Each new message, a message hidden by the owner and a change in who is here all set the value again, so a repeat over `chat.messages` and a text with `{chat.here}` in it stay up to date by themselves. **When data has loaded** fires each time too.

## Sending
- **+ When clicked… > Send a message to a room…** is the quickest way. Choose the room and the text variable the person types into (a text input bound to it, say). It writes a **Send to room** node and a second node that empties the box.
- Or add a **Send to room** node yourself. Its **Message** is an expression, usually the name of the text variable.
- Or `await ix.room.send('chat', 'Hello')` in a script. It resolves to true when the room took the message.

A message that is empty or has a blocked word is never sent. **Send to room** goes on from **Not sent**, and `chat.problem` says why. Anything over 2000 characters is cut. There is no limit on how many messages a person can send.

## Who sees what
Only people in the same project and the same course are in a room together. A person shows as a **made-up name** such as *Quiet Otter 41*, which is the same every time they are in that room and means nothing anywhere else, or as their **first name** if you choose that in **People show as**. Nobody ever sees a username, a surname or an email address.

Someone with no course (opened from outside a StudyDesk course) is not put in a room.

## Where it runs
The class lives on the server, and the server only knows who someone is on the **StudyDesk learner page** (**Share**, then **Link for StudyDesk**, see [Share link](export#share-link)). The page holds one live link for all the rooms in the project. If it drops, the page keeps trying and, once it is back, catches up on whatever it missed.

Anywhere else (an exported file, an ordinary share link, the page open on its own) there is no room: `chat.ready` stays false and a send says `offline`, so the page can quietly show something else.

**Preview** has a pretend room of its own: your sample messages, each from a different person, plus what you send, kept in this browser. Nothing leaves it.

The rules are fixed when the project is shared. After you add or change a room, **Update to the latest version** in the Share dialog or the learner page will not know about it.

## A class chat in a few steps
1. In the **Data** tab press **+ Room**. Leave the name as `chat`. Under **Sample messages** type a few lines, one a line, so the page has something in it while you lay it out.
2. On the page add an **Input field** (**Web** in the tool bar). In its **Variable** box press **Bind to a variable…** and make a new text variable called `draft`.
3. Add a button with the label **Send**. With it selected press **+ When clicked…**, choose **Send a message to a room…**, pick **chat** and **draft**, and press **Add**.
4. Add a group with one text layer in it. In the group's **Repeat (list)** section tick **Repeat the first child for each item**, set **Repeat for each** to **A formula (advanced)** with `chat.messages` in **Items**, and type `{item.seat}: {item.text}` in the text layer.
5. Add a text with `{chat.here} here` in it.
6. Press **Preview**. The sample messages are there, and what you send joins them.

## The settings
- **People show as**: a made-up name (the default) or their first name.
- **Messages in view**: how many of the latest messages the room holds at once, up to 300. Older ones are kept, they just leave the list.
- **Blocked words**: words and phrases nobody may send. Whole words only, so blocking *ass* leaves *class* alone. Share again for a change to reach learners.
- **Sample messages**: for you only. The canvas and Preview show them as a room full of people, so a page can be laid out with nobody in it. Learners never see them.

## Moderating a room
Below the settings, **What people have said** lists each course's latest 100 messages, newest first, with who sent each one. **Hide** takes a message out of the room for everybody, at once, and **Show** puts it back. It is kept either way.

The project's owner and anyone it is shared with as a collaborator can hide and show messages, and see who sent them. Learners only ever see the names above.

## What is kept
Every message is kept on the server, with the account that sent it (shown only to the people who can moderate), whether it is hidden or not. Deleting the project does not delete its messages.

## Limits and safety
Everything is held to what was declared when the project was shared, never to what a browser sends, and who somebody is comes from their StudyDesk session, never from the page. A message is cut to 2000 characters, stripped of control and invisible characters, and checked against the blocked words. A course can hold only so many live links at once (the same limits as live shared responses), and a page that cannot get one keeps its last messages and tries again later.
