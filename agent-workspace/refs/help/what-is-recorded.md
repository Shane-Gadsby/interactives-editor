# What the editor records
The editor records how it is used, and its errors, to make it better. What is kept, what never is, and that there is no off switch.

The editor records how it is used, and the faults it runs into, so that the people who make it can see what is used, what gets in the way and what breaks. **This is always on. There is no setting to turn it off.** It goes into the same StudyDesk analytics as the other Toolbox tools.

## What is recorded

- **That you were here**: a visit started, how long you were actively working (time with the tab showing and something being done), your browser and its version, your operating system and a rough window size.
- **Which parts you use**: the tool you pick and how long you stay in it, which panels and tabs you open, which layers you add (by kind: rectangle, text, button...), which properties you change (by name: *fill*, *opacity*...), and the bigger features you use (questions, steps, drag and drop, captions, responsive sets, the public interface, libraries, accessibility fixes, sharing).
- **Imports and exports**: the file type (*svg*, *riv*, *psd*...), how big it was, and whether it worked. For an export, the kind of file and its size.
- **Help**: which help topics you open, and how many words a search had and whether anything matched.
- **Previews**: that you opened one, and how long the project took to start.
- **Which parts of the server were called**, with the ids taken out (*projects/:id/comments*), how long they took, and the ones that failed.
- **Faults**: when something breaks (an error in the page, a part of the editor that stopped, a failed save, a file that could not be imported, a script or shader layer that failed), a short description of the error with anything in quotes, web addresses and long numbers taken out, which part it happened in, the browser, and the editor version.
- **Who and which project**: the rows carry your StudyDesk username and the id of the project you had open, like every other Toolbox analytics row.

Nothing is sent for every click. Events are added up and sent about once a minute, as a count with the time spent.

## What is never recorded

- Anything you type: text in layers, names of projects, layers, variables, pages, libraries or files, search words, comments, captions, code, shader code.
- The contents of your projects, your images and your files. Only the *type* of a file you import or export is kept, never its name.
- The values you give properties (only that you changed *fill*, not to what).

## Published projects

A project shown through the **Link for StudyDesk** (in the Share link dialog) also reports how it ran: how long it took to show, and any script, shader, picture or data fault, with a short scrubbed description and the player version. This is for fixing bugs. This part records nothing a learner did or typed. What learners do (pages reached, clicks, steps, answers) is a separate thing that you can read and switch off in the project, see [Insights](insights). A project exported as a file, or opened through the plain *Share link*, sends nothing anywhere.

## Who sees it

The people who make the product, as counts and lists of errors. If you are one of them, power user mode (**F9** on the projects page) has a *Usage and errors* page.
