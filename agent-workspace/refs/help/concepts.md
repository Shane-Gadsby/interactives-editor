# Concepts: the ideas behind the editor
Short explanations of the ideas that catch people out: what the canvas shows, variables and bindings, repeaters, auto layout, what gets clicked and more.

Each of these is a few minutes' read: the idea, the ways people get caught out, and how to tell what is going on. If something "does nothing", start with the first one.

- [The canvas shows the start; Preview runs it](concept-canvas-vs-preview). Nothing happens on the canvas when you click a button: it shows every page as it starts. Events, timers, scripts and changing variables only run in Preview.
- [Pages, page masters and the start page](concept-pages-masters). Every artboard is a page, one of them plays first, and a page master is a page whose layers are drawn on the pages that use it.
- [Events, actions and the graph](concept-events-actions). Nothing happens unless an event is joined to actions. The Interactions graph is the program; the sentences in the Inspector are another way of reading it.
- [Variables, data sources and bindings](concept-variables-data-bindings). Variables are what changes while it runs, data sources are content loaded from a file, and a binding makes a layer follow either one.
- [Formulas, and {braces} in text](concept-expressions). Bindings, conditions and the {slots} in text take small formulas, not plain words: quotes around text, == to compare, lists counted from 0.
- [A repeater is one layer drawn many times](concept-repeaters). A repeater draws its first child once for each item in a list. There is one template, not many layers, and item, index and event.index say which row is which.
- [Timelines, keyframes and recording](concept-timelines). A timeline is a named animation of layer properties. Record turns your changes into keyframes, and several timelines can play at once.
- [Auto layout: the frame places its children](concept-auto-layout). Inside a frame with auto layout, the frame decides where each child goes. Each child is fixed, hugs its content or fills, and its x and y are worked out for it.
- [Components: one page, placed many times](concept-components). Any page can be placed inside another as a component. Each copy is an instance that follows its source page, and Inputs are how one copy differs.
- [What gets clicked](concept-hit-testing). A click goes to the front layer under the pointer that can take it, and to the groups around that layer. See-through and hidden layers let it pass.
- [Positions are measured from the parent](concept-coordinates). A layer's X and Y are measured from the top left of whatever holds it: the page, or the group or frame it is in.
- [Assets: one file, used in many places](concept-assets). Pictures, sound, video, fonts and data files live once in the Assets tab, and layers point at them. Replace a file there and everything that uses it changes.
- [Theme colours and fixed colours](concept-themes-tokens). A colour is either a token, which changes with the theme (Light, Dark, High contrast), or a fixed colour, which never does. Mixing the two is how text vanishes in Dark.
- [Responsive variants: one page, several widths](concept-responsive-variants). A page can have narrow and wide variants, each a whole page of its own. The player shows the one that fits the width it has, and carries what the learner did across by matching names.
- [Reduced motion: it has to work without the movement](concept-reduced-motion). Some learners ask their device for less motion. Then animations that start by themselves show their end, transitions are instant, and anything that only exists mid-animation is lost.
- [Roles, names and focus order](concept-a11y-names). A screen reader knows a layer by its role and name, not by how it looks. A keyboard moves through tab stops in the Tab order, not in the order things sit on the page.
- [What is remembered, for whom, and for how long](concept-user-data). Variables start again on every visit unless you ask for them to be kept. Kept values are per person, per course and per project, and only reach the server from the Link for StudyDesk.
- [Report result, and what StudyDesk sees](concept-results). Report result sends a score and completion to the Toolbox's results for the project. Only the Link for StudyDesk keeps them; Preview and the plain share link keep none.
- [Share gives links, Export gives files](concept-share-export). Share holds links and people: the share link, the Link for StudyDesk, collaborators and reviewers. Export only ever makes a file, which is a copy that never changes again.
- [It saves as you go; revisions are the way back](concept-live-revisions). There is no Save to remember: every change is saved, other editors see it live once you turn Live collaboration on, and Revision history takes the project back to an earlier version.
- [Sticky notes are for editors; comments are for reviewers](concept-notes-comments). A note is part of the project, for whoever edits it next, and reviewers never see it. A comment is a conversation kept beside the project, for reviewers and the people answering them.
- [Only if, Check a condition, and turning a flow off](concept-only-if). Only if decides whether an event runs its flow at all. Check a condition chooses a way inside a flow. Both take a yes/no formula.
- [Random, shuffle and seeds](concept-seeds-random). A seed makes a shuffle come out the same way every time. Without one it is different on every run, and you can't repeat it.
